import fs from 'fs/promises';
import path from 'path';

/**
 * Parses a start.bat file and extracts server config values.
 * @param {string} filePath - Path to the start.bat file
 * @returns {Promise<object>} Parsed config object
 */
export async function parseStartBat(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  // Find the ArkAscendedServer.exe launch line
  const match = content.match(/ArkAscendedServer\.exe"\s+"([^"]+)"([^\n]*)/i);
  if (!match) throw new Error('No ArkAscendedServer.exe launch line found');
  const argsString = match[1];
  const trailingArgs = match[2] || '';

  // Split the argsString by ? to get key-value pairs
  const [mapPart, ...params] = argsString.split('?');
  const map = mapPart.replace(/_WP$/, '');
  const config = { map };

  for (const param of params) {
    const [key, value] = param.split('=');
    if (!key) continue;
    switch (key.toLowerCase()) {
      case 'sessionname': config.name = value; break;
      case 'port': config.gamePort = parseInt(value, 10); break;
      case 'queryport': config.queryPort = parseInt(value, 10); break;
      case 'rconport': config.rconPort = parseInt(value, 10); break;
      case 'rconenabled': config.rconEnabled = value === 'True'; break;
      case 'maxplayers': config.maxPlayers = parseInt(value, 10); break;
      case 'serverpassword': config.serverPassword = value; break;
      case 'customdynamicconfigurl':
        // Remove both escaped and unescaped double quotes
        config.customDynamicConfigUrl = value.replace(/\\?"/g, '');
        break;
      case 'clusterid': config.clusterId = value; break;
      default:
        // ignore
    }
  }

  // Parse trailing args for mods, BattleEye, etc.
  // Mods: -mods=123,456,789
  const modsMatch = trailingArgs.match(/-mods=([\d,]+)/i);
  if (modsMatch) {
    config.mods = modsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  // BattleEye: -NoBattleEye
  config.disableBattleEye = /-NoBattleEye/i.test(trailingArgs);

  // ClusterDirOverride: -ClusterDirOverride=...
  const clusterDirMatch = trailingArgs.match(/-ClusterDirOverride=([^\s]+)/i);
  if (clusterDirMatch) {
    // Use single backslash for Windows paths
    config.clusterDirOverride = clusterDirMatch[1].replace(/\\/g, '\\');
  }

  return config;
}

// Example usage:
// const config = await parseStartBat('D:/ARK/clusters/iLGaming/iLGaming-The Island/start.bat');
// console.log(config); 
