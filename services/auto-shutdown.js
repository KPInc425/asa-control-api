import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import rconService from './rcon.js';
import DiscordService from './discord.js';

class AutoShutdownService extends EventEmitter {
  constructor() {
    super();
    this.timers = new Map(); // Map of server name to shutdown timer
    this.configs = new Map(); // Map of server name to auto-shutdown config
    this.discordService = new DiscordService();
    this.isEnabled = true;
    
    // Default configuration
    this.defaultConfig = {
      enabled: false,
      timeoutMinutes: 30,
      saveBeforeShutdown: true,
      saveTimeoutSeconds: 30,
      warningIntervals: [15, 10, 5, 2], // Warning intervals in minutes
      discordNotifications: true
    };
  }

  /**
   * Initialize auto-shutdown for a server
   */
  async initializeServer(serverName, config = {}) {
    try {
      const serverConfig = { ...this.defaultConfig, ...config };
      this.configs.set(serverName, serverConfig);
      
      if (serverConfig.enabled) {
        logger.info(`Auto-shutdown initialized for server: ${serverName}`);
        this.emit('serverInitialized', { serverName, config: serverConfig });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error initializing auto-shutdown for ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Start monitoring a server for auto-shutdown
   */
  async startMonitoring(serverName) {
    try {
      const config = this.configs.get(serverName);
      if (!config || !config.enabled) {
        return false;
      }

      // Clear any existing timer
      this.clearTimer(serverName);
      
      // Set new timer
      const timeoutMs = config.timeoutMinutes * 60 * 1000;
      const timer = setTimeout(async () => {
        await this.performShutdown(serverName);
      }, timeoutMs);
      
      this.timers.set(serverName, {
        timer,
        startTime: Date.now(),
        timeoutMs,
        config
      });
      
      logger.info(`Auto-shutdown monitoring started for ${serverName} (${config.timeoutMinutes} minutes)`);
      
      // Send Discord notification if enabled
      if (config.discordNotifications) {
        await this.discordService.sendNotification({
          type: 'server_status',
          serverName,
          message: `🕐 Auto-shutdown timer started (${config.timeoutMinutes} minutes)`,
          timestamp: new Date(),
          data: {
            status: 'monitoring',
            timeoutMinutes: config.timeoutMinutes
          }
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error starting auto-shutdown monitoring for ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Stop monitoring a server (when players join)
   */
  async stopMonitoring(serverName) {
    try {
      const timerInfo = this.timers.get(serverName);
      if (!timerInfo) {
        return false;
      }
      
      this.clearTimer(serverName);
      
      logger.info(`Auto-shutdown monitoring stopped for ${serverName}`);
      
      // Send Discord notification if enabled
      const config = this.configs.get(serverName);
      if (config && config.discordNotifications) {
        await this.discordService.sendNotification({
          type: 'server_status',
          serverName,
          message: '✅ Auto-shutdown cancelled - players are online',
          timestamp: new Date(),
          data: {
            status: 'active'
          }
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error stopping auto-shutdown monitoring for ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Perform the actual shutdown with saveworld
   */
  async performShutdown(serverName) {
    try {
      const timerInfo = this.timers.get(serverName);
      if (!timerInfo) {
        return false;
      }
      
      const { config } = timerInfo;
      
      logger.info(`Auto-shutdown triggered for ${serverName}`);
      
      // Send Discord notification
      if (config.discordNotifications) {
        await this.discordService.sendNotification({
          type: 'server_stop',
          serverName,
          message: '🛑 Auto-shutdown initiated - server is empty',
          timestamp: new Date(),
          data: {
            reason: 'auto_shutdown',
            emptyDuration: config.timeoutMinutes
          }
        });
      }
      
      // Save world before shutdown if enabled
      if (config.saveBeforeShutdown) {
        await this.saveWorldBeforeShutdown(serverName, config.saveTimeoutSeconds);
      }
      
      // Emit shutdown event for server manager to handle
      this.emit('shutdownRequested', { 
        serverName, 
        reason: 'auto_shutdown',
        config 
      });
      
      // Clear timer
      this.clearTimer(serverName);
      
      return true;
    } catch (error) {
      logger.error(`Error performing auto-shutdown for ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Save world using RCON before shutdown
   */
  async saveWorldBeforeShutdown(serverName, timeoutSeconds = 30) {
    try {
      logger.info(`Saving world for ${serverName} before shutdown...`);
      
      // Send Discord notification about save
      const config = this.configs.get(serverName);
      if (config && config.discordNotifications) {
        await this.discordService.sendNotification({
          type: 'server_status',
          serverName,
          message: '💾 Saving world before shutdown...',
          timestamp: new Date(),
          data: {
            status: 'saving'
          }
        });
      }
      
      // Try to save using RCON
      try {
        const result = await rconService.saveWorld(serverName);
        logger.info(`World saved successfully for ${serverName}:`, result);
        
        // Wait a moment for save to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (config && config.discordNotifications) {
          await this.discordService.sendNotification({
            type: 'server_status',
            serverName,
            message: '✅ World saved successfully',
            timestamp: new Date(),
            data: {
              status: 'saved'
            }
          });
        }
        
      } catch (rconError) {
        logger.warn(`RCON saveworld failed for ${serverName}:`, rconError);
        
        // Send warning notification
        if (config && config.discordNotifications) {
          await this.discordService.sendNotification({
            type: 'error',
            serverName,
            message: '⚠️ Failed to save world via RCON, proceeding with shutdown',
            timestamp: new Date(),
            data: {
              error: rconError.message
            }
          });
        }
      }
      
    } catch (error) {
      logger.error(`Error in saveWorldBeforeShutdown for ${serverName}:`, error);
    }
  }

  /**
   * Send warning notifications at specified intervals
   */
  async sendWarningNotifications(serverName, remainingMinutes) {
    try {
      const config = this.configs.get(serverName);
      if (!config || !config.discordNotifications) {
        return;
      }
      
      const timerInfo = this.timers.get(serverName);
      if (!timerInfo) {
        return;
      }
      
      // Check if we should send a warning
      const warningIntervals = config.warningIntervals || this.defaultConfig.warningIntervals;
      if (warningIntervals.includes(remainingMinutes)) {
        await this.discordService.sendNotification({
          type: 'server_status',
          serverName,
          message: `⚠️ Server will shut down in ${remainingMinutes} minutes (no players online)`,
          timestamp: new Date(),
          data: {
            status: 'warning',
            remainingMinutes
          }
        });
      }
    } catch (error) {
      logger.error(`Error sending warning notification for ${serverName}:`, error);
    }
  }

  /**
   * Update server configuration
   */
  async updateServerConfig(serverName, config) {
    try {
      const currentConfig = this.configs.get(serverName) || this.defaultConfig;
      const updatedConfig = { ...currentConfig, ...config };
      
      this.configs.set(serverName, updatedConfig);
      
      // If auto-shutdown was disabled, clear any existing timer
      if (!updatedConfig.enabled) {
        this.clearTimer(serverName);
      }
      
      logger.info(`Auto-shutdown config updated for ${serverName}:`, updatedConfig);
      return true;
    } catch (error) {
      logger.error(`Error updating auto-shutdown config for ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Get server configuration
   */
  getServerConfig(serverName) {
    return this.configs.get(serverName) || this.defaultConfig;
  }

  /**
   * Get all server configurations
   */
  getAllConfigs() {
    const configs = {};
    for (const [serverName, config] of this.configs) {
      configs[serverName] = config;
    }
    return configs;
  }

  /**
   * Get timer information for a server
   */
  getTimerInfo(serverName) {
    const timerInfo = this.timers.get(serverName);
    if (!timerInfo) {
      return null;
    }
    
    const elapsed = Date.now() - timerInfo.startTime;
    const remaining = Math.max(0, timerInfo.timeoutMs - elapsed);
    const remainingMinutes = Math.ceil(remaining / (60 * 1000));
    
    return {
      serverName,
      startTime: timerInfo.startTime,
      timeoutMs: timerInfo.timeoutMs,
      elapsed,
      remaining,
      remainingMinutes,
      config: timerInfo.config
    };
  }

  /**
   * Get all active timers
   */
  getAllTimers() {
    const timers = {};
    for (const [serverName] of this.timers) {
      timers[serverName] = this.getTimerInfo(serverName);
    }
    return timers;
  }

  /**
   * Clear timer for a server
   */
  clearTimer(serverName) {
    const timerInfo = this.timers.get(serverName);
    if (timerInfo && timerInfo.timer) {
      clearTimeout(timerInfo.timer);
      this.timers.delete(serverName);
    }
  }

  /**
   * Clear all timers
   */
  clearAllTimers() {
    for (const [serverName] of this.timers) {
      this.clearTimer(serverName);
    }
  }

  /**
   * Enable/disable the entire auto-shutdown service
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (!enabled) {
      this.clearAllTimers();
    }
    
    logger.info(`Auto-shutdown service ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if service is enabled
   */
  isServiceEnabled() {
    return this.isEnabled;
  }

  /**
   * Handle player join event
   */
  async onPlayerJoin(serverName) {
    if (!this.isEnabled) {
      return;
    }
    
    await this.stopMonitoring(serverName);
  }

  /**
   * Handle player leave event
   */
  async onPlayerLeave(serverName, remainingPlayers) {
    if (!this.isEnabled) {
      return;
    }
    
    // If no players left, start monitoring
    if (remainingPlayers === 0) {
      await this.startMonitoring(serverName);
    }
  }

  /**
   * Handle server start event
   */
  async onServerStart(serverName) {
    if (!this.isEnabled) {
      return;
    }
    
    // Initialize server if not already done
    if (!this.configs.has(serverName)) {
      await this.initializeServer(serverName);
    }
  }

  /**
   * Handle server stop event
   */
  async onServerStop(serverName) {
    if (!this.isEnabled) {
      return;
    }
    
    // Clear any monitoring
    this.clearTimer(serverName);
  }
}

export default new AutoShutdownService(); 
