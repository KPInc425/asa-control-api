import path from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";
import { getServerConfig } from "../database.js";
import { gameFor } from "../../games/index.js";
import { ServerStats } from "../server-stats.js";

/**
 * Server stats and log retrieval
 */
export class ServerStatsManager {
  constructor(manager) {
    this.manager = manager;
  }

  async getStats(name) {
    try {
      const processInfo = this.manager.processes.get(name);
      if (processInfo) {
        try {
          const stats = await this.manager.powershellHelper.getProcessInfo(processInfo.processId);
          if (stats.success) {
            const process = stats.process;
            const uptime = Math.floor((Date.now() - new Date(process.StartTime).getTime()) / 1000);
            const memoryMB = Math.round(process.WorkingSet / (1024 * 1024));
            return new ServerStats(name, process.Responding ? "running" : "stopped", 0, memoryMB, uptime, process.Id);
          }
        } catch (powershellError) {
          logger.error(`PowerShell stats check failed for ${name}:`, powershellError);
        }
        const uptime = Math.floor((Date.now() - processInfo.startTime) / 1000);
        return new ServerStats(name, "running", 0, 0, uptime, processInfo.processId);
      }

      try {
        const serverConfig = getServerConfig(name);
        const adapter = gameFor(serverConfig?.game_type || "ark");
        for (const procName of adapter.processNames) {
          const procResult = await this.manager.powershellHelper.getProcessesByName(procName);
          if (procResult.success && procResult.processes && procResult.processes.length > 0) {
            const process = procResult.processes[0];
            const uptime = Math.floor((Date.now() - new Date(process.StartTime).getTime()) / 1000);
            const memoryMB = Math.round(process.WorkingSet / (1024 * 1024));
            return new ServerStats(name, "running", 0, memoryMB, uptime, process.Id);
          }
        }
      } catch (powershellError) {
        logger.error(`PowerShell process search failed for ${name}:`, powershellError);
      }

      return new ServerStats(name, "stopped", 0, 0, 0, null);
    } catch (error) {
      logger.error(`Failed to get native server stats for ${name}:`, error);
      return new ServerStats(name, "unknown", 0, 0, 0, null);
    }
  }

