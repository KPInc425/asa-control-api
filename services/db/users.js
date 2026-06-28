import { db } from "./connection.js";

/**
 * Create a new user
 * @param {string} username
 * @param {string} email
 * @param {string} password_hash
 * @param {string} [role]
 * @param {string} [permissions]
 * @param {string} [profile]
 * @param {string} [security]
 * @param {string} [metadata]
 */
function createUser(
  username,
  email,
  password_hash,
  role = "viewer",
  permissions = "[]",
  profile = "{}",
  security = "{}",
  metadata = "{}",
) {
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, role, permissions, profile, security, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    username,
    email,
    password_hash,
    role,
    permissions,
    profile,
    security,
    metadata,
  );
}

/**
 * Get user by username
 * @param {string} username
 */
function getUserByUsername(username) {
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
  return stmt.get(username);
}

/**
 * Get user by email
 * @param {string} email
 */
function getUserByEmail(email) {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  return stmt.get(email);
}

/**
 * Get user by id
 * @param {number} id
 */
function getUserById(id) {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id);
}

/**
 * Get all users
 */
function getAllUsers() {
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
  return stmt.all();
}

/**
 * Update user
 * @param {number} id
 * @param {object} updates
 */
function updateUser(id, updates) {
  const fields = Object.keys(updates).filter((key) => key !== "id");
  const values = fields.map((field) => updates[field]);
  const setClause = fields.map((field) => `${field} = ?`).join(", ");

  const stmt = db.prepare(
    `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  );
  return stmt.run(...values, id);
}

/**
 * Update user password
 * @param {string} username
 * @param {string} new_hash
 */
function updateUserPassword(username, new_hash) {
  const stmt = db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
  );
  return stmt.run(new_hash, username);
}

/**
 * Delete user by username
 * @param {string} username
 */
function deleteUser(username) {
  const stmt = db.prepare("DELETE FROM users WHERE username = ?");
  return stmt.run(username);
}

export {
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  deleteUser,
};
