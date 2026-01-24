/**
 * Notification Adapters for ARK Server Admin Suite
 * 
 * Centralized notification system supporting multiple channels:
 * - In-game RCON broadcasts
 * - Discord webhooks
 * - Socket.io real-time dashboard updates
 * 
 * Features:
 * - Template-based message formatting
 * - Per-server channel configuration
 * - Graceful error handling (one channel failure doesn't block others)
 * - Color-coded Discord embeds by severity
 */

import rconService from '../rcon.js';
import DiscordService from '../discord.js';
import logger from '../../utils/logger.js';
import { getServerUpdateConfig } from '../database.js';

// ============================================================================
// Message Templates
// ============================================================================

/**
 * Default message templates for different notification types
 */
export const DEFAULT_TEMPLATES = {
  // Update warning templates
  'update.warning': {
    inGame: '[AUTO-UPDATE] Server will restart in {minutesRemaining} minute(s) for updates. Save your progress!',
    discord: '⚠️ **{serverName}** will restart in **{minutesRemaining} minute(s)** for updates.',
    socket: 'Server update scheduled in {minutesRemaining} minutes'
  },
  
  // Update starting templates
  'update.starting': {
    inGame: '[AUTO-UPDATE] Server update starting NOW. Please disconnect safely!',
    discord: '🔄 **{serverName}** is now updating. The server will be temporarily offline.',
    socket: 'Server update in progress'
  },
  
  // Update completed templates
  'update.completed': {
    inGame: '[UPDATE] Server update completed successfully!',
    discord: '✅ **{serverName}** has been successfully updated and is back online.',
    socket: 'Server update completed successfully'
  },
  
  // Update failed templates
  'update.failed': {
    inGame: '[UPDATE] Server update encountered an error. Administrators have been notified.',
    discord: '❌ **{serverName}** update failed: {error}',
    socket: 'Server update failed: {error}'
  },
  
  // Server status templates
  'server.starting': {
    inGame: '[SERVER] Server is starting up...',
    discord: '🚀 **{serverName}** is starting up.',
    socket: 'Server starting'
  },
  
  'server.stopping': {
    inGame: '[SERVER] Server is shutting down...',
    discord: '🛑 **{serverName}** is shutting down.',
    socket: 'Server stopping'
  },
  
  'server.online': {
    inGame: '[SERVER] Server is now online and ready!',
    discord: '🟢 **{serverName}** is now online and accepting connections.',
    socket: 'Server online'
  },
  
  'server.offline': {
    inGame: '',
    discord: '🔴 **{serverName}** is now offline.',
    socket: 'Server offline'
  },
  
  // Maintenance templates
  'maintenance.scheduled': {
    inGame: '[MAINTENANCE] Scheduled maintenance in {minutesRemaining} minute(s). Please save your progress.',
    discord: '🔧 **{serverName}** scheduled maintenance in **{minutesRemaining} minute(s)**.',
    socket: 'Scheduled maintenance in {minutesRemaining} minutes'
  },
  
  'maintenance.started': {
    inGame: '[MAINTENANCE] Server maintenance has begun.',
    discord: '🔧 **{serverName}** maintenance has started.',
    socket: 'Maintenance in progress'
  },
  
  'maintenance.completed': {
    inGame: '[MAINTENANCE] Server maintenance completed.',
    discord: '✅ **{serverName}** maintenance completed.',
    socket: 'Maintenance completed'
  },
  
  // Generic message
  'generic': {
    inGame: '{message}',
    discord: '{message}',
    socket: '{message}'
  }
};

/**
 * Discord embed colors by severity/type
 */
export const EMBED_COLORS = {
  info: 0x0099ff,      // Blue
  success: 0x00ff00,   // Green
  warning: 0xffa500,   // Orange
  error: 0xff0000,     // Red
  maintenance: 0x9b59b6, // Purple
  update: 0x3498db     // Light Blue
};

/**
 * Map notification types to severity for embed colors
 */
const TYPE_TO_SEVERITY = {
  'update.warning': 'warning',
  'update.starting': 'update',
  'update.completed': 'success',
  'update.failed': 'error',
  'server.starting': 'info',
  'server.stopping': 'warning',
  'server.online': 'success',
  'server.offline': 'error',
  'maintenance.scheduled': 'maintenance',
  'maintenance.started': 'maintenance',
  'maintenance.completed': 'success',
  'generic': 'info'
};

