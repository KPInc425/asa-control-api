import userManagementService from '../../services/user-management.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * Email verification routes: verify email, resend verification
 */
export default async function emailRoutes(fastify, options) {
  // Verify email
  fastify.post('/api/auth/verify-email', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
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
      const { token } = request.body;
      const result = await userManagementService.verifyEmail(token);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Verify email error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to verify email'
      });
    }
  });

  // Resend email verification
  fastify.post('/api/auth/resend-verification', {
    preHandler: [authenticate],
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
      const user = userManagementService.getUserById(request.user.id);
      
      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }

      if (user.security.emailVerified) {
        return reply.status(400).send({
          success: false,
          message: 'Email is already verified'
        });
      }

      const result = await userManagementService.sendEmailVerification(user);
      
      return result;
    } catch (error) {
      fastify.log.error('Resend verification error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to resend verification email'
      });
    }
  });
}
