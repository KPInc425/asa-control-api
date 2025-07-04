import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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

// Create HTTP server for Socket.IO
const server = createServer(fastify.server);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: ['https://ark.ilgaming.xyz', 'http://localhost:4010', 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Socket.IO client connected: ${socket.id}`);

  // Handle container log streaming
  socket.on('join-logs', (containerName) => {
    logger.info(`Client ${socket.id} joining logs for container: ${containerName}`);
    socket.join(`logs-${containerName}`);
  });

  socket.on('leave-logs', (containerName) => {
    logger.info(`Client ${socket.id} leaving logs for container: ${containerName}`);
    socket.leave(`logs-${containerName}`);
  });

  socket.on('disconnect', (reason) => {
    logger.info(`Socket.IO client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket.IO error from client ${socket.id}:`, error);
  });
});

// Make io available to routes
fastify.decorate('io', io);

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

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close RCON connections
    const rconService = await import('./services/rcon.js');
    await rconService.default.closeAllConnections();
    
    // Stop all Docker log streams
    const dockerService = await import('./services/docker.js');
    await dockerService.default.stopAllLogStreams();
    
    // Close Socket.IO server
    io.close();
    
    // Close HTTP server
    server.close();
    
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
    // Start HTTP server with Socket.IO
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`ASA Control API server listening on ${config.server.host}:${config.server.port}`);
      logger.info(`Socket.IO server ready`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`Metrics enabled: ${config.metrics.enabled}`);
      
      // Log default credentials in development
      if (config.server.nodeEnv === 'development') {
        logger.info('Default users:');
        logger.info('  admin/admin123 (admin role)');
        logger.info('  operator/operator123 (operator role)');
        logger.info('  viewer/viewer123 (viewer role)');
      }
    });
    
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};

start(); 
