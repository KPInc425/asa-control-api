/**
 * Firewall Utility
 * Automatically adds Windows Firewall rules for game server ports
 * so users don't have to manually approve each new server.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';

const execAsync = promisify(exec);

const RULE_PREFIX = 'ASA-Managed';

/**
 * Ensure Windows Firewall allows traffic on the given port.
 * Creates an inbound TCP+UDP rule if one doesn't already exist.
 *
 * @param {number} port
 * @param {string} [ruleName]  Optional display name (defaults to ASA-Managed Port {port})
 * @returns {Promise<boolean>}  Whether the rule was created
 */
export async function allowPort(port, ruleName) {
  const name = ruleName || `${RULE_PREFIX} Port ${port}`;

  try {
    // Check if rule already exists
    const { stdout } = await execAsync(
      `netsh advfirewall firewall show rule name="${name}"`,
    );
    if (stdout.includes('Rule Name:')) {
      logger.debug(`Firewall rule already exists: ${name}`);
      return true;
    }
  } catch {
    // Rule doesn't exist — continue to create it
  }

  try {
    // Create inbound rule for both TCP and UDP on this port
    await execAsync(
      `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port} description="ASA Managed Server Port ${port}" enable=yes`,
    );
    await execAsync(
      `netsh advfirewall firewall add rule name="${name}-UDP" dir=in action=allow protocol=UDP localport=${port} description="ASA Managed Server Port ${port} (UDP)" enable=yes`,
    );
    logger.info(`Created firewall rule for port ${port} (TCP+UDP)`);
    return true;
  } catch (error) {
    // Silently ignore permission errors — user can run firewall script manually
    if (error.message?.includes('access is denied') || error.message?.includes('required')) {
      logger.warn(`Cannot create firewall rule for port ${port} — run as Administrator to auto-allow ports.`);
    } else {
      logger.warn(`Failed to create firewall rule for port ${port}: ${error.message}`);
    }
    return false;
  }
}

/**
 * Ensure Windows Firewall allows traffic for an executable.
 *
 * @param {string} exePath   Full path to the executable
 * @param {string} [ruleName]
 * @returns {Promise<boolean>}
 */
export async function allowProgram(exePath, ruleName) {
  const name = ruleName || `${RULE_PREFIX} ${exePath.replace(/[:\\/]/g, '-')}`;

  try {
    const { stdout } = await execAsync(
      `netsh advfirewall firewall show rule name="${name}"`,
    );
    if (stdout.includes('Rule Name:')) {
      logger.debug(`Firewall rule already exists: ${name}`);
      return true;
    }
  } catch {
    // Continue
  }

  try {
    await execAsync(
      `netsh advfirewall firewall add rule name="${name}" dir=in action=allow program="${exePath}" description="ASA Managed Server Executable" enable=yes`,
    );
    await execAsync(
      `netsh advfirewall firewall add rule name="${name}-Out" dir=out action=allow program="${exePath}" description="ASA Managed Server Executable" enable=yes`,
    );
    logger.info(`Created firewall rules for program: ${exePath}`);
    return true;
  } catch (error) {
    if (error.message?.includes('access is denied')) {
      logger.warn(`Cannot create firewall rule for ${exePath} — run as Administrator.`);
    } else {
      logger.warn(`Failed to create firewall rule: ${error.message}`);
    }
    return false;
  }
}

/**
 * Convenience: allow all standard ARK server ports for a given server.
 * Game port (default 7777), Query port (+1), RCON port (+2).
 *
 * @param {object} opts  { gamePort, queryPort, rconPort, serverName }
 */
export async function allowArkServerPorts({ gamePort, queryPort, rconPort, serverName }) {
  const label = serverName ? `ASA-${serverName.replace(/[^a-zA-Z0-9]/g, '-')}` : RULE_PREFIX;

  const results = await Promise.allSettled([
    allowPort(gamePort,  `${label} Game`),
    allowPort(queryPort, `${label} Query`),
    allowPort(rconPort,  `${label} RCON`),
  ]);

  const ok = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  logger.info(`Firewall: ${ok}/3 rules ensured for ${serverName || 'server'} (ports ${gamePort}, ${queryPort}, ${rconPort})`);
}

export default { allowPort, allowProgram, allowArkServerPorts };