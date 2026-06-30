import rconService from '../../rcon.js';
import logger from '../../../utils/logger.js';
import { formatForARK } from '../template-processor.js';

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
    if (rconConfig) {
      await rconService.sendCommand(rconConfig, `Broadcast ${formattedMessage}`);
    } else {
      await rconService.broadcast(serverName, formattedMessage);
    }
    logger.debug(`[NotificationAdapters] In-game broadcast sent successfully to ${serverName}`);
    return { success: true, channel: 'inGame', serverName, message: formattedMessage };
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to send in-game broadcast to ${serverName}:`, error.message);
    return { success: false, channel: 'inGame', serverName, error: error.message };
  }
}
