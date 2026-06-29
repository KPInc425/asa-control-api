/**
 * Status Reconciler Module
 *
 * Core reconciliation logic: combines process, RCON, and query data
 * to determine accurate server status.
 */

import {
  ServerStatus,
  DataSource,
  createServerLiveData,
  calculateStaleAfter
} from '../../utils/statusContract.js';
import { CONFIG } from './config.js';
import logger from '../../utils/logger.js';

export class StatusReconciler {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Reconcile server status from multiple sources
   * @param {string} serverId - Server identifier
   * @param {Object} sources - Data sources
   * @param {Object} [sources.process] - Process detection result
   * @param {Object} [sources.rcon] - RCON query result
   * @param {Object} [sources.query] - Server browser query result
   * @returns {Object} Reconciled ServerLiveData
   */
  reconcileStatus(serverId, sources = {}) {
    // Check cache first
    const cached = this.service.statusCache.get(serverId);
    if (cached && !this.service.isStaleFn(cached.staleAfter)) {
      return cached.data;
    }

    let state = this.service.serverStates.get(serverId);
    if (!state) {
      state = this.service.createDefaultState(serverId);
      this.service.serverStates.set(serverId, state);
    }

    const now = new Date();
    let status = ServerStatus.UNKNOWN;
    let source = DataSource.CACHED;
    let reason = null;

    // Step 1: Get best available data from sources
    const { process: processData, rcon: rconData, query: queryData } = sources;

    // Step 2: Determine status based on priority
    // Priority: process > rcon > query > cached

    if (processData !== undefined) {
      // Process state is most authoritative
      source = DataSource.PROCESS;

      if (processData.running) {
        // Process is running
        if (rconData?.success) {
          // RCON connection successful - definitely running
          status = ServerStatus.RUNNING;
          source = DataSource.RCON;
          this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.RCON, rconData);
        } else if (queryData?.success || queryData?.sessionName) {
          // Query successful - server is running
          status = ServerStatus.RUNNING;
          source = DataSource.QUERY;
          this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.QUERY, queryData);
        } else if (this.service.transitionChecker.isInStartingTransition(serverId)) {
          // Process running but no RCON/query response yet, still starting
          status = ServerStatus.STARTING;
        } else {
          // Process running, no RCON/query but not in transition - consider running
          status = ServerStatus.RUNNING;
          this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.PROCESS);
        }
      } else {
        // Process not running — but first check if RCON or query says it IS
        // (this covers cases where isRunning() fails to match but the server
        //  is actually alive and responding on the network)
        if (rconData?.success) {
          status = ServerStatus.RUNNING;
          source = DataSource.RCON;
          this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.RCON, rconData);
        } else if (queryData?.success || queryData?.sessionName) {
          status = ServerStatus.RUNNING;
          source = DataSource.QUERY;
          this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.QUERY, queryData);
        } else if (this.service.transitionChecker.isInStoppingTransition(serverId)) {
          // We were stopping and now stopped
          status = ServerStatus.STOPPED;
          this.service.probeTracker.recordServerStopped(serverId, processData.exitInfo);
        } else if (this.service.intentTracker.wasIntentionalStop(serverId)) {
          // Process stopped after intentional stop command
          status = ServerStatus.STOPPED;
        } else if (state.lastKnownStatus === ServerStatus.FAILED) {
          // Already in failed state — check if it's time to give up
          // or if a new probe succeeded.  If the FAILED state is older
          // than 2 minutes, downgrade to STOPPED so the server can
          // be recovered gracefully.
          const failedAge = state.lastStopReason?.timestamp
            ? Date.now() - new Date(state.lastStopReason.timestamp).getTime()
            : Infinity;
          if (failedAge > 2 * 60 * 1000) {
            // Server has been in FAILED for over 2 min with no process
            // and no successful probe — recycle to STOPPED.
            status = ServerStatus.STOPPED;
            state.lastKnownStatus = ServerStatus.STOPPED;
            state.transitionState = null;
            logger.info(
              `[StateReconciliation] Server ${serverId} FAILED state expired, recycling to STOPPED`,
            );
          } else {
            status = ServerStatus.FAILED;
            reason = state.lastStopReason?.reason || 'Server crashed unexpectedly';
          }
        } else if (state.lastKnownStatus === ServerStatus.RUNNING ||
                   state.lastKnownStatus === ServerStatus.STARTING) {
          // Was running/starting but now not - crashed
          status = ServerStatus.FAILED;
          reason = this.service.failureAnalyzer.determineFailureReason(processData.exitInfo || {});
          this.service.probeTracker.recordServerStopped(serverId, processData.exitInfo);
        } else if (state.lastKnownStatus === ServerStatus.UNKNOWN) {
          // No prior state (e.g. after API restart) — default to STOPPED
          // so the dashboard doesn't show a stuck FAILED state.
          status = ServerStatus.STOPPED;
        } else {
          // Default to stopped
          status = ServerStatus.STOPPED;
        }
      }
    } else if (rconData) {
      source = DataSource.RCON;
      if (rconData.success) {
        status = ServerStatus.RUNNING;
        this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.RCON, rconData);
      } else if (rconData.timeout) {
        reason = `RCON timeout after ${CONFIG.RCON_PROBE_TIMEOUT_MS / 1000}s`;
        status = state.lastKnownStatus || ServerStatus.UNKNOWN;
      }
    } else if (queryData) {
      source = DataSource.QUERY;
      if (queryData.success || queryData.sessionName) {
        status = ServerStatus.RUNNING;
        this.service.probeTracker.recordSuccessfulProbe(serverId, DataSource.QUERY, queryData);
      }
    } else {
      // No data sources available - use cached state
      source = DataSource.CACHED;
      status = state.lastKnownStatus;
    }

    // Step 3: Check for transition timeouts
    const transitionCheck = this.service.transitionChecker.checkTransitionTimeout(serverId);
    if (transitionCheck.timedOut) {
      status = transitionCheck.status;
      reason = transitionCheck.reason;
    }

    // Step 4: Update last known status
    state.lastKnownStatus = status;
    state.lastStatusCheck = now;

    // Step 5: Build ServerLiveData response
    const liveData = createServerLiveData({
      serverId: serverId,
      status: status,
      source: source,
      players: this.service.dataExtractor.extractPlayerData(sources),
      performance: this.service.dataExtractor.extractPerformanceData(sources, state),
      gameData: this.service.dataExtractor.extractGameData(sources),
      updatedAt: now.toISOString()
    });

    // Add transition info if applicable
    if (state.transitionState) {
      liveData.transition = state.transitionState;
    }

    // Add reason for failed/unknown states
    if ((status === ServerStatus.FAILED || status === ServerStatus.UNKNOWN) && reason) {
      liveData.reason = reason;
    }

    // Add crash info if available
    if (status === ServerStatus.FAILED && state.lastStopReason) {
      liveData.crashInfo = {
        exitCode: state.lastStopReason.exitCode,
        exitSignal: state.lastStopReason.exitSignal,
        reason: state.lastStopReason.reason,
        timestamp: state.lastStopReason.timestamp
      };
    }

    // Add last successful probe timestamp
    if (state.lastSuccessfulProbe) {
      liveData.lastSuccessfulProbe = new Date(state.lastSuccessfulProbe.timestamp).toISOString();
    }

    // Cache the result
    this.service.statusCache.set(serverId, {
      data: liveData,
      staleAfter: calculateStaleAfter(source, now)
    });

    return liveData;
  }
}
