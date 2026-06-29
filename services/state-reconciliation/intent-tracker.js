/**
 * Intent Tracker Module
 *
 * Tracks intentional user actions (start/stop/restart) per server
 * and determines whether a stop was intentional.
 */

import { isStale } from '../../utils/statusContract.js';
import logger from '../../utils/logger.js';
import { CONFIG, IntentType } from './config.js';

export class IntentTracker {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Record an intentional action for a server
   * @param {string} serverId - Server identifier
   * @param {string} action - Action type: 'start', 'stop', or 'restart'
   * @param {string} [initiator='system'] - Who initiated the action
   */
  recordIntent(serverId, action, initiator = 'system') {
    const now = new Date();
    let state = this.service.serverStates.get(serverId);

    if (!state) {
      state = this.service.createDefaultState(serverId);
      this.service.serverStates.set(serverId, state);
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
        status: 'starting',
        previousStatus: previousStatus,
        transitionStartedAt: now.toISOString(),
        expectedDuration: CONFIG.STARTING_TIMEOUT_MS
      };
      state.lastKnownStatus = 'starting';
    } else if (action === IntentType.STOP) {
      state.transitionState = {
        status: 'stopping',
        previousStatus: previousStatus,
        transitionStartedAt: now.toISOString(),
        expectedDuration: CONFIG.STOPPING_TIMEOUT_MS
      };
      state.lastKnownStatus = 'stopping';
    }

    logger.info(`[StateReconciliation] Recorded intent for ${serverId}: ${action} by ${initiator}`);

    // Invalidate cache
    this.service.statusCache.delete(serverId);
  }

  /**
   * Check if a stop was intentional (recent stop intent recorded)
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if stop was intentional
   */
  wasIntentionalStop(serverId) {
    const state = this.service.serverStates.get(serverId);
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
   * Clean up stale intent records
   */
  cleanupStaleRecords() {
    const now = Date.now();

    for (const [serverId, state] of this.service.serverStates.entries()) {
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
    for (const [serverId, cached] of this.service.statusCache.entries()) {
      if (isStale(cached.staleAfter)) {
        this.service.statusCache.delete(serverId);
      }
    }
  }
}
