import { environmentService } from '../../services/environment.js';
import { requireRead, requireAdmin } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

export default async function envFileRoutes(fastify, options) {
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
}
