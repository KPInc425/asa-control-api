import userManagementService from '../services/user-management.js';
import { authenticate, requireAdmin, requirePermission } from '../middleware/auth.js';
import logger from '../utils/logger.js';

/**
 * Enhanced Authentication routes with comprehensive user management
 */
export default async function enhancedAuthRoutes(fastify, options) {
  // Enhanced user login with security features
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

      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      const result = await userManagementService.authenticateUser(username, password, ipAddress, userAgent);
      
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
