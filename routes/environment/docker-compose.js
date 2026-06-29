import { environmentService } from '../../services/environment.js';
import { requireRead, requireAdmin } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

export default async function dockerComposeRoutes(fastify, options) {
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
}
