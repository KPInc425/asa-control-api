/**
 * Auto-Update Service for ARK Server Admin Suite
 *
 * Facade that composes sub-modules for scheduling, checking, warning,
 * execution, player state, and configuration management.
 */

import { EventEmitter } from "events";
import logger from "../utils/logger.js";
import { ServerProvisioner } from "./server-provisioner.js";
import { NotificationService } from "./notifications/adapters.js";
import { getAllServerUpdateConfigs } from "./database.js";
import { UPDATE_STATUS, DEFAULT_CONFIG } from "./auto-update-constants.js";
import { AutoUpdateScheduler } from "./auto-update-scheduler.js";
import { AutoUpdateChecker } from "./auto-update-checker.js";
import { AutoUpdateWarning } from "./auto-update-warning.js";
import { AutoUpdateExecutor } from "./auto-update-executor.js";
import { AutoUpdatePlayerState } from "./auto-update-player-state.js";
import { AutoUpdateConfig } from "./auto-update-config.js";

export { UPDATE_STATUS, DEFAULT_CONFIG } from "./auto-update-constants.js";

export class AutoUpdateService extends EventEmitter {
  constructor() {
    super();
    this.serverProvisioner = null;
    this._provisionersByGame = new Map();
    this.warningTimers = new Map();
    this.pendingUpdates = new Map();
    this.io = null;
    this.notificationService = null;
    this.discordService = null;
    this.scheduler = new AutoUpdateScheduler(this);
    this.checker = new AutoUpdateChecker(this);
    this.warning = new AutoUpdateWarning(this);
    this.executor = new AutoUpdateExecutor(this);
    this.playerState = new AutoUpdatePlayerState(this);
    this.config = new AutoUpdateConfig(this);
    logger.info("[AutoUpdateService] Initialized");
  }

  _provisionerFor(gameType) {
    if (!this._provisionersByGame.has(gameType)) {
      this._provisionersByGame.set(gameType, new ServerProvisioner(gameType));
    }
    return this._provisionersByGame.get(gameType);
  }

  async _gameTypeFor(serverName) {
    try {
      const { getServerUpdateConfig } = await import("./database.js");
      const cfg = getServerUpdateConfig(serverName);
      return cfg?.game_type || "ark";
    } catch { return "ark"; }
  }

  setSocketIO(io) {
    this.io = io;
    if (this.notificationService) this.notificationService.setSocketIO(io);
    logger.info("[AutoUpdateService] Socket.io instance set");
  }

  setNotificationService(notificationService) {
    this.notificationService = notificationService;
    logger.info("[AutoUpdateService] NotificationService instance set");
  }

  async initialize(options = {}) {
    try {
      logger.info("[AutoUpdateService] Starting initialization...");
      const configs = getAllServerUpdateConfigs();
      const gameTypes = new Set(configs.map((c) => c.game_type || "ark"));
      for (const gameType of gameTypes) await this._provisionerFor(gameType).initialize();
      if (!this.notificationService) {
        this.notificationService = global.notificationService || new NotificationService({
          io: this.io || global.io, discordService: this.discordService,
          defaultChannels: { rcon: true, discord: true, socket: true }
        });
      }
      if (!this.io && global.io) this.setSocketIO(global.io);
      logger.info("[AutoUpdateService] Loaded " + configs.length + " server update configurations");
      for (const config of configs) {
        const rconConfig = await this.getServerRconConfig(config.server_name);
        if (rconConfig) this.notificationService.registerRconConfig(config.server_name, rconConfig);
      }
      for (const config of configs) {
        if (config.auto_update === 1 || config.auto_update_enabled === 1) {
          this.scheduler.startServerScheduler(config.server_name);
        }
      }
      logger.info("[AutoUpdateService] Initialization complete");
      return { success: true };
    } catch (error) {
      logger.error("[AutoUpdateService] Initialization failed:", error);
      throw error;
    }
  }

  startScheduler() { return this.scheduler.startScheduler(); }
  stopScheduler() { return this.scheduler.stopScheduler(); }
  startServerScheduler(s) { return this.scheduler.startServerScheduler(s); }
  stopServerScheduler(s) { return this.scheduler.stopServerScheduler(s); }
  checkAllServersForUpdates() { return this.checker.checkAllServersForUpdates(); }
  checkForUpdates(s) { return this.checker.checkForUpdates(s); }
  runUpdateOnStart(s, o) { return this.checker.runUpdateOnStart(s, o || {}); }
  initiateUpdate(s, o) { return this.warning.initiateUpdate(s, o || {}); }
  startWarningCountdown(s, o) { return this.warning.startWarningCountdown(s, o || {}); }
  cancelWarnings(s) { return this.warning.cancelWarnings(s); }
  performUpdate(s, o) { return this.executor.performUpdate(s, o || {}); }
  checkPlayersConnected(s) { return this.playerState.checkPlayersConnected(s); }
  getPlayerConnectionState(s) { return this.playerState.getPlayerConnectionState(s); }
  sendInGameBroadcast(s, m) { return this.playerState.sendInGameBroadcast(s, m); }
  getServerRconConfig(s) { return this.playerState.getServerRconConfig(s); }
  stopServer(s) { return this.playerState.stopServer(s); }
  startServer(s) { return this.playerState.startServer(s); }
  verifyServerStartup(s) { return this.playerState.verifyServerStartup(s); }
  waitForRunningState(s, b, t) { return this.playerState.waitForRunningState(s, b, t); }
  getUpdateStatus(s) { return this.config.getUpdateStatus(s); }
  setStatus(s, st, d) { return this.config.setStatus(s, st, d || {}); }
  getConfig(s) { return this.config.getConfig(s); }
  setConfig(s, c) { return this.config.setConfig(s, c); }
  cancelUpdate(s) { return this.config.cancelUpdate(s); }
  forceUpdate(s, o) { return this.config.forceUpdate(s, o || {}); }
  getAllStatuses() { return this.config.getAllStatuses(); }
  delay(ms) { return this.config.delay(ms); }

  async shutdown() {
    this.scheduler.stopScheduler();
    this.removeAllListeners();
    logger.info("[AutoUpdateService] Shutdown complete");
  }
}

export default AutoUpdateService;
