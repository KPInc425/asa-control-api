import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';
import autoShutdownService from '../services/auto-shutdown.js';

export default async function autoShutdownRoutes(fastify) {
  // Get auto-shutdown service status
  fastify.get('/api/auto-shutdown/status', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const status = {
        enabled: autoShutdownService.isServiceEnabled(),
        activeTimers: autoShutdownService.getAllTimers(),
        serverConfigs: autoShutdownService.getAllConfigs()
      };
      
      return {
        success: true,
        status
      };
    } catch (error) {
      logger.error('Error getting auto-shutdown status:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get auto-shutdown status'
      });
    }
  });

  // Enable/disable auto-shutdown service
  fastify.post('/api/auto-shutdown/enable', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        },
        required: ['enabled']
      }
    }
  }, async (request, reply) => {
    try {
      const { enabled } = request.body;
      
      autoShutdownService.setEnabled(enabled);
      
      return {
        success: true,
        message: `Auto-shutdown service ${enabled ? 'enabled' : 'disabled'}`
      };
    } catch (error) {
      logger.error('Error enabling/disabling auto-shutdown service:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update auto-shutdown service status'
      });
    }
  });

  // Get auto-shutdown config for a server
  fastify.get('/api/auto-shutdown/servers/:serverName/config', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const config = autoShutdownService.getServerConfig(serverName);
      const timerInfo = autoShutdownService.getTimerInfo(serverName);
      
      return {
        success: true,
        config,
        timerInfo
      };
    } catch (error) {
      logger.error(`Error getting auto-shutdown config for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get auto-shutdown configuration'
      });
    }
  });

  // Update auto-shutdown config for a server
  fastify.put('/api/auto-shutdown/servers/:serverName/config', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          timeoutMinutes: { type: 'number', minimum: 1, maximum: 1440 },
          saveBeforeShutdown: { type: 'boolean' },
          saveTimeoutSeconds: { type: 'number', minimum: 5, maximum: 300 },
          warningIntervals: { 
            type: 'array',
            items: { type: 'number', minimum: 1, maximum: 60 }
          },
          discordNotifications: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const config = request.body;
      
      // Validate timeout
      if (config.timeoutMinutes && (config.timeoutMinutes < 1 || config.timeoutMinutes > 1440)) {
        return reply.status(400).send({
          success: false,
          message: 'Timeout must be between 1 and 1440 minutes'
        });
      }
      
      // Validate warning intervals
      if (config.warningIntervals) {
        for (const interval of config.warningIntervals) {
          if (interval < 1 || interval > 60) {
            return reply.status(400).send({
              success: false,
              message: 'Warning intervals must be between 1 and 60 minutes'
            });
          }
        }
      }
      
      const success = await autoShutdownService.updateServerConfig(serverName, config);
      
      if (success) {
        return {
          success: true,
          message: 'Auto-shutdown configuration updated successfully'
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to update auto-shutdown configuration'
        });
      }
    } catch (error) {
      logger.error(`Error updating auto-shutdown config for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update auto-shutdown configuration'
      });
    }
  });

  // Initialize auto-shutdown for a server
  fastify.post('/api/auto-shutdown/servers/:serverName/initialize', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          timeoutMinutes: { type: 'number', minimum: 1, maximum: 1440 },
          saveBeforeShutdown: { type: 'boolean' },
          saveTimeoutSeconds: { type: 'number', minimum: 5, maximum: 300 },
          warningIntervals: { 
            type: 'array',
            items: { type: 'number', minimum: 1, maximum: 60 }
          },
          discordNotifications: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const config = request.body;
      
      const success = await autoShutdownService.initializeServer(serverName, config);
      
      if (success) {
        return {
          success: true,
          message: 'Auto-shutdown initialized successfully'
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to initialize auto-shutdown'
        });
      }
    } catch (error) {
      logger.error(`Error initializing auto-shutdown for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to initialize auto-shutdown'
      });
    }
  });

  // Start monitoring a server
  fastify.post('/api/auto-shutdown/servers/:serverName/start-monitoring', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const success = await autoShutdownService.startMonitoring(serverName);
      
      if (success) {
        return {
          success: true,
          message: 'Auto-shutdown monitoring started'
        };
      } else {
        return reply.status(400).send({
          success: false,
          message: 'Failed to start monitoring (server may not be configured for auto-shutdown)'
        });
      }
    } catch (error) {
      logger.error(`Error starting auto-shutdown monitoring for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to start monitoring'
      });
    }
  });

  // Stop monitoring a server
  fastify.post('/api/auto-shutdown/servers/:serverName/stop-monitoring', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const success = await autoShutdownService.stopMonitoring(serverName);
      
      if (success) {
        return {
          success: true,
          message: 'Auto-shutdown monitoring stopped'
        };
      } else {
        return reply.status(400).send({
          success: false,
          message: 'No active monitoring found for this server'
        });
      }
    } catch (error) {
      logger.error(`Error stopping auto-shutdown monitoring for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to stop monitoring'
      });
    }
  });

  // Manually trigger shutdown for a server
  fastify.post('/api/auto-shutdown/servers/:serverName/shutdown', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      body: {
        type: 'object',
        properties: {
          saveBeforeShutdown: { type: 'boolean', default: true },
          saveTimeoutSeconds: { type: 'number', minimum: 5, maximum: 300, default: 30 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { saveBeforeShutdown = true, saveTimeoutSeconds = 30 } = request.body;
      
      // Save world if requested
      if (saveBeforeShutdown) {
        await autoShutdownService.saveWorldBeforeShutdown(serverName, saveTimeoutSeconds);
      }
      
      // Emit shutdown event
      autoShutdownService.emit('shutdownRequested', {
        serverName,
        reason: 'manual_shutdown',
        config: { saveBeforeShutdown, saveTimeoutSeconds }
      });
      
      return {
        success: true,
        message: 'Manual shutdown initiated'
      };
    } catch (error) {
      logger.error(`Error triggering manual shutdown for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to trigger shutdown'
      });
    }
  });

  // Get all server configurations
  fastify.get('/api/auto-shutdown/servers', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const configs = autoShutdownService.getAllConfigs();
      const timers = autoShutdownService.getAllTimers();
      
      const servers = Object.keys(configs).map(serverName => ({
        serverName,
        config: configs[serverName],
        timerInfo: timers[serverName] || null
      }));
      
      return {
        success: true,
        servers
      };
    } catch (error) {
      logger.error('Error getting auto-shutdown server configurations:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get server configurations'
      });
    }
  });

  // Clear all timers (emergency stop)
  fastify.post('/api/auto-shutdown/clear-all-timers', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      autoShutdownService.clearAllTimers();
      
      return {
        success: true,
        message: 'All auto-shutdown timers cleared'
      };
    } catch (error) {
      logger.error('Error clearing all auto-shutdown timers:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to clear timers'
      });
    }
  });

  // Test saveworld functionality
  fastify.post('/api/auto-shutdown/servers/:serverName/test-save', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      await autoShutdownService.saveWorldBeforeShutdown(serverName, 30);
      
      return {
        success: true,
        message: 'Test save completed successfully'
      };
    } catch (error) {
      logger.error(`Error testing save for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to test save functionality'
      });
    }
  });
} 
