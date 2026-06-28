import { db } from "./connection.js";

/**
 * Insert or update a game definition.
 * @param {object} def - Game definition fields
 */
function upsertGameDefinition(def) {
  const stmt = db.prepare(`
    INSERT INTO game_definitions (
      game_type, display_name, binary_name, process_names,
      steam_app_id, config_files, config_sub_path,
      default_game_port, default_query_port, default_rcon_port,
      can_cluster, supports_steam_workshop, supports_rcon, supports_query,
      binary_exe_relative_path, install_script_template,
      start_script_template, stop_script_template
    ) VALUES (
      @game_type, @display_name, @binary_name, @process_names,
      @steam_app_id, @config_files, @config_sub_path,
      @default_game_port, @default_query_port, @default_rcon_port,
      @can_cluster, @supports_steam_workshop, @supports_rcon, @supports_query,
      @binary_exe_relative_path, @install_script_template,
      @start_script_template, @stop_script_template
    )
    ON CONFLICT(game_type) DO UPDATE SET
      display_name = excluded.display_name,
      binary_name = excluded.binary_name,
      process_names = excluded.process_names,
      steam_app_id = excluded.steam_app_id,
      config_files = excluded.config_files,
      config_sub_path = excluded.config_sub_path,
      default_game_port = excluded.default_game_port,
      default_query_port = excluded.default_query_port,
      default_rcon_port = excluded.default_rcon_port,
      can_cluster = excluded.can_cluster,
      supports_steam_workshop = excluded.supports_steam_workshop,
      supports_rcon = excluded.supports_rcon,
      supports_query = excluded.supports_query,
      binary_exe_relative_path = excluded.binary_exe_relative_path,
      install_script_template = excluded.install_script_template,
      start_script_template = excluded.start_script_template,
      stop_script_template = excluded.stop_script_template,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run({
    game_type: def.game_type,
    display_name: def.display_name,
    binary_name: def.binary_name,
    process_names: JSON.stringify(def.process_names || []),
    steam_app_id: def.steam_app_id || null,
    config_files: JSON.stringify(def.config_files || []),
    config_sub_path: def.config_sub_path || "",
    default_game_port: def.default_game_port ?? 7777,
    default_query_port: def.default_query_port ?? 27015,
    default_rcon_port: def.default_rcon_port ?? 25575,
    can_cluster: def.can_cluster ? 1 : 0,
    supports_steam_workshop: def.supports_steam_workshop ? 1 : 0,
    supports_rcon: def.supports_rcon !== false ? 1 : 0,
    supports_query: def.supports_query ? 1 : 0,
    binary_exe_relative_path: def.binary_exe_relative_path || null,
    install_script_template: def.install_script_template || null,
    start_script_template: def.start_script_template || null,
    stop_script_template: def.stop_script_template || null,
  });
}

/**
 * Get a game definition by game_type.
 * @param {string} gameType
 */
function getGameDefinition(gameType) {
  const stmt = db.prepare("SELECT * FROM game_definitions WHERE game_type = ?");
  return stmt.get(gameType);
}

/**
 * Get all game definitions.
 */
function getAllGameDefinitions() {
  const stmt = db.prepare(
    "SELECT * FROM game_definitions ORDER BY display_name ASC",
  );
  return stmt.all();
}

/**
 * Delete a game definition by game_type.
 * @param {string} gameType
 */
function deleteGameDefinition(gameType) {
  const stmt = db.prepare("DELETE FROM game_definitions WHERE game_type = ?");
  return stmt.run(gameType);
}

/**
 * Check if a game definition exists.
 * @param {string} gameType
 * @returns {boolean}
 */
function gameDefinitionExists(gameType) {
  const stmt = db.prepare("SELECT 1 FROM game_definitions WHERE game_type = ?");
  return !!stmt.get(gameType);
}

export {
  upsertGameDefinition,
  getGameDefinition,
  getAllGameDefinitions,
  deleteGameDefinition,
  gameDefinitionExists,
};
