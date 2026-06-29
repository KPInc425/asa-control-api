import { readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";

export class ServerDiscoveryModule {
  constructor(service) {
    this.service = service;
  }

  get serverRootPath() {
    return config.asa.serverRootPath;
  }

  /**
   * Find the actual config path for a server by searching through possible locations
   */
  async findServerConfigPath(serverName) {
    const currentPath = this.serverRootPath;
    console.log(`[findServerConfigPath] Looking for server: ${serverName}`);
    console.log(`[findServerConfigPath] Using serverRootPath: ${currentPath}`);
    console.log(
      `[findServerConfigPath] Server name length: ${serverName.length}`,
    );
    console.log(
      `[findServerConfigPath] Server name bytes: ${Buffer.from(serverName).toString("hex")}`,
    );

    // Check if serverRootPath exists
    if (!existsSync(currentPath)) {
      logger.error(
        `[findServerConfigPath] Server root path does not exist: ${currentPath}`,
      );
      return null;
    }

    // First, check if it's a standalone server (direct path)
    const standalonePath = join(
      currentPath,
      serverName,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
    );
    logger.info(
      `[findServerConfigPath] Checking standalone path: ${standalonePath}`,
    );
    logger.info(
      `[findServerConfigPath] Standalone path exists: ${existsSync(standalonePath)}`,
    );
    if (existsSync(standalonePath)) {
      logger.info(
        `[findServerConfigPath] Found standalone server at: ${standalonePath}`,
      );
      return {
        type: "standalone",
        path: standalonePath,
        serverName: serverName,
      };
    }

    // Second, check if it's a standalone server under the servers/ subdirectory
    const serversSubPath = join(
      currentPath,
      "servers",
      serverName,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
    );
    logger.info(
      `[findServerConfigPath] Checking servers subdirectory path: ${serversSubPath}`,
    );
    logger.info(
      `[findServerConfigPath] Servers subdirectory path exists: ${existsSync(serversSubPath)}`,
    );
    if (existsSync(serversSubPath)) {
      logger.info(
        `[findServerConfigPath] Found standalone server in servers/ subdirectory at: ${serversSubPath}`,
      );
      return {
        type: "standalone",
        path: serversSubPath,
        serverName: serverName,
      };
    }

    // If not standalone, check if it's a cluster server
    const clusterPath = join(currentPath, "clusters");
    logger.info(`[findServerConfigPath] Checking cluster path: ${clusterPath}`);
    logger.info(
      `[findServerConfigPath] Cluster path exists: ${existsSync(clusterPath)}`,
    );
    if (existsSync(clusterPath)) {
      try {
        const clusterEntries = await readdir(clusterPath, {
          withFileTypes: true,
        });
        logger.info(
          `[findServerConfigPath] All cluster entries: ${clusterEntries.map((e) => e.name + (e.isDirectory() ? "/" : "")).join(", ")}`,
        );
        const clusterDirs = clusterEntries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
        logger.info(
          `[findServerConfigPath] Found cluster directories: ${clusterDirs.join(", ")}`,
        );

        for (const clusterName of clusterDirs) {
          logger.info(
            `[findServerConfigPath] Checking cluster: ${clusterName}`,
          );
          const clusterServerPath = join(
            clusterPath,
            clusterName,
            serverName,
            "ShooterGame",
            "Saved",
            "Config",
            "WindowsServer",
          );
          logger.info(
            `[findServerConfigPath] Checking cluster server path: ${clusterServerPath}`,
          );
          logger.info(
            `[findServerConfigPath] Cluster server path exists: ${existsSync(clusterServerPath)}`,
          );

          // Also check if the server directory exists without the config subpath
          const serverDirPath = join(clusterPath, clusterName, serverName);
          logger.info(
            `[findServerConfigPath] Server directory path: ${serverDirPath}`,
          );
          logger.info(
            `[findServerConfigPath] Server directory exists: ${existsSync(serverDirPath)}`,
          );

          if (existsSync(clusterServerPath)) {
            logger.info(
              `[findServerConfigPath] Found cluster server at: ${clusterServerPath}`,
            );
            return {
              type: "cluster",
              path: clusterServerPath,
              serverName: serverName,
              clusterName: clusterName,
            };
          } else {
            logger.info(
              `[findServerConfigPath] Cluster server path does not exist`,
            );
          }
        }
      } catch (error) {
        logger.error(
          `[findServerConfigPath] Error checking cluster directories:`,
          error,
        );
      }
    } else {
      logger.info(`[findServerConfigPath] Cluster path does not exist`);
    }

    logger.warn(
      `[findServerConfigPath] Server ${serverName} not found in any location`,
    );
    return null;
  }

  /**
   * Get the full config path for a specific server and file
   */
  async getConfigFilePath(serverName, fileName = "GameUserSettings.ini") {
    const serverInfo = await this.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }
    return join(serverInfo.path, fileName);
  }

  /**
   * Get the config directory path for a specific server
   */
  async getConfigDirPath(serverName) {
    const serverInfo = await this.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }
    return serverInfo.path;
  }

  /**
   * List all available ASA servers by scanning both standalone and cluster directories
   */
  async listServers() {
    const currentPath = this.serverRootPath;
    logger.info(`[listServers] Using serverRootPath: ${currentPath}`);
    logger.info(
      `[listServers] NATIVE_BASE_PATH env: ${process.env.NATIVE_BASE_PATH}`,
    );
    logger.info(`[listServers] SERVER_MODE env: ${process.env.SERVER_MODE}`);
    logger.info(
      `[listServers] config.asa.serverRootPath: ${config.asa.serverRootPath}`,
    );
    const servers = [];

    try {
      // Check if serverRootPath exists
      if (!existsSync(currentPath)) {
        logger.warn(
          `[listServers] Server root path does not exist: ${currentPath}`,
        );
        return {
          success: true,
          servers: [],
          serverDetails: [],
          count: 0,
          rootPath: currentPath,
          message: `Server root path does not exist: ${currentPath}`,
        };
      }

      // Check standalone servers
      const entries = await readdir(currentPath, { withFileTypes: true });
      logger.info(
        `[listServers] Found entries in root: ${entries.map((e) => e.name + (e.isDirectory() ? "/" : "")).join(", ")}`,
      );

      const standaloneServers = entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => {
          // Check if this directory contains a ShooterGame folder (indicating it's an ASA server)
          const shooterGamePath = join(currentPath, entry.name, "ShooterGame");
          const exists = existsSync(shooterGamePath);
          logger.info(
            `[listServers] Checking ${entry.name}: ShooterGame exists = ${exists}`,
          );
          return exists;
        })
        .map((entry) => ({
          name: entry.name,
          type: "standalone",
          path: join(currentPath, entry.name),
        }));

      servers.push(...standaloneServers);
      logger.info(
        `[listServers] Found standalone servers: ${standaloneServers.map((s) => s.name).join(", ")}`,
      );

      // Check cluster servers
      const clusterPath = join(currentPath, "clusters");
      logger.info(`[listServers] Checking for cluster path: ${clusterPath}`);
      if (existsSync(clusterPath)) {
        logger.info(`[listServers] Cluster path exists, scanning clusters...`);
        const clusterEntries = await readdir(clusterPath, {
          withFileTypes: true,
        });
        const clusterDirs = clusterEntries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
        logger.info(
          `[listServers] Found cluster directories: ${clusterDirs.join(", ")}`,
        );

        for (const clusterName of clusterDirs) {
          const clusterServerPath = join(clusterPath, clusterName);
          logger.info(
            `[listServers] Scanning cluster: ${clusterName} at ${clusterServerPath}`,
          );
          try {
            const clusterServerEntries = await readdir(clusterServerPath, {
              withFileTypes: true,
            });
            logger.info(
              `[listServers] Found entries in ${clusterName}: ${clusterServerEntries.map((e) => e.name + (e.isDirectory() ? "/" : "")).join(", ")}`,
            );

            const clusterServers = clusterServerEntries
              .filter((entry) => entry.isDirectory())
              .filter((entry) => {
                // Check if this directory contains a ShooterGame folder
                const shooterGamePath = join(
                  clusterServerPath,
                  entry.name,
                  "ShooterGame",
                );
                const exists = existsSync(shooterGamePath);
                logger.info(
                  `[listServers] Checking ${clusterName}/${entry.name}: ShooterGame exists = ${exists}`,
                );
                return exists;
              })
              .map((entry) => ({
                name: entry.name,
                type: "cluster",
                clusterName: clusterName,
                path: join(clusterServerPath, entry.name),
              }));

            servers.push(...clusterServers);
            logger.info(
              `[listServers] Found cluster servers in ${clusterName}: ${clusterServers.map((s) => s.name).join(", ")}`,
            );
          } catch (error) {
            logger.error(
              `[listServers] Error reading cluster ${clusterName}:`,
              error,
            );
          }
        }
      } else {
        logger.info(
          `[listServers] No cluster directory found at: ${clusterPath}`,
        );
      }

      logger.info(`[listServers] Total servers found: ${servers.length}`);

      return {
        success: true,
        servers: servers.map((s) => s.name),
        serverDetails: servers,
        count: servers.length,
        rootPath: currentPath,
      };
    } catch (error) {
      logger.error(`[listServers] Error: ${error.message}`);
      if (error.code === "ENOENT") {
        logger.warn(
          `[listServers] ASA server root directory not found: ${this.serverRootPath}`,
        );
        return {
          success: true,
          servers: [],
          serverDetails: [],
          count: 0,
          rootPath: currentPath,
          message: "No ASA servers found",
        };
      }

      logger.error("Error listing ASA servers:", error);
      throw new Error(`Failed to list ASA servers: ${error.message}`);
    }
  }
}
