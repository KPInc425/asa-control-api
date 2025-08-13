import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the SQLite database file (in data directory)
// Support both development and production service environments
function getDatabasePath() {
  // Check for custom database path in environment
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  
  // Check if we're running in a service environment
  const currentDir = process.cwd();
  const isServiceEnvironment = currentDir.includes('C:\\ASA-API') || 
    process.env.NODE_ENV === 'production' ||
    process.env.SERVICE_MODE === 'true';
  
  if (isServiceEnvironment) {
    return path.join('C:\\ASA-API', 'data', 'asa-data.sqlite');
  } else {
    // Development environment - use relative path from project
    return path.join(__dirname, '..', 'data', 'asa-data.sqlite');
  }
}

const dbPath = getDatabasePath();
console.log('Database path:', dbPath);

// Ensure the data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Create users table with expanded schema
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',
  permissions TEXT DEFAULT '[]',
  profile TEXT DEFAULT '{}',
  security TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create sessions table
db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`).run();

// Create jobs table
db.prepare(`CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress TEXT DEFAULT '[]',
  result TEXT,
  error TEXT,
  data TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create password reset tokens table
db.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`).run();

// Create email verification tokens table
db.prepare(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`).run();

// Create login attempts table
db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN DEFAULT FALSE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create server configurations table
db.prepare(`CREATE TABLE IF NOT EXISTS server_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  config_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create shared mods table
db.prepare(`CREATE TABLE IF NOT EXISTS shared_mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id TEXT UNIQUE NOT NULL,
  mod_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create server mods table
db.prepare(`CREATE TABLE IF NOT EXISTS server_mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  mod_id TEXT,
  mod_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  excludeSharedMods BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, mod_id)
)`).run();

// Add excludeSharedMods column if it doesn't exist (for existing databases)
try {
  db.prepare('ALTER TABLE server_mods ADD COLUMN excludeSharedMods BOOLEAN DEFAULT FALSE').run();
} catch (error) {
  // Column already exists, ignore error
}

// Update mod_id to allow NULL (for storing server settings)
try {
  db.prepare('CREATE TABLE server_mods_new (id INTEGER PRIMARY KEY AUTOINCREMENT, server_name TEXT NOT NULL, mod_id TEXT, mod_name TEXT, enabled BOOLEAN DEFAULT TRUE, excludeSharedMods BOOLEAN DEFAULT FALSE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(server_name, mod_id))').run();
  db.prepare('INSERT INTO server_mods_new SELECT * FROM server_mods').run();
  db.prepare('DROP TABLE server_mods').run();
  db.prepare('ALTER TABLE server_mods_new RENAME TO server_mods').run();
} catch (error) {
  // Table already updated, ignore error
}

// Create configuration exclusions table
db.prepare(`CREATE TABLE IF NOT EXISTS config_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  config_file TEXT NOT NULL,
  exclusion_pattern TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, config_file, exclusion_pattern)
)`).run();

// Create server update configurations table
db.prepare(`CREATE TABLE IF NOT EXISTS server_update_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT UNIQUE NOT NULL,
  cluster_name TEXT,
  update_on_start BOOLEAN DEFAULT TRUE,
  last_update DATETIME,
  update_enabled BOOLEAN DEFAULT TRUE,
  auto_update BOOLEAN DEFAULT FALSE,
  update_interval INTEGER DEFAULT 24,
  update_schedule TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// --- User CRUD functions ---

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
function createUser(username, email, password_hash, role = 'viewer', permissions = '[]', profile = '{}', security = '{}', metadata = '{}') {
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, role, permissions, profile, security, metadata) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(username, email, password_hash, role, permissions, profile, security, metadata);
}

/**
 * Get user by username
 * @param {string} username
 */
function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

/**
 * Get user by email
 * @param {string} email
 */
function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

/**
 * Get user by id
 * @param {number} id
 */
function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

/**
 * Get all users
 */
function getAllUsers() {
  const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Update user
 * @param {number} id
 * @param {object} updates
 */
function updateUser(id, updates) {
  const fields = Object.keys(updates).filter(key => key !== 'id');
  const values = fields.map(field => updates[field]);
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  
  const stmt = db.prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  return stmt.run(...values, id);
}

/**
 * Update user password
 * @param {string} username
 * @param {string} new_hash
 */
function updateUserPassword(username, new_hash) {
  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?');
  return stmt.run(new_hash, username);
}

/**
 * Delete user by username
 * @param {string} username
 */
function deleteUser(username) {
  const stmt = db.prepare('DELETE FROM users WHERE username = ?');
  return stmt.run(username);
}

// --- Session CRUD functions ---

/**
 * Create a new session
 * @param {string} id
 * @param {number} userId
 * @param {string} token
 * @param {string} [ipAddress]
 * @param {string} [userAgent]
 * @param {string} expiresAt
 */
function createSession(id, userId, token, ipAddress = null, userAgent = null, expiresAt) {
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
  const stmt = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')');
  return stmt.get(token);
}

/**
 * Get session by id
 * @param {string} id
 */
function getSessionById(id) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id);
}

/**
 * Get all sessions for a user
 * @param {number} userId
 */
function getSessionsByUserId(userId) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId);
}

/**
 * Update session last activity
 * @param {string} id
 */
function updateSessionActivity(id) {
  const stmt = db.prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?');
  return stmt.run(id);
}

/**
 * Delete session by id
 * @param {string} id
 */
function deleteSession(id) {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  return stmt.run(id);
}

/**
 * Delete session by token
 * @param {string} token
 */
function deleteSessionByToken(token) {
  const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
  return stmt.run(token);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const stmt = db.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')');
  return stmt.run();
}

// --- Job CRUD functions ---

/**
 * Create a new job
 * @param {string} id
 * @param {string} type
 * @param {string} [data]
 */
function createJob(id, type, data = '{}') {
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
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  return stmt.get(id);
}

/**
 * Get all jobs
 */
function getAllJobs() {
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Update job
 * @param {string} id
 * @param {object} updates
 */
function updateJob(id, updates) {
  const fields = Object.keys(updates).filter(key => key !== 'id');
  const values = fields.map(field => updates[field]);
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  
  const stmt = db.prepare(`UPDATE jobs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  return stmt.run(...values, id);
}

/**
 * Delete job by id
 * @param {string} id
 */
function deleteJob(id) {
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
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
  const stmt = db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?');
  return stmt.run(token);
}

/**
 * Clean up expired password reset tokens
 */
function cleanupExpiredPasswordResetTokens() {
  const stmt = db.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= datetime(\'now\')');
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
  const stmt = db.prepare('UPDATE email_verification_tokens SET used = 1 WHERE token = ?');
  return stmt.run(token);
}

/**
 * Clean up expired email verification tokens
 */
function cleanupExpiredEmailVerificationTokens() {
  const stmt = db.prepare('DELETE FROM email_verification_tokens WHERE expires_at <= datetime(\'now\')');
  return stmt.run();
}

// --- Login Attempt functions ---

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

// --- Server Configuration functions ---

/**
 * Create or update server configuration
 * @param {string} name
 * @param {string} configData
 */
function upsertServerConfig(name, configData) {
  const stmt = db.prepare(`
    INSERT INTO server_configs (name, config_data) 
    VALUES (?, ?) 
    ON CONFLICT(name) DO UPDATE SET 
      config_data = excluded.config_data,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(name, configData);
}

/**
 * Get server configuration by name
 * @param {string} name
 */
function getServerConfig(name) {
  const stmt = db.prepare('SELECT * FROM server_configs WHERE name = ?');
  return stmt.get(name);
}

/**
 * Get all server configurations
 */
function getAllServerConfigs() {
  const stmt = db.prepare('SELECT * FROM server_configs ORDER BY updated_at DESC');
  return stmt.all();
}

/**
 * Delete server configuration
 * @param {string} name
 */
function deleteServerConfig(name) {
  const stmt = db.prepare('DELETE FROM server_configs WHERE name = ?');
  return stmt.run(name);
}

// --- Shared Mods functions ---

/**
 * Add or update shared mod
 * @param {string} modId
 * @param {string} [modName]
 * @param {boolean} [enabled]
 */
function upsertSharedMod(modId, modName = null, enabled = true) {
  const stmt = db.prepare(`
    INSERT INTO shared_mods (mod_id, mod_name, enabled) 
    VALUES (?, ?, ?) 
    ON CONFLICT(mod_id) DO UPDATE SET 
      mod_name = excluded.mod_name,
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(modId, modName, enabled ? 1 : 0);
}

/**
 * Get shared mod by ID
 * @param {string} modId
 */
function getSharedMod(modId) {
  const stmt = db.prepare('SELECT * FROM shared_mods WHERE mod_id = ?');
  return stmt.get(modId);
}

/**
 * Get all shared mods
 */
function getAllSharedMods() {
  const stmt = db.prepare('SELECT * FROM shared_mods ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Delete shared mod
 * @param {string} modId
 */
function deleteSharedMod(modId) {
  const stmt = db.prepare('DELETE FROM shared_mods WHERE mod_id = ?');
  return stmt.run(modId);
}

// --- Server Mods functions ---

/**
 * Add or update server mod
 * @param {string} serverName
 * @param {string} modId
 * @param {string} [modName]
 * @param {boolean} [enabled]
 * @param {boolean} [excludeSharedMods]
 */
function upsertServerMod(serverName, modId, modName = null, enabled = true, excludeSharedMods = false) {
  // Validate inputs to prevent NULL modId
  if (!modId || modId === null || modId === undefined || modId === '') {
    throw new Error(`Invalid modId: ${modId}. modId cannot be null, undefined, or empty.`);
  }
  
  if (!serverName || serverName === null || serverName === undefined || serverName === '') {
    throw new Error(`Invalid serverName: ${serverName}. serverName cannot be null, undefined, or empty.`);
  }
  
  const stmt = db.prepare(`
    INSERT INTO server_mods (server_name, mod_id, mod_name, enabled, excludeSharedMods) 
    VALUES (?, ?, ?, ?, ?) 
    ON CONFLICT(server_name, mod_id) DO UPDATE SET 
      mod_name = excluded.mod_name,
      enabled = excluded.enabled,
      excludeSharedMods = excluded.excludeSharedMods,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(serverName, modId, modName, enabled ? 1 : 0, excludeSharedMods ? 1 : 0);
}

/**
 * Get mods for a server
 * @param {string} serverName
 */
function getServerMods(serverName) {
  const stmt = db.prepare('SELECT * FROM server_mods WHERE server_name = ? ORDER BY created_at DESC');
  return stmt.all(serverName);
}

/**
 * Delete server mod
 * @param {string} serverName
 * @param {string} modId
 */
function deleteServerMod(serverName, modId) {
  const stmt = db.prepare('DELETE FROM server_mods WHERE server_name = ? AND mod_id = ?');
  return stmt.run(serverName, modId);
}

/**
 * Delete all mods for a server
 * @param {string} serverName
 */
function deleteAllServerMods(serverName) {
  const stmt = db.prepare('DELETE FROM server_mods WHERE server_name = ?');
  return stmt.run(serverName);
}

// --- Configuration Exclusions functions ---

/**
 * Add configuration exclusion
 * @param {string} serverName
 * @param {string} configFile
 * @param {string} exclusionPattern
 */
function addConfigExclusion(serverName, configFile, exclusionPattern) {
  const stmt = db.prepare(`
    INSERT INTO config_exclusions (server_name, config_file, exclusion_pattern) 
    VALUES (?, ?, ?)
  `);
  return stmt.run(serverName, configFile, exclusionPattern);
}

/**
 * Get exclusions for a server
 * @param {string} serverName
 */
function getConfigExclusions(serverName) {
  const stmt = db.prepare('SELECT * FROM config_exclusions WHERE server_name = ? ORDER BY created_at DESC');
  return stmt.all(serverName);
}

/**
 * Get exclusions for a server and config file
 * @param {string} serverName
 * @param {string} configFile
 */
function getConfigExclusionsForFile(serverName, configFile) {
  const stmt = db.prepare('SELECT * FROM config_exclusions WHERE server_name = ? AND config_file = ? ORDER BY created_at DESC');
  return stmt.all(serverName, configFile);
}

/**
 * Delete configuration exclusion
 * @param {string} serverName
 * @param {string} configFile
 * @param {string} exclusionPattern
 */
function deleteConfigExclusion(serverName, configFile, exclusionPattern) {
  const stmt = db.prepare('DELETE FROM config_exclusions WHERE server_name = ? AND config_file = ? AND exclusion_pattern = ?');
  return stmt.run(serverName, configFile, exclusionPattern);
}

/**
 * Delete all exclusions for a server
 * @param {string} serverName
 */
function deleteAllConfigExclusions(serverName) {
  const stmt = db.prepare('DELETE FROM config_exclusions WHERE server_name = ?');
  return stmt.run(serverName);
}

/**
 * Get all server mods
 */
function getAllServerMods() {
  const stmt = db.prepare('SELECT * FROM server_mods ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Store server settings (like excludeSharedMods flag)
 * @param {string} serverName
 * @param {boolean} excludeSharedMods
 */
function upsertServerSettings(serverName, excludeSharedMods = false) {
  const stmt = db.prepare(`
    INSERT INTO server_mods (server_name, mod_id, mod_name, enabled, excludeSharedMods) 
    VALUES (?, NULL, NULL, TRUE, ?) 
    ON CONFLICT(server_name, mod_id) DO UPDATE SET 
      excludeSharedMods = excluded.excludeSharedMods,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(serverName, excludeSharedMods ? 1 : 0);
}

/**
 * Get server settings
 * @param {string} serverName
 */
function getServerSettings(serverName) {
  const stmt = db.prepare('SELECT * FROM server_mods WHERE server_name = ? AND mod_id IS NULL');
  return stmt.get(serverName);
}

// --- Server Update Configuration functions ---

/**
 * Add or update server update configuration
 * @param {Object} config
 */
function upsertServerUpdateConfig(config) {
  const stmt = db.prepare(`
    INSERT INTO server_update_configs (
      server_name, cluster_name, update_on_start, last_update, 
      update_enabled, auto_update, update_interval, update_schedule
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
    ON CONFLICT(server_name) DO UPDATE SET 
      cluster_name = excluded.cluster_name,
      update_on_start = excluded.update_on_start,
      last_update = excluded.last_update,
      update_enabled = excluded.update_enabled,
      auto_update = excluded.auto_update,
      update_interval = excluded.update_interval,
      update_schedule = excluded.update_schedule,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(
    config.serverName,
    config.clusterName,
    config.updateOnStart ? 1 : 0,
    config.lastUpdate,
    config.updateEnabled ? 1 : 0,
    config.autoUpdate ? 1 : 0,
    config.updateInterval,
    config.updateSchedule
  );
}

/**
 * Get server update configuration
 * @param {string} serverName
 */
function getServerUpdateConfig(serverName) {
  const stmt = db.prepare('SELECT * FROM server_update_configs WHERE server_name = ?');
  return stmt.get(serverName);
}

/**
 * Get all server update configurations
 */
function getAllServerUpdateConfigs() {
  const stmt = db.prepare('SELECT * FROM server_update_configs ORDER BY updated_at DESC');
  return stmt.all();
}

/**
 * Update server last update time
 * @param {string} serverName
 */
function updateServerLastUpdate(serverName) {
  const stmt = db.prepare(`
    UPDATE server_update_configs 
    SET last_update = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
    WHERE server_name = ?
  `);
  return stmt.run(serverName);
}

/**
 * Delete server update configuration
 * @param {string} serverName
 */
function deleteServerUpdateConfig(serverName) {
  const stmt = db.prepare('DELETE FROM server_update_configs WHERE server_name = ?');
  return stmt.run(serverName);
}

export {
  db,
  // User functions
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  deleteUser,
  // Session functions
  createSession,
  getSessionByToken,
  getSessionById,
  getSessionsByUserId,
  updateSessionActivity,
  deleteSession,
  deleteSessionByToken,
  cleanupExpiredSessions,
  // Job functions
  createJob,
  getJob,
  getAllJobs,
  updateJob,
  deleteJob,
  cleanupOldJobs,
  // Password reset token functions
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  cleanupExpiredPasswordResetTokens,
  // Email verification token functions
  createEmailVerificationToken,
  getEmailVerificationToken,
  markEmailVerificationTokenUsed,
  cleanupExpiredEmailVerificationTokens,
  // Login attempt functions
  recordLoginAttempt,
  getRecentFailedLoginAttempts,
  cleanupOldLoginAttempts,
  // Server configuration functions
  upsertServerConfig,
  getServerConfig,
  getAllServerConfigs,
  deleteServerConfig,
  // Shared mods functions
  upsertSharedMod,
  getSharedMod,
  getAllSharedMods,
  deleteSharedMod,
  // Server mods functions
  upsertServerMod,
  getServerMods,
  deleteServerMod,
  deleteAllServerMods,
  // Configuration exclusions functions
  addConfigExclusion,
  getConfigExclusions,
  getConfigExclusionsForFile,
  deleteConfigExclusion,
  deleteAllConfigExclusions,
  getAllServerMods,
  upsertServerSettings,
  getServerSettings,
  // Server update configuration functions
  upsertServerUpdateConfig,
  getServerUpdateConfig,
  getAllServerUpdateConfigs,
  updateServerLastUpdate,
  deleteServerUpdateConfig,
};
