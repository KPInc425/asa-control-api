import userManagementService from '../../services/user-management.js';
import logger from '../../utils/logger.js';

/**
 * Password management routes: forgot password, reset password
 */
export default async function passwordRoutes(fastify, options) {
  // Initiate password reset
  fastify.post('/api/auth/forgot-password', {
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
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email } = request.body;
      const result = await userManagementService.initiatePasswordReset(email);
      
      return result;
    } catch (error) {
      fastify.log.error('Forgot password error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to initiate password reset'
      });
    }
  });

  // Reset password with token
  fastify.post('/api/auth/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string' }
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
      const { token, newPassword } = request.body;
      const result = await userManagementService.resetPassword(token, newPassword);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Reset password error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to reset password'
      });
    }
  });
}
