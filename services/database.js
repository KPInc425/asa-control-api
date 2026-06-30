// Database access layer � refactored into domain modules under services/db/
// This file re-exports everything for backward compatibility.
// New code should import from "./db/index.js" instead.

export * from "./db/index.js";

// Backward-compatible aliases (user-management/ files use db-prefixed names)
export {
  createUser as dbCreateUser,
  getUserByUsername as dbGetUserByUsername,
  getUserByEmail as dbGetUserByEmail,
  getUserById as dbGetUserById,
  getAllUsers as dbGetAllUsers,
  updateUser as dbUpdateUser,
  deleteUser as dbDeleteUser,
} from "./db/users.js";

export {
  cleanupExpiredSessions as dbCleanupExpiredSessions,
  createSession as dbCreateSession,
  deleteSessionByToken as dbDeleteSessionByToken,
} from "./db/sessions.js";

export {
  createPasswordResetToken as dbCreatePasswordResetToken,
  getPasswordResetToken as dbGetPasswordResetToken,
  markPasswordResetTokenUsed as dbMarkPasswordResetTokenUsed,
  cleanupExpiredPasswordResetTokens as dbCleanupExpiredPasswordResetTokens,
  createEmailVerificationToken as dbCreateEmailVerificationToken,
  getEmailVerificationToken as dbGetEmailVerificationToken,
  markEmailVerificationTokenUsed as dbMarkEmailVerificationTokenUsed,
  cleanupExpiredEmailVerificationTokens as dbCleanupExpiredEmailVerificationTokens,
} from "./db/tokens.js";

export {
  cleanupOldLoginAttempts as dbCleanupOldLoginAttempts,
  recordLoginAttempt as dbRecordLoginAttempt,
} from "./db/login-attempts.js";