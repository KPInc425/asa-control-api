import rconService from '../services/rcon.js';
import { requireWrite } from '../middleware/auth.js';

/**
 * RCON routes for sending commands to ASA servers
 */
export default async function rconRoutes(fastify, options) {
  // Send RCON command
  fastify.post('/api/containers/:name/rcon', {
    preHandler: [requireWrite],
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
        required: ['command'],
        properties: {
          command: { type: 'string' },
          host: { type: 'string' },
          port: { type: 'number' },
          password: { type: 'string' },
          timeout: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: { type: 'string' },
            command: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { command, host, port, password, timeout } = request.body;
      
      const options = {};
      if (host) options.host = host;
      if (port) options.port = port;
      if (password) options.password = password;
      if (timeout) options.timeout = timeout;
      
      const result = await rconService.sendRconCommand(name, command, options);
      return result;
    } catch (error) {
      fastify.log.error(`RCON command failed for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get server info
  fastify.get('/api/containers/:name/server-info', {
    preHandler: [requireWrite],
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
            info: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const info = await rconService.getServerInfo(name);
      return { success: true, info };
    } catch (error) {
      fastify.log.error(`Failed to get server info for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get player list
  fastify.get('/api/containers/:name/players', {
    preHandler: [requireWrite],
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
            players: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const players = await rconService.getPlayerList(name);
      return { success: true, players };
    } catch (error) {
      fastify.log.error(`Failed to get player list for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Save world
  fastify.post('/api/containers/:name/save-world', {
    preHandler: [requireWrite],
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
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const result = await rconService.saveWorld(name);
      return result;
    } catch (error) {
      fastify.log.error(`Failed to save world for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Broadcast message
  fastify.post('/api/containers/:name/broadcast', {
    preHandler: [requireWrite],
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
        required: ['message'],
        properties: {
          message: { type: 'string' }
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
      const { name } = request.params;
      const { message } = request.body;
      const result = await rconService.broadcast(name, message);
      return result;
    } catch (error) {
      fastify.log.error(`Failed to broadcast message to container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Send asa-ctrl command (alternative method)
  fastify.post('/api/containers/:name/asa-ctrl', {
    preHandler: [requireWrite],
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
        required: ['command'],
        properties: {
          command: { type: 'string' },
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: { type: 'string' },
            command: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { command, password } = request.body;
      
      const options = {};
      if (password) options.password = password;
      
      const result = await rconService.sendAsaCtrlCommand(name, command, options);
      return result;
    } catch (error) {
      fastify.log.error(`asa-ctrl command failed for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
} 
