import rconService from '../services/rcon.js';
import { testGetChatForServer } from '../services/chat-poller.js';
import logger from '../utils/logger.js';

export default async function rconRoutes(fastify, options) {
  // Get RCON health status
  fastify.get('/api/rcon/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            health: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  successCount: { type: 'number' },
                  failureCount: { type: 'number' },
                  lastSuccess: { type: 'string', nullable: true },
                  lastFailure: { type: 'string', nullable: true },
                  consecutiveFailures: { type: 'number' },
                  successRate: { type: 'string' }
                }
              }
            },
            cacheStats: {
              type: 'object',
              properties: {
                totalEntries: { type: 'number' },
                expiredEntries: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const health = rconService.getConnectionHealthSummary();
      const cacheStats = {
        totalEntries: rconService.cachedData.size,
        expiredEntries: 0 // This would need to be calculated
      };
      
      return {
        success: true,
        health,
        cacheStats
      };
    } catch (error) {
      logger.error('Error getting RCON health:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get RCON health status'
      });
    }
  });

  // Clear RCON cache
  fastify.post('/api/rcon/cache/clear', {
    schema: {
      body: {
        type: 'object',
        properties: {
          serverKey: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverKey } = request.body;
      rconService.clearCache(serverKey);
      
      return {
        success: true,
        message: serverKey ? `Cache cleared for ${serverKey}` : 'All cache cleared'
      };
    } catch (error) {
      logger.error('Error clearing RCON cache:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to clear RCON cache'
      });
    }
  });

  // Get RCON cache status
  fastify.get('/api/rcon/cache/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            cacheEntries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  timestamp: { type: 'number' },
                  ttl: { type: 'number' },
                  age: { type: 'number' },
                  expired: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const now = Date.now();
      const cacheEntries = [];
      
      for (const [key, entry] of rconService.cachedData.entries()) {
        const age = now - entry.timestamp;
        const expired = age > entry.ttl;
        
        cacheEntries.push({
          key,
          timestamp: entry.timestamp,
          ttl: entry.ttl,
          age,
          expired
        });
      }
      
      return {
        success: true,
        cacheEntries
      };
    } catch (error) {
      logger.error('Error getting RCON cache status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get RCON cache status'
      });
    }
  });

  // Test RCON connection
  fastify.post('/api/rcon/test', {
    schema: {
      body: {
        type: 'object',
        properties: {
          serverName: { type: 'string' },
          command: { type: 'string', default: 'listplayers' }
        },
        required: ['serverName']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: { type: 'string' },
            cached: { type: 'boolean' },
            attempt: { type: 'number' },
            duration: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName, command = 'listplayers' } = request.body;
      const startTime = Date.now();
      
      const result = await rconService.sendRconCommandWithRetry(serverName, command, {
        maxRetries: 3,
        timeout: 10000
      });
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        response: result.response,
        cached: result.cached || false,
        attempt: result.attempt || 1,
        duration
      };
    } catch (error) {
      logger.error('Error testing RCON connection:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Send RCON command
  fastify.post('/api/rcon/command', {
    schema: {
      body: {
        type: 'object',
        properties: {
          serverName: { type: 'string' },
          command: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              maxRetries: { type: 'number' },
              timeout: { type: 'number' },
              retryDelay: { type: 'number' }
            }
          }
        },
        required: ['serverName', 'command']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: { type: 'string' },
            cached: { type: 'boolean' },
            attempt: { type: 'number' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName, command, options = {} } = request.body;
      
      const result = await rconService.sendRconCommandWithRetry(serverName, command, {
        maxRetries: options.maxRetries || 3,
        timeout: options.timeout || 10000,
        retryDelay: options.retryDelay || 1000
      });
      
      return {
        success: true,
        response: result.response,
        cached: result.cached || false,
        attempt: result.attempt || 1
      };
    } catch (error) {
      logger.error('Error sending RCON command:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get server info with enhanced error handling
  fastify.get('/api/rcon/server-info/:serverName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            info: { type: 'object' },
            cached: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const info = await rconService.getServerInfo(serverName);
      
      return {
        success: true,
        info,
        cached: false // This would need to be tracked in the service
      };
    } catch (error) {
      logger.error('Error getting server info:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get player list with enhanced error handling
  fastify.get('/api/rcon/players/:serverName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            players: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  steamId: { type: 'string' }
                }
              }
            },
            cached: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const players = await rconService.getPlayerList(serverName);
      
      return {
        success: true,
        players,
        cached: false // This would need to be tracked in the service
      };
    } catch (error) {
      logger.error('Error getting player list:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Test GetChat command for a specific server
  fastify.get('/api/rcon/test-getchat/:serverName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            serverName: { type: 'string' },
            response: { type: 'string' },
            responseLength: { type: 'number' },
            cached: { type: 'boolean' },
            attempt: { type: 'number' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      logger.info(`Testing GetChat command for server: ${serverName}`);
      
      const result = await testGetChatForServer(serverName);
      
      return {
        success: result.success,
        serverName,
        response: result.response,
        responseLength: result.responseLength,
        cached: result.cached,
        attempt: result.attempt,
        error: result.error
      };
    } catch (error) {
      logger.error('Error testing GetChat command:', error);
      return reply.status(500).send({
        success: false,
        serverName: request.params.serverName,
        error: error.message
      });
    }
  });
} 
