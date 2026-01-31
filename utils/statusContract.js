/**
 * Status and Error Contract Utilities
 * 
 * Provides unified constants and helper functions for server status
 * and error responses across the ASA management API.
 * 
 * @see docs/STATUS_ERROR_CONTRACT.md for full specification
 */

/**
 * Canonical server status values
 * @readonly
 * @enum {string}
 */
export const ServerStatus = Object.freeze({
  RUNNING: 'running',
  STOPPED: 'stopped',
  STARTING: 'starting',
  STOPPING: 'stopping',
  FAILED: 'failed',
  UNKNOWN: 'unknown'
});

/**
 * Data source types indicating where status data originated
 * @readonly
 * @enum {string}
 */
export const DataSource = Object.freeze({
  PROCESS: 'process',
  RCON: 'rcon',
  QUERY: 'query',
  CACHED: 'cached'
});

/**
 * Standard error types with their URIs and HTTP status codes
 * @readonly
 */
export const ErrorTypes = Object.freeze({
  SERVER_NOT_FOUND: {
    type: '/errors/server-not-found',
    code: 'SERVER_NOT_FOUND',
    status: 404,
    title: 'Server Not Found'
  },
  SERVER_OFFLINE: {
    type: '/errors/server-offline',
    code: 'SERVER_OFFLINE',
    status: 503,
    title: 'Server Offline'
  },
  RCON_FAILED: {
    type: '/errors/rcon-failed',
    code: 'RCON_FAILED',
    status: 502,
    title: 'RCON Connection Failed'
  },
  TIMEOUT: {
    type: '/errors/timeout',
    code: 'TIMEOUT',
    status: 504,
    title: 'Operation Timed Out'
  },
  VALIDATION_ERROR: {
    type: '/errors/validation',
    code: 'VALIDATION_ERROR',
    status: 400,
    title: 'Validation Error'
  },
  UNAUTHORIZED: {
    type: '/errors/unauthorized',
    code: 'UNAUTHORIZED',
    status: 401,
    title: 'Unauthorized'
  },
  FORBIDDEN: {
    type: '/errors/forbidden',
    code: 'FORBIDDEN',
    status: 403,
    title: 'Forbidden'
  },
  INTERNAL_ERROR: {
    type: '/errors/internal',
    code: 'INTERNAL_ERROR',
    status: 500,
    title: 'Internal Server Error'
  },
  RATE_LIMITED: {
    type: '/errors/rate-limited',
    code: 'RATE_LIMITED',
    status: 429,
    title: 'Rate Limited'
  }
});

/**
 * Staleness thresholds in milliseconds
 * @readonly
 */
export const StalenessThresholds = Object.freeze({
  [DataSource.PROCESS]: 0,           // Real-time
  [DataSource.RCON]: 10 * 1000,      // 10 seconds
  [DataSource.QUERY]: 60 * 1000,     // 60 seconds
  [DataSource.CACHED]: 5 * 60 * 1000 // 5 minutes
});

/**
 * Maps legacy status values to canonical ServerStatus
 * @type {Object.<string, string>}
 */
const LEGACY_STATUS_MAP = {
  'online': ServerStatus.RUNNING,
  'offline': ServerStatus.STOPPED,
  'error': ServerStatus.FAILED,
  'crashed': ServerStatus.FAILED,
  'restarting': ServerStatus.STARTING,
  'exited': ServerStatus.STOPPED,
  'closed': ServerStatus.STOPPED
};

/**
 * Normalize a status value to canonical ServerStatus
 * @param {string} status - Status value to normalize
 * @returns {string} Canonical status value
 */
export function normalizeStatus(status) {
  if (!status) return ServerStatus.UNKNOWN;
  
  const normalized = status.toLowerCase().trim();
  
  // Check if already canonical
  if (Object.values(ServerStatus).includes(normalized)) {
    return normalized;
  }
  
  // Check legacy mapping
  if (LEGACY_STATUS_MAP[normalized]) {
    return LEGACY_STATUS_MAP[normalized];
  }
  
  return ServerStatus.UNKNOWN;
}

/**
 * Check if a status is valid
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid
 */
export function isValidStatus(status) {
  return Object.values(ServerStatus).includes(status);
}

/**
 * Calculate when data becomes stale based on source
 * @param {string} source - Data source type
 * @param {Date|string} [updatedAt] - When data was last updated (defaults to now)
 * @returns {string} ISO timestamp when data becomes stale
 */
