/**
 * EOS (Epic Online Services) Query Provider
 *
 * Uses the `asa-query` npm package to query ARK servers via EOS.
 * This is the standard query method for ARK: Survival Ascended.
 */
import AsaQuery from 'asa-query';
import { QueryProvider } from './base-provider.js';
import logger from '../../utils/logger.js';

export class EosQueryProvider extends QueryProvider {
  get id() { return 'eos'; }

  async query(sessionName, _options = {}) {
    try {
      const query = new AsaQuery();
      const res = await query
        .unofficial()
        .serverNameContains(sessionName)
        .exec();

      if (!res.sessions || res.sessions.length === 0) return null;

      const lower = sessionName.toLowerCase();
      let best =
        res.sessions.find(
          (s) => (s.attributes?.SESSIONNAME_s || '').toLowerCase() === lower,
        ) ||
        res.sessions.find(
          (s) =>
            (s.attributes?.SESSIONNAME_s || '').toLowerCase().startsWith(lower),
        ) ||
        res.sessions[0];

      if (!best) return null;

      const attrs = best.attributes || {};
      const settings = best.settings || {};

      let version = 'N/A';
      if (attrs.BUILDID_s && attrs.MINORBUILDID_s) {
        version = `${attrs.BUILDID_s}.${attrs.MINORBUILDID_s}`;
      } else if (attrs.BUILDID_s) {
        version = attrs.BUILDID_s;
      }

      return {
        sessionName: attrs.SESSIONNAME_s || attrs.CUSTOMSERVERNAME_s || best.id,
        map: attrs.MAPNAME_s || attrs.FRIENDLYMAPNAME_s || 'N/A',
        day: attrs.DAYTIME_s || 'N/A',
        version,
        players:
          typeof best.totalPlayers === 'number'
            ? best.totalPlayers
            : Array.isArray(best.publicPlayers)
              ? best.publicPlayers.length
              : 'N/A',
        maxPlayers: settings.maxPublicPlayers || attrs.maxPublicPlayers || 'N/A',
        started: best.started || 'N/A',
        lastUpdated: best.lastUpdated || 'N/A',
        raw: best,
      };
    } catch (error) {
      logger.error(`[EosQueryProvider] Error querying ${sessionName}:`, error);
      return null;
    }
  }

  async queryAddress(host, port, _options = {}) {
    try {
      const query = new AsaQuery();
      const res = await query.address(host, port).exec();

      if (!res.sessions || res.sessions.length === 0) return null;

      const entry = res.sessions[0];
      const attrs = entry.attributes || {};
      const settings = entry.settings || {};

      return {
        sessionName: attrs.SESSIONNAME_s || attrs.CUSTOMSERVERNAME_s || entry.id,
        map: attrs.MAPNAME_s || attrs.FRIENDLYMAPNAME_s || 'N/A',
        day: attrs.DAYTIME_s || 'N/A',
        version:
          attrs.BUILDID_s && attrs.MINORBUILDID_s
            ? `${attrs.BUILDID_s}.${attrs.MINORBUILDID_s}`
            : attrs.BUILDID_s || 'N/A',
        players:
          typeof entry.totalPlayers === 'number'
            ? entry.totalPlayers
            : Array.isArray(entry.publicPlayers)
              ? entry.publicPlayers.length
              : 'N/A',
        maxPlayers: settings.maxPublicPlayers || attrs.maxPublicPlayers || 'N/A',
        started: entry.started || 'N/A',
        lastUpdated: entry.lastUpdated || 'N/A',
        raw: entry,
      };
    } catch (error) {
      logger.error(`[EosQueryProvider] Error querying ${host}:${port}:`, error);
      return null;
    }
  }
}

export const eosQueryProvider = new EosQueryProvider();
