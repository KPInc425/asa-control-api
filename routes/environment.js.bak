import { environmentService } from '../services/environment.js';
import { requireRead, requireWrite, requireAdmin } from '../middleware/auth.js';
import config from '../config/index.js';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import { requirePermission } from '../middleware/auth.js';

/**
 * Environment management routes for .env and docker-compose.yml files
 */
export default async function environmentRoutes(fastify, options) {
  // Get environment file content
  fastify.get('/api/environment', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            content: { type: 'string' },
            variables: { type: 'object' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await environmentService.readEnvironmentFile();
      return result;
    } catch (error) {
      fastify.log.error('Error reading environment file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update environment file
  fastify.put('/api/environment', {
    preHandler: [requireAdmin],
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
            message: { type: 'string' },
            path: { type: 'string' },
            variables: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { content } = request.body;
      const result = await environmentService.updateEnvironmentFile(content);
      return result;
    } catch (error) {
      fastify.log.error('Error updating environment file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update specific environment variable
  fastify.put('/api/environment/:key', {
    preHandler: [requireAdmin],
    schema: {
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['value'],
        properties: {
          value: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            path: { type: 'string' },
            variables: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { value } = request.body;
      const result = await environmentService.updateEnvironmentVariable(key, value);
      return result;
    } catch (error) {
      fastify.log.error(`Error updating environment variable ${request.params.key}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get Docker Compose file content
  fastify.get('/api/docker-compose', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            content: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await environmentService.readDockerComposeFile();
      return result;
    } catch (error) {
      fastify.log.error('Error reading Docker Compose file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update Docker Compose file
  fastify.put('/api/docker-compose', {
    preHandler: [requireAdmin],
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
            message: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { content } = request.body;
      const result = await environmentService.updateDockerComposeFile(content);
      return result;
    } catch (error) {
      fastify.log.error('Error updating Docker Compose file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Reload environment configuration
  fastify.post('/api/environment/reload', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            needsRestart: { type: 'boolean' },
            restartCommand: { type: 'string', nullable: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await environmentService.reloadEnvironment();
      return result;
    } catch (error) {
      fastify.log.error('Error reloading environment:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

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

  // Reload Docker Compose configuration
  fastify.post('/api/docker-compose/reload', {
    preHandler: [requireAdmin],
    schema: {
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
      const result = await environmentService.reloadDockerCompose();
      return result;
    } catch (error) {
      fastify.log.error('Error reloading Docker Compose:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get available mods (placeholder for future implementation)
  fastify.get('/api/mods', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            mods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  author: { type: 'string' },
                  version: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Popular ARK mods - in a real implementation, you might fetch from Steam Workshop API
      const mods = [
        {
          id: '731604991',
          name: 'Structures Plus (S+)',
          description: 'Enhanced building system with advanced features',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '793605978',
          name: 'Platforms Plus',
          description: 'Enhanced platform building and functionality',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '821530042',
          name: 'Castles, Keeps, and Forts Remastered',
          description: 'Medieval building pieces and structures',
          author: 'Mezta',
          version: '1.0.0'
        },
        {
          id: '1404697612',
          name: 'Dino Storage v2',
          description: 'Advanced dino management and storage system',
          author: 'Salty',
          version: '2.0.0'
        },
        {
          id: '1565015734',
          name: 'Awesome SpyGlass!',
          description: 'Enhanced spyglass with detailed creature information',
          author: 'MisterRaa',
          version: '1.0.0'
        },
        {
          id: '1631852980',
          name: 'Super Structures',
          description: 'Advanced building system with automation features',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '1766154726',
          name: 'Automated Ark',
          description: 'Automation and quality of life improvements',
          author: 'MisterRaa',
          version: '1.0.0'
        },
        {
          id: '1814953878',
          name: 'HG Stacking Mod 5000-90 V317',
          description: 'Increased stack sizes for better inventory management',
          author: 'HackGMs',
          version: '3.17'
        }
      ];

      return {
        success: true,
        mods
      };
    } catch (error) {
      fastify.log.error('Error getting mods:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get lock status
  fastify.get('/api/lock-status', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const lockFilePath = config.environment.lockFilePath || path.join(process.cwd(), '.update.lock');
      
      try {
        await fs.access(lockFilePath);
        const lockContent = await fs.readFile(lockFilePath, 'utf8');
        const lockData = JSON.parse(lockContent);
        
        return {
          success: true,
          locked: true,
          lockData
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return {
            success: true,
            locked: false,
            lockData: null
          };
        }
        throw error;
      }
    } catch (error) {
      logger.error('Failed to get lock status:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get lock status'
      });
    }
  });
} 
