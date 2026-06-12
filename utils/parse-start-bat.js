import fs from 'fs/promises';
import path from 'path';

/**
 * Parses a start.bat file and extracts server config values.
 * Supports both ARK-specific format (ArkAscendedServer.exe with URL params)
 * and a generic fallback for any game server executable.
 * @param {string} filePath - Path to the start.bat file
 * @returns {Promise<object>} Parsed config object
 */
export async function parseStartBat(filePath) {
  const content = await fs.readFile(filePath, 'utf8');

  // Try ARK-specific format first
  const arkMatch = content.match(/ArkAscendedServer\.exe"\s+"([^"]+)"([^\n]*)/i);
  if (arkMatch) {
    return parseArkStartBat(content, arkMatch);
  }

  // Generic fallback: find any .exe launch line and extract -key=value args
  const exeMatch = content.match(/"([^"]+\.exe)"\s+(.*)/i);
  if (exeMatch) {
    return parseGenericStartBat(content, exeMatch);
  }

  // Last resort: find any line with -- or - flags
  const flagLineMatch = content.match(/^[^@]*(?:--|-{1,2})(\w+)[= ]/m);
  if (flagLineMatch) {
    const line = flagLineMatch.input.split('\n').find(l =>
      l.includes(flagLineMatch[0].trim().split('=')[0])
    );
    if (line) {
      return parseGenericStartBat(content, [null, null, line.trim()]);
    }
  }

  throw new Error('No executable launch line found in ' + path.basename(filePath));
}

/**
 * Parse ARK-specific start.bat (ArkAscendedServer.exe with URL-style params)
 */
function parseArkStartBat(content, match) {
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

/**
 * Generic fallback: parse any start.bat with -key=value style arguments
 */
function parseGenericStartBat(content, match) {
  const config = {};
  const fullArgs = match[2] || content;

  // Extract binary name
  if (match[1]) {
    config.binaryName = path.basename(match[1]);
  }

  // Extract common -key=value and -key value patterns
  const argRegex = /[-](\w+)[= ]"?([^\s"]+)"?/g;
  let argMatch;
  while ((argMatch = argRegex.exec(fullArgs)) !== null) {
    const key = argMatch[1].toLowerCase();
    const value = argMatch[2];
    switch (key) {
      case 'port':
      case 'gameport':
        config.gamePort = parseInt(value, 10);
        break;
      case 'queryport':
        config.queryPort = parseInt(value, 10);
        break;
      case 'rconport':
        config.rconPort = parseInt(value, 10);
        break;
      case 'maxplayers':
      case 'winliveplayers':
        config.maxPlayers = parseInt(value, 10);
        break;
      case 'sessionname':
      case 'servername':
        config.name = value;
        break;
      case 'serverpassword':
        config.serverPassword = value;
        break;
      case 'adminpassword':
      case 'serveradminpassword':
        config.adminPassword = value;
        break;
      case 'map':
        config.map = value;
        break;
      case 'nobattleye':
      case 'nobattleeye':
        config.disableBattleEye = true;
        break;
    }
  }

  // Try to extract a server name from the command line or file title
  if (!config.name) {
    const titleMatch = content.match(/title\s+([^\r\n]+)/i);
    if (titleMatch) {
      config.name = titleMatch[1].trim();
    }
  }

  return config;
}

// Example usage:
// const config = await parseStartBat('D:/ARK/clusters/iLGaming/iLGaming-The Island/start.bat');
// console.log(config); 
