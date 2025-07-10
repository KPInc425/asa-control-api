import dockerService from '../services/docker.js';
import { DockerServerManager } from '../services/server-manager.js';
import { requireRead, requireWrite } from '../middleware/auth.js';

// Create Docker-only server manager instance
const serverManager = new DockerServerManager(dockerService);

/**
 * Container routes for ASA container management
 */
export default async function containerRoutes(fastify, options) {
  // Get all containers/servers
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
                  ports: { 
                    oneOf: [
                      { type: 'array' },
                      { type: 'string' }
                    ]
                  },
                  labels: { type: 'object' },
                  memoryUsage: { type: 'number' },
                  cpuUsage: { type: 'number' },
                  type: { type: 'string' },
                  serverCount: { type: 'number' },
                  maps: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const containers = await serverManager.listServers();
      
      // Filter to only include actual Docker containers (not native servers)
      const dockerContainers = containers.filter(container => 
        container.type === 'container' || 
        (container.image && !container.image.includes('native'))
      );
      
      // Transform the data to match the expected schema
      const transformedContainers = dockerContainers.map(container => ({
        id: container.name, // Use name as ID for containers
        name: container.name,
        image: container.image || 'unknown',
        status: container.status,
        created: container.created,
        ports: container.ports || [],
        labels: container.labels || {},
        memoryUsage: container.memoryUsage || 0,
        cpuUsage: container.cpuUsage || 0,
        type: 'container', // Force type to be container
        serverCount: container.serverCount || 1,
        maps: container.maps || 'Unknown'
      }));
      
      return { success: true, containers: transformedContainers };
    } catch (error) {
      // If Docker is not running, return empty list instead of error
      if (error.message.includes('connect ENOENT') || error.message.includes('Failed to list containers')) {
        fastify.log.warn('Docker not running, returning empty container list');
        return { success: true, containers: [] };
      }
      
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
      const result = await serverManager.start(name);
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
      const result = await serverManager.stop(name);
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
      const result = await serverManager.restart(name);
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
            logs: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { tail = 100, follow = false } = request.query;
      
      const logs = await serverManager.getLogs(name, { tail, follow });
      return { success: true, logs };
    } catch (error) {
      fastify.log.error(`Error getting logs for ${request.params.name}:`, error);
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
                name: { type: 'string' },
                status: { type: 'string' },
                cpu: { type: 'number' },
                memory: { type: 'number' },
                uptime: { type: 'number' },
                pid: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const stats = await serverManager.getStats(name);
      return { success: true, stats };
    } catch (error) {
      fastify.log.error(`Error getting stats for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Check if container is running
  fastify.get('/api/containers/:name/running', {
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
            running: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const running = await serverManager.isRunning(name);
      return { success: true, running };
    } catch (error) {
      fastify.log.error(`Error checking running status for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get container status (compatibility with native servers)
  fastify.get('/api/containers/:name/status', {
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
            status: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const running = await serverManager.isRunning(name);
      const status = {
        status: running ? 'running' : 'stopped',
        running: running
      };
      return { success: true, status };
    } catch (error) {
      fastify.log.error(`Error getting container status for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
} 
