/**
 * Notification Adapters for ARK Server Admin Suite
 *
 * Refactored into sub-modules under services/notifications/.
 * This file re-exports everything for backward compatibility.
 * New code should import from "./index.js" instead.
 */

export * from "./index.js"; 
        success: false, 
        channel: 'socket',
        skipped: true,
        reason: 'No socket.io instance'
      };
    }
    
    logger.info(`[NotificationAdapters] Emitting socket event '${event}' for ${serverName}`);
    
    // Build structured payload
    const payload = {
      serverName,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    // Emit to room or broadcast
    if (broadcast) {
      if (room) {
        io.to(room).emit(event, payload);
      } else {
        io.emit(event, payload);
      }
    } else {
      io.emit(event, payload);
    }
    
    logger.debug(`[NotificationAdapters] Socket event emitted successfully: ${event}`);
    
    return { 
      success: true, 
      channel: 'socket',
      serverName,
      event,
      data: payload
    };
    
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to emit socket event for ${serverName}:`, error.message);
    
    return { 
      success: false, 
      channel: 'socket',
      serverName,
      error: error.message
    };
  }
}

// ============================================================================
// Unified Notification Function
// ============================================================================

/**
 * Send notifications to all enabled channels
 * @param {Object} options - Notification options
 * @param {string} options.serverName - Server name (required)
 * @param {string} options.type - Notification type (e.g., 'update.warning')
 * @param {string} options.message - Message content (or use template)
 * @param {Object} options.data - Data for template processing
 * @param {Object} options.channels - Channel enable/disable overrides { rcon, discord, socket }
 * @param {Object} options.templates - Custom templates per channel
 * @param {Object} options.io - Socket.io instance for socket notifications
 * @param {string} options.eventType - Socket event type
 * @param {Object} options.rconConfig - RCON connection config
 * @param {DiscordService} options.discordService - Discord service instance
 * @param {string} options.severity - Override severity for Discord embed color
 * @returns {Object} Results from all channels
 */
export async function notifyAll(options = {}) {
  const {
    serverName,
    type = 'generic',
    message,
    data = {},
    channels = {},
    templates = {},
    io,
    eventType = 'server:notification',
    rconConfig,
    discordService,
    severity
  } = options;
  
  if (!serverName) {
    logger.error('[NotificationAdapters] notifyAll called without serverName');
    return {
      success: false,
      error: 'serverName is required',
      results: {}
    };
  }
  
  // Add serverName to data for template processing
  const templateData = {
    serverName,
    ...data
  };
  
  // Get server channel settings and merge with runtime overrides
  const serverSettings = await getServerChannelSettings(serverName);
  const effectiveChannels = mergeChannelSettings(serverSettings, channels);
  
  logger.info(`[NotificationAdapters] Sending notifications for ${serverName} (type: ${type})`);
  logger.debug(`[NotificationAdapters] Channels: rcon=${effectiveChannels.rcon}, discord=${effectiveChannels.discord}, socket=${effectiveChannels.socket}`);
  
  const results = {
    rcon: null,
    discord: null,
    socket: null
  };
  
  // Create array of notification promises
  const notifications = [];
  
  // In-Game (RCON) notification
  if (effectiveChannels.rcon) {
    const template = getTemplate(type, 'inGame', templates);
    const inGameMessage = message || processTemplate(template, templateData);
    
    notifications.push(
      notifyInGame(serverName, inGameMessage, { rconConfig })
        .then(result => { results.rcon = result; })
        .catch(error => { 
          results.rcon = { success: false, channel: 'rcon', error: error.message };
        })
    );
  }
  
  // Discord notification
  if (effectiveChannels.discord) {
    const template = getTemplate(type, 'discord', templates);
    const discordMessage = message || processTemplate(template, templateData);
    
    notifications.push(
      notifyDiscord(serverName, discordMessage, { 
        type, 
        data: templateData,
        discordService,
        severity
      })
        .then(result => { results.discord = result; })
        .catch(error => { 
          results.discord = { success: false, channel: 'discord', error: error.message };
        })
    );
  }
  
  // Socket notification
  if (effectiveChannels.socket && io) {
    const template = getTemplate(type, 'socket', templates);
    const socketMessage = message || processTemplate(template, templateData);
    
    const socketData = {
      type,
      message: socketMessage,
      ...templateData
    };
    
    results.socket = notifySocket(io, serverName, eventType, socketData);
  }
  
  // Wait for all async notifications to complete
  await Promise.allSettled(notifications);
  
  // Calculate overall success
  const channelResults = Object.values(results).filter(r => r !== null);
  const successCount = channelResults.filter(r => r.success).length;
  const failureCount = channelResults.filter(r => r && !r.success && !r.skipped).length;
  
  logger.info(`[NotificationAdapters] Notification results for ${serverName}: ${successCount} succeeded, ${failureCount} failed`);
  
  return {
    success: failureCount === 0,
    serverName,
    type,
    successCount,
    failureCount,
    results
  };
}

// ============================================================================
// NotificationService Class
// ============================================================================

/**
 * NotificationService - Class wrapper for notification functionality
 * Provides a persistent service with configured defaults
 */
export class NotificationService {
  /**
   * Create a NotificationService instance
   * @param {Object} options - Service options
   * @param {Object} options.io - Socket.io instance
   * @param {DiscordService} options.discordService - Discord service instance
   * @param {Object} options.defaultChannels - Default channel settings
   * @param {Object} options.customTemplates - Custom message templates
   */
  constructor(options = {}) {
    this.io = options.io || null;
    this.discordService = options.discordService || new DiscordService();
    this.defaultChannels = options.defaultChannels || {
      rcon: true,
      discord: true,
      socket: true
    };
    this.customTemplates = options.customTemplates || {};
    this.rconConfigs = new Map(); // Cache of RCON configs by server name
    
    logger.info('[NotificationService] Initialized');
  }
  
  /**
   * Set Socket.io instance
   * @param {Object} io - Socket.io server instance
   */
  setSocketIO(io) {
    this.io = io;
    logger.info('[NotificationService] Socket.io instance set');
  }
  
  /**
   * Set Discord service instance
   * @param {DiscordService} discordService - Discord service instance
   */
  setDiscordService(discordService) {
    this.discordService = discordService;
    logger.info('[NotificationService] Discord service instance set');
  }
  
  /**
   * Register RCON config for a server
   * @param {string} serverName - Server name
   * @param {Object} config - RCON config { host, port, password }
   */
  registerRconConfig(serverName, config) {
    this.rconConfigs.set(serverName, config);
    logger.debug(`[NotificationService] RCON config registered for ${serverName}`);
  }
  
  /**
   * Get RCON config for a server
   * @param {string} serverName - Server name
   * @returns {Object|null} RCON config
   */
  getRconConfig(serverName) {
    return this.rconConfigs.get(serverName) || null;
  }
  
  /**
   * Send in-game broadcast
   * @param {string} serverName - Server name
   * @param {string} message - Message to broadcast
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result
   */
  async notifyInGame(serverName, message, options = {}) {
    const rconConfig = options.rconConfig || this.getRconConfig(serverName);
    return notifyInGame(serverName, message, { ...options, rconConfig });
  }
  
  /**
   * Send Discord notification
   * @param {string} serverName - Server name
   * @param {string} message - Message content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result
   */
  async notifyDiscord(serverName, message, options = {}) {
    return notifyDiscord(serverName, message, {
      ...options,
      discordService: options.discordService || this.discordService
    });
  }
  
  /**
   * Emit socket event
   * @param {string} serverName - Server name
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} options - Additional options
   * @returns {Object} Result
   */
  notifySocket(serverName, event, data, options = {}) {
    return notifySocket(this.io, serverName, event, data, options);
  }
  
  /**
   * Send to all channels
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} Results from all channels
   */
  async notifyAll(options = {}) {
    const serverName = options.serverName;
    const rconConfig = options.rconConfig || this.getRconConfig(serverName);
    
    return notifyAll({
      ...options,
      io: options.io || this.io,
      discordService: options.discordService || this.discordService,
      rconConfig,
      templates: { ...this.customTemplates, ...options.templates },
      channels: { ...this.defaultChannels, ...options.channels }
    });
  }
  
  // ========================================================================
  // Convenience Methods for Common Notifications
  // ========================================================================
  
  /**
   * Send update warning notification
   * @param {string} serverName - Server name
   * @param {number} minutesRemaining - Minutes until update
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendUpdateWarning(serverName, minutesRemaining, options = {}) {
    return this.notifyAll({
      serverName,
      type: 'update.warning',
      data: { minutesRemaining, action: 'update' },
      eventType: 'auto-update:warning',
      ...options
    });
  }
  
  /**
   * Send update starting notification
   * @param {string} serverName - Server name
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendUpdateStarting(serverName, options = {}) {
    return this.notifyAll({
      serverName,
      type: 'update.starting',
      data: { action: 'update' },
      eventType: 'auto-update:starting',
      ...options
    });
  }
  
  /**
   * Send update completed notification
   * @param {string} serverName - Server name
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendUpdateCompleted(serverName, options = {}) {
    return this.notifyAll({
      serverName,
      type: 'update.completed',
      data: { action: 'update' },
      eventType: 'auto-update:completed',
      ...options
    });
  }
  
  /**
   * Send update failed notification
   * @param {string} serverName - Server name
   * @param {string} error - Error message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendUpdateFailed(serverName, error, options = {}) {
    return this.notifyAll({
      serverName,
      type: 'update.failed',
      data: { error, action: 'update' },
      eventType: 'auto-update:failed',
      severity: 'error',
      ...options
    });
  }
  
  /**
   * Send server status notification
   * @param {string} serverName - Server name
   * @param {string} status - Status ('starting', 'online', 'stopping', 'offline')
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendServerStatus(serverName, status, options = {}) {
    const type = `server.${status}`;
    return this.notifyAll({
      serverName,
      type,
      data: { status },
      eventType: 'server:status',
      ...options
    });
  }
  
  /**
   * Send maintenance notification
   * @param {string} serverName - Server name
   * @param {string} phase - Maintenance phase ('scheduled', 'started', 'completed')
   * @param {Object} data - Additional data (e.g., minutesRemaining)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendMaintenanceNotification(serverName, phase, data = {}, options = {}) {
    const type = `maintenance.${phase}`;
    return this.notifyAll({
      serverName,
      type,
      data,
      eventType: 'server:maintenance',
      ...options
    });
  }
  
  /**
   * Send custom notification to all channels
   * @param {string} serverName - Server name
   * @param {string} message - Custom message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results
   */
  async sendCustomNotification(serverName, message, options = {}) {
    return this.notifyAll({
      serverName,
      type: 'generic',
      message,
      eventType: options.eventType || 'server:notification',
      ...options
    });
  }
}

// ============================================================================
// Exports
// ============================================================================

// Create default service instance
const notificationService = new NotificationService();

export default notificationService;

// Named exports (functions are already exported inline above)
export {
  notificationService
};
