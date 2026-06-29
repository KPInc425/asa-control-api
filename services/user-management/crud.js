import bcrypt from 'bcryptjs';
import logger from '../../utils/logger.js';
import {
  dbGetUserByUsername,
  dbGetUserByEmail,
  dbCreateUser,
  dbUpdateUser,
  dbDeleteUser,
  dbGetAllUsers
} from '../database.js';

export class UserCrud {
  constructor(manager) {
    this.manager = manager;
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
      // Check if user already exists in database
      const existingUserByUsername = dbGetUserByUsername(username);
      if (existingUserByUsername) {
        return { success: false, message: 'Username already exists' };
      }
      // Check if email already exists in database
      const existingUserByEmail = dbGetUserByEmail(email);
      if (existingUserByEmail) {
        return { success: false, message: 'Email already exists' };
      }
      // Validate password strength
      const passwordValidation = this.manager.validatePassword(password);
      if (!passwordValidation.valid) {
        return { 
          success: false, 
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        };
      }
      // Validate email format
      const emailValidation = this.manager.validateEmail(email);
      if (!emailValidation.valid) {
        return { 
          success: false, 
          message: 'Invalid email format',
          errors: emailValidation.errors
        };
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const permissions = this.manager.getPermissionsForRole(role);
      
      // Prepare user data for database
      const security = {
        emailVerified: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        lastPasswordChange: new Date().toISOString(),
        passwordHistory: [hashedPassword],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: null,
        loginHistory: []
      };
      
      const metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy,
        lastActivity: new Date().toISOString()
      };
      
      // Insert into SQLite DB
      const dbResult = dbCreateUser(
        username, 
        email, 
        hashedPassword, 
        role, 
        JSON.stringify(permissions), 
        JSON.stringify(profile), 
        JSON.stringify(security), 
        JSON.stringify(metadata)
      );
      
      if (!dbResult.changes) {
        return { success: false, message: 'Failed to create user in DB' };
      }
      
      // Create user object for in-memory map
      const newUser = {
        id: dbResult.lastInsertRowid,
        username,
        email,
        password_hash: hashedPassword,
        role,
        permissions,
        profile,
        security,
        metadata
      };
      
      // Update the in-memory map
      this.manager.users.set(username, newUser);
      // Send email verification (in production, implement email service)
      await this.manager.sendEmailVerification(this.manager.users.get(username));
      logger.info(`New user created: ${username} with role ${role}`);
      return {
        success: true,
        user: this.sanitizeUser(this.manager.users.get(username))
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
      const user = this.manager.users.get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Handle username change
      if (updates.username && updates.username !== username) {
        const newUsername = updates.username;
        // Check if new username already exists
        if (this.manager.users.has(newUsername)) {
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
        this.manager.users.delete(username);
        user.username = newUsername;
        this.manager.users.set(newUsername, user);
        logger.info(`Username changed from ${username} to ${newUsername}`);
      }

      // Handle password change
      if (updates.newPassword) {
        // Validate new password
        const passwordValidation = this.manager.validatePassword(updates.newPassword);
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
        user.password_hash = hashedNewPassword;
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
        const emailValidation = this.manager.validateEmail(updates.email);
        if (!emailValidation.valid) {
          return { 
            success: false, 
            message: 'Invalid email format',
            errors: emailValidation.errors
          };
        }
        // Check for duplicate email in DB
        const existingUserByEmail = dbGetUserByEmail(updates.email);
        if (existingUserByEmail && existingUserByEmail.id !== user.id) {
          return { success: false, message: 'Email already exists' };
        }
        user.email = updates.email;
        user.security.emailVerified = false; // Require re-verification
        await this.manager.sendEmailVerification(user);
      }

      user.metadata.updatedAt = new Date().toISOString();
      user.metadata.lastActivity = new Date().toISOString();

      // Update user in database (persist all updated fields)
      try {
        dbUpdateUser(user.id, {
          username: user.username,
          email: user.email,
          password_hash: user.password_hash,
          profile: JSON.stringify(user.profile),
          security: JSON.stringify(user.security),
          metadata: JSON.stringify(user.metadata)
        });
      } catch (err) {
        if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return { success: false, message: 'Email or username already exists' };
        }
        logger.error('Error updating user in DB:', err);
        return { success: false, message: 'Failed to update user profile' };
      }
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
   * Delete user (admin only)
   */
  async deleteUser(username, deletedBy = 'admin') {
    try {
      if (!this.manager.users.has(username)) {
        return { success: false, message: 'User not found' };
      }

      // Prevent deleting the last admin
      const user = this.manager.users.get(username);
      if (user.role === 'admin') {
        const adminCount = Array.from(this.manager.users.values()).filter(u => u.role === 'admin').length;
        if (adminCount <= 1) {
          return { success: false, message: 'Cannot delete the last admin user' };
        }
      }

      // Delete user from database (this will cascade delete sessions, tokens, etc.)
      dbDeleteUser(username);
      
      // Remove from in-memory map
      this.manager.users.delete(username);
      
      logger.info(`User deleted: ${username} by ${deletedBy}`);
      
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      logger.error('Error deleting user:', error);
      return { success: false, message: 'Failed to delete user' };
    }
  }

  /**
   * List all users (admin only)
   */
  listUsers() {
    const userList = Array.from(this.manager.users.values()).map(user => this.sanitizeUser(user));
    return { success: true, users: userList };
  }

  /**
   * Get user by ID
   */
  getUserById(userId) {
    const user = Array.from(this.manager.users.values()).find(u => u.id === userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Get user by username
   */
  getUserByUsername(username) {
    const user = this.manager.users.get(username);
    return user ? this.sanitizeUser(user) : null;
  }
}
