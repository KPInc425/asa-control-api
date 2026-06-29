import userManagementService from '../../services/user-management.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * Session routes: login, logout, get current user
 */
export default async function sessionRoutes(fastify, options) {
  // Enhanced user login with security features
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          rememberMe: { type: 'boolean', default: false }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            token: { type: 'string' },
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
                },
                security: {
                  type: 'object',
                  properties: {
                    emailVerified: { type: 'boolean' },
                    twoFactorEnabled: { type: 'boolean' },
                    lastLogin: { type: 'string' }
                  }
                }
              }
            },
            rememberMe: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, password, rememberMe = false } = request.body;
      
      if (!username || !password) {
        return reply.status(400).send({
          success: false,
          message: 'Username and password are required'
        });
      }

      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      const result = await userManagementService.authenticateUser(username, password, ipAddress, userAgent, rememberMe);
      
      if (!result.success) {
        return reply.status(401).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Login error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Login failed'
      });
    }
  });

  // User logout
  fastify.post('/api/auth/logout', {
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
      const token = request.headers.authorization?.replace('Bearer ', '');
      const result = await userManagementService.logoutUser(token);
      
      return result;
    } catch (error) {
      fastify.log.error('Logout error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Logout failed'
      });
    }
  });

  // Get current user info
  fastify.get('/api/auth/me', {
    preHandler: [authenticate],
    schema: {
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
                },
                security: {
                  type: 'object',
                  properties: {
                    emailVerified: { type: 'boolean' },
                    twoFactorEnabled: { type: 'boolean' },
                    lastLogin: { type: 'string' }
                  }
                },
                metadata: {
                  type: 'object',
                  properties: {
                    createdAt: { type: 'string' },
                    lastActivity: { type: 'string' }
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
      // The user data is already available from the authentication middleware
      // No need to look it up again
      return {
        success: true,
        user: request.user
      };
    } catch (error) {
      fastify.log.error('Get current user error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get user info'
      });
    }
  });
}
