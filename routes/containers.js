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

  // Get container logs
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
          tail: { type: 'number', default: 100 },
          follow: { type: 'boolean', default: false }
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
      const { tail, follow } = request.query;
      
      if (follow) {
        // WebSocket streaming for real-time logs
        reply.raw.writeHead(200, {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        });
        
        const container = dockerService.docker.getContainer(name);
        const logStream = await container.logs({
          stdout: true,
          stderr: true,
          tail: tail || 100,
          follow: true
        });
        
        logStream.on('data', (chunk) => {
          reply.raw.write(chunk);
        });
        
        logStream.on('end', () => {
          reply.raw.end();
        });
        
        request.raw.on('close', () => {
          logStream.destroy();
        });
        
        return reply;
      } else {
        const logs = await dockerService.getContainerLogs(name, { tail });
        return { success: true, logs };
      }
    } catch (error) {
      fastify.log.error(`Error getting logs for container ${request.params.name}:`, error);
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
