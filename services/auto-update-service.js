/**
 * Auto-Update Service for ARK Server Admin Suite
 * 
 * Handles automated server updates with:
 * - Cron-based scheduling for update checks
 * - Per-server configuration
 * - Safe update flow with player warnings
 * - Event emission for integration with other services
 * - Discord and in-game notifications
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { ServerProvisioner } from './server-provisioner.js';
import { NativeServerManager } from './server-manager.js';
import rconService from './rcon.js';
import DiscordService from './discord.js';
import { NotificationService } from './notifications/adapters.js';
import {
  createJob,
  updateJob,
  addJobProgress,
  getJob
} from './job-manager.js';
import {
  upsertServerUpdateConfig,
  getAutoUpdateConfig,
  getServerUpdateConfig,
  getAllServerUpdateConfigs,
  setAutoUpdateConfig,
  updateLastAppliedTime,
  updateLastCheckTime,
  updateServerLastUpdate,
  saveServerUpdateHistory
} from './database.js';

const WARNING_RECHECK_INTERVAL_MS = 60 * 1000;
const SAVE_RETRY_COUNT = 3;
const SAVE_RETRY_DELAY_MS = 5000;
const STARTUP_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
const STARTUP_VERIFY_INTERVAL_MS = 5000;

/**
 * Default configuration for auto-updates
 */
const DEFAULT_CONFIG = {
  enabled: false,
  warningMinutes: [30, 10, 5, 1],
  checkIntervalMinutes: 60, // Check every hour by default
  cronExpression: null, // Optional cron expression (overrides checkIntervalMinutes)
  forceUpdate: false, // If true, update even if players are present
  updateIfEmpty: true, // If true, only auto-update when no players are connected
  notifyDiscord: true,
  notifyInGame: true,
  autoRestart: true // Automatically restart server after update
};

/**
 * Update status tracking
 */
const UPDATE_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  WARNING: 'warning',
  UPDATING: 'updating',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * AutoUpdateService - Manages automated server updates
 */
export class AutoUpdateService extends EventEmitter {
  constructor() {
    super();
    
    // Service dependencies
    this.serverProvisioner = null; // Lazy, created per-game-type
    this._provisionersByGame = new Map(); // gameType -> ServerProvisioner
    this.schedulers = new Map(); // serverName -> intervalId
    this.updateStatus = new Map(); // serverName -> status object
    this.warningTimers = new Map(); // serverName -> array of timeouts
    this.pendingUpdates = new Map(); // serverName -> update promise
    
    // Global scheduler for checking all servers
    this.globalScheduler = null;
    this.isRunning = false;
    
    // Socket.io reference for real-time updates
    this.io = null;
    
    logger.info('[AutoUpdateService] Initialized');
  }

  // -----------------------------------------------------------------------
  // Game-type-aware provisioner resolution
  // -----------------------------------------------------------------------

  /**
   * Get (or create) a ServerProvisioner for the given game type.
   * @param {string} gameType
   * @returns {ServerProvisioner}
   */
  _provisionerFor(gameType) {
    if (!this._provisionersByGame.has(gameType)) {
      const p = new ServerProvisioner(gameType);
      this._provisionersByGame.set(gameType, p);
    }
    return this._provisionersByGame.get(gameType);
  }

  /**
   * Resolve the game type for a server from its DB config.
   * @param {string} serverName
   * @returns {string}
   */
  _gameTypeFor(serverName) {
    try {
      const cfg = getServerUpdateConfig(serverName);
      return cfg?.game_type || 'ark';
    } catch {
      return 'ark';
    }
  }

  // -----------------------------------------------------------------------
  // Socket.io
  // -----------------------------------------------------------------------

  /**
   * Set the Socket.io instance for real-time broadcasts
   * @param {Object} io - Socket.io server instance
   */
  setSocketIO(io) {
    this.io = io;
    if (this.notificationService) {
      this.notificationService.setSocketIO(io);
    }
    logger.info('[AutoUpdateService] Socket.io instance set');
  }

  /**
   * Set the NotificationService instance
   * @param {NotificationService} notificationService - NotificationService instance
   */
  setNotificationService(notificationService) {
    this.notificationService = notificationService;
    logger.info('[AutoUpdateService] NotificationService instance set');
  }

