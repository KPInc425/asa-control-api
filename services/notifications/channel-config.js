import logger from '../../utils/logger.js';
import { getServerUpdateConfig } from '../database.js';

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
        rcon: config.notify_rcon !== 0,
        discord: config.notify_discord !== 0,
        socket: config.notify_socket !== 0
      };
    }
    return { rcon: true, discord: true, socket: true };
  } catch (error) {
    logger.warn(`[NotificationAdapters] Error getting channel settings for ${serverName}:`, error.message);
    return { rcon: true, discord: true, socket: true };
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
