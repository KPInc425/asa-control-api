import crypto from 'crypto';
import logger from '../../utils/logger.js';
import {
  dbGetUserByEmail,
  dbUpdateUser,
  dbCreateEmailVerificationToken,
  dbGetEmailVerificationToken,
  dbMarkEmailVerificationTokenUsed
} from '../database.js';

export class UserEmail {
  constructor(manager) {
    this.manager = manager;
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
   * Send email verification
   */
  async sendEmailVerification(user) {
    try {
      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Store verification token in database
      dbCreateEmailVerificationToken(user.id, verificationToken, expiresAt);

      // In production, send email with verification link
      logger.info(`Email verification sent for ${user.email} with token: ${verificationToken}`);
      
      return { success: true, message: 'Verification email sent' };
    } catch (error) {
      logger.error('Error sending email verification:', error);
      return { success: false, message: 'Failed to send verification email' };
    }
  }

  /**
   * Verify email using token
   */
  async verifyEmail(token) {
    try {
      // Get verification token from database
      const verificationToken = dbGetEmailVerificationToken(token);
      
      if (!verificationToken) {
        return { success: false, message: 'Invalid or expired verification token' };
      }

      // Get user
      const user = this.manager.users.get(verificationToken.user_id) || 
                   Array.from(this.manager.users.values()).find(u => u.id === verificationToken.user_id);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Mark email as verified
      user.security.emailVerified = true;

      // Update user in database
      dbUpdateUser(user.id, {
        security: JSON.stringify(user.security)
      });

      // Mark verification token as used
      dbMarkEmailVerificationTokenUsed(token);

      logger.info(`Email verified for user: ${user.username}`);
      
      return { success: true, message: 'Email verified successfully' };
    } catch (error) {
      logger.error('Error verifying email:', error);
      return { success: false, message: 'Failed to verify email' };
    }
  }
}
