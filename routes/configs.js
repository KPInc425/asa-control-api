import configService from '../services/config.js';
import { requireRead, requireWrite } from '../middleware/auth.js';

/**
 * Config routes for ASA configuration file management
 */
export default async function configRoutes(fastify, options) {
  // List all available ASA servers
  fastify.get('/api/servers', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            servers: {
              type: 'array',
              items: { type: 'string' }
            },
            count: { type: 'number' },
            rootPath: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await configService.listServers();
      return result;
    } catch (error) {
      fastify.log.error('Error listing ASA servers:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get server information
  fastify.get('/api/servers/:server', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['server'],
        properties: {
          server: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            serverName: { type: 'string' },
            serverPath: { type: 'string' },
            configPath: { type: 'string' },
            configExists: { type: 'boolean' },
            configFiles: {
              type: 'array',
              items: { type: 'string' }
            },
            defaultFiles: {
              type: 'array',
              items: { type: 'string' }
            },
            hasGameIni: { type: 'boolean' },
            hasGameUserSettings: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { server } = request.params;
      const result = await configService.getServerInfo(server);
      return result;
    } catch (error) {
      fastify.log.error(`Error getting server info for ${request.params.server}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get config file contents for a specific server
  fastify.get('/api/servers/:server/config', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['server'],
        properties: {
          server: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          file: { type: 'string', default: 'GameUserSettings.ini' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            content: { type: 'string' },
            filePath: { type: 'string' },
            fileName: { type: 'string' },
            serverName: { type: 'string' },
            configPath: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { server } = request.params;
      const { file } = request.query;
      
      const result = await configService.getConfigFile(server, file);
      return result;
    } catch (error) {
      fastify.log.error(`Error reading config file for server ${request.params.server}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update config file contents for a specific server
  fastify.put('/api/servers/:server/config', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['server'],
        properties: {
          server: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          file: { type: 'string', default: 'GameUserSettings.ini' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            filePath: { type: 'string' },
            fileName: { type: 'string' },
            serverName: { type: 'string' },
            configPath: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { server } = request.params;
      const { content, file } = request.body;
      
      const result = await configService.updateConfigFile(server, content, file);
      return result;
    } catch (error) {
      fastify.log.error(`Error updating config file for server ${request.params.server}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // List config files for a specific server
  fastify.get('/api/servers/:server/config/files', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['server'],
        properties: {
          server: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            files: {
              type: 'array',
              items: { type: 'string' }
            },
            serverName: { type: 'string' },
            path: { type: 'string' },
            defaultFiles: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { server } = request.params;
      const result = await configService.listConfigFiles(server);
      return result;
    } catch (error) {
      fastify.log.error(`Error listing config files for server ${request.params.server}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get update lock status
  fastify.get('/api/lock-status', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            locked: { type: 'boolean' },
            content: { type: 'string', nullable: true },
            timestamp: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const status = await configService.getUpdateLockStatus();
      return status;
    } catch (error) {
      fastify.log.error('Error getting update lock status:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Create update lock
  fastify.post('/api/lock-status', {
    preHandler: [requireWrite],
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', default: 'Manual lock' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            path: { type: 'string' },
            content: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { reason } = request.body;
      const result = await configService.createUpdateLock(reason);
      return result;
    } catch (error) {
      fastify.log.error('Error creating update lock:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Remove update lock
  fastify.delete('/api/lock-status', {
    preHandler: [requireWrite],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await configService.removeUpdateLock();
      return result;
    } catch (error) {
      fastify.log.error('Error removing update lock:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Parse INI content
  fastify.post('/api/parse-ini', {
    preHandler: [requireRead],
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            parsed: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { content } = request.body;
      const parsed = configService.parseIniContent(content);
      
      return {
        success: true,
        parsed
      };
    } catch (error) {
      fastify.log.error('Error parsing INI content:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Stringify INI content
  fastify.post('/api/stringify-ini', {
    preHandler: [requireRead],
    schema: {
      body: {
        type: 'object',
        required: ['parsed'],
        properties: {
          parsed: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            content: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { parsed } = request.body;
      const content = configService.stringifyIniContent(parsed);
      
      return {
        success: true,
        content
      };
    } catch (error) {
      fastify.log.error('Error stringifying INI content:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
} 
 