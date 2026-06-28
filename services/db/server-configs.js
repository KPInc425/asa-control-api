import { db } from "./connection.js";

/**
 * Create or update server configuration
 * @param {string} name
 * @param {string} configData
 * @param {string} [gameType='ark']
 */
function upsertServerConfig(name, configData, gameType = "ark") {
  const stmt = db.prepare(`
    INSERT INTO server_configs (name, game_type, config_data)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      game_type = excluded.game_type,
      config_data = excluded.config_data,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(name, gameType, configData);
}

/**
 * Get server configuration by name
 * @param {string} name
 */
function getServerConfig(name) {
  const stmt = db.prepare("SELECT * FROM server_configs WHERE name = ?");
  return stmt.get(name);
}

/**
 * Get all server configurations
 */
function getAllServerConfigs() {
  const stmt = db.prepare(
    "SELECT * FROM server_configs ORDER BY updated_at DESC",
  );
  return stmt.all();
}

/**
 * Delete server configuration
 * @param {string} name
 */
function deleteServerConfig(name) {
  const stmt = db.prepare("DELETE FROM server_configs WHERE name = ?");
  return stmt.run(name);
}

export {
  upsertServerConfig,
  getServerConfig,
  getAllServerConfigs,
  deleteServerConfig,
};
