import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { Server as SocketIOServer } from 'socket.io';
import config from './config/index.js';
import logger from './utils/logger.js';
import { metricsHandler } from './metrics/index.js';
import { metricsMiddleware } from './middleware/metrics.js';

// Import routes
import containerRoutes from './routes/containers.js';
import rconRoutes from './routes/rcon.js';
import configRoutes from './routes/configs.js';
import enhancedAuthRoutes from './routes/enhanced-auth.js';
// import logsRoutes from './routes/logs.js';
import environmentRoutes from './routes/environment.js';
import nativeServerRoutes from './routes/native-servers.js';
import saveFilesRoutes from './routes/save-files.js';
import discordRoutes from './routes/discord.js';
import autoShutdownRoutes from './routes/auto-shutdown.js';
import StaticServer from './services/static-server.js';
import provisioningRoutes from './routes/provisioning/index.js';
import { startChatPolling } from './services/chat-poller.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.logging.level
  }
});

// Register plugins
await fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  }
});

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000'];

await fastify.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Configure body parser
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    // Handle empty body
    if (!body || body.trim() === '') {
      return done(null, {});
    }
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// Apply rate limiting with exclusions for auth endpoints
await fastify.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
  skipOnError: true,
  keyGenerator: function (request) {
    // Skip rate limiting for authentication endpoints
    if (request.url.startsWith('/api/auth/')) {
      return 'auth-exempt';
    }
    // Use IP address for rate limiting
    return request.ip;
  },
  errorResponseBuilder: function (request, context) {
    return {
      success: false,
      message: `Rate limit exceeded, retry in ${Math.ceil(context.ttl / 1000)} seconds`,
      code: 429
    };
  }
});

// Removed websocket plugin to avoid conflicts with Socket.IO

// Global error handler
fastify.setErrorHandler(function (error, request, reply) {
  logger.error('Unhandled error:', error);
  
  // Don't expose internal errors in production
  const message = config.server.nodeEnv === 'production' 
    ? 'Internal server error' 
    : error.message;
  
  reply.status(500).send({
    success: false,
    message,
    ...(config.server.nodeEnv === 'development' && { stack: error.stack })
  });
});

// Global hooks
fastify.addHook('onRequest', metricsMiddleware);

// Request logging hook
fastify.addHook('onRequest', async (request, reply) => {
  logger.info(`[REQUEST] ${request.method} ${request.url}`);
});

// Response logging hook to debug response transformation
fastify.addHook('onSend', async (request, reply, payload) => {
  if (request.url.includes('/debug-rcon')) {
    logger.info(`[RESPONSE] URL: ${request.url}`);
    logger.info(`[RESPONSE] Status: ${reply.statusCode}`);
    logger.info(`[RESPONSE] Payload type: ${typeof payload}`);
    logger.info(`[RESPONSE] Payload length: ${payload ? payload.length : 0}`);
    logger.info(`[RESPONSE] Payload preview: ${payload ? payload.substring(0, 200) : 'null'}`);
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  };
});

// Health check alias under /api for reverse proxy configs that only forward /api/*
fastify.get('/api/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  };
});

// Minimal logs ping endpoint to validate reverse-proxy routing for /api/logs/*
fastify.get('/api/logs/ping', async (request, reply) => {
  return {
    ok: true,
    route: '/api/logs/ping',
    timestamp: new Date().toISOString()
  };
});

// Debug endpoint to test authentication
fastify.get('/api/debug/auth', async (request, reply) => {
  const authHeader = request.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  return {
    success: true,
    hasAuthHeader: !!authHeader,
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPreview: token ? `${token.substring(0, 20)}...` : null,
    headers: Object.keys(request.headers)
  };
});

// Debug endpoint to test route registration
fastify.get('/api/debug/routes', async (request, reply) => {
  logger.info('[DEBUG-ROUTES] Routes debug endpoint called');
  return {
    success: true,
    message: 'Routes debug endpoint working!',
    timestamp: new Date().toISOString(),
    url: request.url,
    method: request.method
  };
});

// Metrics endpoint
if (config.metrics.enabled) {
  fastify.get('/metrics', metricsHandler);
}

