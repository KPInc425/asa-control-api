import logger from '../../utils/logger.js';

export class UserPermissions {
  constructor(manager) {
    this.manager = manager;
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
    const totalUsers = this.manager.users.size;
    const activeUsers = Array.from(this.manager.users.values()).filter(u => 
      new Date(u.metadata.lastActivity) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;
    
    const roleStats = {
      admin: 0,
      operator: 0,
      viewer: 0
    };

    this.manager.users.forEach(user => {
      roleStats[user.role] = (roleStats[user.role] || 0) + 1;
    });

    return {
      totalUsers,
      activeUsers,
      roleStats
    };
  }
}
