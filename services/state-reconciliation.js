/**
 * State Reconciliation Service
 * 
 * Provides unified state reconciliation logic for ASA server management.
 * Tracks intentional actions, handles transition states, and determines
 * accurate server status from multiple data sources.
 * 
 * @see docs/STATUS_ERROR_CONTRACT.md for status contract specification
 */

import {
  ServerStatus,
  DataSource,
  createServerLiveData,
  createTransitionState,
  normalizeStatus,
  getBestAvailableData,
  isStale,
  calculateStaleAfter
} from '../utils/statusContract.js';
import logger from '../utils/logger.js';

/**
 * Configuration for state reconciliation
 */
const CONFIG = {
  // How long a server can stay in 'starting' state before failing (5 minutes)
  STARTING_TIMEOUT_MS: 5 * 60 * 1000,
  // How long a server can stay in 'stopping' state before timeout (2 minutes)
  STOPPING_TIMEOUT_MS: 2 * 60 * 1000,
  // How long to remember an intentional stop action (10 minutes)
  INTENT_MEMORY_MS: 10 * 60 * 1000,
  // How long cached status is valid (30 seconds)
  CACHE_TTL_MS: 30 * 1000,
  // RCON timeout for health check (10 seconds)
  RCON_PROBE_TIMEOUT_MS: 10 * 1000,
  // Query timeout (5 seconds)
  QUERY_PROBE_TIMEOUT_MS: 5 * 1000
};

/**
 * Intent types for tracking user actions
 * @readonly
 * @enum {string}
 */
const IntentType = Object.freeze({
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart'
});

/**
 * State Reconciliation Service
 * 
 * Manages per-server state tracking including:
 * - Last intentional action (start/stop/restart)
 * - Last known status
 * - Transition states
 * - Probe results
 */
class StateReconciliationService {
  constructor() {
    /**
     * Per-server state tracking
     * @type {Map<string, ServerState>}
     */
    this.serverStates = new Map();
    
    /**
     * Cached reconciled status
     * @type {Map<string, CachedStatus>}
     */
    this.statusCache = new Map();
    
    // Start cleanup interval to remove stale intent records
    this.cleanupInterval = setInterval(() => this.cleanupStaleRecords(), 60000);
  }

  /**
   * Record an intentional action for a server
   * @param {string} serverId - Server identifier
   * @param {string} action - Action type: 'start', 'stop', or 'restart'
   * @param {string} [initiator='system'] - Who initiated the action
   */
  recordIntent(serverId, action, initiator = 'system') {
    const now = new Date();
    let state = this.serverStates.get(serverId);
    
    if (!state) {
      state = this.createDefaultState(serverId);
      this.serverStates.set(serverId, state);
    }
    
    // Store previous status before transition
    const previousStatus = state.lastKnownStatus;
    
    state.lastIntent = {
      action: action,
      timestamp: now,
      initiator: initiator
    };
    
    // Set transition state based on action
    if (action === IntentType.START || action === IntentType.RESTART) {
      state.transitionState = {
        status: ServerStatus.STARTING,
        previousStatus: previousStatus,
        transitionStartedAt: now.toISOString(),
        expectedDuration: CONFIG.STARTING_TIMEOUT_MS
      };
      state.lastKnownStatus = ServerStatus.STARTING;
    } else if (action === IntentType.STOP) {
      state.transitionState = {
        status: ServerStatus.STOPPING,
        previousStatus: previousStatus,
        transitionStartedAt: now.toISOString(),
        expectedDuration: CONFIG.STOPPING_TIMEOUT_MS
      };
      state.lastKnownStatus = ServerStatus.STOPPING;
    }
    
    logger.info(`[StateReconciliation] Recorded intent for ${serverId}: ${action} by ${initiator}`);
    
    // Invalidate cache
    this.statusCache.delete(serverId);
  }

