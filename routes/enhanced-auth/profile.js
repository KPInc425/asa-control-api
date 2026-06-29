import userManagementService from '../../services/user-management.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * Profile routes: update profile, change password
 */
export default async function profileRoutes(fastify, options) {
  // Update user profile
  fastify.put('/api/auth/profile', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          profile: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              displayName: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              timezone: { type: 'string' },
              language: { type: 'string' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
                profile: {
                  type: 'object',
                  properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    displayName: { type: 'string' },
                    avatar: { type: 'string', nullable: true },
                    timezone: { type: 'string' },
                    language: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const updates = request.body;
      const result = await userManagementService.updateUserProfile(request.user.username, updates);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Update profile error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update profile'
      });
    }
  });

  // Change password
  fastify.put('/api/auth/change-password', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
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
      const { currentPassword, newPassword } = request.body;
      const result = await userManagementService.changePassword(
        request.user.username, 
        currentPassword, 
        newPassword
      );
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Change password error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to change password'
      });
    }
  });
}
