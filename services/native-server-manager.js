/**
 * Native Windows Server Manager
 *
 * Facade that delegates to focused composition modules.
 * This keeps the public API stable while splitting concerns.
 */
import { ServerManager } from "./server-manager-base.js";
import { ServerStats } from "./server-stats.js";
import { ServerLifecycle } from "./native-server-manager/lifecycle.js";
import { ServerDiscovery } from "./native-server-manager/discovery.js";
import { ServerScriptManager } from "./native-server-manager/scripts.js";
import { ServerStatsManager } from "./native-server-manager/stats.js";
import { ServerConfigHelper } from "./native-server-manager/config.js";
import { EventEmitter } from "events";
import config from "../config/index.js";
import path from "path";
import PowerShellHelper from "./powershell-helper.js";

export class NativeServerManager extends ServerManager {
  constructor() {
    super();
    const rawBasePath =
      config.server.native.basePath ||
      process.env.NATIVE_BASE_PATH ||
      "C:\\ARK";
    this.basePath = path.normalize(rawBasePath);
    this.serversPath = path.join(this.basePath, "servers");
    this.clustersPath = path.join(this.basePath, "clusters");
    this.processes = new Map();
    this.eventEmitter = new EventEmitter();
    this.powershellHelper = new PowerShellHelper();

    // Compose from focused modules
    this.lifecycle = new ServerLifecycle(this);
    this.discovery = new ServerDiscovery(this);
    this.scripts = new ServerScriptManager(this);
    this.statsMgr = new ServerStatsManager(this);
    this.configHelper = new ServerConfigHelper(this);
  }

  // ── Lifecycle ──
  async start(name) { return this.lifecycle.start(name); }
  async stop(name) { return this.lifecycle.stop(name); }
  async restart(name) { return this.lifecycle.restart(name); }
  async startCluster(clusterName) { return this.lifecycle.startCluster(clusterName); }
  async stopCluster(clusterName) { return this.lifecycle.stopCluster(clusterName); }
  async restartCluster(clusterName) { return this.lifecycle.restartCluster(clusterName); }

  // ── Discovery ──
  async listServers() { return this.discovery.listServers(); }
  async isRunning(name) { return this.discovery.isRunning(name); }
  async getClusterServerInfo(name) { return this.discovery.getClusterServerInfo(name); }
  async getClusterServers(clusterName) { return this.discovery.getClusterServers(clusterName); }
  async findServerOnDisk(name) { return this.discovery.findServerOnDisk(name); }
  async getRunningProcesses() { return this.discovery.getRunningProcesses(); }

  // ── Scripts ──
  async getClusterServerStartBat(name) { return this.scripts.getClusterServerStartBat(name); }
  async updateClusterServerStartBat(name, content) { return this.scripts.updateClusterServerStartBat(name, content); }
  async regenerateServerStartScript(serverName) { return this.scripts.regenerateServerStartScript(serverName); }
  async getFinalModListForServer(serverName) { return this.scripts.getFinalModListForServer(serverName); }

  // ── Stats / Logs ──
  async getStats(name) { return this.statsMgr.getStats(name); }
  async getLogs(name, options) { return this.statsMgr.getLogs(name, options); }
  async listLogFiles(name) { return this.statsMgr.listLogFiles(name); }
  async getServerStatus(name) { return this.statsMgr.getServerStatus(name); }

  // ── Config ──
  getServerConfigFromDatabase(name) { return this.configHelper.getServerConfigFromDatabase(name); }
  getClusterIdFromConfig(serverConfig) { return this.configHelper.getClusterIdFromConfig(serverConfig); }
  async addServerConfig(name, configData) { return this.configHelper.addServerConfig(name, configData); }
  buildServerArgs(serverCfg) { return this.configHelper.buildServerArgs(serverCfg); }
  buildServerArgsFromCluster(server) { return this.configHelper.buildServerArgsFromCluster(server); }
}
