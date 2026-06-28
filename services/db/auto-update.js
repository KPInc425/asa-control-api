import { db } from "./connection.js";

/**
 * Get auto-update configuration for a server
 * @param {string} serverName
 * @returns {Object|null} Auto-update config with parsed JSON fields
 */
function getAutoUpdateConfig(serverName) {
  const stmt = db.prepare(`
    SELECT
      server_name,
      notify_rcon,
      notify_discord,
      notify_socket,
      warning_minutes,
      notification_templates,
      auto_restart,
      auto_update_enabled,
      auto_update_check_interval,
      auto_update_if_empty,
      last_update_check,
      last_update_applied,
      updated_at
    FROM server_update_configs
    WHERE server_name = ?
  `);
  const row = stmt.get(serverName);

  if (!row) return null;

  // Parse JSON fields
  return {
    ...row,
    notify_rcon: !!row.notify_rcon,
    notify_discord: !!row.notify_discord,
    notify_socket: !!row.notify_socket,
    warning_minutes: row.warning_minutes
      ? JSON.parse(row.warning_minutes)
      : [30, 10, 5, 1],
    notification_templates: row.notification_templates
      ? JSON.parse(row.notification_templates)
      : null,
    auto_restart: row.auto_restart !== 0,
    auto_update_enabled: !!row.auto_update_enabled,
    auto_update_if_empty: !!row.auto_update_if_empty,
  };
}

/**
 * Set auto-update configuration for a server
 * @param {string} serverName
 * @param {Object} config - Configuration object
 */
function setAutoUpdateConfig(serverName, config) {
  // First ensure the server exists in the table
  const existing = db
    .prepare(
      "SELECT server_name FROM server_update_configs WHERE server_name = ?",
    )
    .get(serverName);

  if (!existing) {
    // Insert new record with defaults
    db.prepare(
      `
      INSERT INTO server_update_configs (server_name) VALUES (?)
    `,
    ).run(serverName);
  }

  // Build update statement dynamically based on provided fields
  const updates = [];
  const values = [];

  if (config.notify_rcon !== undefined) {
    updates.push("notify_rcon = ?");
    values.push(config.notify_rcon ? 1 : 0);
  }
  if (config.notify_discord !== undefined) {
    updates.push("notify_discord = ?");
    values.push(config.notify_discord ? 1 : 0);
  }
  if (config.notify_socket !== undefined) {
    updates.push("notify_socket = ?");
    values.push(config.notify_socket ? 1 : 0);
  }
  if (config.warning_minutes !== undefined) {
    updates.push("warning_minutes = ?");
    values.push(JSON.stringify(config.warning_minutes));
  }
  if (config.notification_templates !== undefined) {
    updates.push("notification_templates = ?");
    values.push(
      config.notification_templates
        ? JSON.stringify(config.notification_templates)
        : null,
    );
  }
  if (config.auto_restart !== undefined) {
    updates.push("auto_restart = ?");
    values.push(config.auto_restart ? 1 : 0);
  }
  if (config.auto_update_enabled !== undefined) {
    updates.push("auto_update_enabled = ?");
    values.push(config.auto_update_enabled ? 1 : 0);
  }
  if (config.auto_update_check_interval !== undefined) {
    updates.push("auto_update_check_interval = ?");
    values.push(config.auto_update_check_interval);
  }
  if (config.auto_update_if_empty !== undefined) {
    updates.push("auto_update_if_empty = ?");
    values.push(config.auto_update_if_empty ? 1 : 0);
  }

  if (updates.length === 0) {
    return { changes: 0 };
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(serverName);

  const stmt = db.prepare(`
    UPDATE server_update_configs
    SET ${updates.join(", ")}
    WHERE server_name = ?
  `);

  return stmt.run(...values);
}

/**
 * Get all servers with auto-update enabled
 * @returns {Array} List of server configs with auto-update enabled
 */
function getAutoUpdateEnabledServers() {
  const stmt = db.prepare(`
    SELECT
      server_name,
      notify_rcon,
      notify_discord,
      notify_socket,
      warning_minutes,
      notification_templates,
      auto_restart,
      auto_update_enabled,
      auto_update_check_interval,
      auto_update_if_empty,
      last_update_check,
      last_update_applied,
      updated_at
    FROM server_update_configs
    WHERE auto_update_enabled = 1
    ORDER BY server_name
  `);
  const rows = stmt.all();

  // Parse JSON fields for each row
  return rows.map((row) => ({
    ...row,
    notify_rcon: !!row.notify_rcon,
    notify_discord: !!row.notify_discord,
    notify_socket: !!row.notify_socket,
    warning_minutes: row.warning_minutes
      ? JSON.parse(row.warning_minutes)
      : [30, 10, 5, 1],
    notification_templates: row.notification_templates
      ? JSON.parse(row.notification_templates)
      : null,
    auto_restart: row.auto_restart !== 0,
    auto_update_enabled: !!row.auto_update_enabled,
    auto_update_if_empty: !!row.auto_update_if_empty,
  }));
}

/**
 * Update the last update check timestamp for a server
 * @param {string} serverName
 */
function updateLastCheckTime(serverName) {
  // Ensure server exists first
  const existing = db
    .prepare(
      "SELECT server_name FROM server_update_configs WHERE server_name = ?",
    )
    .get(serverName);

  if (!existing) {
    db.prepare(
      "INSERT INTO server_update_configs (server_name) VALUES (?)",
    ).run(serverName);
  }

  const stmt = db.prepare(`
    UPDATE server_update_configs
    SET last_update_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE server_name = ?
  `);
  return stmt.run(serverName);
}

/**
 * Update the last update applied timestamp for a server
 * @param {string} serverName
 */
function updateLastAppliedTime(serverName) {
  // Ensure server exists first
  const existing = db
    .prepare(
      "SELECT server_name FROM server_update_configs WHERE server_name = ?",
    )
    .get(serverName);

  if (!existing) {
    db.prepare(
      "INSERT INTO server_update_configs (server_name) VALUES (?)",
    ).run(serverName);
  }

  const stmt = db.prepare(`
    UPDATE server_update_configs
    SET last_update_applied = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE server_name = ?
  `);
  return stmt.run(serverName);
}

export {
  getAutoUpdateConfig,
  setAutoUpdateConfig,
  getAutoUpdateEnabledServers,
  updateLastCheckTime,
  updateLastAppliedTime,
};