export function calculateStaleAfter(source, updatedAt = new Date()) {
  const threshold = StalenessThresholds[source] || StalenessThresholds[DataSource.CACHED];
  const baseTime = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  return new Date(baseTime.getTime() + threshold).toISOString();
}

/**
 * Check if data is stale
 * @param {string} staleAfter - ISO timestamp when data becomes stale
 * @returns {boolean} True if data is stale
 */
export function isStale(staleAfter) {
  if (!staleAfter) return true;
  return new Date() > new Date(staleAfter);
}

/**
 * Create a TransitionState object
 * @param {Object} options - Transition options
 * @param {string} options.status - Current status during transition
 * @param {string} [options.previousStatus] - Status before transition
 * @param {number} [options.expectedDuration] - Expected duration in milliseconds
 * @returns {Object} TransitionState object
 */
export function createTransitionState(options) {
  const { status, previousStatus, expectedDuration } = options;
  
  return {
    status: normalizeStatus(status),
    previousStatus: previousStatus ? normalizeStatus(previousStatus) : undefined,
    transitionStartedAt: new Date().toISOString(),
    expectedDuration: expectedDuration || undefined
  };
}

/**
 * Create a ServerLiveData object
 * @param {Object} options - Live data options
 * @param {string} options.serverId - Server identifier
 * @param {string} options.status - Server status
 * @param {string} options.source - Data source
 * @param {Object} [options.players] - Player data
 * @param {number} [options.players.online] - Online player count
 * @param {number} [options.players.max] - Max player count
 * @param {Array} [options.players.list] - Player list
 * @param {Object} [options.performance] - Performance metrics
 * @param {number} [options.performance.cpu] - CPU usage percentage
 * @param {number} [options.performance.memory] - Memory usage in MB
 * @param {number} [options.performance.uptime] - Uptime in seconds
 * @param {Object} [options.gameData] - Game-specific data
 * @param {string} [options.gameData.map] - Current map
 * @param {number} [options.gameData.day] - In-game day
 * @param {string} [options.gameData.version] - Server version
 * @param {Object} [options.transition] - Transition state if applicable
 * @param {string|Date} [options.updatedAt] - When data was collected
 * @returns {Object} ServerLiveData object
 */
export function createServerLiveData(options) {
  const {
    serverId,
    status,
    source = DataSource.CACHED,
    players = {},
    performance,
    gameData,
    transition,
    updatedAt = new Date()
  } = options;
  
  const normalizedStatus = normalizeStatus(status);
  const timestamp = typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString();
  
  const liveData = {
    serverId,
    status: normalizedStatus,
    players: {
      online: typeof players.online === 'number' ? players.online : 0,
      max: typeof players.max === 'number' ? players.max : 0,
      list: Array.isArray(players.list) ? players.list : undefined
    },
    updatedAt: timestamp,
    source,
    staleAfter: calculateStaleAfter(source, timestamp)
  };
  
  // Add optional fields only if provided
  if (transition) {
    liveData.transition = transition;
  }
  
  if (performance && (performance.cpu !== undefined || performance.memory !== undefined || performance.uptime !== undefined)) {
    liveData.performance = {
      cpu: performance.cpu,
      memory: performance.memory,
      uptime: performance.uptime
    };
  }
  
  if (gameData && (gameData.map || gameData.day !== undefined || gameData.version)) {
    liveData.gameData = {
      map: gameData.map,
      day: gameData.day,
      version: gameData.version
    };
  }
  
  return liveData;
}

/**
 * Create a ProblemDetails error object (RFC 7807)
 * @param {Object} options - Error options
 * @param {number} options.status - HTTP status code
 * @param {string} [options.code] - Application error code (e.g., 'SERVER_NOT_FOUND')
 * @param {string} [options.title] - Short human-readable summary
 * @param {string} [options.detail] - Detailed explanation
 * @param {string} [options.instance] - URI of specific occurrence (usually request path)
 * @param {string} [options.serverId] - Related server ID
 * @param {number} [options.retryAfter] - Seconds until retry is recommended
 * @returns {Object} ProblemDetails object
 */
export function createProblemDetails(options) {
  const {
    status,
    code,
    title,
    detail,
    instance,
    serverId,
    retryAfter
  } = options;
  
  // Find matching error type or use defaults
  let errorType = null;
  if (code) {
    errorType = Object.values(ErrorTypes).find(e => e.code === code);
  }
  if (!errorType) {
    errorType = Object.values(ErrorTypes).find(e => e.status === status);
  }
  
  const problem = {
    type: errorType?.type || `/errors/http-${status}`,
    title: title || errorType?.title || 'Error',
    status: status || 500,
    timestamp: new Date().toISOString()
  };
  
  // Add optional fields
  if (code) {
    problem.code = code;
  }
  if (detail) {
    problem.detail = detail;
  }
  if (instance) {
    problem.instance = instance;
  }
  if (serverId) {
    problem.serverId = serverId;
  }
  if (retryAfter !== undefined && retryAfter !== null) {
    problem.retryAfter = retryAfter;
  }
  
  return problem;
}

