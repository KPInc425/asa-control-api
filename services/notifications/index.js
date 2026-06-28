/**
 * Notifications Module Index
 *
 * Centralized notification system for ARK Server Admin Suite
 * Re-exports all notification adapters and services
 */

export { DEFAULT_TEMPLATES, EMBED_COLORS, TYPE_TO_SEVERITY } from './templates.js';
export { processTemplate, getTemplate, formatForARK } from './template-processor.js';
export { getServerChannelSettings, mergeChannelSettings } from './channel-config.js';
export { notifyInGame } from './adapters/ingame.js';
export { notifyDiscord } from './adapters/discord.js';
export { notifySocket } from './adapters/socket.js';
export { notifyAll } from './orchestrator.js';
export { NotificationService } from './notification-service.js';
