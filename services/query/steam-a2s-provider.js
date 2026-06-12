/**
 * Steam A2S (Source Server Query) Provider
 *
 * Queries game servers using the Steam A2S protocol. This works for
 * many Steam-based game servers including V Rising, Conan Exiles, etc.
 *
 * NOTE: This provider requires a Steam A2S library such as `steam-query`
 * or `gamedig`. Install one with:
 *   npm install gamedig
 *
 * Then uncomment the imports and implementation below.
 */
// import Gamedig from 'gamedig';
import { QueryProvider } from './base-provider.js';
import logger from '../../utils/logger.js';

export class SteamA2sQueryProvider extends QueryProvider {
  get id() { return 'steam-a2s'; }

  constructor(options = {}) {
    super();
    this.port = options.port || 27015;
    this.socketTimeout = options.socketTimeout || 5000;
    this.gamedigType = options.gamedigType || null;
  }

  async query(sessionName, _options = {}) {
    // Stub: Steam A2S queries require a `gamedig` or `steam-query` npm package.
    // Protocol: UDP query to the game's query port using the A2S_INFO packet.
    //
    // When gamedig is installed, implementation would be:
    //   const result = await Gamedig.query({
    //     type: this.gamedigType || sessionName,
    //     host: '...',
    //     port: this.port,
    //     socketTimeout: this.socketTimeout,
    //   });
    //   return { sessionName, map, players, maxPlayers, ... };
    logger.warn(`[SteamA2sQueryProvider] query() not implemented — gamedig not installed`);
    return null;
  }

  async queryAddress(host, port, _options = {}) {
    logger.warn(`[SteamA2sQueryProvider] queryAddress() not implemented — gamedig not installed`);
    return null;
  }
}

export const steamA2sQueryProvider = new SteamA2sQueryProvider();
