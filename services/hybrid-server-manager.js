import { ServerManager } from "./server-manager-base.js";
import { DockerServerManager } from "./docker-server-manager.js";
import { NativeServerManager } from "./native-server-manager.js";
import config from "../config/index.js";
import logger from "../utils/logger.js";
import { promises as fs, existsSync } from "fs";
import path from "path";

/**
 * Hybrid Server Manager that handles both Docker containers and native cluster servers
 */
export class HybridServerManager extends ServerManager {
  constructor(dockerService) {
    super();
    this.dockerManager = new DockerServerManager(dockerService);
    this.nativeManager = new NativeServerManager();
  }

  async start(name) {
    try {
      try { return await this.nativeManager.start(name); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        return await this.dockerManager.start(name);
      }
    } catch (error) {
      logger.error(`Failed to start server ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      try { return await this.nativeManager.stop(name); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        return await this.dockerManager.stop(name);
      }
    } catch (error) {
      logger.error(`Failed to stop server ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      try { return await this.nativeManager.restart(name); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        return await this.dockerManager.restart(name);
      }
    } catch (error) {
      logger.error(`Failed to restart server ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      try { return await this.nativeManager.getStats(name); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        return await this.dockerManager.getStats(name);
      }
    } catch (error) {
      logger.error(`Failed to get stats for server ${name}:`, error);
      throw error;
    }
  }

  async getLogs(name, options = {}) {
    try {
      try { return await this.nativeManager.getLogs(name, options); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        return await this.dockerManager.getLogs(name, options);
      }
    } catch (error) {
      logger.error(`Failed to get logs for server ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      const [dockerServers, nativeServers] = await Promise.all([
        this.dockerManager.listServers(),
        this.nativeManager.listServers(),
      ]);
      const allServers = [...nativeServers];
      for (const dockerServer of dockerServers) {
        const existingNative = nativeServers.find((ns) => ns.name === dockerServer.name);
        if (!existingNative) allServers.push(dockerServer);
      }
      return allServers;
    } catch (error) {
      logger.error("Failed to list servers in hybrid mode:", error);
      return [];
    }
  }

  async isRunning(name) {
    try {
      const [nativeRunning, dockerRunning] = await Promise.all([
        this.nativeManager.isRunning(name).catch(() => false),
        this.dockerManager.isRunning(name).catch(() => false),
      ]);
      return nativeRunning || dockerRunning;
    } catch (error) {
      logger.error(`Failed to check running status for ${name}:`, error);
      return false;
    }
  }

  async getClusterServerInfo(name) {
    return this.nativeManager.getClusterServerInfo(name);
  }

  async getClusterServerStartBat(name) {
    return this.nativeManager.getClusterServerStartBat(name);
  }

  async updateClusterServerStartBat(name, content) {
    return this.nativeManager.updateClusterServerStartBat(name, content);
  }

  async listLogFiles(name) {
    return this.nativeManager.listLogFiles(name);
  }

  async getServerStatus(name) {
    try {
      try { return await this.nativeManager.getServerStatus(name); }
      catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        const isRunning = await this.dockerManager.isRunning(name);
        return { name, status: isRunning ? "running" : "stopped", uptime: 0, pid: null, crashInfo: null };
      }
    } catch (error) {
      logger.error(`Failed to get server status for ${name}:`, error);
      return { name, status: "unknown", uptime: 0, pid: null, crashInfo: null, error: error.message };
    }
  }

  async startCluster(name) { return this.nativeManager.startCluster(name); }
  async stopCluster(name) { return this.nativeManager.stopCluster(name); }
  async restartCluster(name) { return this.nativeManager.restartCluster(name); }
}
