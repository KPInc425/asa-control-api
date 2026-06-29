import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import {
  dbGetUserByUsername,
  dbUpdateUser,
  dbRecordLoginAttempt,
  dbCreateSession,
  dbDeleteSessionByToken
} from '../database.js';

export class UserAuth {
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Enhanced user authentication with security features
   */
  async authenticateUser(username, password, ipAddress = null, userAgent = null, rememberMe = false) {
    try {
      // Query database directly for user
      const dbUser = dbGetUserByUsername(username);
      
      if (!dbUser) {
        await this.manager.recordFailedLogin(username, ipAddress);
        return { success: false, message: 'Invalid credentials' };
      }

      // Parse JSON fields
      const user = {
        ...dbUser,
        permissions: JSON.parse(dbUser.permissions || '[]'),
        profile: JSON.parse(dbUser.profile || '{}'),
        security: JSON.parse(dbUser.security || '{}'),
        metadata: JSON.parse(dbUser.metadata || '{}')
      };

      // Check if account is locked
      if (user.security.lockedUntil && new Date() < new Date(user.security.lockedUntil)) {
        return { 
          success: false, 
          message: `Account is locked until ${user.security.lockedUntil}`,
          lockedUntil: user.security.lockedUntil
        };
      }

      // Check if email is verified (optional for admin)
      if (user.role !== 'admin' && !user.security.emailVerified) {
        return { 
          success: false, 
          message: 'Please verify your email address before logging in',
          requiresEmailVerification: true
        };
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        await this.manager.recordFailedLogin(username, ipAddress);
        return { success: false, message: 'Invalid credentials' };
      }

      // Record successful login attempt
      dbRecordLoginAttempt(username, ipAddress, true);

      // Reset failed login attempts on successful login
      user.security.failedLoginAttempts = 0;
      user.security.lockedUntil = null;
      user.security.lastLogin = new Date().toISOString();
      
      // Record login history
      user.security.loginHistory.push({
        timestamp: new Date().toISOString(),
        ipAddress,
        userAgent,
        success: true,
        rememberMe
      });

      // Keep only last 10 login attempts
      if (user.security.loginHistory.length > 10) {
        user.security.loginHistory = user.security.loginHistory.slice(-10);
      }

      user.metadata.lastActivity = new Date().toISOString();
      user.metadata.updatedAt = new Date().toISOString();

      // Update user in database
      dbUpdateUser(user.id, {
        security: JSON.stringify(user.security),
        metadata: JSON.stringify(user.metadata)
      });
      
      // Update in-memory map
      this.manager.users.set(username, user);

      // Generate JWT token with remember me preference
      const token = this.generateToken(user, rememberMe);
      
      // Store session in database with appropriate expiration
      await this.createSession(user.id, token, ipAddress, userAgent, rememberMe);
      
      logger.info(`User ${username} authenticated successfully from ${ipAddress} (remember me: ${rememberMe})`);
      
      return {
        success: true,
        token,
        user: this.manager.sanitizeUser(user),
        rememberMe
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      return { success: false, message: 'Authentication failed' };
    }
  }

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(username, ipAddress) {
    // Record failed login attempt in database
    dbRecordLoginAttempt(username, ipAddress, false);
    
    const dbUser = dbGetUserByUsername(username);
    if (dbUser) {
      const user = {
        ...dbUser,
        permissions: JSON.parse(dbUser.permissions || '[]'),
        profile: JSON.parse(dbUser.profile || '{}'),
        security: JSON.parse(dbUser.security || '{}'),
        metadata: JSON.parse(dbUser.metadata || '{}')
      };
      
      user.security.failedLoginAttempts += 1;
      
      // Lock account after 5 failed attempts for 15 minutes
      if (user.security.failedLoginAttempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        user.security.lockedUntil = lockUntil.toISOString();
        logger.warn(`Account ${username} locked due to multiple failed login attempts`);
      }

      user.security.loginHistory.push({
        timestamp: new Date().toISOString(),
        ipAddress,
        success: false
      });

      // Update user in database
      dbUpdateUser(user.id, {
        security: JSON.stringify(user.security)
      });
      
      // Update in-memory map
      this.manager.users.set(username, user);
    }
  }

  /**
   * Generate JWT token with enhanced security
   */
  generateToken(user, rememberMe = false) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      sessionId: crypto.randomUUID(),
      rememberMe,
      iat: Math.floor(Date.now() / 1000)
    };

    // Use different expiration times based on remember me preference
    const expiresIn = rememberMe ? '30d' : config.jwt.expiresIn; // 30 days for remember me, default for regular sessions

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn,
      issuer: 'asa-management-api',
      audience: 'asa-management-dashboard'
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      return { success: true, user: decoded };
    } catch (error) {
      logger.warn('Token verification failed:', error.message);
      return { success: false, message: 'Invalid token' };
    }
  }

  /**
   * Create user session in database
   */
  async createSession(userId, token, ipAddress, userAgent, rememberMe = false) {
    const sessionId = crypto.randomUUID();
    
    // Set session expiration based on remember me preference
    const sessionDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 24 hours
    const expiresAt = new Date(Date.now() + sessionDuration).toISOString();
    
    const session = {
      id: sessionId,
      userId,
      token,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt
    };

    // Store session in database
    dbCreateSession(sessionId, userId, token, ipAddress, userAgent, expiresAt);
    
    return session;
  }

  /**
   * Logout user (invalidate session)
   */
  async logoutUser(token) {
    try {
      // Remove session from database
      dbDeleteSessionByToken(token);

      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      logger.error('Error during logout:', error);
      return { success: false, message: 'Failed to logout' };
    }
  }
}
