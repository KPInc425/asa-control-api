import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class UserManagementService {
  constructor() {
    this.users = new Map();
    this.passwordResetTokens = new Map();
    this.emailVerificationTokens = new Map();
    this.failedLoginAttempts = new Map();
    this.userSessions = new Map();
    this.usersFile = path.join(process.cwd(), 'data', 'users.json');
    this.sessionsFile = path.join(process.cwd(), 'data', 'sessions.json');
    
    this.initializeDataDirectory();
    this.loadUsers();
    this.initializeDefaultUsers();
  }

  /**
   * Initialize data directory and files
   */
  async initializeDataDirectory() {
    try {
      const dataDir = path.dirname(this.usersFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Create users file if it doesn't exist
      try {
        await fs.access(this.usersFile);
      } catch {
        await fs.writeFile(this.usersFile, JSON.stringify([], null, 2));
      }
      
      // Create sessions file if it doesn't exist
      try {
        await fs.access(this.sessionsFile);
      } catch {
        await fs.writeFile(this.sessionsFile, JSON.stringify([], null, 2));
      }
    } catch (error) {
      logger.error('Error initializing data directory:', error);
    }
  }

  /**
   * Load users from file
   */
  async loadUsers() {
    try {
      const data = await fs.readFile(this.usersFile, 'utf8');
      const users = JSON.parse(data);
      
      this.users.clear();
      users.forEach(user => {
        this.users.set(user.username, user);
      });
      
      logger.info(`Loaded ${users.length} users from file`);
    } catch (error) {
      logger.error('Error loading users:', error);
    }
  }

  /**
   * Save users to file
   */
  async saveUsers() {
    try {
      const users = Array.from(this.users.values());
      await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
      logger.info(`Saved ${users.length} users to file`);
    } catch (error) {
      logger.error('Error saving users:', error);
    }
  }

  /**
   * Initialize default users if none exist
   */
  async initializeDefaultUsers() {
    if (this.users.size === 0) {
      logger.info('No users found, creating default admin user');
      
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      const adminUser = {
        id: crypto.randomUUID(),
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        permissions: ['read', 'write', 'admin', 'user_management'],
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          displayName: 'Administrator',
          avatar: null,
          timezone: 'UTC',
          language: 'en'
        },
        security: {
          emailVerified: true,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          lastPasswordChange: new Date().toISOString(),
          passwordHistory: [],
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          loginHistory: []
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          lastActivity: new Date().toISOString()
        }
      };

      this.users.set('admin', adminUser);
      await this.saveUsers();
      
      logger.warn('Default admin user created with password: admin123');
      logger.warn('Please change the default password immediately!');
    }
  }

  /**
   * Enhanced user authentication with security features
   */
  async authenticateUser(username, password, ipAddress = null, userAgent = null) {
    try {
      const user = this.users.get(username);
      
      if (!user) {
        await this.recordFailedLogin(username, ipAddress);
        return { success: false, message: 'Invalid credentials' };
      }

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

      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        await this.recordFailedLogin(username, ipAddress);
        return { success: false, message: 'Invalid credentials' };
      }

      // Reset failed login attempts on successful login
      user.security.failedLoginAttempts = 0;
      user.security.lockedUntil = null;
      user.security.lastLogin = new Date().toISOString();
      
      // Record login history
      user.security.loginHistory.push({
        timestamp: new Date().toISOString(),
        ipAddress,
        userAgent,
        success: true
      });

      // Keep only last 10 login attempts
      if (user.security.loginHistory.length > 10) {
        user.security.loginHistory = user.security.loginHistory.slice(-10);
      }

      user.metadata.lastActivity = new Date().toISOString();
      user.metadata.updatedAt = new Date().toISOString();

      await this.saveUsers();

      // Generate JWT token
      const token = this.generateToken(user);
      
      // Store session
      await this.createSession(user.id, token, ipAddress, userAgent);
      
      logger.info(`User ${username} authenticated successfully from ${ipAddress}`);
      
      return {
        success: true,
        token,
        user: this.sanitizeUser(user)
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
    const user = this.users.get(username);
    if (user) {
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

      await this.saveUsers();
    }
  }

  /**
   * Generate JWT token with enhanced security
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      sessionId: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: 'asa-management-api',
      audience: 'asa-management-dashboard'
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      logger.info('=== VERIFY TOKEN DEBUG START ===');
      logger.info(`Token to verify: ${token ? token.substring(0, 20) + '...' : 'NULL'}`);
      logger.info(`JWT secret length: ${config.jwt.secret ? config.jwt.secret.length : 'NULL'}`);
      
      const decoded = jwt.verify(token, config.jwt.secret);
      logger.info(`Token decoded successfully:`, JSON.stringify(decoded, null, 2));
      
      const result = { success: true, user: decoded };
      logger.info('=== VERIFY TOKEN DEBUG END ===');
      return result;
    } catch (error) {
      logger.warn('Token verification failed:', error.message);
      logger.error('Full verification error:', error);
      logger.info('=== VERIFY TOKEN DEBUG END ===');
      return { success: false, message: 'Invalid token' };
    }
  }

  /**
   * Create user session
   */
  async createSession(userId, token, ipAddress, userAgent) {
    const session = {
      id: crypto.randomUUID(),
      userId,
      token,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    this.userSessions.set(session.id, session);
    await this.saveSessions();
    
    return session;
  }

  /**
   * Save sessions to file
   */
  async saveSessions() {
    try {
      const sessions = Array.from(this.userSessions.values());
      await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
    } catch (error) {
      logger.error('Error saving sessions:', error);
    }
  }

  /**
   * Sanitize user object (remove sensitive data)
   */
  sanitizeUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      profile: user.profile,
      security: {
        emailVerified: user.security.emailVerified,
        twoFactorEnabled: user.security.twoFactorEnabled,
        lastLogin: user.security.lastLogin
      },
      metadata: {
        createdAt: user.metadata.createdAt,
        lastActivity: user.metadata.lastActivity
      }
    };
  }

  /**
   * Create new user with enhanced validation
   */
  async createUser(userData, createdBy = 'admin') {
    try {
      const { username, email, password, role = 'viewer', profile = {} } = userData;
      
      // Validate required fields
      if (!username || !email || !password) {
        return { success: false, message: 'Username, email, and password are required' };
      }

      // Check if user already exists
      if (this.users.has(username)) {
        return { success: false, message: 'Username already exists' };
      }

      // Check if email already exists
      const existingUser = Array.from(this.users.values()).find(u => u.email === email);
      if (existingUser) {
        return { success: false, message: 'Email already exists' };
      }

      // Validate password strength
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { 
          success: false, 
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        };
      }

      // Validate email format
      const emailValidation = this.validateEmail(email);
      if (!emailValidation.valid) {
        return { 
          success: false, 
          message: 'Invalid email format',
          errors: emailValidation.errors
        };
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const permissions = this.getPermissionsForRole(role);
      
      const newUser = {
        id: crypto.randomUUID(),
        username,
        email,
        password: hashedPassword,
        role,
        permissions,
        profile: {
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          displayName: profile.displayName || username,
          avatar: profile.avatar || null,
          timezone: profile.timezone || 'UTC',
          language: profile.language || 'en',
          ...profile
        },
        security: {
          emailVerified: false,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          lastPasswordChange: new Date().toISOString(),
          passwordHistory: [hashedPassword],
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          loginHistory: []
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy,
          lastActivity: new Date().toISOString()
        }
      };

      this.users.set(username, newUser);
      await this.saveUsers();
      
      // Send email verification (in production, implement email service)
      await this.sendEmailVerification(newUser);
      
      logger.info(`New user created: ${username} with role ${role}`);
      
      return {
        success: true,
        user: this.sanitizeUser(newUser)
      };
    } catch (error) {
      logger.error('Error creating user:', error);
      return { success: false, message: 'Failed to create user' };
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(username, updates, updatedBy = 'self') {
    try {
      const user = this.users.get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Handle username change
      if (updates.username && updates.username !== username) {
        const newUsername = updates.username;
        
        // Check if new username already exists
        if (this.users.has(newUsername)) {
          return { success: false, message: 'Username already exists' };
        }

        // Validate username format
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(newUsername)) {
          return { 
            success: false, 
            message: 'Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens' 
          };
        }

        // Remove old user entry and add with new username
        this.users.delete(username);
        user.username = newUsername;
        this.users.set(newUsername, user);
        
        logger.info(`Username changed from ${username} to ${newUsername}`);
      }

      // Handle password change
      if (updates.newPassword) {
        // Validate new password
        const passwordValidation = this.validatePassword(updates.newPassword);
        if (!passwordValidation.valid) {
          return { 
            success: false, 
            message: 'New password does not meet requirements',
            errors: passwordValidation.errors
          };
        }

        // Check if new password is in history
        const hashedNewPassword = await bcrypt.hash(updates.newPassword, 12);
        if (user.security.passwordHistory.includes(hashedNewPassword)) {
          return { success: false, message: 'New password cannot be the same as recent passwords' };
        }

        // Update password
        user.password = hashedNewPassword;
        user.security.lastPasswordChange = new Date().toISOString();
        user.security.passwordHistory.push(hashedNewPassword);
        
        // Keep only last 5 passwords in history
        if (user.security.passwordHistory.length > 5) {
          user.security.passwordHistory = user.security.passwordHistory.slice(-5);
        }

        // Reset failed login attempts
        user.security.failedLoginAttempts = 0;
        user.security.lockedUntil = null;

        logger.info(`Password updated for user: ${user.username}`);
      }

      // Update profile fields
      if (updates.profile) {
        user.profile = { ...user.profile, ...updates.profile };
      }

      // Update email if provided
      if (updates.email && updates.email !== user.email) {
        const emailValidation = this.validateEmail(updates.email);
        if (!emailValidation.valid) {
          return { 
            success: false, 
            message: 'Invalid email format',
            errors: emailValidation.errors
          };
        }

        const existingUser = Array.from(this.users.values()).find(u => u.email === updates.email && u.username !== user.username);
        if (existingUser) {
          return { success: false, message: 'Email already exists' };
        }

        user.email = updates.email;
        user.security.emailVerified = false; // Require re-verification
        await this.sendEmailVerification(user);
      }

      user.metadata.updatedAt = new Date().toISOString();
      user.metadata.lastActivity = new Date().toISOString();

      await this.saveUsers();
      
      logger.info(`User profile updated: ${user.username} by ${updatedBy}`);
      
      return {
        success: true,
        user: this.sanitizeUser(user)
      };
    } catch (error) {
      logger.error('Error updating user profile:', error);
      return { success: false, message: 'Failed to update user profile' };
    }
  }

  /**
   * Change user password
   */
  async changePassword(username, currentPassword, newPassword) {
    try {
      const user = this.users.get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Verify current password
      const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidCurrentPassword) {
        return { success: false, message: 'Current password is incorrect' };
      }

      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return { 
          success: false, 
          message: 'New password does not meet requirements',
          errors: passwordValidation.errors
        };
      }

      // Check if new password is in history
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);
      if (user.security.passwordHistory.includes(hashedNewPassword)) {
        return { success: false, message: 'New password cannot be the same as recent passwords' };
      }

      // Update password
      user.password = hashedNewPassword;
      user.security.lastPasswordChange = new Date().toISOString();
      user.security.passwordHistory.push(hashedNewPassword);
      
      // Keep only last 5 passwords in history
      if (user.security.passwordHistory.length > 5) {
        user.security.passwordHistory = user.security.passwordHistory.slice(-5);
      }

      // Reset failed login attempts
      user.security.failedLoginAttempts = 0;
      user.security.lockedUntil = null;

      user.metadata.updatedAt = new Date().toISOString();
      user.metadata.lastActivity = new Date().toISOString();

      await this.saveUsers();
      
      logger.info(`Password changed for user: ${username}`);
      
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      logger.error('Error changing password:', error);
      return { success: false, message: 'Failed to change password' };
    }
  }

  /**
   * Initiate password reset
   */
  async initiatePasswordReset(email) {
    try {
      const user = Array.from(this.users.values()).find(u => u.email === email);
      
      if (!user) {
        // Don't reveal if email exists or not
        return { success: true, message: 'If the email exists, a reset link has been sent' };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      this.passwordResetTokens.set(resetToken, {
        userId: user.id,
        email: user.email,
        expiresAt: resetExpiry.toISOString()
      });

      // In production, send email with reset link
      logger.info(`Password reset initiated for ${email}. Token: ${resetToken}`);
      
      return { 
        success: true, 
        message: 'If the email exists, a reset link has been sent',
        resetToken // Remove this in production, only for development
      };
    } catch (error) {
      logger.error('Error initiating password reset:', error);
      return { success: false, message: 'Failed to initiate password reset' };
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    try {
      const resetData = this.passwordResetTokens.get(token);
      
      if (!resetData) {
        return { success: false, message: 'Invalid or expired reset token' };
      }

      if (new Date() > new Date(resetData.expiresAt)) {
        this.passwordResetTokens.delete(token);
        return { success: false, message: 'Reset token has expired' };
      }

      const user = Array.from(this.users.values()).find(u => u.id === resetData.userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return { 
          success: false, 
          message: 'New password does not meet requirements',
          errors: passwordValidation.errors
        };
      }

      // Update password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);
      user.password = hashedNewPassword;
      user.security.lastPasswordChange = new Date().toISOString();
      user.security.passwordHistory.push(hashedNewPassword);
      user.security.failedLoginAttempts = 0;
      user.security.lockedUntil = null;

      user.metadata.updatedAt = new Date().toISOString();
      user.metadata.lastActivity = new Date().toISOString();

      // Remove used token
      this.passwordResetTokens.delete(token);

      await this.saveUsers();
      
      logger.info(`Password reset completed for user: ${user.username}`);
      
      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      logger.error('Error resetting password:', error);
      return { success: false, message: 'Failed to reset password' };
    }
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(user) {
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      this.emailVerificationTokens.set(verificationToken, {
        userId: user.id,
        email: user.email,
        expiresAt: verificationExpiry.toISOString()
      });

      // In production, send email with verification link
      logger.info(`Email verification sent to ${user.email}. Token: ${verificationToken}`);
      
      return { success: true, message: 'Verification email sent' };
    } catch (error) {
      logger.error('Error sending email verification:', error);
      return { success: false, message: 'Failed to send verification email' };
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token) {
    try {
      const verificationData = this.emailVerificationTokens.get(token);
      
      if (!verificationData) {
        return { success: false, message: 'Invalid or expired verification token' };
      }

      if (new Date() > new Date(verificationData.expiresAt)) {
        this.emailVerificationTokens.delete(token);
        return { success: false, message: 'Verification token has expired' };
      }

      const user = Array.from(this.users.values()).find(u => u.id === verificationData.userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.security.emailVerified = true;
      user.metadata.updatedAt = new Date().toISOString();

      // Remove used token
      this.emailVerificationTokens.delete(token);

      await this.saveUsers();
      
      logger.info(`Email verified for user: ${user.username}`);
      
      return { success: true, message: 'Email verified successfully' };
    } catch (error) {
      logger.error('Error verifying email:', error);
      return { success: false, message: 'Failed to verify email' };
    }
  }

  /**
   * Enhanced password validation
   */
  validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const hasNoCommonPatterns = !/(123|abc|password|admin|qwerty)/i.test(password);

    const errors = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
      errors.push('Password must contain at least one special character');
    }
    if (!hasNoCommonPatterns) {
      errors.push('Password cannot contain common patterns');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Email validation
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const errors = [];

    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get permissions for a role
   */
  getPermissionsForRole(role) {
    const rolePermissions = {
      admin: ['read', 'write', 'admin', 'user_management', 'system_config'],
      operator: ['read', 'write', 'server_management'],
      viewer: ['read']
    };

    return rolePermissions[role] || ['read'];
  }

  /**
   * List all users (admin only)
   */
  listUsers() {
    const userList = Array.from(this.users.values()).map(user => this.sanitizeUser(user));
    return { success: true, users: userList };
  }

  /**
   * Get user by ID
   */
  getUserById(userId) {
    const user = Array.from(this.users.values()).find(u => u.id === userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Get user by username
   */
  getUserByUsername(username) {
    const user = this.users.get(username);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(username, deletedBy = 'admin') {
    try {
      if (!this.users.has(username)) {
        return { success: false, message: 'User not found' };
      }

      // Prevent deleting the last admin
      const user = this.users.get(username);
      if (user.role === 'admin') {
        const adminCount = Array.from(this.users.values()).filter(u => u.role === 'admin').length;
        if (adminCount <= 1) {
          return { success: false, message: 'Cannot delete the last admin user' };
        }
      }

      this.users.delete(username);
      await this.saveUsers();
      
      logger.info(`User deleted: ${username} by ${deletedBy}`);
      
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      logger.error('Error deleting user:', error);
      return { success: false, message: 'Failed to delete user' };
    }
  }

  /**
   * Logout user (invalidate session)
   */
  async logoutUser(token) {
    try {
      // Remove session
      const session = Array.from(this.userSessions.values()).find(s => s.token === token);
      if (session) {
        this.userSessions.delete(session.id);
        await this.saveSessions();
      }

      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      logger.error('Error during logout:', error);
      return { success: false, message: 'Failed to logout' };
    }
  }

  /**
   * Check if user has permission
   */
  hasPermission(user, permission) {
    if (!user || !user.permissions) {
      return false;
    }

    // Admin role has all permissions
    if (user.role === 'admin') {
      return true;
    }

    return user.permissions.includes(permission);
  }

  /**
   * Check if user has any of the required permissions
   */
  hasAnyPermission(user, permissions) {
    return permissions.some(permission => this.hasPermission(user, permission));
  }

  /**
   * Check if user has all required permissions
   */
  hasAllPermissions(user, permissions) {
    return permissions.every(permission => this.hasPermission(user, permission));
  }

  /**
   * Get user statistics
   */
  getUserStats() {
    const totalUsers = this.users.size;
    const activeUsers = Array.from(this.users.values()).filter(u => 
      new Date(u.metadata.lastActivity) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;
    
    const roleStats = {
      admin: 0,
      operator: 0,
      viewer: 0
    };

    this.users.forEach(user => {
      roleStats[user.role] = (roleStats[user.role] || 0) + 1;
    });

    return {
      totalUsers,
      activeUsers,
      roleStats
    };
  }
}

export default new UserManagementService(); 
