import { db } from "./connection.js";

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
  const stmt = db.prepare("SELECT * FROM shared_mods WHERE mod_id = ?");
  return stmt.get(modId);
}

/**
 * Get all shared mods
 */
function getAllSharedMods() {
  const stmt = db.prepare("SELECT * FROM shared_mods ORDER BY created_at DESC");
  return stmt.all();
}

/**
 * Delete shared mod
 * @param {string} modId
 */
function deleteSharedMod(modId) {
  const stmt = db.prepare("DELETE FROM shared_mods WHERE mod_id = ?");
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
function upsertServerMod(
  serverName,
  modId,
  modName = null,
  enabled = true,
  excludeSharedMods = false,
) {
  // Validate inputs to prevent NULL modId
  if (!modId || modId === null || modId === undefined || modId === "") {
    throw new Error(
      `Invalid modId: ${modId}. modId cannot be null, undefined, or empty.`,
    );
  }

  if (
    !serverName ||
    serverName === null ||
    serverName === undefined ||
    serverName === ""
  ) {
    throw new Error(
      `Invalid serverName: ${serverName}. serverName cannot be null, undefined, or empty.`,
    );
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
  return stmt.run(
    serverName,
    modId,
    modName,
    enabled ? 1 : 0,
    excludeSharedMods ? 1 : 0,
  );
}

/**
 * Get mods for a server
 * @param {string} serverName
 */
function getServerMods(serverName) {
  const stmt = db.prepare(
    "SELECT * FROM server_mods WHERE server_name = ? ORDER BY created_at DESC",
  );
  return stmt.all(serverName);
}

/**
 * Delete server mod
 * @param {string} serverName
 * @param {string} modId
 */
function deleteServerMod(serverName, modId) {
  const stmt = db.prepare(
    "DELETE FROM server_mods WHERE server_name = ? AND mod_id = ?",
  );
  return stmt.run(serverName, modId);
}

/**
 * Delete all mods for a server
 * @param {string} serverName
 */
function deleteAllServerMods(serverName) {
  const stmt = db.prepare("DELETE FROM server_mods WHERE server_name = ?");
  return stmt.run(serverName);
}

/**
 * Get all server mods
 */
function getAllServerMods() {
  const stmt = db.prepare("SELECT * FROM server_mods ORDER BY created_at DESC");
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
  const stmt = db.prepare(
    "SELECT * FROM server_mods WHERE server_name = ? AND mod_id IS NULL",
  );
  return stmt.get(serverName);
}

export {
  upsertSharedMod,
  getSharedMod,
  getAllSharedMods,
  deleteSharedMod,
  upsertServerMod,
  getServerMods,
  deleteServerMod,
  deleteAllServerMods,
  getAllServerMods,
  upsertServerSettings,
  getServerSettings,
};
