/**
 * RconService — Facade
 *
 * Thin delegation layer over the rcon/ module sub-components.
 * All logic lives in the modules under services/rcon/.
 */
import { RconConnection } from './rcon/connection.js';
import { RconCache } from './rcon/cache.js';
import { RconCommands } from './rcon/commands.js';
import { RconParser } from './rcon/parser.js';

class RconService {
  constructor() {
    this.cache = new RconCache(this);
    this.connection = new RconConnection(this);
    this.parser = new RconParser(this);
    this.commands = new RconCommands(this);
  }

  // ── Connection ──────────────────────────────────────────────
  getConnection(containerName, options) {
    return this.connection.getConnection(containerName, options);
  }

  closeAllConnections() {
    return this.connection.closeAllConnections();
  }

  resolveServerConfig(serverName) {
    return this.connection.resolveServerConfig(serverName);
  }

  updateConnectionHealth(serverKey, success) {
    return this.connection.updateConnectionHealth(serverKey, success);
  }

  getConnectionHealth(serverKey) {
    return this.connection.getConnectionHealth(serverKey);
  }

  // ── Cache ────────────────────────────────────────────────────
  cacheResponse(serverKey, command, response) {
    return this.cache.cacheResponse(serverKey, command, response);
  }

  getCachedResponse(serverKey, command) {
    return this.cache.getCachedResponse(serverKey, command);
  }

  cleanupCache() {
    return this.cache.cleanupCache();
  }

  // ── Commands ────────────────────────────────────────────────
  sendRconCommandWithRetry(containerName, command, options) {
    return this.commands.sendRconCommandWithRetry(containerName, command, options);
  }

  sendRconCommand(containerName, command, options) {
    return this.commands.sendRconCommand(containerName, command, options);
  }

  sendAsaCtrlCommand(containerName, command, options) {
    return this.commands.sendAsaCtrlCommand(containerName, command, options);
  }

  sendCommand(options, command) {
    return this.commands.sendCommand(options, command);
  }

  getCommandType(command) {
    return this.commands.getCommandType(command);
  }

  getServerInfo(containerName, options) {
    return this.commands.getServerInfo(containerName, options);
  }

  getPlayerList(containerName, options) {
    return this.commands.getPlayerList(containerName, options);
  }

  saveWorld(containerName, options) {
    return this.commands.saveWorld(containerName, options);
  }

  broadcast(containerName, message, options) {
    return this.commands.broadcast(containerName, message, options);
  }

  // ── Parser ──────────────────────────────────────────────────
  parseServerInfo(response) {
    return this.parser.parseServerInfo(response);
  }

  parsePlayerList(response) {
    return this.parser.parsePlayerList(response);
  }
}

// Export singleton instance (backward-compatible with original export)
export default new RconService();
