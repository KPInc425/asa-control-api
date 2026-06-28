import { promises as fs, existsSync } from "fs";
import path from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";
import { getAllServerConfigs, getServerConfig } from "../database.js";
import { gameFor } from "../../games/index.js";

/**
 * Server discovery: listing, finding, running detection
 */
export class ServerDiscovery {
  constructor(manager) {
    this.manager = manager;
  }

  async getClusterServers(clusterName) {
    const clustersPath = this.manager.clustersPath ||
      config.server.native.clustersPath ||
      path.join(this.manager.basePath, "clusters");
    const dbConfigs = getAllServerConfigs();
    const dbServers = dbConfigs
      .map((configRow) => {
        try {
          const serverConfig = JSON.parse(configRow.config_data);
          const resolvedClusterName = this.manager.getClusterIdFromConfig(serverConfig);
          if (resolvedClusterName !== clusterName) return null;
          return {
            name: configRow.name, ...serverConfig,
            clusterName: resolvedClusterName, clusterId: resolvedClusterName,
            isClusterServer: true,
            serverPath: serverConfig.serverPath || path.join(clustersPath, resolvedClusterName, configRow.name),
          };
        } catch (error) {
          logger.warn(`Failed to parse database config for cluster lookup: ${configRow.name}`, error.message);
          return null;
        }
      })
      .filter(Boolean);

    if (dbServers.length > 0) return dbServers;

    const clusterConfigPath = path.join(clustersPath, clusterName, "cluster.json");
    try {
      const clusterConfigContent = await fs.readFile(clusterConfigPath, "utf8");
      const clusterConfig = JSON.parse(clusterConfigContent);
      if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
        return clusterConfig.servers.map((server) => ({
          ...server, name: server.name, clusterName,
          clusterId: server.clusterId || clusterName, isClusterServer: true,
          serverPath: server.serverPath || path.join(clustersPath, clusterName, server.name),
        }));
      }
    } catch (error) {
      if (error.code !== "ENOENT") logger.warn(`Error reading legacy cluster config for ${clusterName}:`, error.message);
    }

    const clusterPath = path.join(clustersPath, clusterName);
    if (!existsSync(clusterPath)) return [];

    const { parseStartBat } = await import("../../utils/parse-start-bat.js");
    const serverDirs = await fs.readdir(clusterPath);
    const servers = [];

