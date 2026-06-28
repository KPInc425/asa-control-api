import logger from '../../utils/logger.js';
import { getServerChannelSettings, mergeChannelSettings } from '../channel-config.js';
import { getTemplate, processTemplate } from '../template-processor.js';
import { notifyInGame } from './ingame.js';
import { notifyDiscord } from './discord.js';
import { notifySocket } from './socket.js';

/**
 * Send notification to all enabled channels
 * @param {Object} options - Notification options
 * @param {string} options.serverName - Server name
 * @param {string} options.type - Notification type (e.g., 'update.warning')
 * @param {Object} options.data - Template data for message placeholders
 * @param {Object} options.channels - Channel overrides {rcon, discord, socket}
 * @param {Object} options.rconConfig - RCON config for in-game broadcasts
 * @param {Object} options.customTemplates - Custom message templates
 * @param {Object} options.io - Socket.io instance
 * @param {Object} options.discordService - Discord service instance
 * @returns {Object} Aggregated result
 */
export async function notifyAll(options = {}) {
  const { serverName, type = 'generic', data = {}, channels: runtimeChannels, rconConfig, customTemplates, io, discordService } = options;

  if (!serverName) {
    logger.warn('[NotificationAdapters] notifyAll called without serverName');
    return { success: false, error: 'serverName is required' };
  }

  const serverSettings = await getServerChannelSettings(serverName);
  const channels = mergeChannelSettings(serverSettings, runtimeChannels);
  const results = [];

  const templateData = { serverName, ...data };

  if (channels.rcon) {
    const template = getTemplate(type, 'inGame', customTemplates);
    const message = processTemplate(template, templateData);
    results.push(await notifyInGame(serverName, message, { rconConfig }));
  }

  if (channels.discord) {
    const template = getTemplate(type, 'discord', customTemplates);
    const message = processTemplate(template, templateData);
    results.push(await notifyDiscord(serverName, message, { type, data: templateData, discordService }));
  }

  if (channels.socket) {
    const template = getTemplate(type, 'socket', customTemplates);
    const message = processTemplate(template, templateData);
    results.push(notifySocket(io, serverName, `notification:${type}`, { message, type, ...templateData }));
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return { success: failureCount === 0, serverName, type, successCount, failureCount, results };
}
