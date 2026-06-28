import { db } from "./connection.js";

/**
 * Record login attempt
 * @param {string} username
 * @param {string} [ipAddress]
 * @param {boolean} [success]
 */
function recordLoginAttempt(username, ipAddress = null, success = false) {
  const stmt = db.prepare(`
    INSERT INTO login_attempts (username, ip_address, success)
    VALUES (?, ?, ?)
  `);
  return stmt.run(username, ipAddress, success ? 1 : 0);
}

/**
 * Get recent failed login attempts for a username
 * @param {string} username
 * @param {number} hours
 */
function getRecentFailedLoginAttempts(username, hours = 1) {
  const stmt = db.prepare(`
    SELECT * FROM login_attempts
    WHERE username = ? AND success = 0
    AND timestamp >= datetime('now', '-${hours} hours')
    ORDER BY timestamp DESC
  `);
  return stmt.all(username);
}

/**
 * Clean up old login attempts
 * @param {number} daysOld
 */
function cleanupOldLoginAttempts(daysOld = 30) {
  const stmt = db.prepare(`
    DELETE FROM login_attempts
    WHERE timestamp <= datetime('now', '-${daysOld} days')
  `);
  return stmt.run();
}

export {
  recordLoginAttempt,
  getRecentFailedLoginAttempts,
  cleanupOldLoginAttempts,
};
