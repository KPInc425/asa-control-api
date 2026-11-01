import { promises as fs, existsSync } from "fs";
import path from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";
import { getAllSharedMods, getServerMods } from "../database.js";

/**
 * Start script management: read, write, regenerate
 */
export class ServerScriptManager {
  constructor(manager) {
    this.manager = manager;
  }

  async getClusterServerStartBat(name) {
    try {
      // Standalone servers (and any server whose path is recorded in the DB)
      // are resolved from their stored config first. Without this the lookup
      // only walked <base>/clusters/* and <base>/servers/*, so a server that
      // lives anywhere else reported "not found in any cluster, DB, or on disk".
      const dbCfg = this.manager.getServerConfigFromDatabase(name);
      if (dbCfg && dbCfg.serverPath) {
        const bat = path.join(dbCfg.serverPath, "start.bat");
        if (existsSync(bat)) {
          const content = await fs.readFile(bat, "utf8");
          return { success: true, content, path: bat };
        }
      }

      const serverInfo = await this.manager.getClusterServerInfo(name);
      if (!serverInfo) throw new Error(`Server ${name} not found`);

      const clustersPath = process.env.NATIVE_CLUSTERS_PATH ||
        (config.server && config.server.native && config.server.native.clustersPath) ||
        (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, "clusters") : null);
      if (!clustersPath) throw new Error("Missing clustersPath in configuration.");

      const clusterDirs = await fs.readdir(clustersPath);
      let clusterName = null;

      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, "cluster.json");
          const clusterConfigContent = await fs.readFile(clusterConfigPath, "utf8");
          const clusterConfig = JSON.parse(clusterConfigContent);
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find((s) => s.name === name);
            if (server) { clusterName = clusterDir; break; }
          }
        } catch (error) { logger.warn(`Error reading cluster ${clusterDir}:`, error.message); }
      }

      if (!clusterName) {
        const { parseStartBat } = await import("../../utils/parse-start-bat.js");
        if (clustersPath && existsSync(clustersPath)) {
          const clusterDirs = await fs.readdir(clustersPath);
          for (const cName of clusterDirs) {
            const clusterPath = path.join(clustersPath, cName);
            if (!existsSync(clusterPath) || !(await fs.stat(clusterPath)).isDirectory()) continue;
            const serverDirs = await fs.readdir(clusterPath);
            for (const sDir of serverDirs) {
              const serverPath = path.join(clusterPath, sDir);
              if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
              const startBatPath = path.join(serverPath, "start.bat");
              if (existsSync(startBatPath)) {
                try {
                  const parsed = await parseStartBat(startBatPath);
                  if (parsed.name === name) { clusterName = cName; break; }
                } catch (e) { logger.warn(`[getClusterServerStartBat] Failed to parse start.bat for fallback server in cluster ${cName}: ${e.message}`); }
              }
            }
            if (clusterName) break;
          }
        }
        if (!clusterName && this.manager.serversPath && existsSync(this.manager.serversPath)) {
          const serverDirs = await fs.readdir(this.manager.serversPath);
          for (const sDir of serverDirs) {
            const serverPath = path.join(this.manager.serversPath, sDir);
            if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (parsed.name === name) {
                  const content = await fs.readFile(startBatPath, "utf8");
                  return { success: true, content, path: startBatPath };
                }
              } catch (e) { logger.warn(`[getClusterServerStartBat] Failed to parse start.bat for fallback standalone server: ${e.message}`); }
            }
          }
        }
      }

      if (!clusterName) throw new Error(`Server ${name} not found in any cluster, DB, or on disk`);

      const startBatPath = path.join(clustersPath, clusterName, name, "start.bat");
      try { await fs.access(startBatPath); } catch { throw new Error(`Start.bat file not found: ${startBatPath}`); }
      const content = await fs.readFile(startBatPath, "utf8");
      return { success: true, content, path: startBatPath };
    } catch (error) {
      logger.error(`Failed to get start.bat for ${name}:`, error);
      throw error;
    }
  }

  async updateClusterServerStartBat(name, content) {
    try {
      const serverInfo = await this.manager.getClusterServerInfo(name);
      if (!serverInfo) throw new Error(`Server ${name} not found`);

      const clustersPath = process.env.NATIVE_CLUSTERS_PATH ||
        (config.server && config.server.native && config.server.native.clustersPath) ||
        (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, "clusters") : null);
      if (!clustersPath) throw new Error("Missing clustersPath in configuration.");

      const clusterDirs = await fs.readdir(clustersPath);
      let clusterName = null;

      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, "cluster.json");
          const clusterConfigContent = await fs.readFile(clusterConfigPath, "utf8");
          const clusterConfig = JSON.parse(clusterConfigContent);
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find((s) => s.name === name);
            if (server) { clusterName = clusterDir; break; }
          }
        } catch (error) { logger.warn(`Error reading cluster ${clusterDir}:`, error.message); }
      }

      if (!clusterName) {
        const { parseStartBat } = await import("../../utils/parse-start-bat.js");
        if (clustersPath && existsSync(clustersPath)) {
          const clusterDirs = await fs.readdir(clustersPath);
          for (const cName of clusterDirs) {
            const clusterPath = path.join(clustersPath, cName);
            if (!existsSync(clusterPath) || !(await fs.stat(clusterPath)).isDirectory()) continue;
            const serverDirs = await fs.readdir(clusterPath);
            for (const sDir of serverDirs) {
              const serverPath = path.join(clusterPath, sDir);
              if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
              const startBatPath = path.join(serverPath, "start.bat");
              if (existsSync(startBatPath)) {
                try {
                  const parsed = await parseStartBat(startBatPath);
                  if (parsed.name === name) { clusterName = cName; break; }
                } catch (e) { logger.warn(`[updateClusterServerStartBat] Failed to parse start.bat for fallback server in cluster ${cName}: ${e.message}`); }
              }
            }
            if (clusterName) break;
          }
        }
        if (!clusterName && this.manager.serversPath && existsSync(this.manager.serversPath)) {
          const serverDirs = await fs.readdir(this.manager.serversPath);
          for (const sDir of serverDirs) {
            const serverPath = path.join(this.manager.serversPath, sDir);
            if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (parsed.name === name) {
                  await fs.writeFile(startBatPath, content);
                  return { success: true, message: `Start.bat updated for ${name}`, path: startBatPath };
                }
              } catch (e) { logger.warn(`[updateClusterServerStartBat] Failed to parse start.bat for fallback standalone server: ${e.message}`); }
            }
          }
        }
      }

      if (!clusterName) throw new Error(`Server ${name} not found in any cluster, DB, or on disk`);

      const startBatPath = path.join(clustersPath, clusterName, name, "start.bat");
      try { await fs.access(startBatPath); } catch { throw new Error(`Start.bat file not found: ${startBatPath}`); }
      await fs.writeFile(startBatPath, content);
      return { success: true, message: `Start.bat updated for ${name}`, path: startBatPath };
    } catch (error) {
      logger.error(`Failed to update start.bat for ${name}:`, error);
      throw error;
    }
  }

  async regenerateServerStartScript(serverName) {
    try {
      const dbServerConfig = this.manager.getServerConfigFromDatabase(serverName);
      const resolvedServerConfig = dbServerConfig || (await this.manager.getClusterServerInfo(serverName));
      if (!resolvedServerConfig) throw new Error(`Server ${serverName} not found in database or any cluster`);
      // A standalone server (no clusterId) is legitimate - it used to throw here,
      // which is why start() silently kept a stale start.bat for every server
      // that is not part of a cluster.
      const clusterId = this.manager.getClusterIdFromConfig(resolvedServerConfig);
      const finalMods = await this.getFinalModListForServer(serverName);
      const cleanMods = finalMods.filter((modId) => modId !== null && modId !== undefined && modId !== "");
      const excludeSharedMods = dbServerConfig?.excludeSharedMods === true || resolvedServerConfig.excludeSharedMods === true;
      const clustersPath = this.manager.clustersPath || config.server.native.clustersPath || path.join(this.manager.basePath, "clusters");
      const serversPath = this.manager.serversPath || path.join(this.manager.basePath, "servers");
      const serverPath =
        resolvedServerConfig.serverPath ||
        (clusterId ? path.join(clustersPath, clusterId, serverName) : path.join(serversPath, serverName));
      const serverConfig = {
        ...resolvedServerConfig,
        mods: cleanMods,
        excludeSharedMods,
        serverPath,
        ...(clusterId ? { clusterId, clusterName: clusterId } : {}),
      };
      const { ServerProvisioner } = await import("../server-provisioner.js");
      const provisioner = new ServerProvisioner();
      if (clusterId) {
        await provisioner.createStartScriptInCluster(clusterId, serverPath, serverConfig);
      } else {
        await provisioner.createStartScript(serverPath, serverConfig);
      }
    } catch (error) {
      logger.error(`Failed to regenerate start script for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Move the ids listed in a server's `firstMods` config to the front, preserving
   * their declared order. Everything else keeps its relative position.
   */
  _hoistFirstMods(serverName, modIds) {
    try {
      const cfg = this.manager.getServerConfigFromDatabase(serverName);
      const first = Array.isArray(cfg?.firstMods) ? cfg.firstMods.map(String) : [];
      if (first.length === 0) return modIds;
      const present = first.filter((id) => modIds.includes(id));
      if (present.length === 0) return modIds;
      return [...present, ...modIds.filter((id) => !present.includes(id))];
    } catch {
      return modIds;
    }
  }

  async getFinalModListForServer(serverName) {
    try {
      const serverModsData = getServerMods(serverName);
      const serverMods = serverModsData
        .filter((mod) => mod.enabled === 1 && mod.mod_id)
        .map((mod) => mod.mod_id);

      // excludeSharedMods is per server and MUST be honoured here: this list is
      // what lands in the regenerated "-mods=" flag. Ignoring it silently added
      // every enabled shared mod to servers that had opted out, which changes
      // the mod set of a live world.
      const dbServerConfig = this.manager.getServerConfigFromDatabase(serverName);
      const excludeSharedMods = dbServerConfig?.excludeSharedMods === true;

      if (excludeSharedMods) return this._hoistFirstMods(serverName, [...new Set(serverMods)]);

      const sharedModsData = getAllSharedMods();
      const sharedMods = sharedModsData
        .filter((mod) => mod.enabled === 1 && mod.mod_id)
        .map((mod) => mod.mod_id);

      // Shared mods come first as the cluster-wide prefix, then the server's own.
      // A server may declare firstMods (in its config) for mods that must lead the
      // load order regardless - Randi's Halloween Mod, for instance, only plays
      // its combat music when it is first.
      return this._hoistFirstMods(serverName, [...new Set([...sharedMods, ...serverMods])]);
    } catch (error) {
      logger.warn(`Failed to get mod list for ${serverName}:`, error.message);
      return [];
    }
  }
}
