/**
 * Transition Checker Module
 *
 * Manages transition states (starting/stopping) and timeout detection.
 */

import { ServerStatus } from '../../utils/statusContract.js';
import { CONFIG } from './config.js';

export class TransitionChecker {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Check if server is in starting transition
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if in starting transition
   */
  isInStartingTransition(serverId) {
    const state = this.service.serverStates.get(serverId);
    return state?.transitionState?.status === ServerStatus.STARTING;
  }

  /**
   * Check if server is in stopping transition
   * @param {string} serverId - Server identifier
   * @returns {boolean} True if in stopping transition
   */
  isInStoppingTransition(serverId) {
    const state = this.service.serverStates.get(serverId);
    return state?.transitionState?.status === ServerStatus.STOPPING;
  }

  /**
   * Check for transition timeout
   * @param {string} serverId - Server identifier
   * @returns {Object} Timeout check result
   */
  checkTransitionTimeout(serverId) {
    const state = this.service.serverStates.get(serverId);
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
}