  /**
   * Record a successful probe result
   * @param {string} serverId - Server identifier
   * @param {string} source - Probe source: 'process', 'rcon', or 'query'
   * @param {Object} [data] - Additional probe data
   */
  recordSuccessfulProbe(serverId, source, data = {}) {
    let state = this.serverStates.get(serverId);
    
    if (!state) {
      state = this.createDefaultState(serverId);
      this.serverStates.set(serverId, state);
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
    this.statusCache.delete(serverId);
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
    let state = this.serverStates.get(serverId);
    
    if (!state) {
      state = this.createDefaultState(serverId);
      this.serverStates.set(serverId, state);
    }
    
    const now = new Date();
    const wasIntentionalStop = this.wasIntentionalStop(serverId);
    
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
        reason: exitInfo.reason || this.determineFailureReason(exitInfo)
      };
      logger.warn(`[StateReconciliation] Server ${serverId} crashed or failed: ${state.lastStopReason.reason}`);
    }
    
    // Invalidate cache
    this.statusCache.delete(serverId);
  }

  /**
   * Check if a stop was intentional (recent stop intent recorded)
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if stop was intentional
   */
  wasIntentionalStop(serverId) {
    const state = this.serverStates.get(serverId);
    if (!state?.lastIntent) return false;
    
    const { action, timestamp } = state.lastIntent;
    const age = Date.now() - new Date(timestamp).getTime();
    
    // If there was a recent stop or restart intent, consider it intentional
    if ((action === IntentType.STOP || action === IntentType.RESTART) && age < CONFIG.INTENT_MEMORY_MS) {
      return true;
    }
    
    return false;
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
    const cached = this.statusCache.get(serverId);
    if (cached && !isStale(cached.staleAfter)) {
      return cached.data;
    }
    
    let state = this.serverStates.get(serverId);
    if (!state) {
      state = this.createDefaultState(serverId);
      this.serverStates.set(serverId, state);
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
          this.recordSuccessfulProbe(serverId, DataSource.RCON, rconData);
        } else if (queryData?.success || queryData?.sessionName) {
          // Query successful - server is running
          status = ServerStatus.RUNNING;
          source = DataSource.QUERY;
          this.recordSuccessfulProbe(serverId, DataSource.QUERY, queryData);
        } else if (this.isInStartingTransition(serverId)) {
          // Process running but no RCON/query response yet, still starting
          status = ServerStatus.STARTING;
        } else {
          // Process running, no RCON/query but not in transition - consider running
          status = ServerStatus.RUNNING;
          this.recordSuccessfulProbe(serverId, DataSource.PROCESS);
        }
      } else {
        // Process not running
        if (this.isInStoppingTransition(serverId)) {
          // We were stopping and now stopped
          status = ServerStatus.STOPPED;
          this.recordServerStopped(serverId, processData.exitInfo);
        } else if (this.wasIntentionalStop(serverId)) {
          // Process stopped after intentional stop command
          status = ServerStatus.STOPPED;
        } else if (state.lastKnownStatus === ServerStatus.RUNNING || 
                   state.lastKnownStatus === ServerStatus.STARTING) {
          // Was running/starting but now not - crashed
          status = ServerStatus.FAILED;
          reason = this.determineFailureReason(processData.exitInfo || {});
          this.recordServerStopped(serverId, processData.exitInfo);
        } else if (state.lastKnownStatus === ServerStatus.FAILED) {
          // Keep failed status
          status = ServerStatus.FAILED;
          reason = state.lastStopReason?.reason || 'Server crashed unexpectedly';
        } else {
          // Default to stopped
          status = ServerStatus.STOPPED;
        }
      }
    } else if (rconData) {
      source = DataSource.RCON;
      if (rconData.success) {
        status = ServerStatus.RUNNING;
        this.recordSuccessfulProbe(serverId, DataSource.RCON, rconData);
      } else if (rconData.timeout) {
        reason = `RCON timeout after ${CONFIG.RCON_PROBE_TIMEOUT_MS / 1000}s`;
        status = state.lastKnownStatus || ServerStatus.UNKNOWN;
      }
    } else if (queryData) {
      source = DataSource.QUERY;
      if (queryData.success || queryData.sessionName) {
        status = ServerStatus.RUNNING;
        this.recordSuccessfulProbe(serverId, DataSource.QUERY, queryData);
      }
    } else {
      // No data sources available - use cached state
      source = DataSource.CACHED;
      status = state.lastKnownStatus;
    }
    
    // Step 3: Check for transition timeouts
    const transitionCheck = this.checkTransitionTimeout(serverId);
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
      players: this.extractPlayerData(sources),
      performance: this.extractPerformanceData(sources, state),
      gameData: this.extractGameData(sources),
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
    this.statusCache.set(serverId, {
      data: liveData,
      staleAfter: calculateStaleAfter(source, now)
    });
    
    return liveData;
  }

  /**
   * Check if server is in starting transition
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if in starting transition
   */
  isInStartingTransition(serverId) {
    const state = this.serverStates.get(serverId);
    return state?.transitionState?.status === ServerStatus.STARTING;
  }

  /**
   * Check if server is in stopping transition
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if in stopping transition
   */
  isInStoppingTransition(serverId) {
    const state = this.serverStates.get(serverId);
    return state?.transitionState?.status === ServerStatus.STOPPING;
  }

  /**
   * Check for transition timeout
   * @param {string} serverId - Server identifier
   * @returns {Object} Timeout check result
   */
  checkTransitionTimeout(serverId) {
    const state = this.serverStates.get(serverId);
    if (!state?.transitionState) {
      return { timedOut: false };
    }
    
    const transitionStart = new Date(state.transitionState.transitionStartedAt);
    const elapsed = Date.now() - transitionStart.getTime();
    
    if (state.transitionState.status === ServerStatus.STARTING) {
      if (elapsed > CONFIG.STARTING_TIMEOUT_MS) {
        // Starting timeout - consider failed
        state.transitionState = null;
        return {
          timedOut: true,
          status: ServerStatus.FAILED,
          reason: `Server failed to start within ${CONFIG.STARTING_TIMEOUT_MS / 1000 / 60} minutes`
        };
      }
    } else if (state.transitionState.status === ServerStatus.STOPPING) {
      if (elapsed > CONFIG.STOPPING_TIMEOUT_MS) {
        // Stopping timeout - consider unknown
        state.transitionState = null;
        return {
          timedOut: true,
          status: ServerStatus.UNKNOWN,
          reason: `Server stop not confirmed within ${CONFIG.STOPPING_TIMEOUT_MS / 1000} seconds`
        };
      }
    }
    
    return { timedOut: false };
  }

  /**
   * Determine failure reason from exit info
   * @param {Object} exitInfo - Exit information
   * @returns {string} Human-readable failure reason
   */
  determineFailureReason(exitInfo) {
    const { exitCode, exitSignal, error } = exitInfo;
    
    if (exitSignal === 'SIGKILL') {
      return 'Process was forcefully terminated';
    }
    if (exitSignal === 'SIGTERM') {
      return 'Process was terminated';
    }
    if (exitSignal) {
      return `Process terminated by signal: ${exitSignal}`;
    }
    
    if (exitCode === null || exitCode === undefined) {
      return 'Server crashed unexpectedly';
    }
    
    switch (exitCode) {
      case 0:
        return 'Server exited normally';
      case 1:
        return 'Server crashed with generic error';
      case 2:
        return 'Server command line error';
      case -1073741515:
        return 'Missing DLL or dependency (0xC0000135)';
      case -1073741819:
        return 'Access violation (0xC0000005)';
      case -1073740940:
        return 'Heap corruption (0xC0000374)';
      case -1073740791:
        return 'Stack buffer overrun (0xC0000409)';
      default:
        if (exitCode < 0) {
          return `Server crashed with Windows error code: 0x${(exitCode >>> 0).toString(16).toUpperCase()}`;
        }
        return `Server exited with code: ${exitCode}`;
    }
  }

  /**
   * Extract player data from sources
   * @param {Object} sources - Data sources
   * @returns {Object} Player data
   */
  extractPlayerData(sources) {
    const { rcon, query } = sources;
    
    // Prefer RCON data for player info
    if (rcon?.players) {
      return {
        online: rcon.playerCount || (Array.isArray(rcon.players) ? rcon.players.length : 0),
        max: rcon.maxPlayers || 70,
        list: Array.isArray(rcon.players) ? rcon.players : undefined
      };
    }
    
    // Fall back to query data
    if (query) {
      return {
        online: query.players || 0,
        max: query.maxPlayers || 70
      };
    }
    
    return { online: 0, max: 70 };
  }

  /**
   * Extract performance data from sources
   * @param {Object} sources - Data sources
   * @param {Object} state - Server state
   * @returns {Object} Performance data
   */
  extractPerformanceData(sources, state) {
    const { process: processData } = sources;
    
    if (processData?.stats) {
      return {
        cpu: processData.stats.cpu,
        memory: processData.stats.memory,
        uptime: processData.stats.uptime
      };
    }
    
    // Calculate uptime from last successful probe or intent
    if (state.lastIntent?.action === IntentType.START && state.lastKnownStatus === ServerStatus.RUNNING) {
      const startTime = new Date(state.lastIntent.timestamp);
      const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
      return { uptime };
    }
    
    return undefined;
  }

  /**
   * Extract game data from sources
   * @param {Object} sources - Data sources
   * @returns {Object} Game data
   */
  extractGameData(sources) {
    const { rcon, query } = sources;
    
    if (query) {
      return {
        map: query.map,
        day: typeof query.day === 'number' ? query.day : undefined,
        version: query.version
      };
    }
    
    if (rcon?.serverInfo) {
      return {
        map: rcon.serverInfo.map,
        day: rcon.serverInfo.day,
        version: rcon.serverInfo.version
      };
    }
    
    return undefined;
  }

  /**
   * Create default state for a server
   * @param {string} serverId - Server identifier
   * @returns {Object} Default server state
   */
  createDefaultState(serverId) {
    return {
      serverId: serverId,
      lastIntent: null,
      lastKnownStatus: ServerStatus.UNKNOWN,
      lastStatusCheck: null,
      lastSuccessfulProbe: null,
      transitionState: null,
      lastStopReason: null
    };
  }

  /**
   * Get current state for a server (for debugging)
   * @param {string} serverId - Server identifier
   * @returns {Object|null} Server state or null if not tracked
   */
  getServerState(serverId) {
    return this.serverStates.get(serverId) || null;
  }

  /**
   * Clear state for a server
   * @param {string} serverId - Server identifier
   */
  clearServerState(serverId) {
    this.serverStates.delete(serverId);
    this.statusCache.delete(serverId);
    logger.info(`[StateReconciliation] Cleared state for ${serverId}`);
  }

  /**
   * Clean up stale intent records
   */
  cleanupStaleRecords() {
    const now = Date.now();
    
    for (const [serverId, state] of this.serverStates.entries()) {
      // Clean up old intent records
      if (state.lastIntent) {
        const intentAge = now - new Date(state.lastIntent.timestamp).getTime();
        if (intentAge > CONFIG.INTENT_MEMORY_MS * 2) {
          state.lastIntent = null;
        }
      }
      
      // Clean up old stop reasons
      if (state.lastStopReason) {
        const stopAge = now - new Date(state.lastStopReason.timestamp).getTime();
        if (stopAge > CONFIG.INTENT_MEMORY_MS * 2) {
          state.lastStopReason = null;
        }
      }
    }
    
    // Clean up expired cache entries
    for (const [serverId, cached] of this.statusCache.entries()) {
      if (isStale(cached.staleAfter)) {
        this.statusCache.delete(serverId);
      }
    }
  }

  /**
   * Destroy the service and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.serverStates.clear();
    this.statusCache.clear();
  }
}

// Export singleton instance
export const stateReconciliation = new StateReconciliationService();

// Also export the class for testing
export { StateReconciliationService, IntentType, CONFIG as StateReconciliationConfig };

export default stateReconciliation;
