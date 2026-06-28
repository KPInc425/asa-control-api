/**
 * Constants for the Auto-Update Service
 */

export const WARNING_RECHECK_INTERVAL_MS = 60 * 1000;
export const SAVE_RETRY_COUNT = 3;
export const SAVE_RETRY_DELAY_MS = 5000;
export const STARTUP_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
export const STARTUP_VERIFY_INTERVAL_MS = 5000;

/**
 * Default configuration for auto-updates
 */
export const DEFAULT_CONFIG = {
  enabled: false,
  warningMinutes: [30, 10, 5, 1],
  checkIntervalMinutes: 60,
  cronExpression: null,
  forceUpdate: false,
  updateIfEmpty: true,
  notifyDiscord: true,
  notifyInGame: true,
  autoRestart: true,
};

/**
 * Update status tracking
 */
export const UPDATE_STATUS = {
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  WARNING: "warning",
  UPDATING: "updating",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};
