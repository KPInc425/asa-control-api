import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import logger from '../../utils/logger.js';
import {
  dbGetAllUsers,
  dbCreateUser,
  dbCleanupExpiredSessions,
  dbCleanupExpiredPasswordResetTokens,
  dbCleanupExpiredEmailVerificationTokens,
  dbCleanupOldLoginAttempts
} from '../database.js';

export class UserInit {
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Set up periodic cleanup tasks for expired data
   */
  setupCleanupTasks() {

    // Clean up expired sessions every hour
    setInterval(() => {
      dbCleanupExpiredSessions();
      logger.debug('Cleaned up expired sessions');
    }, 60 * 60 * 1000);

    // Clean up expired tokens every 6 hours
    setInterval(() => {
      dbCleanupExpiredPasswordResetTokens();
      dbCleanupExpiredEmailVerificationTokens();
      logger.debug('Cleaned up expired tokens');
    }, 6 * 60 * 60 * 1000);

    // Clean up old login attempts every day
    setInterval(() => {
      dbCleanupOldLoginAttempts(30); // Keep 30 days
      logger.debug('Cleaned up old login attempts');
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Initialize data directory and files
   */
  async initializeDataDirectory() {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Error initializing data directory:', error);
    }
  }

  /**
   * Load users from SQLite DB
   */
  async loadUsersFromDb() {
    try {
      // Get all users from DB and populate the in-memory map
      const users = dbGetAllUsers();
      this.manager.users.clear();
      users.forEach(user => {
        // Parse JSON fields
        const parsedUser = {
          ...user,
          permissions: JSON.parse(user.permissions || '[]'),
          profile: JSON.parse(user.profile || '{}'),
          security: JSON.parse(user.security || '{}'),
          metadata: JSON.parse(user.metadata || '{}')
        };
        this.manager.users.set(user.username, parsedUser);
      });
      logger.info(`Loaded ${users.length} users from SQLite DB`);
    } catch (error) {
      logger.error('Error loading users from DB:', error);
    }
  }

  /**
   * Initialize default users if none exist
   */
  async initializeDefaultUsers() {
    const userCount = dbGetAllUsers().length;
    if (userCount === 0) {
      logger.info('No users found, creating default admin user');
      
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      const permissions = ['read', 'write', 'admin', 'user_management'];
      const profile = {
        firstName: 'Admin',
        lastName: 'User',
        displayName: 'Administrator',
        avatar: null,
        timezone: 'UTC',
        language: 'en'
      };
      const security = {
        emailVerified: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        lastPasswordChange: new Date().toISOString(),
        passwordHistory: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: null,
        loginHistory: []
      };
      const metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system',
        lastActivity: new Date().toISOString()
      };

      // Create admin user in database
      const dbResult = dbCreateUser(
        'admin',
        'admin@example.com',
        hashedPassword,
        'admin',
        JSON.stringify(permissions),
        JSON.stringify(profile),
        JSON.stringify(security),
        JSON.stringify(metadata)
      );

      if (dbResult.changes) {
        // Add to in-memory map
        const adminUser = {
          id: dbResult.lastInsertRowid,
          username: 'admin',
          email: 'admin@example.com',
          password_hash: hashedPassword,
          role: 'admin',
          permissions,
          profile,
          security,
          metadata
        };
        this.manager.users.set('admin', adminUser);
        
        logger.warn('Default admin user created with password: admin123');
        logger.warn('Please change the default password immediately!');
      } else {
        logger.error('Failed to create default admin user');
      }
    }
  }
}
