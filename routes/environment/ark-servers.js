import { environmentService } from '../../services/environment.js';
import { requireRead, requireAdmin } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

export default async function arkServerRoutes(fastify, options) {
  // Get ARK server configurations
  fastify.get('/api/ark-servers', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            servers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  lines: { type: 'array', items: { type: 'string' } },
                  startLine: { type: 'number' },
                  endLine: { type: 'number' }
                }
              }
            },
            count: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await environmentService.getArkServerConfigs();
      return result;
    } catch (error) {
      fastify.log.error('Error getting ARK server configs:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Add new ARK server
  fastify.post('/api/ark-servers', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          containerName: { type: 'string' },
          image: { type: 'string' },
          gamePort: { type: 'string' },
          rconPort: { type: 'string' },
          serverName: { type: 'string' },
          mapName: { type: 'string' },
          serverPassword: { type: 'string' },
          adminPassword: { type: 'string' },
          maxPlayers: { type: 'string' },
          mods: {
            type: 'array',
            items: { type: 'string' }
          },
          additionalArgs: { type: 'string' },
          dataPath: { type: 'string' },
          disableBattleEye: { type: 'boolean' }
        }
      },
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
      const serverConfig = request.body;
      const result = await environmentService.addArkServer(serverConfig);
      return result;
    } catch (error) {
      fastify.log.error('Error adding ARK server:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update ARK server
  fastify.put('/api/ark-servers/:name', {
    preHandler: [requireAdmin],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          containerName: { type: 'string' },
          image: { type: 'string' },
          gamePort: { type: 'string' },
          rconPort: { type: 'string' },
          serverName: { type: 'string' },
          mapName: { type: 'string' },
          serverPassword: { type: 'string' },
          adminPassword: { type: 'string' },
          maxPlayers: { type: 'string' },
          mods: {
            type: 'array',
            items: { type: 'string' }
          },
          additionalArgs: { type: 'string' }
        }
      },
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
      const { name } = request.params;
      const serverConfig = { name, ...request.body };
      const result = await environmentService.updateArkServer(name, serverConfig);
      return result;
    } catch (error) {
      fastify.log.error(`Error updating ARK server ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Remove ARK server
  fastify.delete('/api/ark-servers/:name', {
    preHandler: [requireAdmin],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
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
      const { name } = request.params;
      const result = await environmentService.removeArkServer(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error removing ARK server ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
}