    for (const serverDir of serverDirs) {
      const serverPath = path.join(clusterPath, serverDir);
      if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
      const startBatPath = path.join(serverPath, "start.bat");
      if (!existsSync(startBatPath)) continue;
      try {
        const parsed = await parseStartBat(startBatPath);
        servers.push({ name: parsed.name || serverDir, ...parsed, clusterName, clusterId: parsed.clusterId || clusterName, isClusterServer: true, serverPath });
      } catch (error) {
        logger.warn(`[NativeServerManager] Failed to parse start.bat for cluster ${clusterName} server ${serverDir}: ${error.message}`);
      }
    }
    return servers;
  }

  async findServerOnDisk(name) {
    const clustersPath = this.manager.clustersPath ||
      config.server.native.clustersPath ||
      path.join(this.manager.basePath, "clusters");
    const serversPath = this.manager.serversPath || path.join(this.manager.basePath, "servers");
    const { parseStartBat } = await import("../../utils/parse-start-bat.js");

    if (this.manager.clustersPath && existsSync(this.manager.clustersPath)) {
      const clusterDirs = await fs.readdir(clustersPath);
      for (const clusterName of clusterDirs) {
        const clusterPath = path.join(clustersPath, clusterName);
        if (!existsSync(clusterPath) || !(await fs.stat(clusterPath)).isDirectory()) continue;
        const serverDirs = await fs.readdir(clusterPath);
        for (const serverDir of serverDirs) {
          const serverPath = path.join(clusterPath, serverDir);
          if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
          const startBatPath = path.join(serverPath, "start.bat");
          if (!existsSync(startBatPath)) continue;
          try {
            const parsed = await parseStartBat(startBatPath);
            if (parsed.name === name || serverDir === name) {
              return { name: parsed.name || name, ...parsed, clusterName, clusterId: parsed.clusterId || clusterName, isClusterServer: true, serverPath };
            }
          } catch (error) {
            logger.warn(`[NativeServerManager] Failed to parse start.bat while resolving ${name}: ${error.message}`);
          }
        }
      }
    }

    if (serversPath && existsSync(serversPath)) {
      const serverDirs = await fs.readdir(serversPath);
      for (const serverDir of serverDirs) {
        const serverPath = path.join(serversPath, serverDir);
        if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
        const startBatPath = path.join(serverPath, "start.bat");
        if (!existsSync(startBatPath)) continue;
        try {
          const parsed = await parseStartBat(startBatPath);
          if (parsed.name === name || serverDir === name) {
            return { name: parsed.name || name, ...parsed, isClusterServer: false, clusterName: null, clusterId: null, serverPath };
          }
        } catch (error) {
          logger.warn(`[NativeServerManager] Failed to parse standalone start.bat while resolving ${name}: ${error.message}`);
        }
      }
    }
    return null;
  }

  async getClusterServerInfo(name) {
    try {
      const dbConfig = this.manager.getServerConfigFromDatabase(name);
      if (dbConfig) {
        logger.info(`Found server ${name} in database`);
        const clusterId = this.manager.getClusterIdFromConfig(dbConfig);
        if (clusterId) {
          const clustersPath = this.manager.clustersPath || config.server.native.clustersPath || path.join(this.manager.basePath, "clusters");
          dbConfig.serverPath = path.join(clustersPath, clusterId, name);
        } else if (!dbConfig.serverPath) {
          dbConfig.serverPath = path.join(this.manager.serversPath || path.join(this.manager.basePath, "servers"), name);
        }
        return dbConfig;
      }

      logger.info(`Server ${name} not found in database, checking disk-based configs...`);
      const clustersPath = this.manager.clustersPath || config.server.native.clustersPath || path.join(this.manager.basePath, "clusters");
      const clusterDirs = await fs.readdir(clustersPath);

      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, "cluster.json");
          const clusterConfigContent = await fs.readFile(clusterConfigPath, "utf8");
          const clusterConfig = JSON.parse(clusterConfigContent);
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find((s) => s.name === name);
            if (server) {
              logger.info(`Found server ${name} in disk-based config for cluster ${clusterDir}`);
              return { ...server, clusterName: clusterDir, clusterId: server.clusterId || clusterDir, isClusterServer: true, serverPath: server.serverPath || path.join(clustersPath, clusterDir, name) };
            }
          }
        } catch (error) {
          logger.warn(`Error reading cluster ${clusterDir}:`, error && (error.stack || error.message || error));
          if (error.code === "ENOENT") continue;
        }
      }

      const fallbackServer = await this.findServerOnDisk(name);
      if (fallbackServer) {
        logger.info(`Found server ${name} by scanning start.bat files on disk`);
        return fallbackServer;
      }

      logger.warn(`Server ${name} not found in database or disk-based configs`);
      return null;
    } catch (error) {
      logger.error(`Failed to get cluster server info for ${name}:`, error);
      return null;
    }
  }

  async listServers() {
    try {
      const dbConfigs = getAllServerConfigs();
      const clusterMap = {};
      function getClusterId(config) {
        return config.clusterId || config.clusterName ||
          (config.config && (config.config.clusterId || config.config.clusterName)) || null;
      }
      for (const config of dbConfigs) {
        try {
          const serverConfig = JSON.parse(config.config_data);
          const clusterId = getClusterId(serverConfig);
          if (clusterId) clusterMap[config.name] = clusterId;
        } catch (e) { logger.warn(`Failed to parse config for cluster mapping: ${config.name}`, e.message); }
      }

      const servers = await Promise.all(
        dbConfigs.map(async (config) => {
          try {
            const serverConfig = JSON.parse(config.config_data);
            let status = "unknown";
            try { const statusObj = await this.manager.getServerStatus(config.name); status = statusObj.status; }
            catch (e) { logger.warn(`Failed to get status for ${config.name}:`, e.message); }
            const clusterName = getClusterId(serverConfig);
            return { name: config.name, ...serverConfig, status, type: "native", config: serverConfig, isClusterServer: !!clusterName, clusterName, serverPath: serverConfig.serverPath || "", created: serverConfig.created || "" };
          } catch (error) {
            logger.warn(`Failed to parse database config for ${config.name}:`, error.message);
            return null;
          }
        }),
      );

      const foundNames = new Set(dbConfigs.map((cfg) => { try { return JSON.parse(cfg.config_data).name; } catch { return null; } }).filter(Boolean));
      const { parseStartBat } = await import("../../utils/parse-start-bat.js");

      if (this.manager.clustersPath && existsSync(this.manager.clustersPath)) {
        const clusterDirs = await fs.readdir(this.manager.clustersPath);
        for (const clusterName of clusterDirs) {
          const clusterPath = path.join(this.manager.clustersPath, clusterName);
          if (!existsSync(clusterPath) || !(await fs.stat(clusterPath)).isDirectory()) continue;
          const serverDirs = await fs.readdir(clusterPath);
          for (const serverDir of serverDirs) {
            const serverPath = path.join(clusterPath, serverDir);
            if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (!foundNames.has(parsed.name)) {
                  servers.push({ name: parsed.name, ...parsed, status: "unknown", type: "native", config: parsed, isClusterServer: true, clusterName, serverPath, created: "", fallback: true });
                  foundNames.add(parsed.name);
                }
              } catch (e) { logger.warn(`[NativeServerManager] Failed to parse start.bat for fallback server in cluster ${clusterName}: ${e.message}`); }
            }
          }
        }
      }

      if (this.manager.serversPath && existsSync(this.manager.serversPath)) {
        const serverDirs = await fs.readdir(this.manager.serversPath);
        for (const serverDir of serverDirs) {
          const serverPath = path.join(this.manager.serversPath, serverDir);
          if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
          const startBatPath = path.join(serverPath, "start.bat");
          if (existsSync(startBatPath)) {
            try {
              const parsed = await parseStartBat(startBatPath);
              if (!foundNames.has(parsed.name)) {
                let fallbackStatus = "unknown";
                try { const statusObj = await this.manager.getServerStatus(parsed.name); fallbackStatus = statusObj.status; }
                catch (e) { logger.warn(`Failed to get status for fallback server ${parsed.name}:`, e.message); }
                servers.push({ name: parsed.name, ...parsed, status: fallbackStatus, type: "native", config: parsed, isClusterServer: false, clusterName: null, serverPath, created: "", fallback: true });
                foundNames.add(parsed.name);
              }
            } catch (e) { logger.warn(`[NativeServerManager] Failed to parse start.bat for fallback standalone server: ${e.message}`); }
          }
        }
      }
      return servers.filter(Boolean);
    } catch (error) {
      logger.error("Failed to list servers:", error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      if (!this.manager.processes) this.manager.processes = new Map();
      const processInfo = this.manager.processes.get(name);
      if (processInfo && processInfo.process) return !processInfo.process.killed;

      let serverPorts = null;
      let serverInfo = null;
      try {
        serverInfo = await this.getClusterServerInfo(name);
        if (serverInfo) {
          serverPorts = { gamePort: serverInfo.gamePort, queryPort: serverInfo.queryPort, rconPort: serverInfo.rconPort, externalPort: serverInfo.port, map: serverInfo.map, sessionName: serverInfo.name };
        }
      } catch (error) { console.warn(`Failed to get server info for ${name}:`, error.message); }

      const processes = await this.getRunningProcesses();
      for (const process of processes) {
        const commandLine = process.commandLine || "";
        const processName = process.name || "";
        let isMatch = false;

        if (serverPorts && commandLine.includes(`Port=${serverPorts.gamePort}`) && commandLine.includes(`QueryPort=${serverPorts.queryPort}`) && commandLine.includes(`RCONPort=${serverPorts.rconPort}`) && commandLine.includes(serverPorts.map) && commandLine.includes(`SessionName=${serverPorts.sessionName}`)) isMatch = true;
        if (!isMatch && serverPorts && commandLine.includes(`SessionName=${serverPorts.sessionName}`)) isMatch = true;
        if (!isMatch && serverPorts && commandLine.includes(`Port=${serverPorts.gamePort}`) && commandLine.includes(`QueryPort=${serverPorts.queryPort}`)) isMatch = true;
        if (!isMatch && commandLine.includes(`SessionName=${name}`)) isMatch = true;
        if (!isMatch && name.length > 10 && commandLine.includes(name)) isMatch = true;
        if (!isMatch && (processName === "ArkAscendedServer" || processName === "ArkAscendedServer.exe") && commandLine.includes(name)) isMatch = true;

        if (isMatch) return true;
      }
      return false;
    } catch (error) {
      console.error(`[isRunning] Error checking if server ${name} is running:`, error);
      return false;
    }
  }

  async getRunningProcesses() {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        `wmic process where "name='ArkAscendedServer.exe'" get ProcessId,CommandLine,Name /format:csv`,
        { timeout: 10000 }
      );

      const lines = stdout.trim().split("\n").filter(Boolean);
      const processes = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 3) {
          processes.push({
            name: parts[0]?.trim() || "ArkAscendedServer.exe",
            pid: parts[1]?.trim(),
            commandLine: parts.slice(2).join(","),
          });
        }
      }
      return processes;
    } catch (error) {
      logger.warn("Failed to get running processes via WMIC:", error.message);
      return [];
    }
  }
}