// ============================================================================
// Template Processing
// ============================================================================

/**
 * Process a message template by replacing placeholders with values
 * @param {string} template - Template string with {placeholder} syntax
 * @param {Object} data - Data object with values to substitute
 * @returns {string} Processed message
 */
export function processTemplate(template, data = {}) {
  if (!template) return '';
  
  let result = template;
  
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(placeholder, value ?? '');
  }
  
  return result;
}

/**
 * Get message template for a notification type and channel
 * @param {string} type - Notification type (e.g., 'update.warning')
 * @param {string} channel - Channel name ('inGame', 'discord', 'socket')
 * @param {Object} customTemplates - Optional custom templates to override defaults
 * @returns {string} Template string
 */
export function getTemplate(type, channel, customTemplates = {}) {
  // Check for custom template first
  if (customTemplates[type] && customTemplates[type][channel]) {
    return customTemplates[type][channel];
  }
  
  // Fall back to defaults
  if (DEFAULT_TEMPLATES[type] && DEFAULT_TEMPLATES[type][channel]) {
    return DEFAULT_TEMPLATES[type][channel];
  }
  
  // Last resort: generic template
  return DEFAULT_TEMPLATES.generic[channel] || '{message}';
}

/**
 * Format message for ARK's in-game display
 * Handles special characters and length limits
 * @param {string} message - Raw message
 * @returns {string} Formatted message safe for ARK display
 */
export function formatForARK(message) {
  if (!message) return '';
  
  // ARK broadcast has some character limitations
  // Replace problematic characters
  let formatted = message
    .replace(/[<>]/g, '')      // Remove angle brackets (can cause issues)
    .replace(/"/g, "'")         // Replace double quotes with single
    .replace(/\n/g, ' ')        // Replace newlines with spaces
    .replace(/\r/g, '')         // Remove carriage returns
    .trim();
  
  // ARK has a message length limit (approximately 256 characters for broadcasts)
  const maxLength = 250;
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength - 3) + '...';
  }
  
  return formatted;
}

// ============================================================================
// Channel Configuration
// ============================================================================

/**
 * Get notification channel settings for a server from database
 * @param {string} serverName - Server name
 * @returns {Object} Channel settings with booleans for each channel
 */
export async function getServerChannelSettings(serverName) {
  try {
    const config = getServerUpdateConfig(serverName);
    
    if (config) {
      return {
        rcon: config.notify_rcon !== 0,      // Default to true if not set
        discord: config.notify_discord !== 0, // Default to true if not set
        socket: config.notify_socket !== 0    // Default to true if not set
      };
    }
    
    // Default settings if no config found
    return {
      rcon: true,
      discord: true,
      socket: true
    };
  } catch (error) {
    logger.warn(`[NotificationAdapters] Error getting channel settings for ${serverName}:`, error.message);
    return {
      rcon: true,
      discord: true,
      socket: true
    };
  }
}

/**
 * Merge runtime channel options with server config
 * @param {Object} serverSettings - Server channel settings from database
 * @param {Object} runtimeChannels - Runtime channel overrides
 * @returns {Object} Merged channel settings
 */
export function mergeChannelSettings(serverSettings, runtimeChannels = {}) {
  return {
    rcon: runtimeChannels.rcon !== undefined ? runtimeChannels.rcon : serverSettings.rcon,
    discord: runtimeChannels.discord !== undefined ? runtimeChannels.discord : serverSettings.discord,
    socket: runtimeChannels.socket !== undefined ? runtimeChannels.socket : serverSettings.socket
  };
}

// ============================================================================
// Individual Adapter Functions
// ============================================================================

/**
 * Send in-game RCON broadcast to a server
 * @param {string} serverName - Server name or container name
 * @param {string} message - Message to broadcast
 * @param {Object} options - Options
 * @param {Object} options.rconConfig - RCON connection config (host, port, password)
 * @param {boolean} options.format - Whether to format message for ARK (default: true)
 * @returns {Object} Result with success status
 */
