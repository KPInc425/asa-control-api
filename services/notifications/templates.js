/**
 * Default message templates for different notification types
 */

export const DEFAULT_TEMPLATES = {
  'update.warning': {
    inGame: '[AUTO-UPDATE] Server will restart in {minutesRemaining} minute(s) for updates. Save your progress!',
    discord: '⚠️ **{serverName}** will restart in **{minutesRemaining} minute(s)** for updates.',
    socket: 'Server update scheduled in {minutesRemaining} minutes'
  },
  'update.starting': {
    inGame: '[AUTO-UPDATE] Server update starting NOW. Please disconnect safely!',
    discord: '🔄 **{serverName}** is now updating. The server will be temporarily offline.',
    socket: 'Server update in progress'
  },
  'update.completed': {
    inGame: '[UPDATE] Server update completed successfully!',
    discord: '✅ **{serverName}** has been successfully updated and is back online.',
    socket: 'Server update completed successfully'
  },
  'update.failed': {
    inGame: '[UPDATE] Server update encountered an error. Administrators have been notified.',
    discord: '❌ **{serverName}** update failed: {error}',
    socket: 'Server update failed: {error}'
  },
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
  'generic': {
    inGame: '{message}',
    discord: '{message}',
    socket: '{message}'
  }
};

export const EMBED_COLORS = {
  info: 0x0099ff,
  success: 0x00ff00,
  warning: 0xffa500,
  error: 0xff0000,
  maintenance: 0x9b59b6,
  update: 0x3498db
};

export const TYPE_TO_SEVERITY = {
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
