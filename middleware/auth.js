import authService from '../services/auth.js';
import userManagementService from '../services/user-management.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware for Fastify
 */
export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: Missing or invalid Authorization header format');
      return reply.status(401).send({
        success: false,
        message: 'Authorization header required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify the token with the user management service
    const tokenVerification = userManagementService.verifyToken(token);
    
    if (!tokenVerification.success) {
      logger.warn(`Token verification failed: ${tokenVerification.message}`);
      return reply.status(401).send({
        success: false,
        message: tokenVerification.message
      });
    }

    // Get the full user data from the user management service
    const user = userManagementService.getUserByUsername(tokenVerification.user.username);
    
    if (!user) {
      logger.warn(`User not found in user management service: ${tokenVerification.user.username}`);
      return reply.status(401).send({
        success: false,
        message: 'User not found'
      });
    }

    // Attach the full user object to request
    request.user = user;
    
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Permission middleware for checking specific permissions
 */
export function requirePermission(permission) {
  return async function(request, reply) {
    try {
      // First authenticate the user
      const authResult = await authenticate(request, reply);
      if (authResult) {
        return authResult;
      }
      
      // Check if user was properly attached to request
      if (!request.user) {
        logger.error('User not attached to request after authentication');
        return reply.status(401).send({
          success: false,
          message: 'Authentication failed - user not found'
        });
      }

      if (!userManagementService.hasPermission(request.user, permission)) {
        logger.warn(`Permission denied: User ${request.user.username} lacks permission ${permission}`);
        return reply.status(403).send({
          success: false,
          message: `Insufficient permissions. Required: ${permission}`
        });
      }
      
    } catch (error) {
      logger.error('Permission middleware error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
}

/**
 * Role-based middleware for checking specific roles
 */
export function requireRole(role) {
  return async function(request, reply) {
    try {
      logger.info('=== REQUIRE ROLE DEBUG START ===');
      logger.info(`Checking role: ${role}`);
      logger.info(`Request URL: ${request.url}`);
      
      // First authenticate the user
      const authResult = await authenticate(request, reply);
      if (authResult) {
        // If authenticate returned a response, it means authentication failed
        logger.info('=== REQUIRE ROLE DEBUG END (AUTH FAILED) ===');
        return authResult;
      }
      
      // Check if user was properly attached to request
      if (!request.user) {
        logger.error('User not attached to request after authentication');
        logger.info('=== REQUIRE ROLE DEBUG END (NO USER) ===');
        return reply.status(401).send({
          success: false,
          message: 'Authentication failed - user not found'
        });
      }
      
      logger.info(`User authenticated: ${request.user.username} (role: ${request.user.role})`);

      if (request.user.role !== role && request.user.role !== 'admin') {
        logger.warn(`Role denied: User ${request.user.username} has role ${request.user.role}, required: ${role}`);
        logger.info('=== REQUIRE ROLE DEBUG END (ROLE DENIED) ===');
        return reply.status(403).send({
          success: false,
          message: `Insufficient role. Required: ${role}`
        });
      }
      
      logger.info(`Role granted: ${role}`);
      logger.info('=== REQUIRE ROLE DEBUG END ===');
    } catch (error) {
      logger.error('Role middleware error:', error);
      logger.info('=== REQUIRE ROLE DEBUG END (ERROR) ===');
      return reply.status(500).send({
        success: false,
        message: 'Role check failed'
      });
    }
  };
}

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * Read permission middleware
 */
export const requireRead = requirePermission('read');

/**
 * Write permission middleware
 */
export const requireWrite = requirePermission('write');

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenVerification = userManagementService.verifyToken(token);
      
      if (tokenVerification.success) {
        const user = userManagementService.getUserByUsername(tokenVerification.user.username);
        if (user) {
          request.user = user;
        }
      }
    }
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    // Don't fail the request, just log the error
  }
} 
