import authService from '../services/auth.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware for Fastify
 */
export async function authenticate(request, reply) {
  try {
    logger.info('=== AUTHENTICATION DEBUG START ===');
    logger.info(`Request URL: ${request.url}`);
    logger.info(`Request method: ${request.method}`);
    logger.info(`Request headers:`, JSON.stringify(request.headers, null, 2));
    
    const authHeader = request.headers.authorization;
    logger.info(`Authorization header: ${authHeader ? authHeader.substring(0, 20) + '...' : 'NOT PRESENT'}`);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: Missing or invalid Authorization header format');
      logger.info('=== AUTHENTICATION DEBUG END ===');
      return reply.status(401).send({
        success: false,
        message: 'Authorization header required'
      });
    }

    const token = authHeader.substring(7);
    logger.info(`Token length: ${token.length} characters`);
    logger.info(`Token preview: ${token.substring(0, 20)}...`);
    
    const result = await authService.getCurrentUser(token);
    logger.info(`Auth service result:`, JSON.stringify(result, null, 2));
    
    if (!result.success) {
      logger.warn(`Authentication failed: ${result.message}`);
      logger.info('=== AUTHENTICATION DEBUG END ===');
      return reply.status(401).send({
        success: false,
        message: result.message
      });
    }

    // Attach user to request
    request.user = result.user;
    logger.info(`Authentication successful for user: ${result.user.username} (role: ${result.user.role})`);
    logger.info('=== AUTHENTICATION DEBUG END ===');
    
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    logger.info('=== AUTHENTICATION DEBUG END ===');
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!authService.hasPermission(request.user, permission)) {
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      if (request.user.role !== role && request.user.role !== 'admin') {
        logger.warn(`Role denied: User ${request.user.username} has role ${request.user.role}, required: ${role}`);
        return reply.status(403).send({
          success: false,
          message: `Insufficient role. Required: ${role}`
        });
      }
    } catch (error) {
      logger.error('Role middleware error:', error);
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
      const result = await authService.getCurrentUser(token);
      
      if (result.success) {
        request.user = result.user;
      }
    }
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    // Don't fail the request, just log the error
  }
} 
