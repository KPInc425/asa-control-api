import { db } from "./connection.js";

// --- Password Reset Token functions ---

/**
 * Create password reset token
 * @param {number} userId
 * @param {string} token
 * @param {string} expiresAt
 */
function createPasswordResetToken(userId, token, expiresAt) {
  const stmt = db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `);
  return stmt.run(userId, token, expiresAt);
}

/**
 * Get password reset token
 * @param {string} token
 */
function getPasswordResetToken(token) {
  const stmt = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token = ? AND expires_at > datetime('now') AND used = 0
  `);
  return stmt.get(token);
}

/**
 * Mark password reset token as used
 * @param {string} token
 */
function markPasswordResetTokenUsed(token) {
  const stmt = db.prepare(
    "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
  );
  return stmt.run(token);
}

/**
 * Clean up expired password reset tokens
 */
function cleanupExpiredPasswordResetTokens() {
  const stmt = db.prepare(
    "DELETE FROM password_reset_tokens WHERE expires_at <= datetime('now')",
  );
  return stmt.run();
}

// --- Email Verification Token functions ---

/**
 * Create email verification token
 * @param {number} userId
 * @param {string} token
 * @param {string} expiresAt
 */
function createEmailVerificationToken(userId, token, expiresAt) {
  const stmt = db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `);
  return stmt.run(userId, token, expiresAt);
}

/**
 * Get email verification token
 * @param {string} token
 */
function getEmailVerificationToken(token) {
  const stmt = db.prepare(`
    SELECT * FROM email_verification_tokens
    WHERE token = ? AND expires_at > datetime('now') AND used = 0
  `);
  return stmt.get(token);
}

/**
 * Mark email verification token as used
 * @param {string} token
 */
function markEmailVerificationTokenUsed(token) {
  const stmt = db.prepare(
    "UPDATE email_verification_tokens SET used = 1 WHERE token = ?",
  );
  return stmt.run(token);
}

/**
 * Clean up expired email verification tokens
 */
function cleanupExpiredEmailVerificationTokens() {
  const stmt = db.prepare(
    "DELETE FROM email_verification_tokens WHERE expires_at <= datetime('now')",
  );
  return stmt.run();
}

export {
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  cleanupExpiredPasswordResetTokens,
  createEmailVerificationToken,
  getEmailVerificationToken,
  markEmailVerificationTokenUsed,
  cleanupExpiredEmailVerificationTokens,
};