  async getLogs(name, options = {}) {
    try {
      let serverInfo = null;
      try { serverInfo = await this.manager.getClusterServerInfo(name); } catch (error) {
        logger.warn(`Could not get cluster server info for ${name}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        const clusterId = serverInfo?.clusterId || serverInfo?.clusterName;
        if (clusterId) {
          const clustersPath = config.server.native.clustersPath || path.join(this.manager.basePath, "clusters");
          serverPath = path.join(clustersPath, clusterId, name);
        } else {
          serverPath = path.join(process.env.NATIVE_BASE_PATH || "C:\\ARK", "servers", name);
        }
      }

      const possibleLogPaths = [
        path.join(serverPath, "ShooterGame", "Saved", "Logs", "ShooterGame.log"),
        path.join(serverPath, "ShooterGame", "Saved", "Logs", "ShooterGame_*.log"),
        path.join(serverPath, "ShooterGame", "Saved", "Logs", "WindowsServer.log"),
        path.join(serverPath, "ShooterGame", "Saved", "Logs", "WindowsServer_*.log"),
        path.join(serverPath, "logs", `${name}.log`),
        path.join(serverPath, "ShooterGame.log"),
        path.join(serverPath, "ShooterGame", "Saved", "Logs", "*.log"),
        path.join(serverPath, "Saved", "Logs", "ShooterGame.log"),
        path.join(serverPath, "Saved", "Logs", "*.log"),
      ];

      const { promises: fs } = await import("fs");
      let logContent = "";
      let foundLog = false;

      for (const logPath of possibleLogPaths) {
        try {
          if (logPath.includes("*")) {
            const logDir = path.dirname(logPath);
            const logFiles = await fs.readdir(logDir);
            let matchingFiles = [];
            if (logPath.includes("ShooterGame_*.log")) {
              matchingFiles = logFiles.filter((file) => file.startsWith("ShooterGame") && file.endsWith(".log"));
            } else if (logPath.includes("WindowsServer_*.log")) {
              matchingFiles = logFiles.filter((file) => file.startsWith("WindowsServer") && file.endsWith(".log"));
            } else if (logPath.includes("*.log")) {
              matchingFiles = logFiles.filter((file) => file.endsWith(".log"));
            } else {
              matchingFiles = logFiles.filter((file) => file.startsWith("ShooterGame") || file.startsWith("WindowsServer"));
            }
            if (matchingFiles.length > 0) {
              const logFilesWithStats = await Promise.all(matchingFiles.map(async (file) => {
                const fullPath = path.join(logDir, file);
                try { const stat = await fs.stat(fullPath); return { file, fullPath, mtime: stat.mtime }; }
                catch { return { file, fullPath, mtime: new Date(0) }; }
              }));
              const latestLogFile = logFilesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
              logContent = await fs.readFile(latestLogFile.fullPath, "utf8");
              foundLog = true;
              break;
            }
          } else {
            logContent = await fs.readFile(logPath, "utf8");
            foundLog = true;
            break;
          }
        } catch { continue; }
      }

      if (!foundLog) {
        const processInfo = this.manager.processes.get(name);
        if (processInfo && processInfo.process && !processInfo.process.killed) {
          return `Server ${name} is running but no log files found in:\n${possibleLogPaths.join("\n")}`;
        }
        throw new Error(`No log files found for server ${name} and server is not running`);
      }
      return logContent;
    } catch (error) {
      logger.error(`Failed to get native server logs for ${name}:`, error);
      throw error;
    }
  }

  async listLogFiles(name) {
    const { promises: fs } = await import("fs");
    try {
      let serverInfo = null;
      try { serverInfo = await this.manager.getClusterServerInfo(name); } catch (error) {
        logger.warn(`Could not get cluster server info for ${name}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        const clusterId = serverInfo?.clusterId || serverInfo?.clusterName;
        if (clusterId) {
          const clustersPath = config.server.native.clustersPath || path.join(this.manager.basePath, "clusters");
          serverPath = path.join(clustersPath, clusterId, name);
        } else {
          serverPath = path.join(process.env.NATIVE_BASE_PATH || "C:\\ARK", "servers", name);
        }
      }

      const logFiles = [];
      const dbRow = getServerConfig(name);
      const adapter = gameFor(dbRow?.game_type || "ark");
      const logSubDirs = adapter.getLogSubDirectories();
      const logPatterns = adapter.getLogFilePatterns();
      const possibleLogDirs = logSubDirs.map((sub) => path.join(serverPath, sub));

      for (const logDir of possibleLogDirs) {
        try {
          const files = await fs.readdir(logDir);
          for (const file of files) {
            const lowerName = file.toLowerCase();
            if (file.endsWith(".log") || (logPatterns.length > 0 && logPatterns.some((p) => lowerName.includes(p)))) {
              const filePath = path.join(logDir, file);
              const stat = await fs.stat(filePath);
              logFiles.push({ name: file, path: filePath, size: stat.size, modified: stat.mtime.toISOString() });
            }
          }
        } catch { continue; }
      }

      return logFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    } catch (error) {
      logger.error(`Failed to list log files for ${name}:`, error);
      throw error;
    }
  }

  async getServerStatus(name) {
    try {
      const isRunning = await this.manager.isRunning(name);
      if (isRunning) {
        const stats = await this.getStats(name);
        return {
          status: "running", playerCount: stats.playerCount || 0,
          maxPlayers: stats.maxPlayers || 70, uptime: stats.uptime || 0,
          cpu: stats.cpu || 0, memory: stats.memory || 0,
        };
      }

      const processInfo = this.manager.processes.get(name);
      if (processInfo) {
        if (processInfo.status === "starting") return { status: "starting", playerCount: 0, maxPlayers: 70, uptime: 0, cpu: 0, memory: 0 };
        if (processInfo.status === "stopping") return { status: "stopping", playerCount: 0, maxPlayers: 70, uptime: 0, cpu: 0, memory: 0 };
        if (processInfo.status === "error") return { status: "failed", playerCount: 0, maxPlayers: 70, uptime: 0, cpu: 0, memory: 0, crashInfo: { reason: processInfo.error, time: processInfo.errorTime } };
      }

      return { status: "stopped", playerCount: 0, maxPlayers: 70, uptime: 0, cpu: 0, memory: 0 };
    } catch (error) {
      logger.error(`Failed to get server status for ${name}:`, error);
      return { status: "unknown", playerCount: 0, maxPlayers: 70, uptime: 0, cpu: 0, memory: 0 };
    }
  }
}
