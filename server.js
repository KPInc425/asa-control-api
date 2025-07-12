import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createServer } from 'http';
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
import logsRoutes from './routes/logs.js';
import environmentRoutes from './routes/environment.js';
import nativeServerRoutes from './routes/native-servers.js';
import provisioningRoutes from './routes/provisioning.js';
import StaticServer from './services/static-server.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.logging.level
  }
});

// Register plugins
// Register plugins

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

await fastify.register(websocket);

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

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  };
});

// Metrics endpoint
if (config.metrics.enabled) {
  fastify.get('/metrics', metricsHandler);
}

// Register routes
await fastify.register(containerRoutes);
await fastify.register(rconRoutes);
await fastify.register(configRoutes);
await fastify.register(enhancedAuthRoutes);
await fastify.register(logsRoutes);
await fastify.register(environmentRoutes);
await fastify.register(nativeServerRoutes);
await fastify.register(provisioningRoutes);

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
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication required'));
    }
    import('./services/user-management.js').then(({ default: userManagementService }) => {
      try {
        const result = userManagementService.verifyToken(token);
        if (result.success) {
          socket.user = result.user;
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
        
        const logStream = arkLogsService.default.createLogStream(serverName, logFileName, {
          tail: 100,
          follow: true
        });
        
        logStream.on('data', (chunk) => {
          socket.emit('ark-log-data', {
            data: chunk.toString('utf8'),
            timestamp: new Date().toISOString()
          });
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

// WebSocket endpoint for real-time logs
fastify.get('/api/logs/:container', { websocket: true }, (connection, req) => {
  const { container } = req.params;
  
  logger.info(`WebSocket connection established for container: ${container}`);
  
  // Import docker service here to avoid circular dependencies
  import('./services/docker.js').then(({ default: dockerService }) => {
    const containerObj = dockerService.docker.getContainer(container);
    
    containerObj.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      follow: true
    }).then(logStream => {
      logStream.on('data', (chunk) => {
        connection.socket.send(JSON.stringify({
          type: 'log',
          data: chunk.toString('utf8'),
          timestamp: new Date().toISOString()
        }));
      });
      
      logStream.on('end', () => {
        connection.socket.send(JSON.stringify({
          type: 'end',
          timestamp: new Date().toISOString()
        }));
      });
      
      logStream.on('error', (error) => {
        logger.error(`Log stream error for container ${container}:`, error);
        connection.socket.send(JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      });
      
      // Handle WebSocket close
      connection.socket.on('close', () => {
        logger.info(`WebSocket connection closed for container: ${container}`);
        logStream.destroy();
      });
    }).catch(error => {
      logger.error(`Failed to get logs for container ${container}:`, error);
      connection.socket.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    });
  });
});

// WebSocket endpoint for real-time container events
fastify.get('/api/events', { websocket: true }, (connection, req) => {
  logger.info('WebSocket connection established for container events');
  
  // Import docker service here to avoid circular dependencies
  import('./services/docker.js').then(({ default: dockerService }) => {
    const eventStream = dockerService.docker.getEvents({
      filters: {
        type: ['container']
      }
    });
    
    eventStream.on('data', (chunk) => {
      try {
        const event = JSON.parse(chunk.toString());
        connection.socket.send(JSON.stringify({
          type: 'event',
          data: event,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        logger.warn('Failed to parse Docker event:', error);
      }
    });
    
    eventStream.on('end', () => {
      connection.socket.send(JSON.stringify({
        type: 'end',
        timestamp: new Date().toISOString()
      }));
    });
    
    eventStream.on('error', (error) => {
      logger.error('Docker event stream error:', error);
      connection.socket.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    });
    
    // Handle WebSocket close
    connection.socket.on('close', () => {
      logger.info('WebSocket connection closed for container events');
      eventStream.destroy();
    });
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close RCON connections
    const rconService = await import('./services/rcon.js');
    await rconService.default.closeAllConnections();
    
    // Close Fastify server
    await fastify.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Create HTTP server first
    const server = createServer();
    
    // Attach Socket.IO to the HTTP server before Fastify starts
    io = new SocketIOServer(server, {
      cors: {
        origin: ['https://ark.ilgaming.xyz', 'http://localhost:4010', 'http://localhost:3000', 'http://localhost:5173'],
        credentials: true
      }
    });

    // Setup Socket.IO event handlers
    setupSocketIO();
    
    // Start Fastify server with the existing HTTP server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
      server: server
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
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};
start(); 
