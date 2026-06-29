import userManagementService from '../../services/user-management.js';
import logger from '../../utils/logger.js';

/**
 * Validation routes: password strength, email format
 */
export default async function validationRoutes(fastify, options) {
  // Validate password strength
  fastify.post('/api/auth/validate-password', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            errors: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { password } = request.body;
      const validation = userManagementService.validatePassword(password);
      return validation;
    } catch (error) {
      fastify.log.error('Password validation error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Password validation failed'
      });
    }
  });

  // Validate email format
  fastify.post('/api/auth/validate-email', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            errors: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email } = request.body;
      const validation = userManagementService.validateEmail(email);
      return validation;
    } catch (error) {
      fastify.log.error('Email validation error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Email validation failed'
      });
    }
  });
}