/**
 * Create a ProblemDetails from a known error type
 * @param {string} errorTypeKey - Key from ErrorTypes (e.g., 'SERVER_NOT_FOUND')
 * @param {Object} [options] - Additional options
 * @param {string} [options.detail] - Detailed explanation
 * @param {string} [options.instance] - Request path
 * @param {string} [options.serverId] - Related server ID
 * @param {number} [options.retryAfter] - Seconds until retry
 * @returns {Object} ProblemDetails object
 */
export function createProblemDetailsFromType(errorTypeKey, options = {}) {
  const errorType = ErrorTypes[errorTypeKey];
  if (!errorType) {
    return createProblemDetails({
      status: 500,
      code: 'INTERNAL_ERROR',
      title: 'Unknown Error Type',
      detail: `Error type '${errorTypeKey}' not found`,
      ...options
    });
  }
  
  return createProblemDetails({
    status: errorType.status,
    code: errorType.code,
    title: errorType.title,
    ...options
  });
}

/**
 * Create a standardized success response wrapper
 * @param {*} data - Response data
 * @param {Object} [meta] - Optional metadata
 * @returns {Object} Wrapped response
 */
export function createSuccessResponse(data, meta = {}) {
  const response = {
    success: true,
    data
  };
  
  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * Convert legacy status response to new format
 * @param {Object} legacyResponse - Old format response with details object
 * @param {string} source - Data source for this data
 * @returns {Object} New format response with data object
 */
export function migrateLiveDetailsResponse(legacyResponse, source = DataSource.CACHED) {
  if (!legacyResponse || !legacyResponse.details) {
    return legacyResponse;
  }
  
  const details = legacyResponse.details;
  
  return {
    success: true,
    data: createServerLiveData({
      serverId: details.name,
      status: details.status,
      source,
      players: {
        online: details.players || 0,
        max: details.maxPlayers || 0
      },
      performance: {
        cpu: details.cpu,
        memory: details.memory,
        uptime: details.uptime
      },
      gameData: {
        map: details.map,
        day: details.day,
        version: details.version
      },
      updatedAt: details.lastUpdated || new Date().toISOString()
    })
  };
}

/**
 * Determine status priority between multiple sources
 * Priority: process > rcon > query > cached
 * @param {Object} sources - Object with source data
 * @param {Object} [sources.process] - Process detection result
 * @param {Object} [sources.rcon] - RCON query result
 * @param {Object} [sources.query] - Server browser query result
 * @param {Object} [sources.cached] - Cached data
 * @returns {Object} Best available data with source indication
 */
export function getBestAvailableData(sources) {
  const { process, rcon, query, cached } = sources;
  
  // Priority 1: Process state is most authoritative for running/stopped
  if (process && process.status !== undefined) {
    return {
      source: DataSource.PROCESS,
      status: normalizeStatus(process.status),
      data: process
    };
  }
  
  // Priority 2: RCON success proves server is running and responsive
  if (rcon && rcon.success) {
    return {
      source: DataSource.RCON,
      status: ServerStatus.RUNNING,
      data: rcon
    };
  }
  
  // Priority 3: Query results from server browser
  if (query && (query.success || query.sessionName)) {
    return {
      source: DataSource.QUERY,
      status: ServerStatus.RUNNING,
      data: query
    };
  }
  
  // Priority 4: Fall back to cached data if not too stale
  if (cached && cached.staleAfter && !isStale(cached.staleAfter)) {
    return {
      source: DataSource.CACHED,
      status: normalizeStatus(cached.status),
      data: cached
    };
  }
  
  // No valid data available
  return {
    source: DataSource.CACHED,
    status: ServerStatus.UNKNOWN,
    data: null
  };
}

// Default export for convenience
export default {
  ServerStatus,
  DataSource,
  ErrorTypes,
  StalenessThresholds,
  normalizeStatus,
  isValidStatus,
  calculateStaleAfter,
  isStale,
  createTransitionState,
  createServerLiveData,
  createProblemDetails,
  createProblemDetailsFromType,
  createSuccessResponse,
  migrateLiveDetailsResponse,
  getBestAvailableData
};
