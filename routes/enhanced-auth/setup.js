import userManagementService from '../../services/user-management.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * First-time setup route for default admin user
 */
export default async function setupRoutes(fastify, options) {
  // First-time setup for default admin user
  fastify.put('/api/auth/first-time-setup', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: {
          username: { type: 'string' },
          newPassword: { type: 'string' },
          profile: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              displayName: { type: 'string' },
              email: { type: 'string' },
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
            message: { type: 'string' },
            token: { type: 'string' },
            user: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username: newUsername, newPassword, profile } = request.body;
      const currentUser = request.user;
      
      // Only allow first-time setup for default admin user
      if (currentUser.username !== 'admin' || 
          (currentUser.profile?.firstName !== 'Admin' && currentUser.profile?.firstName)) {
        return reply.status(403).send({
          success: false,
          message: 'First-time setup is only available for the default admin user'
        });
      }

      // Validate password strength
      const passwordValidation = userManagementService.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return reply.status(400).send({
          success: false,
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        });
      }

      // Update user credentials and profile
      const updateData = {
        newPassword,
        profile: {
          ...profile,
          displayName: profile.displayName || 
            (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : 
             profile.firstName || profile.lastName || newUsername || 'admin')
        }
      };

      // If username is being changed, include it in the update
      if (newUsername && newUsername !== 'admin') {
        updateData.username = newUsername;
      }

      const result = await userManagementService.updateUserProfile('admin', updateData);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      // Generate a new JWT for the new username
      const updatedUser = result.user;
      const token = userManagementService.generateToken(updatedUser);

      return {
        success: true,
        message: 'First-time setup completed successfully',
        token,
        user: updatedUser
      };
    } catch (error) {
      fastify.log.error('First-time setup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to complete first-time setup'
      });
    }
  });
}
