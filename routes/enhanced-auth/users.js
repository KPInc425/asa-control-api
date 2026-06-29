import userManagementService from '../../services/user-management.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * User management routes (admin only): CRUD, list, stats
 */
export default async function userManagementRoutes(fastify, options) {
  // Create new user (admin only)
  fastify.post('/api/auth/users', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'], default: 'viewer' },
          profile: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              displayName: { type: 'string' },
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
      const userData = request.body;
      const result = await userManagementService.createUser(userData, request.user.username);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Create user error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to create user'
      });
    }
  });

  // List all users (admin only)
  fastify.get('/api/auth/users', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            users: {
              type: 'array',
              items: {
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
    }
  }, async (request, reply) => {
    try {
      const result = userManagementService.listUsers();
      return result;
    } catch (error) {
      fastify.log.error('List users error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to list users'
      });
    }
  });

  // Get user by ID (admin only)
  fastify.get('/api/auth/users/:userId', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
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
      const { userId } = request.params;
      const user = userManagementService.getUserById(userId);
      
      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }

      return {
        success: true,
        user
      };
    } catch (error) {
      fastify.log.error('Get user error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get user'
      });
    }
  });

  // Update user (admin only)
  fastify.put('/api/auth/users/:username', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      params: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'] },
          profile: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              displayName: { type: 'string' },
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
      const { username } = request.params;
      const updates = request.body;
      const result = await userManagementService.updateUserProfile(username, updates, request.user.username);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Update user error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update user'
      });
    }
  });

  // Delete user (admin only)
  fastify.delete('/api/auth/users/:username', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      params: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string' }
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
      const { username } = request.params;
      const result = await userManagementService.deleteUser(username, request.user.username);
      
      if (!result.success) {
        return reply.status(400).send(result);
      }

      return result;
    } catch (error) {
      fastify.log.error('Delete user error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete user'
      });
    }
  });

  // Get user statistics (admin only)
  fastify.get('/api/auth/stats', {
    preHandler: [authenticate, requirePermission('user_management')],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: {
              type: 'object',
              properties: {
                totalUsers: { type: 'number' },
                activeUsers: { type: 'number' },
                roleStats: {
                  type: 'object',
                  properties: {
                    admin: { type: 'number' },
                    operator: { type: 'number' },
                    viewer: { type: 'number' }
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
      const stats = userManagementService.getUserStats();
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      fastify.log.error('Get user stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get user statistics'
      });
    }
  });
}
