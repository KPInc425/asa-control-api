import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { gameFor, gameRegistry } from "../games/index.js";
import { StartScripts } from "./script-generator/start-scripts.js";
import { StopScripts } from "./script-generator/stop-scripts.js";
import { ScriptRegenerator } from "./script-generator/script-regenerator.js";

/**
 * Script Generator
 * Facade that delegates to specialized modules.
 */
export class ScriptGenerator {
  constructor(basePath, clustersPath, serversPath, gameType = "ark") {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.gameType = gameType;
    this.emitProgress = null;

    // Initialize modules
    this.startScripts = new StartScripts(this);
    this.stopScripts = new StopScripts(this);
    this.scriptRegenerator = new ScriptRegenerator(this);
  }

  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  // Start scripts
  async createStartScript(serverPath, serverConfig) {
    return this.startScripts.createStartScript(serverPath, serverConfig);
  }

  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    return this.startScripts.createStartScriptInCluster(clusterName, serverPath, serverConfig);
  }

  // Stop scripts
  async createStopScript(serverPath, serverName) {
    return this.stopScripts.createStopScript(serverPath, serverName);
  }

  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    return this.stopScripts.createStopScriptInCluster(clusterName, serverPath, serverName);
  }

  // Script regeneration
  async regenerateServerStartScript(serverName) {
    return this.scriptRegenerator.regenerateServerStartScript(serverName);
  }

  async regenerateAllClusterStartScripts() {
    return this.scriptRegenerator.regenerateAllClusterStartScripts();
  }

  // Delegated to parent for script regeneration lookup
  async listClusters() {
    const { ClusterManager } = await import("./cluster-manager.js");
    // This is a simplified lookup; in practice the parent ServerProvisioner
    // or ClusterManager handles this. For regeneration, we scan the filesystem.
    const clusters = [];
    if (this.clustersPath && existsSync(this.clustersPath)) {
      const clusterDirs = await fs.readdir(this.clustersPath);
      for (const name of clusterDirs) {
        const clusterPath = path.join(this.clustersPath, name);
        if ((await fs.stat(clusterPath)).isDirectory()) {
          clusters.push({ name, path: clusterPath, config: { servers: [] } });
        }
      }
    }
    return clusters;
  }
}
