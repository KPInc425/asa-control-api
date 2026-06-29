/**
 * Configuration and constants for state reconciliation
 */

/**
 * Configuration for state reconciliation
 */
export const CONFIG = {
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
export const IntentType = Object.freeze({
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart'
});
