import { db } from "./connection.js";

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
  const stmt = db.prepare(
    "SELECT * FROM config_exclusions WHERE server_name = ? ORDER BY created_at DESC",
  );
  return stmt.all(serverName);
}

/**
 * Get exclusions for a server and config file
 * @param {string} serverName
 * @param {string} configFile
 */
function getConfigExclusionsForFile(serverName, configFile) {
  const stmt = db.prepare(
    "SELECT * FROM config_exclusions WHERE server_name = ? AND config_file = ? ORDER BY created_at DESC",
  );
  return stmt.all(serverName, configFile);
}

/**
 * Delete configuration exclusion
 * @param {string} serverName
 * @param {string} configFile
 * @param {string} exclusionPattern
 */
function deleteConfigExclusion(serverName, configFile, exclusionPattern) {
  const stmt = db.prepare(
    "DELETE FROM config_exclusions WHERE server_name = ? AND config_file = ? AND exclusion_pattern = ?",
  );
  return stmt.run(serverName, configFile, exclusionPattern);
}

/**
 * Delete all exclusions for a server
 * @param {string} serverName
 */
function deleteAllConfigExclusions(serverName) {
  const stmt = db.prepare(
    "DELETE FROM config_exclusions WHERE server_name = ?",
  );
  return stmt.run(serverName);
}

export {
  addConfigExclusion,
  getConfigExclusions,
  getConfigExclusionsForFile,
  deleteConfigExclusion,
  deleteAllConfigExclusions,
};
