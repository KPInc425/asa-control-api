import logger from "../utils/logger.js";
import { UPDATE_STATUS } from "./auto-update-constants.js";
import { getAllServerUpdateConfigs, updateLastCheckTime } from "./database.js";

/**
 * Update checking logic for the Auto-Update Service.
 */
export class AutoUpdateChecker {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Check all servers for available updates.
   */
  async checkAllServersForUpdates() {
    logger.info("[AutoUpdateService] Checking all servers for updates...");

    const configs = getAllServerUpdateConfigs();
    const enabledConfigs = configs.filter(
      (c) => c.auto_update === 1 || c.auto_update_enabled === 1,
    );

    for (const config of enabledConfigs) {
      try {
        await this.service.checkForUpdates(config.server_name);
      } catch (error) {
        logger.error(
          `[AutoUpdateService] Error checking ${config.server_name}:`,
          error,
        );
      }
    }
  }

  /**
   * Check if an update is available for a server.
   * @param {string} serverName
   * @returns {Object} Update status
   */
  async checkForUpdates(serverName) {
    logger.info(`[AutoUpdateService] Checking for updates: ${serverName}`);

    this.service.setStatus(serverName, UPDATE_STATUS.CHECKING);
    this.service.emit("auto-update:checking", {
      serverName,
      timestamp: new Date(),
    });

    try {
      updateLastCheckTime(serverName);

      const provisioner = this.service._provisionerFor(
        this.service._gameTypeFor(serverName),
      );
      const updateStatus = await provisioner.checkServerUpdateStatus(serverName);

      if (updateStatus.needsUpdate) {
        logger.info(
          `[AutoUpdateService] Update available for ${serverName}: ${updateStatus.reason}`,
        );

        this.service.setStatus(serverName, UPDATE_STATUS.AVAILABLE, {
          reason: updateStatus.reason,
          lastUpdate: updateStatus.lastUpdate,
        });

        this.service.emit("auto-update:available", {
          serverName,
          reason: updateStatus.reason,
          lastUpdate: updateStatus.lastUpdate,
          timestamp: new Date(),
        });

        const config = this.service.getConfig(serverName);
        if (config.enabled) {
          await this.service.initiateUpdate(serverName, {
            force: config.forceUpdate,
          });
        }

        return { available: true, ...updateStatus };
      } else {
        logger.info(`[AutoUpdateService] ${serverName} is up to date`);
        this.service.setStatus(serverName, UPDATE_STATUS.IDLE);
        return { available: false, ...updateStatus };
      }
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Error checking updates for ${serverName}:`,
        error,
      );
      this.service.setStatus(serverName, UPDATE_STATUS.FAILED, {
        error: error.message,
      });
      this.service.emit("auto-update:failed", {
        serverName,
        error: error.message,
        phase: "checking",
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Run update check on server start.
   * @param {string} serverName
   * @param {Object} options
   */
  async runUpdateOnStart(serverName, options = {}) {
    const config = this.service.getConfig(serverName);

    if (!config.updateOnStart) {
      return {
        success: true,
        skipped: true,
        reason: "update_on_start disabled",
      };
    }

    logger.info(
      `[AutoUpdateService] Running update-on-start check for ${serverName}`,
    );

    const provisioner = this.service._provisionerFor(
      this.service._gameTypeFor(serverName),
    );
    const updateStatus = await provisioner.checkServerUpdateStatus(serverName);
    updateLastCheckTime(serverName);

    if (updateStatus.needsUpdate) {
      this.service.setStatus(serverName, UPDATE_STATUS.AVAILABLE, {
        reason: updateStatus.reason,
        lastUpdate: updateStatus.lastUpdate,
      });
    }

    if (!updateStatus.needsUpdate) {
      return {
        success: true,
        skipped: true,
        reason: "no update available",
        updateStatus,
      };
    }

    if (this.service.pendingUpdates.has(serverName)) {
      return {
        success: true,
        started: true,
        reason: "update already in progress",
        updateStatus,
      };
    }

    const result = await this.service.initiateUpdate(serverName, {
      ...options,
      force: options.force ?? config.forceUpdate ?? false,
      triggeredBy: "updateOnStart",
    });

    return { ...result, started: !!result?.success, updateStatus };
  }
}
