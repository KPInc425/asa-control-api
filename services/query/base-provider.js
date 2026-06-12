/**
 * Base Query Provider
 *
 * Abstract class for server browser query providers. Each provider
 * implements a specific query protocol (EOS, Steam A2S, etc.) and
 * returns normalized server status data.
 */

export class QueryProvider {
  constructor() {
    if (this.constructor === QueryProvider) {
      throw new Error('QueryProvider is abstract — subclass it');
    }
  }

  /** @returns {string} Provider identifier, e.g. 'eos', 'steam-a2s' */
  get id() {
    throw new Error('QueryProvider subclass must implement id');
  }

  /**
   * Query a server by session/game name.
   * @param {string} sessionName - Server session name to look up
   * @param {object} [options] - Provider-specific options
   * @returns {Promise<import('./types.js').QueryResult|null>}
   */
  async query(sessionName, options = {}) {
    throw new Error('QueryProvider subclass must implement query()');
  }

  /**
   * Query a server by direct address (host:port).
   * @param {string} host
   * @param {number} port
   * @param {object} [options]
   * @returns {Promise<import('./types.js').QueryResult|null>}
   */
  async queryAddress(host, port, options = {}) {
    throw new Error('QueryProvider subclass must implement queryAddress()');
  }
}

/**
 * Normalised query result shape.
 * @typedef {object} QueryResult
 * @property {string}   sessionName
 * @property {string}   [map]
 * @property {string}   [day]
 * @property {string}   [version]
 * @property {number|string} [players]
 * @property {number|string} [maxPlayers]
 * @property {string}   [started]
 * @property {string}   [lastUpdated]
 * @property {object}   [raw]
 */
