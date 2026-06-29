import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import logger from '../../utils/logger.js';
import {
  dbGetUserByUsername,
  dbUpdateUser,
  dbCreatePasswordResetToken,
  dbGetPasswordResetToken,
  dbMarkPasswordResetTokenUsed
} from '../database.js';

export class UserPassword {
  constructor(manager) {
    this.manager = manager;
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
   * Change user password
   */
  async changePassword(username, currentPassword, newPassword) {
    try {
      const user = this.manager.users.get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Verify current password
      const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password_hash);
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

      // Update user in database
      dbUpdateUser(user.id, {
        password_hash: user.password_hash,
        security: JSON.stringify(user.security)
      });

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
      const user = this.manager.users.get(email) || Array.from(this.manager.users.values()).find(u => u.email === email);
      
      if (!user) {
        // Don't reveal if email exists or not
        return { success: true, message: 'If the email exists, a reset link has been sent' };
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      // Store reset token in database
      dbCreatePasswordResetToken(user.id, resetToken, expiresAt);

      // In production, send email with reset link
      logger.info(`Password reset initiated for ${email} with token: ${resetToken}`);
      
      return { success: true, message: 'If the email exists, a reset link has been sent' };
    } catch (error) {
      logger.error('Error initiating password reset:', error);
      return { success: false, message: 'Failed to initiate password reset' };
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token, newPassword) {
    try {
      // Get reset token from database
      const resetToken = dbGetPasswordResetToken(token);
      
      if (!resetToken) {
        return { success: false, message: 'Invalid or expired reset token' };
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

      // Get user
      const user = this.manager.users.get(resetToken.user_id) || 
                   Array.from(this.manager.users.values()).find(u => u.id === resetToken.user_id);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Check if new password is in history
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);
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

      // Update user in database
      dbUpdateUser(user.id, {
        password_hash: user.password_hash,
        security: JSON.stringify(user.security)
      });

      // Mark reset token as used
      dbMarkPasswordResetTokenUsed(token);

      logger.info(`Password reset completed for user: ${user.username}`);
      
      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      logger.error('Error resetting password:', error);
      return { success: false, message: 'Failed to reset password' };
    }
  }
}