export async function notifyInGame(serverName, message, options = {}) {
  const { rconConfig, format = true } = options;
  
  try {
    const formattedMessage = format ? formatForARK(message) : message;
    
    if (!formattedMessage) {
      logger.debug(`[NotificationAdapters] Skipping empty in-game message for ${serverName}`);
      return { success: true, skipped: true, reason: 'Empty message' };
    }
    
    logger.info(`[NotificationAdapters] Sending in-game broadcast to ${serverName}: ${formattedMessage.substring(0, 50)}...`);
    
    // Use RCON service to broadcast
    if (rconConfig) {
      // Direct RCON connection with provided config
      await rconService.sendCommand(rconConfig, `Broadcast ${formattedMessage}`);
    } else {
      // Use container-based broadcast
      await rconService.broadcast(serverName, formattedMessage);
    }
    
    logger.debug(`[NotificationAdapters] In-game broadcast sent successfully to ${serverName}`);
    
    return { 
      success: true, 
      channel: 'inGame',
      serverName,
      message: formattedMessage
    };
    
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to send in-game broadcast to ${serverName}:`, error.message);
    
    return { 
      success: false, 
      channel: 'inGame',
      serverName,
      error: error.message
    };
  }
}

/**
 * Send Discord webhook notification
 * @param {string} serverName - Server name for context
 * @param {string} message - Message content
 * @param {Object} options - Options
 * @param {string} options.type - Notification type for embed styling
 * @param {string} options.title - Optional custom embed title
 * @param {Object} options.data - Additional data for embed fields
 * @param {string} options.severity - Severity level (info, success, warning, error)
 * @param {DiscordService} options.discordService - Optional Discord service instance
 * @returns {Object} Result with success status
 */
export async function notifyDiscord(serverName, message, options = {}) {
  const { 
    type = 'generic',
    title,
    data = {},
    severity,
    discordService
  } = options;
  
  try {
    logger.info(`[NotificationAdapters] Sending Discord notification for ${serverName}: ${message.substring(0, 50)}...`);
    
    // Use provided service or create new instance
    const discord = discordService || new DiscordService();
    
    // Determine embed color
    const effectiveSeverity = severity || TYPE_TO_SEVERITY[type] || 'info';
    const embedColor = EMBED_COLORS[effectiveSeverity] || EMBED_COLORS.info;
    
    // Build notification object
    const notification = {
      type: mapTypeToDiscordType(type),
      serverName,
      message,
      timestamp: new Date(),
      data: {
        ...data,
        embedColor
      }
    };
    
    // Add custom title if provided
    if (title) {
      notification.customTitle = title;
    }
    
    // Send via Discord service
    const result = await discord.sendNotification(notification);
    
    if (result) {
      logger.debug(`[NotificationAdapters] Discord notification sent successfully for ${serverName}`);
      return { 
        success: true, 
        channel: 'discord',
        serverName,
        message
      };
    } else {
      return { 
        success: false, 
        channel: 'discord',
        serverName,
        error: 'No enabled webhooks or send failed'
      };
    }
    
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to send Discord notification for ${serverName}:`, error.message);
    
    return { 
      success: false, 
      channel: 'discord',
      serverName,
      error: error.message
    };
  }
}

/**
 * Map notification type to Discord service type
 * @param {string} type - Notification type
 * @returns {string} Discord service notification type
 */
function mapTypeToDiscordType(type) {
  const typeMap = {
    'update.warning': 'server_status',
    'update.starting': 'server_status',
    'update.completed': 'server_start',
    'update.failed': 'error',
    'server.starting': 'server_start',
    'server.stopping': 'server_stop',
    'server.online': 'server_status',
    'server.offline': 'server_status',
    'maintenance.scheduled': 'server_status',
    'maintenance.started': 'server_status',
    'maintenance.completed': 'server_status',
    'generic': 'server_status'
  };
  
  return typeMap[type] || 'server_status';
}

/**
 * Emit socket.io event for dashboard updates
 * @param {Object} io - Socket.io server instance
 * @param {string} serverName - Server name
 * @param {string} event - Event name to emit
 * @param {Object} data - Data payload
 * @param {Object} options - Options
 * @param {string} options.room - Optional room to emit to (defaults to 'dashboard')
 * @param {boolean} options.broadcast - Whether to broadcast to all clients (default: true)
 * @returns {Object} Result with success status
 */
export function notifySocket(io, serverName, event, data, options = {}) {
  const { room = 'dashboard', broadcast = true } = options;
  
  try {
    if (!io) {
      logger.debug(`[NotificationAdapters] Socket.io instance not provided, skipping socket notification`);
      return { 
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
