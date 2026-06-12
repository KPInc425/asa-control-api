/**
 * Abstract Game Adapter
 *
 * Each supported game implements this interface to provide game-specific
 * binaries, config files, startup scripts, query methods, and defaults.
 * The rest of the system delegates to the adapter through the game registry.
 */
export class GameAdapter {
  constructor() {
    if (this.constructor === GameAdapter) {
      throw new Error('GameAdapter is abstract — subclass it');
    }
  }

  // -------------------------------------------------------------------------
  // Identity (required overrides)
  // -------------------------------------------------------------------------

  /** @returns {string} Machine-readable game type, e.g. 'ark' */
  get id() { throw unimplemented('id'); }

  /** @returns {string} Human-readable game name, e.g. 'ARK: Survival Ascended' */
  get name() { throw unimplemented('name'); }

  // -------------------------------------------------------------------------
  // Files & paths (required overrides)
  // -------------------------------------------------------------------------

  /**
   * Array of config file names this game uses.
   * @returns {string[]}
   */
  get configFiles() { throw unimplemented('configFiles'); }

  /**
   * Relative path from the server root directory to the config folder.
   * @returns {string}
   */
  get configSubPath() { throw unimplemented('configSubPath'); }

  // -------------------------------------------------------------------------
  // Process & binary (required overrides)
  // -------------------------------------------------------------------------

  /** @returns {string} Server executable filename, e.g. 'ArkAscendedServer.exe' */
  get binaryName() { throw unimplemented('binaryName'); }

  /**
   * Process name(s) to match for `Get-Process` / `tasklist`.
   * Usually the binary name without extension, but may be different.
   * @returns {string[]}
   */
  get processNames() { throw unimplemented('processNames'); }

  /** @returns {string|null} Steam App ID for auto-updates, or null if N/A */
  get steamAppId() { throw unimplemented('steamAppId'); }

  // -------------------------------------------------------------------------
  // Ports (required overrides)
  // -------------------------------------------------------------------------

  /**
   * Default port map for the game.
   * @returns {{ game: number, query: number, rcon: number }}
   */
  get defaultPorts() { throw unimplemented('defaultPorts'); }

  // -------------------------------------------------------------------------
  // Capabilities (optional overrides — default to false)
  // -------------------------------------------------------------------------

  /** @returns {boolean} Whether this game supports cross-server clustering */
  get canCluster() { return false; }

  /** @returns {boolean} Whether this game uses Steam Workshop mods */
  get supportsSteamWorkshop() { return false; }

  /** @returns {boolean} Whether this game has an in-game RCON interface */
  get supportsRcon() { return false; }

  /** @returns {boolean} Whether this game has a browser-based server query */
  get supportsQuery() { return false; }

  // -------------------------------------------------------------------------
  // Config validation (optional override)
  // -------------------------------------------------------------------------

  /**
   * Check whether the given filename is a valid config file for this game.
   * @param {string} fileName
   * @returns {boolean}
   */
  isValidConfigFile(fileName) {
    return this.configFiles.includes(fileName);
  }

  // -------------------------------------------------------------------------
  // Config generation (optional override)
  // -------------------------------------------------------------------------

  /**
   * Generate default content for each config file.
   * @param {object} options - Server creation options (map, name, cluster, etc.)
   * @returns {Promise<Record<string, string>>} Map of filename → content
   */
  async generateConfigFiles(options = {}) {
    return {};
  }

  // -------------------------------------------------------------------------
  // Script generation (optional override)
  // -------------------------------------------------------------------------

  /**
   * Build the startup script content.
   * @param {object} options
   * @param {string} options.binariesPath
   * @param {string} options.configsPath
   * @param {string} options.savesPath
   * @param {string} options.logsPath
   * @param {number}  options.gamePort
   * @param {number}  options.queryPort
   * @param {number}  options.rconPort
   * @param {number}  options.maxPlayers
   * @param {string}  options.adminPassword
   * @param {string}  options.serverPassword
   * @param {string}  options.rconPassword
   * @param {string}  options.clusterId
   * @param {string}  options.clusterPassword
   * @param {string}  options.map
   * @param {string}  options.modsArg
   * @param {boolean} options.disableBattleEye
   * @param {string}  options.customDynamicConfigUrl
   * @returns {Promise<string>} Raw script content
   */
  async buildStartScript(options) {
    return '';
  }

  /**
   * Build the stop script content.
   * @param {object} options
   * @param {string} options.binaryName
   * @param {string[]} options.processNames
   * @returns {Promise<string>}
   */
  async buildStopScript(options) {
    return '';
  }

  // -------------------------------------------------------------------------
  // Server query (optional override)
  // -------------------------------------------------------------------------

  /**
   * Query the game's server browser for live stats.
   * @param {string} sessionName
   * @returns {Promise<object|null>}
   */
  async queryServer(sessionName) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Environment variables block name (for config/index.js)
  // -------------------------------------------------------------------------

  /** @returns {string} Key used in the global config, e.g. 'ark' */
  get configBlock() { return this.id; }

  /**
   * Return a partial config block to merge into config/index.js.
   * @returns {object}
   */
  getConfigDefaults() {
    return {
      configSubPath: this.configSubPath,
      defaultConfigFiles: [...this.configFiles],
      defaultPorts: { ...this.defaultPorts },
    };
  }
}

function unimplemented(name) {
  return new Error(`GameAdapter subclass must implement ${name}`);
}
