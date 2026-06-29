/**
 * Data Extractor Module
 *
 * Extracts player, performance, and game data from probe sources.
 */

import { ServerStatus } from '../../utils/statusContract.js';
import { IntentType } from './config.js';

export class DataExtractor {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Extract player data from sources
   * @param {Object} sources - Data sources
   * @returns {Object} Player data
   */
  extractPlayerData(sources) {
    const { rcon, query } = sources;

    // Prefer RCON data for player info
    if (rcon?.players) {
      return {
        online: rcon.playerCount || (Array.isArray(rcon.players) ? rcon.players.length : 0),
        max: rcon.maxPlayers || 70,
        list: Array.isArray(rcon.players) ? rcon.players : undefined
      };
    }

    // Fall back to query data
    if (query) {
      return {
        online: query.players || 0,
        max: query.maxPlayers || 70
      };
    }

    return { online: 0, max: 70 };
  }

  /**
   * Extract performance data from sources
   * @param {Object} sources - Data sources
   * @param {Object} state - Server state
   * @returns {Object} Performance data
   */
  extractPerformanceData(sources, state) {
    const { process: processData } = sources;

    if (processData?.stats) {
      return {
        cpu: processData.stats.cpu,
        memory: processData.stats.memory,
        uptime: processData.stats.uptime
      };
    }

    // Calculate uptime from last successful probe or intent
    if (state.lastIntent?.action === IntentType.START && state.lastKnownStatus === ServerStatus.RUNNING) {
      const startTime = new Date(state.lastIntent.timestamp);
      const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
      return { uptime };
    }

    return undefined;
  }

  /**
   * Extract game data from sources
   * @param {Object} sources - Data sources
   * @returns {Object} Game data
   */
  extractGameData(sources) {
    const { rcon, query } = sources;

    if (query) {
      return {
        map: query.map,
        day: typeof query.day === 'number' ? query.day : undefined,
        version: query.version
      };
    }

    if (rcon?.serverInfo) {
      return {
        map: rcon.serverInfo.map,
        day: rcon.serverInfo.day,
        version: rcon.serverInfo.version
      };
    }

    return undefined;
  }
}
