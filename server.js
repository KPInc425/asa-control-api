import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createServer } from 'http';
import { Server } from 'socket.io';
import config from './config/index.js';
import logger from './utils/logger.js';
import { metricsHandler } from './metrics/index.js';
import { metricsMiddleware } from './middleware/metrics.js';

// Import routes
import containerRoutes from './routes/containers.js';
import rconRoutes from './routes/rcon.js';
import configRoutes from './routes/configs.js';
import authRoutes from './routes/auth.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.logging.level
  }
});

// Register plugins
// Register plugins
await fastify.register(cors, {
  origin: ['https://ark.ilgaming.xyz', 'http://localhost:4010', 'http://localhost:3000', 'http://localhost:5173'], // Allow frontend origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Configure body parser
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

await fastify.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
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
await fastify.register(authRoutes);

// Create HTTP server and Socket.IO instance
let io;

// We'll initialize Socket.IO after Fastify starts
const initializeSocketIO = (fastifyServer) => {
  const server = createServer(fastifyServer);
  io = new Server(server, {
    cors: {
      origin: ['https://ark.ilgaming.xyz', 'http://localhost:4010', 'http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    }
  });
  
  return server;
};

// Socket.IO setup function
const setupSocketIO = () => {
  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    // Import auth service to verify token
    import('./services/auth.js').then(({ default: authService }) => {
      try {
        const decoded = authService.verifyToken(token);
        socket.user = decoded;
        next();
      } catch (error) {
        logger.warn('Socket.IO authentication failed:', error.message);
        next(new Error('Invalid token'));
      }
    }).catch(error => {
      logger.error('Error importing auth service:', error);
      next(new Error('Authentication service error'));
    });
  });

  // Socket.IO connection handler
  io.on('connection', (socket) => {
    logger.info(`Socket.IO client connected: ${socket.id} (User: ${socket.user?.username || 'unknown'})`);
    
    // Handle log streaming requests
    socket.on('start-logs', async (data) => {
      const { container } = data;
      
      if (!container) {
        socket.emit('error', { message: 'Container name is required' });
        return;
      }
      
      logger.info(`Starting log stream for container: ${container} (Socket: ${socket.id})`);
      
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
          socket.emit('log-data', {
            data: chunk.toString('utf8'),
            timestamp: new Date().toISOString()
          });
        });
        
        logStream.on('end', () => {
          socket.emit('log-end', {
            timestamp: new Date().toISOString()
          });
        });
        
        logStream.on('error', (error) => {
          logger.error(`Log stream error for container ${container}:`, error);
          socket.emit('log-error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
        
        // Store the log stream reference for cleanup
        socket.logStream = logStream;
        
      } catch (error) {
        logger.error(`Failed to get logs for container ${container}:`, error);
        socket.emit('log-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Handle stop logs request
    socket.on('stop-logs', () => {
      if (socket.logStream) {
        socket.logStream.destroy();
        socket.logStream = null;
        logger.info(`Log stream stopped for socket: ${socket.id}`);
      }
    });
    
    // Handle container events subscription
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
        
        // Store the event stream reference for cleanup
        socket.eventStream = eventStream;
        
      } catch (error) {
        logger.error('Failed to start container events:', error);
        socket.emit('events-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Handle unsubscribe events
    socket.on('unsubscribe-events', () => {
      if (socket.eventStream) {
        socket.eventStream.destroy();
        socket.eventStream = null;
        logger.info(`Container events stopped for socket: ${socket.id}`);
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Socket.IO client disconnected: ${socket.id}`);
      
      // Clean up any active streams
      if (socket.logStream) {
        socket.logStream.destroy();
        socket.logStream = null;
      }
      
      if (socket.eventStream) {
        socket.eventStream.destroy();
        socket.eventStream = null;
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
    // Start Fastify server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });
    
    // Initialize Socket.IO with the Fastify server
    const socketServer = initializeSocketIO(fastify.server);
    setupSocketIO();
    
    logger.info(`ASA Control API server listening on ${config.server.host}:${config.server.port}`);
    logger.info(`Socket.IO server ready on ${config.server.host}:${config.server.port}`);
    logger.info(`Environment: ${config.server.nodeEnv}`);
    logger.info(`Metrics enabled: ${config.metrics.enabled}`);
    
    // Log default credentials in development
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
