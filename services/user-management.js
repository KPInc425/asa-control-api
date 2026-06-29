import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { 
  db as dbApi, 
  createUser as dbCreateUser, 
  getUserByUsername as dbGetUserByUsername,
  getUserByEmail as dbGetUserByEmail,
  getAllUsers as dbGetAllUsers,
  updateUser as dbUpdateUser,
  updateUserPassword as dbUpdateUserPassword,
  deleteUser as dbDeleteUser,
  // Session functions
  createSession as dbCreateSession,
  getSessionByToken as dbGetSessionByToken,
  getSessionById as dbGetSessionById,
  getSessionsByUserId as dbGetSessionsByUserId,
  updateSessionActivity as dbUpdateSessionActivity,
  deleteSession as dbDeleteSession,
  deleteSessionByToken as dbDeleteSessionByToken,
  cleanupExpiredSessions as dbCleanupExpiredSessions,
  // Password reset token functions
  createPasswordResetToken as dbCreatePasswordResetToken,
  getPasswordResetToken as dbGetPasswordResetToken,
  markPasswordResetTokenUsed as dbMarkPasswordResetTokenUsed,
  cleanupExpiredPasswordResetTokens as dbCleanupExpiredPasswordResetTokens,
  // Email verification token functions
  createEmailVerificationToken as dbCreateEmailVerificationToken,
  getEmailVerificationToken as dbGetEmailVerificationToken,
  markEmailVerificationTokenUsed as dbMarkEmailVerificationTokenUsed,
  cleanupExpiredEmailVerificationTokens as dbCleanupExpiredEmailVerificationTokens,
  // Login attempt functions
  recordLoginAttempt as dbRecordLoginAttempt,
  getRecentFailedLoginAttempts as dbGetRecentFailedLoginAttempts,
  cleanupOldLoginAttempts as dbCleanupOldLoginAttempts
} from './database.js';

import { UserCrud } from './user-management/crud.js';
import { UserAuth } from './user-management/auth.js';
import { UserPassword } from './user-management/password.js';
import { UserEmail } from './user-management/email.js';
import { UserPermissions } from './user-management/permissions.js';
import { UserInit } from './user-management/init.js';

class UserManagementService {
  constructor() {
    this.users = new Map();
    
    // Initialize sub-modules
    this.crud = new UserCrud(this);
    this.auth = new UserAuth(this);
    this.password = new UserPassword(this);
    this.email = new UserEmail(this);
    this.permissions = new UserPermissions(this);
    this.init = new UserInit(this);
    
    this.initializeDataDirectory();
    this.loadUsersFromDb();
    this.initializeDefaultUsers();
    
    // Set up periodic cleanup tasks
    this.setupCleanupTasks();
  }

  // ── Init ──────────────────────────────────────────────
  setupCleanupTasks() { return this.init.setupCleanupTasks(); }
  initializeDataDirectory() { return this.init.initializeDataDirectory(); }
  loadUsersFromDb() { return this.init.loadUsersFromDb(); }
  initializeDefaultUsers() { return this.init.initializeDefaultUsers(); }

  // ── Auth ──────────────────────────────────────────────
  authenticateUser(username, password, ipAddress = null, userAgent = null, rememberMe = false) {
    return this.auth.authenticateUser(username, password, ipAddress, userAgent, rememberMe);
  }
  recordFailedLogin(username, ipAddress) { return this.auth.recordFailedLogin(username, ipAddress); }
  generateToken(user, rememberMe = false) { return this.auth.generateToken(user, rememberMe); }
  verifyToken(token) { return this.auth.verifyToken(token); }
  createSession(userId, token, ipAddress, userAgent, rememberMe = false) {
    return this.auth.createSession(userId, token, ipAddress, userAgent, rememberMe);
  }
  logoutUser(token) { return this.auth.logoutUser(token); }

  // ── CRUD ──────────────────────────────────────────────
  sanitizeUser(user) { return this.crud.sanitizeUser(user); }
  createUser(userData, createdBy = 'admin') { return this.crud.createUser(userData, createdBy); }
  updateUserProfile(username, updates, updatedBy = 'self') {
    return this.crud.updateUserProfile(username, updates, updatedBy);
  }
  deleteUser(username, deletedBy = 'admin') { return this.crud.deleteUser(username, deletedBy); }
  listUsers() { return this.crud.listUsers(); }
  getUserById(userId) { return this.crud.getUserById(userId); }
  getUserByUsername(username) { return this.crud.getUserByUsername(username); }

  // ── Password ──────────────────────────────────────────
  validatePassword(password) { return this.password.validatePassword(password); }
  changePassword(username, currentPassword, newPassword) {
    return this.password.changePassword(username, currentPassword, newPassword);
  }
  initiatePasswordReset(email) { return this.password.initiatePasswordReset(email); }
  resetPassword(token, newPassword) { return this.password.resetPassword(token, newPassword); }

  // ── Email ─────────────────────────────────────────────
  validateEmail(email) { return this.email.validateEmail(email); }
  sendEmailVerification(user) { return this.email.sendEmailVerification(user); }
  verifyEmail(token) { return this.email.verifyEmail(token); }

  // ── Permissions ──────────────────────────────────────
  getPermissionsForRole(role) { return this.permissions.getPermissionsForRole(role); }
  hasPermission(user, permission) { return this.permissions.hasPermission(user, permission); }
  hasAnyPermission(user, permissions) { return this.permissions.hasAnyPermission(user, permissions); }
  hasAllPermissions(user, permissions) { return this.permissions.hasAllPermissions(user, permissions); }
  getUserStats() { return this.permissions.getUserStats(); }
}

export default new UserManagementService();
