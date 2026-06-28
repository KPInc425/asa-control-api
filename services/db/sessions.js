import { db } from "./connection.js";

/**
 * Create a new session
 * @param {string} id
 * @param {number} userId
 * @param {string} token
 * @param {string} [ipAddress]
 * @param {string} [userAgent]
 * @param {string} expiresAt
 */
function createSession(
  id,
  userId,
  token,
  ipAddress = null,
  userAgent = null,
  expiresAt,
) {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(id, userId, token, ipAddress, userAgent, expiresAt);
}

/**
 * Get session by token
 * @param {string} token
 */
function getSessionByToken(token) {
  const stmt = db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')",
  );
  return stmt.get(token);
}

/**
 * Get session by id
 * @param {string} id
 */
function getSessionById(id) {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  return stmt.get(id);
}

/**
 * Get all sessions for a user
 * @param {number} userId
 */
function getSessionsByUserId(userId) {
  const stmt = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
  );
  return stmt.all(userId);
}

/**
 * Update session last activity
 * @param {string} id
 */
function updateSessionActivity(id) {
  const stmt = db.prepare(
    "UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?",
  );
  return stmt.run(id);
}

/**
 * Delete session by id
 * @param {string} id
 */
function deleteSession(id) {
  const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
  return stmt.run(id);
}

/**
 * Delete session by token
 * @param {string} token
 */
function deleteSessionByToken(token) {
  const stmt = db.prepare("DELETE FROM sessions WHERE token = ?");
  return stmt.run(token);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const stmt = db.prepare(
    "DELETE FROM sessions WHERE expires_at <= datetime('now')",
  );
  return stmt.run();
}

export {
  createSession,
  getSessionByToken,
  getSessionById,
  getSessionsByUserId,
  updateSessionActivity,
  deleteSession,
  deleteSessionByToken,
  cleanupExpiredSessions,
};