  /**
   * Initialize the service with dependencies
   * @param {Object} options - Initialization options
   */
  async initialize(options = {}) {
    try {
      logger.info('[AutoUpdateService] Starting initialization...');
      
      // Initialize provisioners per game type from DB configs
      const configs = getAllServerUpdateConfigs();
      const gameTypes = new Set(configs.map(c => c.game_type || 'ark'));
      for (const gameType of gameTypes) {
        const prov = this._provisionerFor(gameType);
        await prov.initialize();
      }

      // Initialize notification service if not already set
      if (!this.notificationService) {
        // Use global notification service if available, otherwise create new instance
        this.notificationService = global.notificationService || new NotificationService({
          io: this.io || global.io,
          discordService: this.discordService,
          defaultChannels: { rcon: true, discord: true, socket: true }
        });
      }
      
      // Set socket.io if available globally
      if (!this.io && global.io) {
        this.setSocketIO(global.io);
      }

      // Reuse the configs already loaded above for game type detection
      logger.info(`[AutoUpdateService] Loaded ${configs.length} server update configurations`);
      
      // Register RCON configs for each server
      for (const config of configs) {
        const rconConfig = await this.getServerRconConfig(config.server_name);
        if (rconConfig) {
          this.notificationService.registerRconConfig(config.server_name, rconConfig);
        }
      }
      
      // Auto-start schedulers for enabled servers
      for (const config of configs) {
        if (config.auto_update === 1 || config.auto_update_enabled === 1) {
          this.startServerScheduler(config.server_name);
        }
      }
      
      logger.info('[AutoUpdateService] Initialization complete');
      return { success: true };
    } catch (error) {
      logger.error('[AutoUpdateService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the global update scheduler
   * This checks all servers at regular intervals
   */
  startScheduler() {
    if (this.isRunning) {
      logger.warn('[AutoUpdateService] Scheduler already running');
      return;
    }
    
    logger.info('[AutoUpdateService] Starting global scheduler');
    this.isRunning = true;
    
    // Check all servers every hour by default
    const checkIntervalMs = 60 * 60 * 1000; // 1 hour
    
    this.globalScheduler = setInterval(async () => {
      await this.checkAllServersForUpdates();
    }, checkIntervalMs);
    
    // Also run an immediate check
    this.checkAllServersForUpdates().catch(error => {
      logger.error('[AutoUpdateService] Error in initial update check:', error);
    });
    
    this.emit('scheduler:started');
    logger.info('[AutoUpdateService] Global scheduler started');
  }

  /**
   * Stop the global update scheduler
   */
  stopScheduler() {
    if (!this.isRunning) {
      logger.warn('[AutoUpdateService] Scheduler not running');
      return;
    }
    
    logger.info('[AutoUpdateService] Stopping global scheduler');
    
    if (this.globalScheduler) {
      clearInterval(this.globalScheduler);
      this.globalScheduler = null;
    }
    
    // Stop all server schedulers
    for (const [serverName, intervalId] of this.schedulers.entries()) {
      clearInterval(intervalId);
      this.schedulers.delete(serverName);
    }
    
    // Clear all warning timers
    for (const [serverName, timers] of this.warningTimers.entries()) {
      timers.forEach(timer => clearTimeout(timer));
      this.warningTimers.delete(serverName);
    }
    
    this.isRunning = false;
    this.emit('scheduler:stopped');
    logger.info('[AutoUpdateService] All schedulers stopped');
  }

  /**
   * Start scheduler for a specific server
   * @param {string} serverName - Server name
   */
  startServerScheduler(serverName) {
    if (this.schedulers.has(serverName)) {
      logger.warn(`[AutoUpdateService] Scheduler already running for ${serverName}`);
      return;
    }
    
    const config = this.getConfig(serverName);
    if (!config.enabled) {
      logger.info(`[AutoUpdateService] Auto-update disabled for ${serverName}`);
      return;
    }
    
    const checkIntervalMs = (config.checkIntervalMinutes || 60) * 60 * 1000;
    
    const intervalId = setInterval(async () => {
      await this.checkForUpdates(serverName);
    }, checkIntervalMs);
    
    this.schedulers.set(serverName, intervalId);
    logger.info(`[AutoUpdateService] Started scheduler for ${serverName} (interval: ${config.checkIntervalMinutes}min)`);
  }

  /**
   * Stop scheduler for a specific server
   * @param {string} serverName - Server name
   */
  stopServerScheduler(serverName) {
    const intervalId = this.schedulers.get(serverName);
    if (intervalId) {
      clearInterval(intervalId);
      this.schedulers.delete(serverName);
      logger.info(`[AutoUpdateService] Stopped scheduler for ${serverName}`);
    }
    
    // Also cancel any pending warnings
    this.cancelWarnings(serverName);
  }

  /**
   * Check all servers for available updates
   */
  async checkAllServersForUpdates() {
    logger.info('[AutoUpdateService] Checking all servers for updates...');
    
    const configs = getAllServerUpdateConfigs();
    const enabledConfigs = configs.filter(c => c.auto_update === 1 || c.auto_update_enabled === 1);
    
    for (const config of enabledConfigs) {
      try {
        await this.checkForUpdates(config.server_name);
      } catch (error) {
        logger.error(`[AutoUpdateService] Error checking ${config.server_name}:`, error);
      }
    }
  }

  /**
   * Check if an update is available for a server
   * @param {string} serverName - Server name
   * @returns {Object} Update status
   */
  async checkForUpdates(serverName) {
    logger.info(`[AutoUpdateService] Checking for updates: ${serverName}`);
    
    this.setStatus(serverName, UPDATE_STATUS.CHECKING);
    this.emit('auto-update:checking', { serverName, timestamp: new Date() });
    
    try {
      updateLastCheckTime(serverName);

      // Get update status from server provisioner
      const provisioner = this._provisionerFor(this._gameTypeFor(serverName));
      const updateStatus = await provisioner.checkServerUpdateStatus(serverName);
      
      if (updateStatus.needsUpdate) {
        logger.info(`[AutoUpdateService] Update available for ${serverName}: ${updateStatus.reason}`);
        
        this.setStatus(serverName, UPDATE_STATUS.AVAILABLE, {
          reason: updateStatus.reason,
          lastUpdate: updateStatus.lastUpdate
        });
        
        this.emit('auto-update:available', {
          serverName,
          reason: updateStatus.reason,
          lastUpdate: updateStatus.lastUpdate,
          timestamp: new Date()
        });
        
        // Get config to check if we should auto-update
        const config = this.getConfig(serverName);
        if (config.enabled) {
          await this.initiateUpdate(serverName, { force: config.forceUpdate });
        }
        
        return { available: true, ...updateStatus };
      } else {
        logger.info(`[AutoUpdateService] ${serverName} is up to date`);
        this.setStatus(serverName, UPDATE_STATUS.IDLE);
        return { available: false, ...updateStatus };
      }
    } catch (error) {
      logger.error(`[AutoUpdateService] Error checking updates for ${serverName}:`, error);
      this.setStatus(serverName, UPDATE_STATUS.FAILED, { error: error.message });
      this.emit('auto-update:failed', {
        serverName,
        error: error.message,
        phase: 'checking',
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Initiate the update process for a server
   * @param {string} serverName - Server name
   * @param {Object} options - Update options
   */
  async initiateUpdate(serverName, options = {}) {
    const config = this.getConfig(serverName);
    
    // Check if update is already in progress
    if (this.pendingUpdates.has(serverName)) {
      logger.warn(`[AutoUpdateService] Update already in progress for ${serverName}`);
      return { success: false, message: 'Update already in progress' };
    }
    
    // Check for players if not forcing
    if (!options.force) {
      const playerState = await this.getPlayerConnectionState(serverName);
      const playersConnected = playerState.hasPlayers;
      
      if (playersConnected) {
        await this.startWarningCountdown(serverName, {
          ...options,
          initialPlayerCount: playerState.count
        });
        return {
          success: true,
          message: `Warning countdown started for ${playerState.count} connected player(s)`
        };
      }
    }
    
    // No players or force update - proceed directly
    return await this.performUpdate(serverName, options);
  }

  /**
   * Start the warning countdown before an update
   * @param {string} serverName - Server name
   * @param {Object} options - Update options
   */
  async startWarningCountdown(serverName, options = {}) {
    const config = this.getConfig(serverName);
    const warningMinutes = config.warningMinutes || DEFAULT_CONFIG.warningMinutes;
    const sortedWarningMinutes = [...warningMinutes].sort((a, b) => b - a);
    const maxWarningMinutes = Math.max(...sortedWarningMinutes, 0);
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + (maxWarningMinutes * 60 * 1000));
    
    logger.info(`[AutoUpdateService] Starting warning countdown for ${serverName}: ${sortedWarningMinutes.join(', ')} minutes`);
    
    this.setStatus(serverName, UPDATE_STATUS.WARNING, { 
      warningMinutes: sortedWarningMinutes,
      startedAt,
      deadlineAt,
      playersDetectedAtStart: options.initialPlayerCount ?? null
    });
    
    // Cancel any existing timers
    this.cancelWarnings(serverName);
    
    const timers = [];
    
    // Schedule warning notifications
    for (const minutes of sortedWarningMinutes) {
      const delayMs = (maxWarningMinutes - minutes) * 60 * 1000;
      
      const timer = setTimeout(async () => {
        await this.sendWarningNotification(serverName, minutes, { deadlineAt });
      }, delayMs);
      
      timers.push(timer);
    }

    const recheckTimer = setInterval(async () => {
      try {
        await this.handleWarningPhaseRecheck(serverName, options, deadlineAt);
      } catch (error) {
        logger.warn(`[AutoUpdateService] Warning recheck failed for ${serverName}:`, error.message);
      }
    }, WARNING_RECHECK_INTERVAL_MS);

    timers.push(recheckTimer);
    
    // Schedule the actual update after the last warning
    const updateDelayMs = maxWarningMinutes * 60 * 1000;
    const updateTimer = setTimeout(async () => {
      await this.performUpdate(serverName, {
        ...options,
        playerStateAtExecution: await this.getPlayerConnectionState(serverName)
      });
    }, updateDelayMs);
    
    timers.push(updateTimer);
    this.warningTimers.set(serverName, timers);
    
    // Send initial notification
    if (maxWarningMinutes > 0) {
      await this.sendWarningNotification(serverName, maxWarningMinutes, { deadlineAt });
    }
    
    return { success: true, firstWarning: maxWarningMinutes };
  }

  async handleWarningPhaseRecheck(serverName, options, deadlineAt) {
    if (!this.warningTimers.has(serverName) || this.pendingUpdates.has(serverName)) {
      return;
    }

    const playerState = await this.getPlayerConnectionState(serverName);
    const now = new Date();

    this.setStatus(serverName, UPDATE_STATUS.WARNING, {
      ...this.getUpdateStatus(serverName),
      deadlineAt,
      lastPlayerCheckAt: now,
      playersConnected: playerState.count
    });

    if (!playerState.hasPlayers) {
      logger.info(`[AutoUpdateService] ${serverName} is empty during warning phase, proceeding immediately`);
      this.cancelWarnings(serverName);

      try {
        await this.sendInGameBroadcast(serverName, '[AUTO-UPDATE] Server is now empty. Applying update immediately.');
      } catch (error) {
        logger.debug(`[AutoUpdateService] Empty-server broadcast skipped for ${serverName}: ${error.message}`);
      }

      await this.performUpdate(serverName, {
        ...options,
        startedEarlyBecauseEmpty: true,
        playerStateAtExecution: playerState
      });
      return;
    }

    saveServerUpdateHistory(serverName, {
      eventType: 'warning',
      status: 'in_progress',
      message: `Update pending with ${playerState.count} player(s) online`,
      details: {
        playersOnline: playerState.count,
        checkedAt: now.toISOString(),
        deadlineAt: deadlineAt.toISOString()
      }
    });
  }

  /**
   * Send a warning notification
   * @param {string} serverName - Server name
   * @param {number} minutesRemaining - Minutes until update
   */
  async sendWarningNotification(serverName, minutesRemaining, context = {}) {
    logger.info(`[AutoUpdateService] Sending ${minutesRemaining}min warning for ${serverName}`);
    
    const config = this.getConfig(serverName);
    const playerState = await this.getPlayerConnectionState(serverName);
    const message = `[AUTO-UPDATE] Server will restart for update in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}. Please save your progress!`;
    
    this.emit('auto-update:warning', {
      serverName,
      minutesRemaining,
      message,
      timestamp: new Date()
    });

    saveServerUpdateHistory(serverName, {
      eventType: 'warning',
      status: 'in_progress',
      message,
      details: {
        minutesRemaining,
        playersOnline: playerState.count,
        deadlineAt: context.deadlineAt?.toISOString?.() || null
      }
    });
    
    // Use NotificationService if available for unified notifications
    if (this.notificationService) {
      try {
        const rconConfig = await this.getServerRconConfig(serverName);
        await this.notificationService.sendUpdateWarning(serverName, minutesRemaining, {
          rconConfig,
          channels: {
            rcon: config.notifyInGame,
            discord: config.notifyDiscord,
            socket: true
          }
        });
      } catch (error) {
        logger.error(`[AutoUpdateService] NotificationService warning failed:`, error);
      }
    } else {
      // Fallback to direct service calls
      // Send in-game broadcast
      if (config.notifyInGame) {
        try {
          await this.sendInGameBroadcast(serverName, message);
        } catch (error) {
          logger.error(`[AutoUpdateService] Failed to send in-game broadcast:`, error);
        }
      }
      
      // Send Discord notification
      if (config.notifyDiscord) {
        try {
          await this.discordService.sendNotification({
            type: 'server_status',
            serverName,
            message: `⚠️ ${message}`,
            timestamp: new Date(),
            data: {
              status: 'updating',
              minutesRemaining
            }
          });
        } catch (error) {
          logger.error(`[AutoUpdateService] Failed to send Discord notification:`, error);
        }
      }
    }
  }

  /**
   * Cancel pending warning timers for a server
   * @param {string} serverName - Server name
   */
  cancelWarnings(serverName) {
    const timers = this.warningTimers.get(serverName);
    if (timers) {
      timers.forEach(timer => clearTimeout(timer));
      this.warningTimers.delete(serverName);
      logger.info(`[AutoUpdateService] Cancelled warnings for ${serverName}`);
    }
  }

  /**
   * Perform the actual server update
   * @param {string} serverName - Server name
   * @param {Object} options - Update options
   * @returns {Object} Update result
   */
  async performUpdate(serverName, options = {}) {
    logger.info(`[AutoUpdateService] Starting update for ${serverName}`);
    
    // Prevent duplicate updates
    if (this.pendingUpdates.has(serverName)) {
      logger.warn(`[AutoUpdateService] Update already in progress for ${serverName}`);
      return { success: false, message: 'Update already in progress' };
    }
    
    // Cancel any pending warnings
    this.cancelWarnings(serverName);
    
    // Create a job for tracking
    const job = createJob('auto-update', {
      serverName,
      options,
      startedAt: new Date().toISOString()
    });
    
    const updatePromise = this.executeUpdate(serverName, options, job.id);
    this.pendingUpdates.set(serverName, updatePromise);
    
    try {
      const result = await updatePromise;
      return result;
    } finally {
      this.pendingUpdates.delete(serverName);
    }
  }

  /**
   * Execute the update workflow
   * @param {string} serverName - Server name
   * @param {Object} options - Update options
   * @param {string} jobId - Job ID for tracking
   * @returns {Object} Update result
   */
  async executeUpdate(serverName, options, jobId) {
    const config = this.getConfig(serverName);
    const steps = [
      'Preparing update',
      'Saving world data',
      'Stopping server',
      'Updating server binaries',
      'Starting server',
      'Verifying startup'
    ];
    
    let currentStep = 0;
    
    const emitProgress = (message, percent) => {
      addJobProgress(jobId, { message, percent });
      this.emit('auto-update:progress', {
        serverName,
        step: currentStep,
        totalSteps: steps.length,
        message,
        percent,
        timestamp: new Date()
      });
    };
    
    this.setStatus(serverName, UPDATE_STATUS.UPDATING, { jobId, startedAt: new Date() });
    this.emit('auto-update:starting', { serverName, jobId, timestamp: new Date() });
    
    try {
      // Step 1: Prepare
      currentStep = 1;
      emitProgress(steps[0], 10);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[0]}`);
      
      // Send final warning using NotificationService if available
      if (this.notificationService) {
        try {
          const rconConfig = await this.getServerRconConfig(serverName);
          await this.notificationService.sendUpdateStarting(serverName, {
            rconConfig,
            channels: {
              rcon: config.notifyInGame,
              discord: config.notifyDiscord,
              socket: true
            }
          });
        } catch (error) {
          logger.warn(`[AutoUpdateService] Failed to send update starting notification:`, error);
        }
      } else if (config.notifyInGame) {
        try {
          await this.sendInGameBroadcast(serverName, '[AUTO-UPDATE] Server update starting NOW. The server will restart shortly.');
        } catch (error) {
          logger.warn(`[AutoUpdateService] Failed to send final warning:`, error);
        }
      }
      
      // Step 2: Save world
      currentStep = 2;
      emitProgress(steps[1], 20);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[1]}`);
      
      try {
        await this.saveWorldDataWithRetry(serverName);
        logger.info(`[AutoUpdateService] ${serverName}: World data saved`);
      } catch (error) {
        logger.warn(`[AutoUpdateService] ${serverName}: Failed to save world (may be offline):`, error.message);
      }
      
      // Step 3: Stop server
      currentStep = 3;
      emitProgress(steps[2], 35);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[2]}`);
      
      await this.stopServer(serverName);
      logger.info(`[AutoUpdateService] ${serverName}: Server stopped`);
      
      // Step 4: Update binaries
      currentStep = 4;
      emitProgress(steps[3], 50);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[3]}`);
      
      await this._provisionerFor(this._gameTypeFor(serverName)).updateServerBinaries(serverName);
      logger.info(`[AutoUpdateService] ${serverName}: Binaries updated`);
      
      // Update last update time in database
      updateServerLastUpdate(serverName);
      updateLastAppliedTime(serverName);
      
      // Step 5: Start server
      if (config.autoRestart) {
        currentStep = 5;
        emitProgress(steps[4], 80);
        logger.info(`[AutoUpdateService] ${serverName}: ${steps[4]}`);
        
        await this.startServer(serverName);
        logger.info(`[AutoUpdateService] ${serverName}: Server started`);
        
        // Step 6: Verify startup
        currentStep = 6;
        emitProgress(steps[5], 95);
        logger.info(`[AutoUpdateService] ${serverName}: ${steps[5]}`);
        
        await this.verifyServerStartup(serverName);
      }
      
      // Complete
      emitProgress('Update completed successfully', 100);
      
      this.setStatus(serverName, UPDATE_STATUS.COMPLETED, { 
        completedAt: new Date(),
        jobId 
      });
      
      updateJob(jobId, { 
        status: 'completed',
        result: { success: true, completedAt: new Date().toISOString() }
      });
      
      this.emit('auto-update:completed', {
        serverName,
        jobId,
        timestamp: new Date()
      });
      
      // Save to update history
      try {
        saveServerUpdateHistory(serverName, {
          eventType: 'complete',
          status: 'success',
          message: 'Update completed successfully',
          details: {
            jobId,
            playersOnlineAtExecution: options.playerStateAtExecution?.count ?? null,
            startedEarlyBecauseEmpty: !!options.startedEarlyBecauseEmpty
          }
        });
      } catch (historyError) {
        logger.warn(`[AutoUpdateService] Failed to save update history:`, historyError);
      }
      
      // Send completion notification using NotificationService
      if (this.notificationService) {
        try {
          const rconConfig = await this.getServerRconConfig(serverName);
          await this.notificationService.sendUpdateCompleted(serverName, {
            rconConfig,
            channels: {
              rcon: config.notifyInGame,
              discord: config.notifyDiscord,
              socket: true
            }
          });
        } catch (error) {
          logger.error(`[AutoUpdateService] Failed to send completion notification:`, error);
        }
      } else if (config.notifyDiscord) {
        try {
          await this.discordService.sendNotification({
            type: 'server_start',
            serverName,
            message: `✅ Server update completed successfully and server is back online.`,
            timestamp: new Date(),
            data: { status: 'online' }
          });
        } catch (error) {
          logger.error(`[AutoUpdateService] Failed to send completion notification:`, error);
        }
      }
      
      logger.info(`[AutoUpdateService] ${serverName}: Update completed successfully`);
      
      return { success: true, jobId };
      
    } catch (error) {
      logger.error(`[AutoUpdateService] ${serverName}: Update failed at step ${currentStep}:`, error);
      
      this.setStatus(serverName, UPDATE_STATUS.FAILED, {
        error: error.message,
        failedStep: currentStep,
        failedAt: new Date()
      });
      
      updateJob(jobId, { 
        status: 'failed',
        error: error.message
      });
      
      this.emit('auto-update:failed', {
        serverName,
        jobId,
        error: error.message,
        phase: steps[currentStep - 1] || 'unknown',
        timestamp: new Date()
      });
      
      // Save to update history
      try {
        saveServerUpdateHistory(serverName, {
          eventType: 'error',
          status: 'failed',
          message: error.message,
          details: { 
            jobId, 
            failedStep: currentStep,
            phase: steps[currentStep - 1] || 'unknown'
          }
        });
      } catch (historyError) {
        logger.warn(`[AutoUpdateService] Failed to save failure history:`, historyError);
      }
      
      // Send failure notification using NotificationService
      if (this.notificationService) {
        try {
          const rconConfig = await this.getServerRconConfig(serverName);
          await this.notificationService.sendUpdateFailed(serverName, error.message, {
            rconConfig,
            channels: {
              rcon: config.notifyInGame,
              discord: config.notifyDiscord,
              socket: true
            }
          });
        } catch (notifyError) {
          logger.error(`[AutoUpdateService] Failed to send error notification:`, notifyError);
        }
      } else if (config.notifyDiscord) {
        try {
          await this.discordService.sendErrorNotification(
            serverName,
            error,
            'Auto-update process'
          );
        } catch (notifyError) {
          logger.error(`[AutoUpdateService] Failed to send error notification:`, notifyError);
        }
      }
      
      // Attempt to restart the server if it was stopped
      if (currentStep > 3 && config.autoRestart) {
        try {
          logger.info(`[AutoUpdateService] ${serverName}: Attempting to restart server after failed update`);
          await this.startServer(serverName);
        } catch (restartError) {
          logger.error(`[AutoUpdateService] ${serverName}: Failed to restart server:`, restartError);
        }
      }
      
      throw error;
    }
  }

  /**
   * Check if players are connected to a server
   * @param {string} serverName - Server name
   * @returns {boolean} True if players are connected
   */
  async checkPlayersConnected(serverName) {
    const playerState = await this.getPlayerConnectionState(serverName);
    return playerState.hasPlayers;
  }

  async getPlayerConnectionState(serverName) {
    try {
      const serverConfig = await this.getServerRconConfig(serverName);
      if (!serverConfig) {
        logger.warn(`[AutoUpdateService] No RCON config found for ${serverName}`);
        return {
          hasPlayers: false,
          count: 0,
          players: [],
          checkedAt: new Date().toISOString(),
          source: 'missing-rcon'
        };
      }
      
      const players = await rconService.getPlayerList(serverName, serverConfig);
      const hasPlayers = Array.isArray(players) && players.length > 0;
      
      logger.info(`[AutoUpdateService] ${serverName}: ${hasPlayers ? players.length : 0} players connected`);
      return {
        hasPlayers,
        count: hasPlayers ? players.length : 0,
        players: Array.isArray(players) ? players : [],
        checkedAt: new Date().toISOString(),
        source: 'rcon'
      };
    } catch (error) {
      logger.warn(`[AutoUpdateService] Failed to check players for ${serverName}:`, error.message);
      // Assume no players if we can't check (server might be offline)
      return {
        hasPlayers: false,
        count: 0,
        players: [],
        checkedAt: new Date().toISOString(),
        source: 'error',
        error: error.message
      };
    }
  }

  async runUpdateOnStart(serverName, options = {}) {
    const config = this.getConfig(serverName);

    if (!config.updateOnStart) {
      return { success: true, skipped: true, reason: 'update_on_start disabled' };
    }

    logger.info(`[AutoUpdateService] Running update-on-start check for ${serverName}`);

    const provisioner = this._provisionerFor(this._gameTypeFor(serverName));
    const updateStatus = await provisioner.checkServerUpdateStatus(serverName);
    updateLastCheckTime(serverName);

    if (updateStatus.needsUpdate) {
      this.setStatus(serverName, UPDATE_STATUS.AVAILABLE, {
        reason: updateStatus.reason,
        lastUpdate: updateStatus.lastUpdate
      });
    }

    if (!updateStatus.needsUpdate) {
      return { success: true, skipped: true, reason: 'no update available', updateStatus };
    }

    if (this.pendingUpdates.has(serverName)) {
      return { success: true, started: true, reason: 'update already in progress', updateStatus };
    }

    const result = await this.initiateUpdate(serverName, {
      ...options,
      force: options.force ?? config.forceUpdate ?? false,
      triggeredBy: 'updateOnStart'
    });

    return {
      ...result,
      started: !!result?.success,
      updateStatus
    };
  }

  /**
   * Send an in-game broadcast message
   * @param {string} serverName - Server name
   * @param {string} message - Message to broadcast
   */
  async sendInGameBroadcast(serverName, message) {
    try {
      const serverConfig = await this.getServerRconConfig(serverName);
      if (!serverConfig) {
        throw new Error(`No RCON config found for ${serverName}`);
      }
      
      await rconService.broadcast(serverName, message, serverConfig);
      logger.info(`[AutoUpdateService] Broadcast sent to ${serverName}: ${message}`);
    } catch (error) {
      logger.error(`[AutoUpdateService] Failed to broadcast to ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Save world data via RCON
   * @param {string} serverName - Server name
   */
  async saveWorldData(serverName) {
    try {
      const serverConfig = await this.getServerRconConfig(serverName);
      if (!serverConfig) {
        throw new Error(`No RCON config found for ${serverName}`);
      }
      
      await rconService.saveWorld(serverName, serverConfig);
      logger.info(`[AutoUpdateService] World saved for ${serverName}`);
    } catch (error) {
      logger.error(`[AutoUpdateService] Failed to save world for ${serverName}:`, error);
      throw error;
    }
  }

  async saveWorldDataWithRetry(serverName) {
    let lastError = null;

    for (let attempt = 1; attempt <= SAVE_RETRY_COUNT; attempt += 1) {
      try {
        await this.saveWorldData(serverName);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`[AutoUpdateService] Save attempt ${attempt}/${SAVE_RETRY_COUNT} failed for ${serverName}: ${error.message}`);

        if (attempt < SAVE_RETRY_COUNT) {
          await this.delay(SAVE_RETRY_DELAY_MS);
        }
      }
    }

    throw lastError || new Error(`Failed to save world for ${serverName}`);
  }

  /**
   * Stop a server
   * @param {string} serverName - Server name
   */
  async stopServer(serverName) {
    try {
      // First try graceful shutdown via RCON
      try {
        const serverConfig = await this.getServerRconConfig(serverName);
        if (serverConfig) {
          // Send shutdown command
          await rconService.sendCommand(serverConfig, 'DoExit');
          // Wait for graceful shutdown
          await this.delay(5000);
        }
      } catch (rconError) {
        logger.warn(`[AutoUpdateService] RCON shutdown failed for ${serverName}:`, rconError.message);
      }
      
      const stopResult = await this.nativeServerManager.stop(serverName);
      logger.info(`[AutoUpdateService] Server ${serverName} stop requested`, stopResult);
      await this.waitForRunningState(serverName, false, 30000);
      
    } catch (error) {
      logger.error(`[AutoUpdateService] Failed to stop ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Start a server
   * @param {string} serverName - Server name
   */
  async startServer(serverName) {
    try {
      const startResult = await this.nativeServerManager.start(serverName);
      logger.info(`[AutoUpdateService] Server ${serverName} start requested`, startResult);
      
    } catch (error) {
      logger.error(`[AutoUpdateService] Failed to start ${serverName}:`, error);
      throw error;
    }
  }

  async verifyServerStartup(serverName) {
    const started = await this.waitForRunningState(serverName, true, STARTUP_VERIFY_TIMEOUT_MS);

    if (!started) {
      throw new Error(`Server ${serverName} did not enter running state after update`);
    }

    const serverConfig = await this.getServerRconConfig(serverName);
    if (!serverConfig) {
      logger.warn(`[AutoUpdateService] No RCON config available for startup verification on ${serverName}`);
      return true;
    }

    try {
      await rconService.sendCommand(serverConfig, 'ListPlayers');
      return true;
    } catch (error) {
      logger.warn(`[AutoUpdateService] RCON verification failed for ${serverName}: ${error.message}`);
      return true;
    }
  }

  async waitForRunningState(serverName, shouldBeRunning, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const isRunning = await this.nativeServerManager.isRunning(serverName);
        if (isRunning === shouldBeRunning) {
          return true;
        }
      } catch (error) {
        logger.debug(`[AutoUpdateService] Running state check failed for ${serverName}: ${error.message}`);
      }

      await this.delay(STARTUP_VERIFY_INTERVAL_MS);
    }

    return false;
  }

  /**
   * Get RCON configuration for a server
   * @param {string} serverName - Server name
   * @returns {Object|null} RCON configuration
   */
  async getServerRconConfig(serverName) {
    try {
      // Try to get from server provisioner
      const provisioner = this._provisionerFor(this._gameTypeFor(serverName));
      const servers = await provisioner.listServers();
      const server = servers.find(s => s.name === serverName);
      
      if (server && server.rconPort) {
        return {
          host: server.host || 'localhost',
          port: server.rconPort,
          password: server.rconPassword || process.env.RCON_PASSWORD
        };
      }
      
      // Try clusters
      const clusters = await provisioner.listClusters();
      for (const cluster of clusters) {
        if (cluster.servers) {
          const clusterServer = cluster.servers.find(s => s.name === serverName);
          if (clusterServer && clusterServer.rconPort) {
            return {
              host: clusterServer.host || 'localhost',
              port: clusterServer.rconPort,
              password: clusterServer.rconPassword || process.env.RCON_PASSWORD
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`[AutoUpdateService] Error getting RCON config for ${serverName}:`, error);
      return null;
    }
  }

  /**
   * Get update status for a server
   * @param {string} serverName - Server name
   * @returns {Object} Update status
   */
  getUpdateStatus(serverName) {
    const status = this.updateStatus.get(serverName);
    if (!status) {
      return {
        status: UPDATE_STATUS.IDLE,
        serverName,
        lastChecked: null
      };
    }
    return status;
  }

  /**
   * Set update status for a server
   * @param {string} serverName - Server name
   * @param {string} status - Status constant
   * @param {Object} details - Additional details
   */
  setStatus(serverName, status, details = {}) {
    this.updateStatus.set(serverName, {
      status,
      serverName,
      ...details,
      updatedAt: new Date()
    });
  }

  /**
   * Get auto-update configuration for a server
   * @param {string} serverName - Server name
   * @returns {Object} Configuration
   */
  getConfig(serverName) {
    try {
      const dbConfig = getServerUpdateConfig(serverName);
      const autoConfig = getAutoUpdateConfig(serverName);
      
      if (dbConfig || autoConfig) {
        return {
          serverName,
          enabled: autoConfig?.auto_update_enabled ?? (dbConfig?.auto_update === 1),
          updateOnStart: dbConfig?.update_on_start === 1,
          lastUpdate: dbConfig?.last_update || autoConfig?.last_update_applied || null,
          checkIntervalMinutes: autoConfig?.auto_update_check_interval || dbConfig?.update_interval || DEFAULT_CONFIG.checkIntervalMinutes,
          cronExpression: dbConfig?.update_schedule || DEFAULT_CONFIG.cronExpression,
          warningMinutes: autoConfig?.warning_minutes || DEFAULT_CONFIG.warningMinutes,
          forceUpdate: DEFAULT_CONFIG.forceUpdate,
          updateIfEmpty: autoConfig?.auto_update_if_empty ?? DEFAULT_CONFIG.updateIfEmpty,
          notifyDiscord: autoConfig?.notify_discord ?? DEFAULT_CONFIG.notifyDiscord,
          notifyInGame: autoConfig?.notify_rcon ?? DEFAULT_CONFIG.notifyInGame,
          notifySocket: autoConfig?.notify_socket ?? true,
          notificationTemplates: autoConfig?.notification_templates || null,
          autoRestart: autoConfig?.auto_restart ?? DEFAULT_CONFIG.autoRestart
        };
      }
      
      return {
        serverName,
        ...DEFAULT_CONFIG
      };
    } catch (error) {
      logger.error(`[AutoUpdateService] Error getting config for ${serverName}:`, error);
      return {
        serverName,
        ...DEFAULT_CONFIG
      };
    }
  }

  /**
   * Set auto-update configuration for a server
   * @param {string} serverName - Server name
   * @param {Object} config - Configuration to set
   * @returns {Object} Result
   */
  setConfig(serverName, config) {
    try {
      const existing = this.getConfig(serverName);
      const updateData = {
        serverName,
        clusterName: config.clusterName || null,
        updateOnStart: config.updateOnStart !== undefined ? config.updateOnStart : existing.updateOnStart,
        updateEnabled: config.enabled !== undefined ? config.enabled : existing.enabled,
        autoUpdate: config.enabled !== undefined ? config.enabled : existing.enabled,
        updateInterval: config.checkIntervalMinutes || existing.checkIntervalMinutes || DEFAULT_CONFIG.checkIntervalMinutes,
        updateSchedule: config.cronExpression !== undefined ? config.cronExpression : existing.cronExpression
      };
      
      upsertServerUpdateConfig(updateData);

      setAutoUpdateConfig(serverName, {
        auto_update_enabled: config.enabled !== undefined ? config.enabled : existing.enabled,
        auto_update_check_interval: config.checkIntervalMinutes || existing.checkIntervalMinutes || DEFAULT_CONFIG.checkIntervalMinutes,
        auto_update_if_empty: config.updateIfEmpty !== undefined ? config.updateIfEmpty : existing.updateIfEmpty,
        notify_rcon: config.notifyInGame !== undefined ? config.notifyInGame : existing.notifyInGame,
        notify_discord: config.notifyDiscord !== undefined ? config.notifyDiscord : existing.notifyDiscord,
        notify_socket: config.notifySocket !== undefined ? config.notifySocket : existing.notifySocket,
        warning_minutes: config.warningMinutes || existing.warningMinutes || DEFAULT_CONFIG.warningMinutes,
        notification_templates: config.notificationTemplates !== undefined ? config.notificationTemplates : existing.notificationTemplates,
        auto_restart: config.autoRestart !== undefined ? config.autoRestart : existing.autoRestart
      });
      
      // Restart scheduler if running
      if (this.schedulers.has(serverName)) {
        this.stopServerScheduler(serverName);
        if (config.enabled) {
          this.startServerScheduler(serverName);
        }
      } else if (config.enabled) {
        this.startServerScheduler(serverName);
      }
      
      logger.info(`[AutoUpdateService] Configuration updated for ${serverName}`);
      
      return { success: true, config: this.getConfig(serverName) };
    } catch (error) {
      logger.error(`[AutoUpdateService] Error setting config for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a pending update
   * @param {string} serverName - Server name
   * @returns {Object} Result
   */
  cancelUpdate(serverName) {
    // Cancel warning timers
    this.cancelWarnings(serverName);
    
    // Update status
    const currentStatus = this.getUpdateStatus(serverName);
    if (currentStatus.status === UPDATE_STATUS.WARNING) {
      this.setStatus(serverName, UPDATE_STATUS.CANCELLED);
      logger.info(`[AutoUpdateService] Update cancelled for ${serverName}`);
      return { success: true, message: 'Update cancelled' };
    }
    
    if (currentStatus.status === UPDATE_STATUS.UPDATING) {
      logger.warn(`[AutoUpdateService] Cannot cancel update in progress for ${serverName}`);
      return { success: false, message: 'Cannot cancel update in progress' };
    }
    
    return { success: false, message: 'No pending update to cancel' };
  }

  /**
   * Force an immediate update check and apply
   * @param {string} serverName - Server name
   * @param {Object} options - Update options
   * @returns {Object} Result
   */
  async forceUpdate(serverName, options = {}) {
    logger.info(`[AutoUpdateService] Force update requested for ${serverName}`);
    return await this.performUpdate(serverName, { ...options, force: true });
  }

  /**
   * Get all server update statuses
   * @returns {Array} Array of status objects
   */
  getAllStatuses() {
    const statuses = [];
    
    // Get all configs
    const configs = getAllServerUpdateConfigs();
    
    for (const config of configs) {
      const status = this.getUpdateStatus(config.server_name);
      statuses.push({
        ...status,
        gameType: config.game_type || 'ark',
        config: this.getConfig(config.server_name),
        schedulerActive: this.schedulers.has(config.server_name)
      });
    }
    
    return statuses;
  }

  /**
   * Helper function for delays
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources on shutdown
   */
  async shutdown() {
    logger.info('[AutoUpdateService] Shutting down...');
    this.stopScheduler();
    this.removeAllListeners();
    logger.info('[AutoUpdateService] Shutdown complete');
  }
}

// Export singleton instance
const autoUpdateService = new AutoUpdateService();

export default autoUpdateService;

// Named exports for class and status constants
export { UPDATE_STATUS, DEFAULT_CONFIG };