// Register routes
logger.info('Registering routes...');
await fastify.register(containerRoutes);
logger.info('Container routes registered');
await fastify.register(rconRoutes);
logger.info('RCON routes registered');
await fastify.register(configRoutes);
logger.info('Config routes registered');
await fastify.register(enhancedAuthRoutes);
logger.info('Enhanced auth routes registered');
// await fastify.register(logsRoutes);
logger.info('Logs routes temporarily disabled for debugging');
await fastify.register(environmentRoutes);
logger.info('Environment routes registered');
await fastify.register(nativeServerRoutes);
logger.info('Native server routes registered');
await fastify.register(saveFilesRoutes);
logger.info('Save files routes registered');
await fastify.register(discordRoutes);
logger.info('Discord routes registered');
await fastify.register(autoShutdownRoutes);
logger.info('Auto shutdown routes registered');
await fastify.register(provisioningRoutes);
logger.info('Provisioning routes registered');

// Make Socket.IO instance available to routes after it's created
fastify.decorate('io', null);

// Initialize static server
const staticServer = new StaticServer();

// Serve static files (frontend)
fastify.get('/*', async (request, reply) => {
  // Skip API routes
  if (request.url.startsWith('/api/') || 
      request.url.startsWith('/health') || 
      request.url.startsWith('/metrics') ||
      request.url.startsWith('/socket.io/')) {
    return reply.callNotFound();
  }
  
  return await staticServer.serveStatic(request, reply);
});

// Socket.IO instance (will be initialized after Fastify is listening)
let io;

