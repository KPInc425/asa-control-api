import { db } from "./connection.js";

/**
 * Save an update history entry for a server
 * @param {string} serverName - Server name
 * @param {Object} entry - History entry
 * @param {string} entry.eventType - Type of event (check, warning, update, restart, complete, error)
 * @param {string} entry.status - Status (success, failed, in_progress)
 * @param {string} [entry.oldVersion] - Previous version
 * @param {string} [entry.newVersion] - New version after update
 * @param {string} [entry.message] - Human-readable message
 * @param {Object} [entry.details] - Additional details as JSON
 * @param {number} [entry.durationMs] - Duration of operation in milliseconds
 */
function saveServerUpdateHistory(serverName, entry) {
  const stmt = db.prepare(`
    INSERT INTO server_update_history
    (server_name, event_type, status, old_version, new_version, message, details, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    serverName,
    entry.eventType,
    entry.status,
    entry.oldVersion || null,
    entry.newVersion || null,
    entry.message || null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.durationMs || null,
  );
}

/**
 * Get update history for a server
 * @param {string} serverName - Server name
 * @param {number} [limit=50] - Maximum number of entries to return
 * @returns {Array} List of history entries, most recent first
 */
function getServerUpdateHistory(serverName, limit = 50) {
  const stmt = db.prepare(`
    SELECT
      id,
      server_name,
      event_type,
      status,
      old_version,
      new_version,
      message,
      details,
      duration_ms,
      created_at
    FROM server_update_history
    WHERE server_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(serverName, limit);

  // Parse JSON details field
  return rows.map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
  }));
}

/**
 * Clean up old update history entries (older than specified days)
 * @param {number} [daysToKeep=30] - Number of days of history to keep
 */
function cleanupOldUpdateHistory(daysToKeep = 30) {
  const stmt = db.prepare(`
    DELETE FROM server_update_history
    WHERE created_at <= datetime('now', '-${daysToKeep} days')
  `);
  return stmt.run();
}

export {
  saveServerUpdateHistory,
  getServerUpdateHistory,
  cleanupOldUpdateHistory,
};
