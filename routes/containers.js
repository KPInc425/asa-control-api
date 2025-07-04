import dockerService from '../services/docker.js';
import { requireRead, requireWrite } from '../middleware/auth.js';

/**
 * Container routes for ASA container management
 */
export default async function containerRoutes(fastify, options) {
  // Get all containers
  fastify.get('/api/containers', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            containers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  image: { type: 'string' },
                  status: { type: 'string' },
                  created: { type: 'string' },
                  ports: { type: 'array' },
                  labels: { type: 'object' },
                  memoryUsage: { type: 'number' },
                  cpuUsage: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const containers = await dockerService.listContainers();
      return { success: true, containers };
    } catch (error) {
      fastify.log.error('Error listing containers:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Start container
  fastify.post('/api/containers/:name/start', {
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
      const result = await dockerService.startContainer(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error starting container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Stop container
  fastify.post('/api/containers/:name/stop', {
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
      const result = await dockerService.stopContainer(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error stopping container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Restart container
  fastify.post('/api/containers/:name/restart', {
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
      const result = await dockerService.restartContainer(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error restarting container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get container logs (non-streaming)
  fastify.get('/api/containers/:name/logs', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          tail: { type: 'number', default: 100 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            logs: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { tail } = request.query;
      
      const logs = await dockerService.getContainerLogs(name, { tail });
      return { success: true, logs };
    } catch (error) {
      fastify.log.error(`Error getting logs for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Start log streaming via Socket.IO
  fastify.post('/api/containers/:name/logs/stream', {
    preHandler: [requireRead],
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
          tail: { type: 'number', default: 100 }
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
      const { tail = 100 } = request.body;
      
      // Start log streaming for this container
      await dockerService.startLogStreaming(name, tail, fastify.io);
      
      return { 
        success: true, 
        message: `Log streaming started for container ${name}` 
      };
    } catch (error) {
      fastify.log.error(`Error starting log streaming for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Stop log streaming via Socket.IO
  fastify.post('/api/containers/:name/logs/stop-stream', {
    preHandler: [requireRead],
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
      
      // Stop log streaming for this container
      await dockerService.stopLogStreaming(name);
      
      return { 
        success: true, 
        message: `Log streaming stopped for container ${name}` 
      };
    } catch (error) {
      fastify.log.error(`Error stopping log streaming for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get container stats
  fastify.get('/api/containers/:name/stats', {
    preHandler: [requireRead],
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
            stats: {
              type: 'object',
              properties: {
                memory: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' },
                    limit: { type: 'number' },
                    percentage: { type: 'string' }
                  }
                },
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' },
                    systemUsage: { type: 'number' },
                    percentage: { type: 'string' }
                  }
                },
                network: { type: 'object' },
                timestamp: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const stats = await dockerService.getContainerStats(name);
      return { success: true, stats };
    } catch (error) {
      fastify.log.error(`Error getting stats for container ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
} 
