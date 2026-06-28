import logger from '../../utils/logger.js';

/**
 * Send Socket.io event to dashboard
 * @param {Object} io - Socket.io server instance
 * @param {string} serverName - Server name
 * @param {string} event - Event name
 * @param {Object} data - Event data payload
 * @param {Object} options - Options
 * @returns {Object} Result with success status
 */
export function notifySocket(io, serverName, event, data = {}, options = {}) {
  try {
    if (!io) {
      logger.debug('[NotificationAdapters] Socket.io not available, skipping socket notification');
      return { success: false, channel: 'socket', serverName, error: 'Socket.io not available' };
    }
    const payload = { serverName, timestamp: new Date().toISOString(), ...data };
    io.emit(event, payload);
    logger.debug(`[NotificationAdapters] Socket event "${event}" emitted for ${serverName}`);
    return { success: true, channel: 'socket', serverName, event };
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to send socket notification for ${serverName}:`, error.message);
    return { success: false, channel: 'socket', serverName, error: error.message };
  }
}
