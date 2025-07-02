import authService from '../services/auth.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

/**
 * Authentication routes for user management
 */
export default async function authRoutes(fastify, options) {
  // User login
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
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
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, password } = request.body;
      
      if (!username || !password) {
        return reply.status(400).send({
          success: false,
          message: 'Username and password are required'
        });
      }

      const result = await authService.authenticateUser(username, password);
      
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
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
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

  // Create new user (admin only)
  fastify.post('/api/auth/users', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'], default: 'viewer' }
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
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, password, role } = request.body;
      
      // Validate password strength
      const passwordValidation = authService.validatePassword(password);
      if (!passwordValidation.valid) {
        return reply.status(400).send({
          success: false,
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        });
      }

      const result = await authService.createUser({ username, password, role });
      
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

  // Update user (admin only)
  fastify.put('/api/auth/users/:username', {
    preHandler: [authenticate, requireAdmin],
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
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'] }
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
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
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
      
      if (updates.password) {
        // Validate password strength
        const passwordValidation = authService.validatePassword(updates.password);
        if (!passwordValidation.valid) {
          return reply.status(400).send({
            success: false,
            message: 'Password does not meet requirements',
            errors: passwordValidation.errors
          });
        }
      }

      const result = await authService.updateUser(username, updates);
      
      if (!result.success) {
        return reply.status(404).send(result);
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
    preHandler: [authenticate, requireAdmin],
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
      
      // Prevent admin from deleting themselves
      if (username === request.user.username) {
        return reply.status(400).send({
          success: false,
          message: 'Cannot delete your own account'
        });
      }

      const result = await authService.deleteUser(username);
      
      if (!result.success) {
        return reply.status(404).send(result);
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

  // List all users (admin only)
  fastify.get('/api/auth/users', {
    preHandler: [authenticate, requireAdmin],
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
                  role: { type: 'string' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string' }
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
      const result = authService.listUsers();
      return result;
    } catch (error) {
      fastify.log.error('List users error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to list users'
      });
    }
  });

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
      const validation = authService.validatePassword(password);
      return validation;
    } catch (error) {
      fastify.log.error('Password validation error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Password validation failed'
      });
    }
  });
} 
