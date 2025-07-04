import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class AuthService {
  constructor() {
    this.users = new Map();
    this.initializeDefaultUsers();
  }

  /**
   * Initialize default users (in production, this should come from a database)
   */
  initializeDefaultUsers() {
    // Default admin user - in production, use environment variables or database
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
    
    this.users.set('admin', {
      id: 'admin',
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      permissions: ['read', 'write', 'admin']
    });

    // Default operator user
    const operatorPassword = process.env.DEFAULT_OPERATOR_PASSWORD || 'operator123';
    const hashedOperatorPassword = bcrypt.hashSync(operatorPassword, 10);
    
    this.users.set('operator', {
      id: 'operator',
      username: 'operator',
      password: hashedOperatorPassword,
      role: 'operator',
      permissions: ['read', 'write']
    });

    // Default viewer user
    const viewerPassword = process.env.DEFAULT_VIEWER_PASSWORD || 'viewer123';
    const hashedViewerPassword = bcrypt.hashSync(viewerPassword, 10);
    
    this.users.set('viewer', {
      id: 'viewer',
      username: 'viewer',
      password: hashedViewerPassword,
      role: 'viewer',
      permissions: ['read']
    });
  }

  /**
   * Authenticate user with username and password
   */
  async authenticateUser(username, password) {
    try {
      const user = this.users.get(username);
      
      if (!user) {
        logger.warn(`Authentication failed: User ${username} not found`);
        return { success: false, message: 'Invalid credentials' };
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        logger.warn(`Authentication failed: Invalid password for user ${username}`);
        return { success: false, message: 'Invalid credentials' };
      }

      // Generate JWT token
      const token = this.generateToken(user);
      
      logger.info(`User ${username} authenticated successfully`);
      
      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions
        }
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      return { success: false, message: 'Authentication failed' };
    }
  }

  /**
   * Generate JWT token
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
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
   * Get current user from token
   */
  async getCurrentUser(token) {
    logger.info('=== GET CURRENT USER DEBUG START ===');
    logger.info(`Token received: ${token ? token.substring(0, 20) + '...' : 'NULL'}`);
    
    const verification = this.verifyToken(token);
    logger.info(`Token verification result:`, JSON.stringify(verification, null, 2));
    
    if (!verification.success) {
      logger.warn(`Token verification failed: ${verification.message}`);
      logger.info('=== GET CURRENT USER DEBUG END ===');
      return { success: false, message: verification.message };
    }

    const user = this.users.get(verification.user.username);
    logger.info(`User lookup result:`, user ? `Found user: ${user.username}` : 'User not found in users map');
    
    if (!user) {
      logger.warn(`User not found in users map: ${verification.user.username}`);
      logger.info('=== GET CURRENT USER DEBUG END ===');
      return { success: false, message: 'User not found' };
    }

    const result = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      }
    };
    
    logger.info(`Returning user data:`, JSON.stringify(result, null, 2));
    logger.info('=== GET CURRENT USER DEBUG END ===');
    return result;
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
   * Create new user (admin only)
   */
  async createUser(userData) {
    try {
      const { username, password, role = 'viewer' } = userData;
      
      if (this.users.has(username)) {
        return { success: false, message: 'User already exists' };
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const permissions = this.getPermissionsForRole(role);
      
      const newUser = {
        id: username,
        username,
        password: hashedPassword,
        role,
        permissions
      };

      this.users.set(username, newUser);
      
      logger.info(`New user created: ${username} with role ${role}`);
      
      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          permissions: newUser.permissions
        }
      };
    } catch (error) {
      logger.error('Error creating user:', error);
      return { success: false, message: 'Failed to create user' };
    }
  }

  /**
   * Update user (admin only)
   */
  async updateUser(username, updates) {
    try {
      const user = this.users.get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const updatedUser = { ...user };

      if (updates.password) {
        updatedUser.password = await bcrypt.hash(updates.password, 10);
      }

      if (updates.role) {
        updatedUser.role = updates.role;
        updatedUser.permissions = this.getPermissionsForRole(updates.role);
      }

      this.users.set(username, updatedUser);
      
      logger.info(`User updated: ${username}`);
      
      return {
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          role: updatedUser.role,
          permissions: updatedUser.permissions
        }
      };
    } catch (error) {
      logger.error('Error updating user:', error);
      return { success: false, message: 'Failed to update user' };
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(username) {
    try {
      if (!this.users.has(username)) {
        return { success: false, message: 'User not found' };
      }

      this.users.delete(username);
      
      logger.info(`User deleted: ${username}`);
      
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
    const userList = Array.from(this.users.values()).map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    }));

    return { success: true, users: userList };
  }

  /**
   * Get permissions for a role
   */
  getPermissionsForRole(role) {
    const rolePermissions = {
      admin: ['read', 'write', 'admin'],
      operator: ['read', 'write'],
      viewer: ['read']
    };

    return rolePermissions[role] || ['read'];
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

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

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default new AuthService(); 
 