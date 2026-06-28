import DiscordService from '../discord.js';
import logger from '../../utils/logger.js';
import { notifyInGame } from './adapters/ingame.js';
import { notifyDiscord } from './adapters/discord.js';
import { notifySocket } from './adapters/socket.js';
import { notifyAll } from './orchestrator.js';

/**
 * NotificationService - Class wrapper for notification functionality
 * Provides a persistent service with configured defaults
 */
export class NotificationService {
  constructor(options = {}) {
    this.io = options.io || null;
    this.discordService = options.discordService || new DiscordService();
    this.defaultChannels = options.defaultChannels || { rcon: true, discord: true, socket: true };
    this.customTemplates = options.customTemplates || {};
    this.rconConfigs = new Map();
    logger.info('[NotificationService] Initialized');
  }

  setSocketIO(io) {
    this.io = io;
    logger.info('[NotificationService] Socket.io instance set');
  }

  setDiscordService(discordService) {
    this.discordService = discordService;
    logger.info('[NotificationService] Discord service instance set');
  }

  registerRconConfig(serverName, config) {
    this.rconConfigs.set(serverName, config);
    logger.debug(`[NotificationService] RCON config registered for ${serverName}`);
  }

  getRconConfig(serverName) {
    return this.rconConfigs.get(serverName) || null;
  }

  async notifyInGame(serverName, message, options = {}) {
    const rconConfig = options.rconConfig || this.getRconConfig(serverName);
    return notifyInGame(serverName, message, { ...options, rconConfig });
  }

  async notifyDiscord(serverName, message, options = {}) {
    return notifyDiscord(serverName, message, { ...options, discordService: options.discordService || this.discordService });
  }

  notifySocket(serverName, event, data, options = {}) {
    return notifySocket(this.io, serverName, event, data, options);
  }

  async notifyAll(options = {}) {
    const serverName = options.serverName;
    const rconConfig = options.rconConfig || this.getRconConfig(serverName);
    return notifyAll({
      ...options,
      io: options.io || this.io,
      discordService: options.discordService || this.discordService,
      rconConfig,
      customTemplates: { ...this.customTemplates, ...options.customTemplates },
      channels: { ...this.defaultChannels, ...options.channels }
    });
  }

  async sendUpdateWarning(serverName, minutesRemaining, options = {}) {
    return this.notifyAll({ serverName, type: 'update.warning', data: { minutesRemaining, action: 'update' }, eventType: 'auto-update:warning', ...options });
  }

  async sendUpdateStarting(serverName, options = {}) {
    return this.notifyAll({ serverName, type: 'update.starting', data: { action: 'update' }, eventType: 'auto-update:starting', ...options });
  }

  async sendUpdateCompleted(serverName, options = {}) {
    return this.notifyAll({ serverName, type: 'update.completed', data: { action: 'update' }, eventType: 'auto-update:completed', ...options });
  }

  async sendUpdateFailed(serverName, error, options = {}) {
    return this.notifyAll({ serverName, type: 'update.failed', data: { error, action: 'update' }, eventType: 'auto-update:failed', severity: 'error', ...options });
  }

  async sendServerStatus(serverName, status, options = {}) {
    return this.notifyAll({ serverName, type: `server.${status}`, data: { status }, eventType: 'server:status', ...options });
  }

  async sendMaintenanceNotification(serverName, phase, data = {}, options = {}) {
    return this.notifyAll({ serverName, type: `maintenance.${phase}`, data, eventType: 'server:maintenance', ...options });
  }

  async sendCustomNotification(serverName, message, options = {}) {
    return this.notifyAll({ serverName, type: 'generic', message, eventType: options.eventType || 'server:notification', ...options });
  }
}