// Register your Socket.IO handlers
const setupSocketIO = () => {
  logger.info('Setting up Socket.IO handlers...');
  
  io.use((socket, next) => {
    logger.info(`Socket.IO authentication attempt from ${socket.handshake.address}`);
    logger.info(`Socket.IO handshake auth:`, socket.handshake.auth);
    logger.info(`Socket.IO handshake headers:`, socket.handshake.headers);
    
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      logger.warn('Socket.IO authentication failed: No token provided');
      logger.info('Available auth data:', {
        authToken: !!socket.handshake.auth.token,
        authHeader: !!socket.handshake.headers.authorization,
        allHeaders: Object.keys(socket.handshake.headers)
      });
      return next(new Error('Authentication required'));
    }
    
    logger.info(`Socket.IO token length: ${token.length}`);
    logger.info(`Socket.IO token preview: ${token.substring(0, 20)}...`);
    
    import('./services/user-management.js').then(({ default: userManagementService }) => {
      try {
        const result = userManagementService.verifyToken(token);
        if (result.success) {
          socket.user = result.user;
          logger.info(`Socket.IO authentication successful for user: ${result.user.username}`);
          next();
        } else {
          logger.warn('Socket.IO authentication failed:', result.message);
          next(new Error('Invalid token'));
        }
      } catch (error) {
        logger.warn('Socket.IO authentication failed:', error.message);
        next(new Error('Invalid token'));
      }
    }).catch(error => {
      logger.error('Error importing user management service:', error);
      next(new Error('Authentication service error'));
    });
  });
  io.on('connection', (socket) => {
    logger.info(`Socket.IO client connected: ${socket.id} (User: ${socket.user?.username || 'unknown'})`);
    logger.info(`Socket.IO connection details:`, {
      id: socket.id,
      user: socket.user?.username,
      address: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });
    
    // Handle container log streaming requests
    socket.on('start-container-logs', async (data) => {
      const { container } = data;
      if (!container) {
        socket.emit('error', { message: 'Container name is required' });
        return;
      }
      logger.info(`Starting container log stream for: ${container} (Socket: ${socket.id})`);
      try {
        const dockerService = await import('./services/docker.js');
        const containerObj = dockerService.default.docker.getContainer(container);
        const logStream = await containerObj.logs({
          stdout: true,
          stderr: true,
          tail: 100,
          follow: true
        });
        logStream.on('data', (chunk) => {
          socket.emit('container-log-data', {
            data: chunk.toString('utf8'),
            timestamp: new Date().toISOString()
          });
        });
        logStream.on('end', () => {
          socket.emit('container-log-end', {
            timestamp: new Date().toISOString()
          });
        });
        logStream.on('error', (error) => {
          logger.error(`Container log stream error for ${container}:`, error);
          socket.emit('container-log-error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
        socket.containerLogStream = logStream;
      } catch (error) {
        logger.error(`Failed to get container logs for ${container}:`, error);
        socket.emit('container-log-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle ARK server log streaming requests
    socket.on('start-ark-logs', async (data) => {
      const { serverName, logFileName = 'shootergame.log' } = data;
      if (!serverName) {
        socket.emit('error', { message: 'Server name is required' });
        return;
      }
      logger.info(`Starting ARK log stream for: ${serverName}/${logFileName} (Socket: ${socket.id})`);
      try {
        const arkLogsService = await import('./services/ark-logs.js');
        
        // Check if log file exists
        const exists = await arkLogsService.default.logFileExists(serverName, logFileName);
        if (!exists) {
          socket.emit('ark-log-error', {
            error: `Log file ${logFileName} not found for server ${serverName}`,
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const logStream = await arkLogsService.default.createLogStream(serverName, logFileName, {
          tail: 100,
          follow: true
        });
        
        logStream.on('data', (chunk) => {
          const logData = chunk.toString('utf8');
          // Try to parse as JSON log entry
          try {
            const logEntry = JSON.parse(logData);
            socket.emit('ark-log-data', {
              timestamp: logEntry.timestamp || new Date().toISOString(),
              level: logEntry.level?.toString() || 'info',
              message: logEntry.message || logEntry.msg || logData,
              container: serverName
            });
          } catch {
            // Fall back to plain text
            socket.emit('ark-log-data', {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: logData,
              container: serverName
            });
          }
        });
        
        logStream.on('end', () => {
          socket.emit('ark-log-end', {
            timestamp: new Date().toISOString()
          });
        });
        
        logStream.on('error', (error) => {
          logger.error(`ARK log stream error for ${serverName}/${logFileName}:`, error);
          socket.emit('ark-log-error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
        
        socket.arkLogStream = logStream;
      } catch (error) {
        logger.error(`Failed to get ARK logs for ${serverName}/${logFileName}:`, error);
        socket.emit('ark-log-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    socket.on('stop-container-logs', () => {
      if (socket.containerLogStream) {
        socket.containerLogStream.destroy();
        socket.containerLogStream = null;
        logger.info(`Container log stream stopped for socket: ${socket.id}`);
      }
    });

    socket.on('stop-ark-logs', () => {
      if (socket.arkLogStream) {
        socket.arkLogStream.destroy();
        socket.arkLogStream = null;
        logger.info(`ARK log stream stopped for socket: ${socket.id}`);
      }
    });

    // Handle system logs streaming requests
    socket.on('start-system-logs', () => {
      logger.info(`Starting system log stream for socket: ${socket.id}`);
      
      // Create a simple system log stream that sends API logs
      const systemLogInterval = setInterval(() => {
        // Send a sample system log entry (in a real implementation, this would stream actual system logs)
        socket.emit('system-log-data', {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `System log entry - API running for ${Math.floor(process.uptime())} seconds`,
          container: 'system'
        });
      }, 5000); // Send a log entry every 5 seconds
      
      socket.systemLogInterval = systemLogInterval;
    });

    socket.on('stop-system-logs', () => {
      if (socket.systemLogInterval) {
        clearInterval(socket.systemLogInterval);
        socket.systemLogInterval = null;
        logger.info(`System log stream stopped for socket: ${socket.id}`);
      }
    });
    socket.on('subscribe-events', async () => {
      logger.info(`Starting container events for socket: ${socket.id}`);
      try {
        const dockerService = await import('./services/docker.js');
        const eventStream = dockerService.default.docker.getEvents({
          filters: {
            type: ['container']
          }
        });
        eventStream.on('data', (chunk) => {
          try {
            const event = JSON.parse(chunk.toString());
            socket.emit('container-event', {
              data: event,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            logger.warn('Failed to parse Docker event:', error);
          }
        });
        eventStream.on('end', () => {
          socket.emit('events-end', {
            timestamp: new Date().toISOString()
          });
        });
        eventStream.on('error', (error) => {
          logger.error('Docker event stream error:', error);
          socket.emit('events-error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
        socket.eventStream = eventStream;
      } catch (error) {
        logger.error('Failed to start container events:', error);
        socket.emit('events-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    socket.on('unsubscribe-events', () => {
      if (socket.eventStream) {
        socket.eventStream.destroy();
        socket.eventStream = null;
        logger.info(`Container events stopped for socket: ${socket.id}`);
      }
    });
    // Test endpoint for job progress
    socket.on('test-job-progress', (data) => {
      logger.info(`Test job progress request from socket: ${socket.id}`);
      socket.emit('job-progress', {
        jobId: 'test',
        status: 'running',
        progress: 50,
        message: 'Test job progress message',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket.IO client disconnected: ${socket.id}`);
      if (socket.containerLogStream) {
        socket.containerLogStream.destroy();
        socket.containerLogStream = null;
      }
      if (socket.arkLogStream) {
        socket.arkLogStream.destroy();
        socket.arkLogStream = null;
      }
      if (socket.eventStream) {
        socket.eventStream.destroy();
        socket.eventStream = null;
      }
      if (socket.systemLogInterval) {
        clearInterval(socket.systemLogInterval);
        socket.systemLogInterval = null;
      }
    });
  });
};

// WebSocket endpoints removed - using Socket.IO instead for real-time communication

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.serviceEvent('info', `Received ${signal}. Starting graceful shutdown...`, {
    event: 'shutdown',
    signal: signal,
    uptime: process.uptime()
  });
  
  try {
    // Close RCON connections
    const rconService = await import('./services/rcon.js');
    await rconService.default.closeAllConnections();
    
    // Close Fastify server
    await fastify.close();
    
    logger.serviceEvent('info', 'Graceful shutdown completed', {
      event: 'shutdown-complete',
      signal: signal
    });
    process.exit(0);
  } catch (error) {
    logger.serviceEvent('error', 'Error during graceful shutdown', {
      event: 'shutdown-error',
      error: error.message,
      signal: signal
    });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Start Fastify server first
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });
    
    // Get the underlying HTTP server from Fastify
    const server = fastify.server;
    
    // Attach Socket.IO to the Fastify HTTP server
    io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN 
          ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
          : ['https://ark.ilgaming.xyz', 'http://localhost:4010', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      maxHttpBufferSize: 1e8,
      path: '/socket.io/'
    });
    
    logger.info('Socket.IO server created with CORS origins:', io.engine.opts.cors.origin);
    logger.info('Socket.IO server configuration:', {
      transports: io.engine.opts.transports,
      pingTimeout: io.engine.opts.pingTimeout,
      pingInterval: io.engine.opts.pingInterval,
      connectTimeout: io.engine.opts.connectTimeout
    });

    // Make Socket.IO instance available to routes and globally
    fastify.io = io;
    global.io = io;

    // Setup Socket.IO event handlers
    setupSocketIO();

    // Start ARK chat polling
    startChatPolling(io);
    
    logger.serviceEvent('info', `ASA Control API server started successfully`, {
      event: 'startup-complete',
      host: config.server.host,
      port: config.server.port,
      environment: config.server.nodeEnv,
      metricsEnabled: config.metrics.enabled,
      uptime: process.uptime()
    });
    
    logger.info(`ASA Control API server listening on ${config.server.host}:${config.server.port}`);
    logger.info(`Socket.IO server ready on ${config.server.host}:${config.server.port}`);
    logger.info(`Environment: ${config.server.nodeEnv}`);
    logger.info(`Metrics enabled: ${config.metrics.enabled}`);
    if (config.server.nodeEnv === 'development') {
      logger.info('Default users:');
      logger.info('  admin/admin123 (admin role)');
      logger.info('  operator/operator123 (operator role)');
      logger.info('  viewer/viewer123 (viewer role)');
    }
  } catch (err) {
    console.error('Top-level startup error:', err);
    if (typeof logger !== 'undefined' && logger && logger.error) {
      logger.error('Top-level startup error:', err);
    }
    process.exit(1);
  }
};
start(); 
