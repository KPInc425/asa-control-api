import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, watch } from 'fs';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { createServerManager } from './server-manager.js';
import { gameFor } from '../games/index.js';
import { getServerConfig } from './database.js';

import { PathResolver } from './ark-logs/path-resolver.js';
import { LogDiscovery } from './ark-logs/log-discovery.js';
import { LogStreamer } from './ark-logs/log-streamer.js';
import { LogReader } from './ark-logs/log-reader.js';

// __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ArkLogsService {
  constructor() {
    // Use the same base path as the server manager for consistency
    this.basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'C:\\ARK';
    this.serverManager = createServerManager();
    this.config = config;

    // Delegate to focused modules
    this.pathResolver = new PathResolver(this);
    this.discovery = new LogDiscovery(this);
    this.streamer = new LogStreamer(this);
    this.reader = new LogReader(this);
  }

  /** @returns {Promise<import('./ark-logs/path-resolver.js').PathResolver>} */
  getPathResolver() { return this.pathResolver; }

  // ── Log discovery ──────────────────────────────────────────────

  /** @inheritdoc */
  async getAvailableLogs(serverName) {
    return this.discovery.getAvailableLogs(serverName);
  }

  /** @inheritdoc */
  categorizeLogFile(fileName, logDir, serverName) {
    return this.discovery.categorizeLogFile(fileName, logDir, serverName);
  }

  /** @inheritdoc */
  async getSystemLogs() {
    return this.discovery.getSystemLogs();
  }

  // ── Log streaming ──────────────────────────────────────────────

  /** @inheritdoc */
  async createLogStream(serverName, logFileName, options = {}) {
    return this.streamer.createLogStream(serverName, logFileName, options);
  }

  // ── Log reading ────────────────────────────────────────────────

  /** @inheritdoc */
  async getRecentLogs(serverName, logFileName, lines = 100) {
    return this.reader.getRecentLogs(serverName, logFileName, lines);
  }

  /** @inheritdoc */
  async logFileExists(serverName, logFileName) {
    return this.reader.logFileExists(serverName, logFileName);
  }

  // ── Utility ────────────────────────────────────────────────────

  /**
   * Get file size in bytes
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
}

export default new ArkLogsService();
