import { db } from "./connection.js";

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
    config.updateSchedule,
  );
}

/**
 * Get server update configuration
 * @param {string} serverName
 */
function getServerUpdateConfig(serverName) {
  const stmt = db.prepare(
    "SELECT * FROM server_update_configs WHERE server_name = ?",
  );
  return stmt.get(serverName);
}

/**
 * Get all server update configurations
 */
function getAllServerUpdateConfigs() {
  const stmt = db.prepare(
    "SELECT * FROM server_update_configs ORDER BY updated_at DESC",
  );
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
  const stmt = db.prepare(
    "DELETE FROM server_update_configs WHERE server_name = ?",
  );
  return stmt.run(serverName);
}

export {
  upsertServerUpdateConfig,
  getServerUpdateConfig,
  getAllServerUpdateConfigs,
  updateServerLastUpdate,
  deleteServerUpdateConfig,
};
