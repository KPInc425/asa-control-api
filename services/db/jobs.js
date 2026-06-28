import { db } from "./connection.js";

/**
 * Create a new job
 * @param {string} id
 * @param {string} type
 * @param {string} [data]
 */
function createJob(id, type, data = "{}") {
  const stmt = db.prepare(`
    INSERT INTO jobs (id, type, data)
    VALUES (?, ?, ?)
  `);
  return stmt.run(id, type, data);
}

/**
 * Get job by id
 * @param {string} id
 */
function getJob(id) {
  const stmt = db.prepare("SELECT * FROM jobs WHERE id = ?");
  return stmt.get(id);
}

/**
 * Get all jobs
 */
function getAllJobs() {
  const stmt = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC");
  return stmt.all();
}

/**
 * Update job
 * @param {string} id
 * @param {object} updates
 */
function updateJob(id, updates) {
  const fields = Object.keys(updates).filter((key) => key !== "id");
  const values = fields.map((field) => updates[field]);
  const setClause = fields.map((field) => `${field} = ?`).join(", ");

  const stmt = db.prepare(
    `UPDATE jobs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  );
  return stmt.run(...values, id);
}

/**
 * Delete job by id
 * @param {string} id
 */
function deleteJob(id) {
  const stmt = db.prepare("DELETE FROM jobs WHERE id = ?");
  return stmt.run(id);
}

/**
 * Clean up old completed/failed jobs
 * @param {number} hoursOld
 */
function cleanupOldJobs(hoursOld = 24) {
  const stmt = db.prepare(`
    DELETE FROM jobs
    WHERE (status = 'completed' OR status = 'failed')
    AND updated_at <= datetime('now', '-${hoursOld} hours')
  `);
  return stmt.run();
}

export {
  createJob,
  getJob,
  getAllJobs,
  updateJob,
  deleteJob,
  cleanupOldJobs,
};
