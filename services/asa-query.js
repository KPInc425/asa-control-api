import AsaQuery from 'asa-query';
import logger from '../utils/logger.js';

/**
 * Query ASA server browser for live stats by session name (case-insensitive, partial match)
 * @param {string} sessionName - The (partial) session name to search for
 * @returns {Promise<object|null>} - Stats object or null if not found
 */
export async function getServerLiveStats(sessionName) {
  try {
    const query = new AsaQuery();
    // Use unofficial() to avoid official servers, and search by session name substring
    const res = await query.unofficial().serverNameContains(sessionName).exec();
    logger.info(`[asa-query] Queried for session name: ${sessionName}, found ${res.sessions?.length || 0} servers`);
    if (res.sessions && res.sessions.length > 0) {
      // Try to find the best match (case-insensitive, prefer exact or startsWith)
      const lower = sessionName.toLowerCase();
      let best = res.sessions.find(s =>
        (s.attributes?.SESSIONNAME_s || '').toLowerCase() === lower
      ) || res.sessions.find(s =>
        (s.attributes?.SESSIONNAME_s || '').toLowerCase().startsWith(lower)
      ) || res.sessions[0];
      if (best) {
        // Extract useful stats
        const attrs = best.attributes || {};
        const settings = best.settings || {};
        // --- Version as float string ---
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
          players: typeof best.totalPlayers === 'number' ? best.totalPlayers : (Array.isArray(best.publicPlayers) ? best.publicPlayers.length : 'N/A'),
          maxPlayers: settings.maxPublicPlayers || attrs.maxPublicPlayers || 'N/A',
          started: best.started || 'N/A',
          lastUpdated: best.lastUpdated || 'N/A',
          raw: best
        };
      }
    }
    return null;
  } catch (error) {
    logger.error(`[asa-query] Error fetching live stats for ${sessionName}:`, error);
    return null;
  }
} 
