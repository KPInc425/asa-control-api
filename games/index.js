/**
 * Game Registry
 *
 * Singleton registry for game adapters. Any service that needs game-specific
 * behaviour looks it up here by game type. If no adapter is registered for
 * a given type, falls back to the 'ark' adapter for backward compatibility.
 */
import logger from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

class GameRegistry {
  constructor() {
    /** @type {Record<string, import('./game-adapter.js').GameAdapter>} */
    this._adapters = {};
    this._initialized = false;
  }

  // -----------------------------------------------------------------------
  // Lazy initialization — avoid TDZ from circular imports
  // -----------------------------------------------------------------------

  async ensureBuiltins() {
    if (this._initialized) return;
    this._initialized = true;
    const { arkAdapter } = await import("./ark.js");
    this._adapters["ark"] = arkAdapter;
    logger.info(
      `[GameRegistry] Registered built-in adapter: ark (${arkAdapter.name})`,
    );

    // Pre-cache dynamic dependencies for synchronous on-the-fly loading
    const { getAllGameDefinitions } = await import("../services/database.js");
    const { DynamicGameAdapter } = await import("./dynamic-game-adapter.js");
    this._dbGetAll = getAllGameDefinitions;
    this._DynamicGameAdapter = DynamicGameAdapter;

    // Load dynamic game definitions from the database
    await this.reloadFromDb();
  }

  /**
   * Reload all game definitions from the database and (re-)register them.
   * Called automatically by ensureBuiltins() and after any CRUD operation.
   */
  async reloadFromDb() {
    try {
      const rows = this._dbGetAll();

      // Remove previously registered dynamic adapters (those with dynamic=true)
      for (const [id, adapter] of Object.entries(this._adapters)) {
        if (adapter.dynamic) {
          delete this._adapters[id];
        }
      }

      for (const row of rows) {
        try {
          const adapter = new this._DynamicGameAdapter(row);
          this._adapters[row.game_type] = adapter;
          logger.info(
            `[GameRegistry] Registered dynamic adapter: ${row.game_type} (${row.display_name})`,
          );
        } catch (innerErr) {
          logger.error(
            `[GameRegistry] Failed to build adapter for "${row.game_type}":`,
            innerErr,
          );
        }
      }
    } catch (err) {
      logger.error("[GameRegistry] Failed to reload from DB:", err);
    }
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a game adapter.
   * @param {import('./game-adapter.js').GameAdapter} adapter
   */
  register(adapter) {
    const id = adapter.id;
    this._adapters[id] = adapter;
    logger.info(
      `[GameRegistry] Registered game adapter: ${id} (${adapter.name})`,
    );
  }

  /**
   * Unregister a game adapter by ID.
   * @param {string} id
   */
  unregister(id) {
    delete this._adapters[id];
    logger.info(`[GameRegistry] Unregistered game adapter: ${id}`);
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Get the adapter for a given game type.
   *
   * Falls back to the ARK adapter when `gameType` is unrecognised so that
   * existing servers (which have no game_type stored) continue to work.
   *
   * @param {string} [gameType='ark'] - Game type identifier
   * @returns {import('./game-adapter.js').GameAdapter}
   */
  get(gameType) {
    if (!gameType || !this._adapters[gameType]) {
      // On-the-fly lookup from DB for unknown game types (synchronous)
      if (gameType && gameType !== "ark") {
        this._tryLoadFromDb(gameType);
      }

      if (!gameType || !this._adapters[gameType]) {
        // Backward compatibility — existing data defaults to ARK
        if (gameType && gameType !== "ark") {
          logger.warn(
            `[GameRegistry] Unknown game type "${gameType}", falling back to "ark"`,
          );
        }
        return this._adapters["ark"];
      }
    }
    return this._adapters[gameType];
  }

  /**
   * Try to load a single game definition from the DB on-the-fly.
   * Synchronous because better-sqlite3 is sync and dependencies are cached
   * by ensureBuiltins().
   * @param {string} gameType
   */
  _tryLoadFromDb(gameType) {
    if (!this._DynamicGameAdapter) return;
    try {
      // Dynamically import getGameDefinition (cached after first import)
      import("../services/database.js").then(({ getGameDefinition }) => {
        const row = getGameDefinition(gameType);
        if (row) {
          const adapter = new this._DynamicGameAdapter(row);
          this._adapters[row.game_type] = adapter;
          logger.info(
            `[GameRegistry] Loaded dynamic adapter on-the-fly: ${row.game_type}`,
          );
        }
      });
    } catch (err) {
      logger.error(
        `[GameRegistry] On-the-fly load failed for "${gameType}":`,
        err,
      );
    }
  }

  /**
   * Return all registered adapter IDs.
   * @returns {string[]}
   */
  get ids() {
    return Object.keys(this._adapters);
  }

  /**
   * Return all registered adapter instances.
   * @returns {import('./game-adapter.js').GameAdapter[]}
   */
  get all() {
    return Object.values(this._adapters);
  }

  /**
   * Check whether an adapter is registered for the given type.
   * @param {string} gameType
   * @returns {boolean}
   */
  has(gameType) {
    return !!this._adapters[gameType];
  }
}

// ---------------------------------------------------------------------------
// Singleton — created empty, populated lazily by ensureBuiltins()
// ---------------------------------------------------------------------------

export const gameRegistry = new GameRegistry();

/**
 * Convenience — shorthand for `gameRegistry.get(type)`
 * @param {string} [gameType='ark']
 * @returns {import('./game-adapter.js').GameAdapter}
 */
export function gameFor(gameType) {
  return gameRegistry.get(gameType);
}
