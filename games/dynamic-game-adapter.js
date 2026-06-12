/**
 * Dynamic Game Adapter
 *
 * Wraps a row from the game_definitions database table into a GameAdapter
 * instance so that admins can add new games through the dashboard without
 * writing any code.
 */
import { GameAdapter } from "./game-adapter.js";

export class DynamicGameAdapter extends GameAdapter {
  constructor(dbRow) {
    super();
    this._row = dbRow;
    this._processNames = JSON.parse(dbRow.process_names || "[]");
    this._configFiles = JSON.parse(dbRow.config_files || "[]");
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  get id() {
    return this._row.game_type;
  }

  get name() {
    return this._row.display_name;
  }

  /** Whether this adapter was created at runtime from the DB (always true) */
  get dynamic() {
    return true;
  }

  // -------------------------------------------------------------------------
  // Files & paths
  // -------------------------------------------------------------------------

  get binaryName() {
    return this._row.binary_name;
  }

  get binaryExeRelPath() {
    return this._row.binary_exe_relative_path || this.binaryName;
  }

  get processNames() {
    return this._processNames;
  }

  get steamAppId() {
    return this._row.steam_app_id || null;
  }

  get configFiles() {
    return this._configFiles;
  }

  get configSubPath() {
    return this._row.config_sub_path || "";
  }

  // -------------------------------------------------------------------------
  // Ports
  // -------------------------------------------------------------------------

  get defaultPorts() {
    return {
      game: this._row.default_game_port || 7777,
      query: this._row.default_query_port || 27015,
      rcon: this._row.default_rcon_port || 25575,
    };
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  get canCluster() {
    return !!this._row.can_cluster;
  }

  get supportsSteamWorkshop() {
    return !!this._row.supports_steam_workshop;
  }

  get supportsRcon() {
    return !!this._row.supports_rcon;
  }

  get supportsQuery() {
    return !!this._row.supports_query;
  }

  // -------------------------------------------------------------------------
  // Script templates
  // -------------------------------------------------------------------------

  buildInstallScript(installDir) {
    const template =
      this._row.install_script_template ||
      [
        "@ShutdownOnFailedCommand 1",
        "@NoPromptForPassword 1",
        `force_install_dir "${installDir}"`,
        "login anonymous",
        "app_update {{app_id}}",
        "quit",
      ].join("\n");

    return template
      .replace(/{{app_id}}/g, this.steamAppId)
      .replace(/{{install_dir}}/g, installDir);
  }

  async buildStartScript(options = {}) {
    const template = this._row.start_script_template;
    if (template) {
      return this._interpolateTemplate(template, options);
    }
    // Default fallback — a generic start script
    const {
      binariesPath,
      binaryName = this.binaryName,
      binaryExePath = this.binaryExeRelPath,
      gamePort = this.defaultPorts.game,
      queryPort = this.defaultPorts.query,
      rconPort = this.defaultPorts.rcon,
      serverName = "Server",
    } = options;

    const exePath = binaryExePath
      ? `"${binariesPath}/${binaryExePath}"`
      : `"${binariesPath}/${binaryName}"`;

    return [
      "@echo off",
      `title ${serverName}`,
      `cd /d "${binariesPath}"`,
      "",
      ":start",
      `${exePath} -port=${gamePort} -queryport=${queryPort} -rconport=${rconPort}`,
      "",
      "echo Restarting server...",
      "timeout /t 5",
      "goto start",
    ].join("\n");
  }

  async buildStopScript(options = {}) {
    const template = this._row.stop_script_template;
    if (template) {
      return this._interpolateTemplate(template, options);
    }
    const procNames = options.processNames || this.processNames;
    const psName = procNames[0] || this.binaryName.replace(/\.exe$/i, "");
    return [
      "@echo off",
      `echo Stopping ${this.name} server...`,
      "",
      `taskkill /F /IM "${psName}.exe" 2>nul`,
      `taskkill /F /IM "${psName}" 2>nul`,
      "",
      "echo Server stopped.",
    ].join("\n");
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Simple mustache-style template replacement.
   * @param {string} template
   * @param {object} vars
   * @returns {string}
   */
  _interpolateTemplate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = vars[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }
}
