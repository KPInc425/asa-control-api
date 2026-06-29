/**
 * Probe Tracker Module
 *
 * Tracks successful probe results and records server stopped events.
 */

import { ServerStatus } from '../../utils/statusContract.js';
import logger from '../../utils/logger.js';

export class ProbeTracker {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Record a successful probe result
   * @param {string} serverId - Server identifier
   * @param {string} source - Probe source: 'process', 'rcon', or 'query'
   * @param {Object} [data] - Additional probe data
   */
  recordSuccessfulProbe(serverId, source, data = {}) {
    let state = this.service.serverStates.get(serverId);

    if (!state) {
      state = this.service.createDefaultState(serverId);
      this.service.serverStates.set(serverId, state);
    }

    const now = new Date();

    state.lastSuccessfulProbe = {
      source: source,
      timestamp: now,
      data: data
    };

    // If we get a successful probe and server was in 'starting', it's now 'running'
    if (state.transitionState?.status === ServerStatus.STARTING) {
      logger.info(`[StateReconciliation] Server ${serverId} transition complete: starting -> running`);
      state.transitionState = null;
      state.lastKnownStatus = ServerStatus.RUNNING;
    }

    // Invalidate cache
    this.service.statusCache.delete(serverId);
  }

  /**
   * Record that a server has stopped
   * @param {string} serverId - Server identifier
   * @param {Object} [exitInfo] - Exit information
   * @param {number} [exitInfo.exitCode] - Process exit code
   * @param {string} [exitInfo.exitSignal] - Exit signal if any
   * @param {string} [exitInfo.reason] - Human-readable reason
   */
  recordServerStopped(serverId, exitInfo = {}) {
    let state = this.service.serverStates.get(serverId);

    if (!state) {
      state = this.service.createDefaultState(serverId);
      this.service.serverStates.set(serverId, state);
    }

    const now = new Date();
    const wasIntentionalStop = this.service.intentTracker.wasIntentionalStop(serverId);

    // Clear transition state
    state.transitionState = null;

    if (wasIntentionalStop) {
      // Intentional stop
      state.lastKnownStatus = ServerStatus.STOPPED;
      state.lastStopReason = {
        type: 'intentional',
        timestamp: now,
        initiator: state.lastIntent?.initiator || 'unknown'
      };
      logger.info(`[StateReconciliation] Server ${serverId} stopped intentionally`);
    } else {
      // Unintentional stop (crash or external kill)
      state.lastKnownStatus = ServerStatus.FAILED;
      state.lastStopReason = {
        type: 'crash',
        timestamp: now,
        exitCode: exitInfo.exitCode,
        exitSignal: exitInfo.exitSignal,
        reason: exitInfo.reason || this.service.failureAnalyzer.determineFailureReason(exitInfo)
      };
      logger.warn(`[StateReconciliation] Server ${serverId} crashed or failed: ${state.lastStopReason.reason}`);
    }

    // Invalidate cache
    this.service.statusCache.delete(serverId);
  }
}
