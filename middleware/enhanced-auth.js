import userManagementService from '../services/user-management.js';
import logger from '../utils/logger.js';

/**
 * Enhanced Authentication middleware for Fastify
 */
export async function authenticate(request, reply) {
  try {
    logger.info('=== ENHANCED AUTHENTICATION DEBUG START ===');
    logger.info(`Request URL: ${request.url}`);
    logger.info(`Request method: ${request.method}`);
    logger.info(`Request IP: ${request.ip}`);
    
    const authHeader = request.headers.authorization;
    logger.info(`Authorization header: ${authHeader ? authHeader.substring(0, 20) + '...' : 'NOT PRESENT'}`);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: Missing or invalid Authorization header format');
      logger.info('=== ENHANCED AUTHENTICATION DEBUG END ===');
      return reply.status(401).send({
        success: false,
        message: 'Authorization header required'
      });
    }

    const token = authHeader.substring(7);
    logger.info(`Token length: ${token.length} characters`);
    logger.info(`Token preview: ${token.substring(0, 20)}...`);
    
    // Verify token and get user
    const result = await userManagementService.verifyToken(token);
    logger.info(`Token verification result:`, JSON.stringify(result, null, 2));
    
    if (!result.success) {
      logger.warn(`Authentication failed: ${result.message}`);
      logger.info('=== ENHANCED AUTHENTICATION DEBUG END ===');
      return reply.status(401).send({
        success: false,
        message: result.message
      });
    }

    // Get full user data
    const user = userManagementService.getUserById(result.user.id);
    if (!user) {
      logger.warn(`User not found: ${result.user.id}`);
      logger.info('=== ENHANCED AUTHENTICATION DEBUG END ===');
      return reply.status(401).send({
        success: false,
        message: 'User not found'
      });
    }

    // Attach user to request
    request.user = user;
    logger.info(`Authentication successful for user: ${user.username} (role: ${user.role})`);
    logger.info(`User permissions: ${JSON.stringify(user.permissions)}`);
    logger.info('=== ENHANCED AUTHENTICATION DEBUG END ===');
    
  } catch (error) {
    logger.error('Enhanced authentication middleware error:', error);
    logger.info('=== ENHANCED AUTHENTICATION DEBUG END ===');
    return reply.status(500).send({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Enhanced permission middleware for checking specific permissions
 */
export function requirePermission(permission) {
  return async function(request, reply) {
    try {
      logger.info('=== ENHANCED REQUIRE PERMISSION DEBUG START ===');
      logger.info(`Checking permission: ${permission}`);
      logger.info(`Request URL: ${request.url}`);
      
      // First authenticate the user
      const authResult = await authenticate(request, reply);
      if (authResult) {
        // If authenticate returned a response, it means authentication failed
        logger.info('=== ENHANCED REQUIRE PERMISSION DEBUG END (AUTH FAILED) ===');
        return authResult;
      }
      
      logger.info(`User authenticated: ${request.user.username} (role: ${request.user.role})`);
      logger.info(`User permissions: ${JSON.stringify(request.user.permissions)}`);

      if (!userManagementService.hasPermission(request.user, permission)) {
        logger.warn(`Permission denied: User ${request.user.username} lacks permission ${permission}`);
        logger.info('=== ENHANCED REQUIRE PERMISSION DEBUG END (PERMISSION DENIED) ===');
        return reply.status(403).send({
          success: false,
          message: `Insufficient permissions. Required: ${permission}`,
          requiredPermission: permission,
          userPermissions: request.user.permissions
        });
      }
      
      logger.info(`Permission granted: ${permission}`);
      logger.info('=== ENHANCED REQUIRE PERMISSION DEBUG END ===');
    } catch (error) {
      logger.error('Enhanced permission middleware error:', error);
      logger.info('=== ENHANCED REQUIRE PERMISSION DEBUG END (ERROR) ===');
      return reply.status(500).send({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
}

/**
 * Enhanced role-based middleware for checking specific roles
 */
export function requireRole(role) {
  return async function(request, reply) {
    try {
      logger.info('=== ENHANCED REQUIRE ROLE DEBUG START ===');
      logger.info(`Checking role: ${role}`);
      logger.info(`Request URL: ${request.url}`);
      
      // First authenticate the user
      const authResult = await authenticate(request, reply);
      if (authResult) {
        // If authenticate returned a response, it means authentication failed
        logger.info('=== ENHANCED REQUIRE ROLE DEBUG END (AUTH FAILED) ===');
        return authResult;
      }
      
      logger.info(`User authenticated: ${request.user.username} (role: ${request.user.role})`);

      if (request.user.role !== role && request.user.role !== 'admin') {
        logger.warn(`Role denied: User ${request.user.username} has role ${request.user.role}, required: ${role}`);
        logger.info('=== ENHANCED REQUIRE ROLE DEBUG END (ROLE DENIED) ===');
        return reply.status(403).send({
          success: false,
          message: `Insufficient role. Required: ${role}`,
          requiredRole: role,
          userRole: request.user.role
        });
      }
      
      logger.info(`Role granted: ${role}`);
      logger.info('=== ENHANCED REQUIRE ROLE DEBUG END ===');
    } catch (error) {
      logger.error('Enhanced role middleware error:', error);
      logger.info('=== ENHANCED REQUIRE ROLE DEBUG END (ERROR) ===');
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
 * User management permission middleware
 */
export const requireUserManagement = requirePermission('user_management');

/**
 * System configuration permission middleware
 */
export const requireSystemConfig = requirePermission('system_config');

/**
 * Server management permission middleware
 */
export const requireServerManagement = requirePermission('server_management');

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const result = await userManagementService.verifyToken(token);
      
      if (result.success) {
        const user = userManagementService.getUserById(result.user.id);
        if (user) {
          request.user = user;
        }
      }
    }
  } catch (error) {
    logger.error('Enhanced optional authentication middleware error:', error);
    // Don't fail the request, just log the error
  }
}

/**
 * Rate limiting middleware for authentication endpoints
 */
export function rateLimitAuth(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const attempts = new Map();
  
  return async function(request, reply) {
    const ip = request.ip;
    const now = Date.now();
    
    // Clean old attempts
    if (attempts.has(ip)) {
      const userAttempts = attempts.get(ip);
      userAttempts.attempts = userAttempts.attempts.filter(
        attempt => now - attempt.timestamp < windowMs
      );
      
      if (userAttempts.attempts.length === 0) {
        attempts.delete(ip);
      }
    }
    
    // Check if IP is blocked
    if (attempts.has(ip)) {
      const userAttempts = attempts.get(ip);
      if (userAttempts.attempts.length >= maxAttempts) {
        const oldestAttempt = userAttempts.attempts[0];
        const timeLeft = windowMs - (now - oldestAttempt.timestamp);
        
        if (timeLeft > 0) {
          return reply.status(429).send({
            success: false,
            message: `Too many authentication attempts. Please try again in ${Math.ceil(timeLeft / 1000)} seconds.`,
            retryAfter: Math.ceil(timeLeft / 1000)
          });
        } else {
          // Reset attempts if window has passed
          attempts.delete(ip);
        }
      }
    }
    
    // Record this attempt
    if (!attempts.has(ip)) {
      attempts.set(ip, { attempts: [] });
    }
    
    attempts.get(ip).attempts.push({
      timestamp: now,
      path: request.url
    });
  };
}

/**
 * Session validation middleware
 */
export async function validateSession(request, reply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.status(401).send({
        success: false,
        message: 'No session token provided'
      });
    }

    // Check if session exists and is valid
    const session = Array.from(userManagementService.userSessions.values())
      .find(s => s.token === token);

    if (!session) {
      return reply.status(401).send({
        success: false,
        message: 'Invalid session'
      });
    }

    // Check if session has expired
    if (new Date() > new Date(session.expiresAt)) {
      // Remove expired session
      userManagementService.userSessions.delete(session.id);
      await userManagementService.saveSessions();
      
      return reply.status(401).send({
        success: false,
        message: 'Session expired'
      });
    }

    // Update session activity
    session.lastActivity = new Date().toISOString();
    await userManagementService.saveSessions();
    
  } catch (error) {
    logger.error('Session validation error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Session validation failed'
    });
  }
}

/**
 * Security headers middleware
 */
export function securityHeaders(request, reply) {
  // Set security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
}

/**
 * Audit logging middleware
 */
export function auditLog(request, reply) {
  const startTime = Date.now();
  
  reply.addHook('onResponse', (request, reply, done) => {
    const duration = Date.now() - startTime;
    const user = request.user ? request.user.username : 'anonymous';
    const ip = request.ip;
    const method = request.method;
    const url = request.url;
    const statusCode = reply.statusCode;
    
    logger.info(`AUDIT: ${method} ${url} - ${statusCode} - ${user}@${ip} - ${duration}ms`);
    
    // Log sensitive operations
    if (method === 'POST' && url.includes('/auth/login')) {
      logger.warn(`LOGIN ATTEMPT: ${user}@${ip} - ${statusCode}`);
    }
    
    if (method === 'DELETE' && url.includes('/auth/users/')) {
      logger.warn(`USER DELETION: ${user}@${ip} deleted user from ${url} - ${statusCode}`);
    }
    
    done();
  });
} 
