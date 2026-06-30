import DiscordService from '../../discord.js';
import logger from '../../../utils/logger.js';
import { EMBED_COLORS, TYPE_TO_SEVERITY } from '../templates.js';

function mapTypeToDiscordType(type) {
  const typeMap = {
    'update.warning': 'server_status',
    'update.starting': 'server_stop',
    'update.completed': 'server_start',
    'update.failed': 'server_error',
    'server.starting': 'server_start',
    'server.stopping': 'server_stop',
    'server.online': 'server_start',
    'server.offline': 'server_stop',
    'maintenance.scheduled': 'server_status',
    'maintenance.started': 'server_stop',
    'maintenance.completed': 'server_start',
    'generic': 'server_status'
  };
  return typeMap[type] || 'server_status';
}

/**
 * Send Discord webhook notification
 * @param {string} serverName - Server name for context
 * @param {string} message - Message content
 * @param {Object} options - Options
 * @returns {Object} Result with success status
 */
export async function notifyDiscord(serverName, message, options = {}) {
  const { type = 'generic', title, data = {}, severity, discordService } = options;
  try {
    logger.info(`[NotificationAdapters] Sending Discord notification for ${serverName}: ${message.substring(0, 50)}...`);
    const discord = discordService || new DiscordService();
    const effectiveSeverity = severity || TYPE_TO_SEVERITY[type] || 'info';
    const embedColor = EMBED_COLORS[effectiveSeverity] || EMBED_COLORS.info;
    const notification = { type: mapTypeToDiscordType(type), serverName, message, timestamp: new Date(), data: { ...data, embedColor } };
    if (title) notification.customTitle = title;
    const result = await discord.sendNotification(notification);
    if (result) {
      logger.debug(`[NotificationAdapters] Discord notification sent successfully for ${serverName}`);
      return { success: true, channel: 'discord', serverName, message };
    }
    return { success: false, channel: 'discord', serverName, error: 'No enabled webhooks or send failed' };
  } catch (error) {
    logger.error(`[NotificationAdapters] Failed to send Discord notification for ${serverName}:`, error.message);
    return { success: false, channel: 'discord', serverName, error: error.message };
  }
}
