import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";
import {
  upsertServerConfig,
  upsertSharedMod,
  upsertServerMod,
  upsertServerSettings,
} from "../database.js";

/**
 * Cluster creation and server addition operations
 */
export class ClusterOperations {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Create a new cluster with multiple servers
   */
  async createCluster(clusterConfig, foreground = false) {
    const clusterName = clusterConfig.name;
    const clusterPath = path.join(this.parent.clustersPath, clusterName);

    // Patch: Ensure every server has clusterId and clusterName
    if (Array.isArray(clusterConfig.servers)) {
      clusterConfig.servers = clusterConfig.servers.map((server) => ({
        ...server,
        clusterId: clusterName,
        clusterName: clusterName,
      }));
    }

    // Define step sequence
    const steps = [
      "Validating configuration",
      "Creating cluster directory",
      "Installing ASA binaries",
      "Writing config files",
      "Creating scripts",
      "Finalizing",
    ];
    let currentStep = 0;
    const emit = (msg, stepOverride) => {
      const step = stepOverride !== undefined ? stepOverride : currentStep;
      this.parent.emitProgress?.({
        step,
        stepName: steps[step],
        percent: Math.round((step / (steps.length - 1)) * 100),
        message: msg,
      });
    };

    try {
      emit("Validating configuration...");
      // Check required fields
      if (!clusterConfig.name || !clusterConfig.name.trim()) {
        emit("Cluster name is required", 0);
        throw new Error("Cluster name is required");
      }

      // Check name format
      if (clusterConfig.name && !/^[a-zA-Z0-9_-]+$/.test(clusterConfig.name)) {
        emit(
          "Cluster name can only contain letters, numbers, underscores, and hyphens",
          0,
        );
        throw new Error(
          "Cluster name can only contain letters, numbers, underscores, and hyphens",
        );
      }

      // Check server count
      if (
        clusterConfig.serverCount &&
        (clusterConfig.serverCount < 1 || clusterConfig.serverCount > 10)
      ) {
        emit("Server count must be between 1 and 10", 0);
        throw new Error("Server count must be between 1 and 10");
      }

      // Check base port
      if (
        clusterConfig.basePort &&
        (clusterConfig.basePort < 1024 || clusterConfig.basePort > 65535)
      ) {
        emit("Base port must be between 1024 and 65535", 0);
        throw new Error("Base port must be between 1024 and 65535");
      }

      // Check if cluster already exists
      if (clusterConfig.name) {
        try {
          const clusterPath = path.join(this.parent.clustersPath, clusterConfig.name);
          await fs.access(clusterPath);
          emit(`Cluster "${clusterConfig.name}" already exists`, 0);
          throw new Error(`Cluster "${clusterConfig.name}" already exists`);
        } catch {
          // Cluster doesn't exist, which is good
        }
      }

      // Step 1: Create cluster directory
      currentStep = 1;
      emit(`Creating cluster directory: ${clusterPath}`);
      await fs.mkdir(clusterPath, { recursive: true });

      // Patch: Build servers array with correct port logic
      const servers = clusterConfig.servers.map((server, index) => ({
        ...server,
        gamePort: server.gamePort ?? clusterConfig.basePort + index * 100,
        queryPort: server.queryPort ?? clusterConfig.basePort + 1 + index * 100,
        rconPort: server.rconPort ?? clusterConfig.basePort + 2 + index * 100,
      }));

      // Save cluster config with correct ports
      const clusterConfigFile = {
        ...clusterConfig,
        name: clusterName,
        created: new Date().toISOString(),
        servers,
      };
      // --- DB-native: upsert each server config into the DB ---
      for (const server of servers) {
        await upsertServerConfig(server.name, JSON.stringify(server));
      }

      // Import global mods from cluster config
      if (clusterConfig.globalMods && Array.isArray(clusterConfig.globalMods)) {
        logger.info(
          `[createCluster] Importing ${clusterConfig.globalMods.length} global mods for cluster ${clusterName}`,
        );
        for (const modId of clusterConfig.globalMods) {
          await upsertSharedMod(modId.toString(), null, true);
        }
      }

      // Import server-specific mods and settings
      for (const server of servers) {
        // Import server mods
        if (server.mods && Array.isArray(server.mods)) {
          logger.info(
            `[createCluster] Importing ${server.mods.length} server mods for ${server.name}`,
          );
          for (const modId of server.mods) {
            // Validate modId before inserting
            if (
              modId !== null &&
              modId !== undefined &&
              modId !== "" &&
              !isNaN(modId)
            ) {
              await upsertServerMod(
                server.name,
                modId.toString(),
                null,
                true,
                server.excludeSharedMods || false,
              );
            } else {
              logger.warn(
                `[createCluster] Skipping invalid modId for server ${server.name}: ${modId}`,
              );
            }
          }
        }

        // Import server settings (excludeSharedMods, etc.)
        if (server.excludeSharedMods !== undefined) {
          await upsertServerSettings(server.name, server.excludeSharedMods);
        }
      }

      // Step 2: Install ASA binaries and create configs/scripts for each server
      for (const [i, serverConfig] of servers.entries()) {
        const serverName = serverConfig.name;
        const serverPath = path.join(clusterPath, serverName);
        // Pass progress callback to sub-managers
        this.parent.asaBinariesManager.setProgressCallback((progress) => {
          let msg =
            progress && typeof progress === "object" && "message" in progress
              ? progress.message
              : progress;
          if (typeof msg !== "string") {
            if (
              msg &&
              typeof msg === "object" &&
              "message" in msg &&
              typeof msg.message === "string"
            ) {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Installing ASA binaries for ${serverName}`, 2);
        });
        this.parent.configGenerator.setProgressCallback?.((progress) => {
          let msg =
            progress && typeof progress === "object" && "message" in progress
              ? progress.message
              : progress;
          if (typeof msg !== "string") {
            if (
              msg &&
              typeof msg === "object" &&
              "message" in msg &&
              typeof msg.message === "string"
            ) {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Writing config for ${serverName}`, 3);
        });
        this.parent.scriptGenerator.setProgressCallback?.((progress) => {
          let msg =
            progress && typeof progress === "object" && "message" in progress
              ? progress.message
              : progress;
          if (typeof msg !== "string") {
            if (
              msg &&
              typeof msg === "object" &&
              "message" in msg &&
              typeof msg.message === "string"
            ) {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Creating scripts for ${serverName}`, 4);
        });

        // Step 2: Installing ASA binaries
        currentStep = 2;
        emit(`Installing ASA binaries for ${serverName}`);
        await this.parent.asaBinariesManager.installForServerInCluster(
          clusterName,
          serverName,
          foreground,
        );

        // Step 3: Writing config files
        currentStep = 3;
        emit(`Writing config files for ${serverName}`);
        await this.parent.configGenerator.createServerConfigInCluster(
          clusterName,
          serverPath,
          serverConfig,
        );

        // Step 4: Creating scripts
        currentStep = 4;
        emit(`Creating scripts for ${serverName}`);
        await this.parent.scriptGenerator.createStartScriptInCluster(
          clusterName,
          serverPath,
          serverConfig,
        );
        await this.parent.scriptGenerator.createStopScriptInCluster(
          clusterName,
          serverPath,
          serverName,
        );
      }

      // Step 5: Finalizing
      currentStep = 5;
      emit(`Cluster ${clusterName} created successfully!`);

      return {
        success: true,
        message: `Cluster "${clusterName}" created successfully`,
        cluster: clusterConfigFile,
      };
    } catch (error) {
      emit(`Failed to create cluster: ${error.message}`);
      logger.error(`Failed to create cluster ${clusterName}:`, error);
      throw new Error(error.message);
    }
  }

  /**
   * Add a single server to an existing cluster.
   * Creates directories, installs binaries, generates config/scripts,
   * and registers the server in the database.
   */
  async addServerToCluster(clusterName, serverConfig) {
    const clusterPath = path.join(this.parent.clustersPath, clusterName);

    try {
      logger.info(`Adding server to cluster: ${clusterName}`, { serverConfig });
      this.parent.emitProgress?.(`Adding server to cluster: ${clusterName}`);

      // Check if cluster exists
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }

      const serverName = serverConfig.name;
      if (!serverName) {
        throw new Error("Server name is required");
      }

      const serverPath = path.join(clusterPath, serverName);

      // Check if server already exists in this cluster
      if (existsSync(serverPath)) {
        throw new Error(
          `Server "${serverName}" already exists in cluster "${clusterName}"`,
        );
      }

      // Patch in cluster metadata
      const enrichedConfig = {
        ...serverConfig,
        clusterId: clusterName,
        clusterName: clusterName,
      };

      // Create server directory structure
      await fs.mkdir(serverPath, { recursive: true });
      await fs.mkdir(path.join(serverPath, "binaries"), { recursive: true });
      await fs.mkdir(path.join(serverPath, "configs"), { recursive: true });
      await fs.mkdir(path.join(serverPath, "saves"), { recursive: true });
      await fs.mkdir(path.join(serverPath, "logs"), { recursive: true });

      this.parent.emitProgress?.(`Server directories created: ${serverName}`);

      // Install ASA binaries
      await this.parent.asaBinariesManager.installForServerInCluster(
        clusterName,
        serverName,
        false,
      );
      this.parent.emitProgress?.(`ASA binaries installed: ${serverName}`);

      // Create server configuration files
      await this.parent.configGenerator.createServerConfigInCluster(
        clusterName,
        serverPath,
        enrichedConfig,
      );
      this.parent.emitProgress?.(`Server configuration created: ${serverName}`);

      // Create start and stop scripts
      await this.parent.scriptGenerator.createStartScriptInCluster(
        clusterName,
        serverPath,
        enrichedConfig,
      );
      await this.parent.scriptGenerator.createStopScriptInCluster(
        clusterName,
        serverPath,
        serverName,
      );
      this.parent.emitProgress?.(`Server scripts created: ${serverName}`);

      // Register in database
      const { upsertServerConfig, upsertServerSettings } =
        await import("../database.js");
      await upsertServerConfig(serverName, JSON.stringify(enrichedConfig));

      if (serverConfig.excludeSharedMods !== undefined) {
        await upsertServerSettings(serverName, serverConfig.excludeSharedMods);
      }

      logger.info(
        `Server "${serverName}" added to cluster "${clusterName}" successfully`,
      );
      return {
        success: true,
        message: `Server "${serverName}" added to cluster "${clusterName}" successfully`,
      };
    } catch (error) {
      logger.error(`Failed to add server to cluster ${clusterName}:`, error);
      throw error;
    }
  }
}
