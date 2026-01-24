/**
 * Notifications Module Index
 * 
 * Centralized notification system for ARK Server Admin Suite
 * Re-exports all notification adapters and services
 */

// Re-export everything from adapters
export {
  // Default service instance
  default,
  notificationService,
  
  // Individual adapter functions
  notifyInGame,
  notifyDiscord,
  notifySocket,
  notifyAll,
  
  // Template utilities
  DEFAULT_TEMPLATES,
  EMBED_COLORS,
  processTemplate,
  getTemplate,
  formatForARK,
  
  // Channel configuration
  getServerChannelSettings,
  mergeChannelSettings,
  
  // Service class
  NotificationService
} from './adapters.js';
