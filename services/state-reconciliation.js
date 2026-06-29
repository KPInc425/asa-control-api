/**
 * State Reconciliation Service
 *
 * Facade that delegates to focused sub-modules.
 *
 * Provides unified state reconciliation logic for ASA server management.
 * Tracks intentional actions, handles transition states, and determines
 * accurate server status from multiple data sources.
 *
 * @see docs/STATUS_ERROR_CONTRACT.md for status contract specification
 */

import { isStale, ServerStatus } from '../utils/statusContract.js';
import logger from '../utils/logger.js';

import { IntentTracker } from './state-reconciliation/intent-tracker.js';
import { ProbeTracker } from './state-reconciliation/probe-tracker.js';
import { FailureAnalyzer } from './state-reconciliation/failure-analyzer.js';
import { TransitionChecker } from './state-reconciliation/transition-checker.js';
import { DataExtractor } from './state-reconciliation/data-extractor.js';
import { StatusReconciler } from './state-reconciliation/status-reconciler.js';
import { IntentType, CONFIG } from './state-reconciliation/config.js';

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

    // Initialize sub-modules
    this.intentTracker = new IntentTracker(this);
    this.probeTracker = new ProbeTracker(this);
    this.failureAnalyzer = new FailureAnalyzer(this);
    this.transitionChecker = new TransitionChecker(this);
    this.dataExtractor = new DataExtractor(this);
    this.statusReconciler = new StatusReconciler(this);

    // Start cleanup interval to remove stale intent records
    this.cleanupInterval = setInterval(() => this.cleanupStaleRecords(), 60000);
  }

  // ── Intent tracking ──────────────────────────────────────────────

  recordIntent(serverId, action, initiator = 'system') {
    return this.intentTracker.recordIntent(serverId, action, initiator);
  }

  wasIntentionalStop(serverId) {
    return this.intentTracker.wasIntentionalStop(serverId);
  }

  // ── Probe tracking ────────────────────────────────────────────────

  recordSuccessfulProbe(serverId, source, data = {}) {
    return this.probeTracker.recordSuccessfulProbe(serverId, source, data);
  }

  recordServerStopped(serverId, exitInfo = {}) {
    return this.probeTracker.recordServerStopped(serverId, exitInfo);
  }

  // ── Status reconciliation ─────────────────────────────────────────

  reconcileStatus(serverId, sources = {}) {
    return this.statusReconciler.reconcileStatus(serverId, sources);
  }

  // ── Transition checks ──────────────────────────────────────────────

  isInStartingTransition(serverId) {
    return this.transitionChecker.isInStartingTransition(serverId);
  }

  isInStoppingTransition(serverId) {
    return this.transitionChecker.isInStoppingTransition(serverId);
  }

  checkTransitionTimeout(serverId) {
    return this.transitionChecker.checkTransitionTimeout(serverId);
  }

  // ── Failure analysis ──────────────────────────────────────────────

  determineFailureReason(exitInfo) {
    return this.failureAnalyzer.determineFailureReason(exitInfo);
  }

  // ── Data extraction ───────────────────────────────────────────────

  extractPlayerData(sources) {
    return this.dataExtractor.extractPlayerData(sources);
  }

  extractPerformanceData(sources, state) {
    return this.dataExtractor.extractPerformanceData(sources, state);
  }

  extractGameData(sources) {
    return this.dataExtractor.extractGameData(sources);
  }

  // ── State management ──────────────────────────────────────────────

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
    this.intentTracker.cleanupStaleRecords();
  }

  /**
   * Check if a staleAfter value indicates staleness
   * @param {any} staleAfter
   * @returns {boolean}
   */
  isStaleFn(staleAfter) {
    return isStale(staleAfter);
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

export default StateReconciliationService;

// Export singleton instance
export const stateReconciliation = new StateReconciliationService();

// Also export the class for testing
export { StateReconciliationService, IntentType, CONFIG as StateReconciliationConfig };
