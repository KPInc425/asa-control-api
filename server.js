import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
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
    level: config.logging.level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
});

// Register plugins
await fastify.register(cors, {
  origin: config.cors.origin,
  credentials: true
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
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });
    
    logger.info(`ASA Control API server listening on ${config.server.host}:${config.server.port}`);
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
