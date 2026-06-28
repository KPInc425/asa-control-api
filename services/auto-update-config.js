import logger from "../utils/logger.js";
import { DEFAULT_CONFIG, UPDATE_STATUS } from "./auto-update-constants.js";
import {
  getAutoUpdateConfig,
  setAutoUpdateConfig as dbSetAutoUpdateConfig,
  getServerUpdateConfig,
} from "./database.js";

/**
 * Configuration and status management for the Auto-Update Service.
 */
export class AutoUpdateConfig {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
    this.updateStatus = new Map(); // serverName -> status object
  }

  /**
   * Get update status for a server.
   * @param {string} serverName
   * @returns {Object|null}
   */
  getUpdateStatus(serverName) {
    return this.updateStatus.get(serverName) || null;
  }

  /**
   * Set update status for a server.
   * @param {string} serverName
   * @param {string} status
   * @param {Object} [details]
   */
  setStatus(serverName, status, details = {}) {
    this.updateStatus.set(serverName, {
      status,
      ...details,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get merged config for a server (DB config + auto config + defaults).
   * @param {string} serverName
   * @returns {Object}
   */
  getConfig(serverName) {
    const dbConfig = getServerUpdateConfig(serverName) || {};
    const autoConfig = getAutoUpdateConfig(serverName) || {};

    return {
      ...DEFAULT_CONFIG,
      // Base update config fields
      updateOnStart: dbConfig.update_on_start !== 0,
      lastUpdate: dbConfig.last_update || null,
      updateEnabled: dbConfig.update_enabled !== 0,
      updateInterval: dbConfig.update_interval || 24,
      updateSchedule: dbConfig.update_schedule || null,
      // Auto-update config fields (override defaults)
      enabled: autoConfig.auto_update_enabled ?? DEFAULT_CONFIG.enabled,
      warningMinutes: autoConfig.warning_minutes ?? DEFAULT_CONFIG.warningMinutes,
      checkIntervalMinutes:
        autoConfig.auto_update_check_interval ?? DEFAULT_CONFIG.checkIntervalMinutes,
      forceUpdate: DEFAULT_CONFIG.forceUpdate,
      updateIfEmpty:
        autoConfig.auto_update_if_empty ?? DEFAULT_CONFIG.updateIfEmpty,
      notifyDiscord: autoConfig.notify_discord ?? DEFAULT_CONFIG.notifyDiscord,
      notifyInGame: autoConfig.notify_rcon ?? DEFAULT_CONFIG.notifyInGame,
      autoRestart: autoConfig.auto_restart ?? DEFAULT_CONFIG.autoRestart,
    };
  }

  /**
   * Persist config to DB and restart scheduler if running.
   * @param {string} serverName
   * @param {Object} config
   */
  setConfig(serverName, config) {
    dbSetAutoUpdateConfig(serverName, config);

    if (this.service.scheduler.isRunning) {
      this.service.scheduler.stopServerScheduler(serverName);
      if (config.auto_update_enabled) {
        this.service.scheduler.startServerScheduler(serverName);
      }
    }
  }

  /**
   * Cancel an in-progress update (warning phase only).
   * @param {string} serverName
   */
  cancelUpdate(serverName) {
    const status = this.getUpdateStatus(serverName);
    if (
      status &&
      (status.status === UPDATE_STATUS.WARNING ||
        status.status === UPDATE_STATUS.AVAILABLE)
    ) {
      this.service.cancelWarnings(serverName);
      this.setStatus(serverName, UPDATE_STATUS.CANCELLED);
      logger.info(`[AutoUpdateService] Update cancelled for ${serverName}`);
      return { success: true, message: `Update cancelled for ${serverName}` };
    }
    return {
      success: false,
      message: `No active update to cancel for ${serverName}`,
    };
  }

  /**
   * Force an immediate update, bypassing warnings.
   * @param {string} serverName
   * @param {Object} options
   */
  async forceUpdate(serverName, options = {}) {
    this.service.cancelWarnings(serverName);
    return await this.service.performUpdate(serverName, {
      ...options,
      force: true,
    });
  }

  /**
   * Aggregate all server statuses with config + scheduler state.
   * @returns {Object}
   */
  getAllStatuses() {
    const configs = getServerUpdateConfig();
    const statuses = {};

    for (const config of configs || []) {
      const name = config.server_name;
      const status = this.getUpdateStatus(name);
      const fullConfig = this.getConfig(name);

      statuses[name] = {
        status: status?.status || UPDATE_STATUS.IDLE,
        details: status || {},
        config: fullConfig,
        scheduler: {
          active: this.service.scheduler.schedulers.has(name),
          global: this.service.scheduler.isRunning,
        },
      };
    }

    return statuses;
  }

  /** Simple promise-based delay. */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
