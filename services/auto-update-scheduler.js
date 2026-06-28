import logger from "../utils/logger.js";
import { DEFAULT_CONFIG } from "./auto-update-constants.js";

/**
 * Scheduler management for the Auto-Update Service.
 * Manages global and per-server interval-based update checking.
 */
export class AutoUpdateScheduler {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
    this.schedulers = new Map(); // serverName -> intervalId
    this.globalScheduler = null;
    this.isRunning = false;
  }

  /**
   * Start the global update scheduler — checks all servers at regular intervals.
   */
  startScheduler() {
    if (this.isRunning) {
      logger.warn("[AutoUpdateService] Scheduler already running");
      return;
    }

    logger.info("[AutoUpdateService] Starting global scheduler");
    this.isRunning = true;

    const checkIntervalMs = 60 * 60 * 1000; // 1 hour

    this.globalScheduler = setInterval(async () => {
      await this.service.checkAllServersForUpdates();
    }, checkIntervalMs);

    this.service
      .checkAllServersForUpdates()
      .catch((error) => {
        logger.error("[AutoUpdateService] Error in initial update check:", error);
      });

    this.service.emit("scheduler:started");
    logger.info("[AutoUpdateService] Global scheduler started");
  }

  /**
   * Stop the global update scheduler and all per-server schedulers.
   */
  stopScheduler() {
    if (!this.isRunning) {
      logger.warn("[AutoUpdateService] Scheduler not running");
      return;
    }

    logger.info("[AutoUpdateService] Stopping global scheduler");

    if (this.globalScheduler) {
      clearInterval(this.globalScheduler);
      this.globalScheduler = null;
    }

    for (const [serverName, intervalId] of this.schedulers.entries()) {
      clearInterval(intervalId);
      this.schedulers.delete(serverName);
    }

    for (const [, timers] of this.service.warningTimers.entries()) {
      timers.forEach((timer) => clearTimeout(timer));
    }
    this.service.warningTimers.clear();

    this.isRunning = false;
    this.service.emit("scheduler:stopped");
    logger.info("[AutoUpdateService] All schedulers stopped");
  }

  /**
   * Start scheduler for a specific server.
   * @param {string} serverName
   */
  startServerScheduler(serverName) {
    if (this.schedulers.has(serverName)) {
      logger.warn(`[AutoUpdateService] Scheduler already running for ${serverName}`);
      return;
    }

    const config = this.service.getConfig(serverName);
    if (!config.enabled) {
      logger.info(`[AutoUpdateService] Auto-update disabled for ${serverName}`);
      return;
    }

    const checkIntervalMs = (config.checkIntervalMinutes || 60) * 60 * 1000;

    const intervalId = setInterval(async () => {
      await this.service.checkForUpdates(serverName);
    }, checkIntervalMs);

    this.schedulers.set(serverName, intervalId);
    logger.info(
      `[AutoUpdateService] Started scheduler for ${serverName} (interval: ${config.checkIntervalMinutes}min)`,
    );
  }

  /**
   * Stop scheduler for a specific server.
   * @param {string} serverName
   */
  stopServerScheduler(serverName) {
    const intervalId = this.schedulers.get(serverName);
    if (intervalId) {
      clearInterval(intervalId);
      this.schedulers.delete(serverName);
      logger.info(`[AutoUpdateService] Stopped scheduler for ${serverName}`);
    }
    this.service.cancelWarnings(serverName);
  }
}
