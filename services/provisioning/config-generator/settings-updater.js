import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../../utils/logger.js";
import { upsertServerConfig } from "../../database.js";

/**
 * Server settings update operations
 */
export class SettingsUpdater {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Regenerate INI config files on disk for a server.
   * Writes GameUserSettings.ini, Game.ini, and Engine.ini into
   * ShooterGame/Saved/Config/WindowsServer/.
   */
  async _regenerateIniFiles(serverPath, serverConfig) {
    try {
      const configsPath = path.join(
        serverPath,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
      );
      await fs.mkdir(configsPath, { recursive: true });

      const finalConfigs = await this.parent.getFinalConfigsForServer(
        serverConfig.name,
      );

      const baseGameIni = await this.parent.generateGameIni(serverConfig);
      const baseGameUserSettings = await this.parent.generateGameUserSettings(serverConfig);
      const baseEngineIni = await this.parent.generateEngineIni(serverConfig);

      const gameIni = this.parent.mergeGlobalSettings(baseGameIni, finalConfigs.gameIni);
      const gameUserSettings = this.parent.mergeGlobalSettings(baseGameUserSettings, finalConfigs.gameUserSettings);

      await fs.writeFile(path.join(configsPath, "Game.ini"), gameIni);
      await fs.writeFile(path.join(configsPath, "GameUserSettings.ini"), gameUserSettings);
      await fs.writeFile(path.join(configsPath, "Engine.ini"), baseEngineIni);

      logger.info(`INI files regenerated for ${serverConfig.name} at ${configsPath}`);
    } catch (error) {
      logger.error(`Failed to regenerate INI files for ${serverConfig.name}:`, error);
    }
  }

  /**
   * Update server settings and regenerate configs if needed
   */
  async updateServerSettings(serverName, newSettings, options = {}) {
    const { regenerateConfigs = true, regenerateScripts = true } = options;
    try {
      logger.info(`Updating server settings for ${serverName}`, {
        disableBattleEye: newSettings.disableBattleEye,
        regenerateConfigs,
        regenerateScripts,
      });
      // Try standalone servers first
      const standaloneServerPath = path.join(
        this.parent.serversPath,
        serverName,
        "server-config.json",
      );
      if (existsSync(standaloneServerPath)) {
        let configContent = await fs.readFile(standaloneServerPath, "utf8");
        let serverConfig = JSON.parse(configContent);
        const updatedConfig = { ...serverConfig, ...newSettings };
        await fs.writeFile(
          standaloneServerPath,
          JSON.stringify(updatedConfig, null, 2),
        );
        await upsertServerConfig(serverName, JSON.stringify(updatedConfig));
        logger.info(
          `Standalone server configuration updated for ${serverName}`,
        );

        // Regenerate INI files on disk so Port/QueryPort/etc take effect
        if (regenerateConfigs) {
          const serverDir = path.dirname(standaloneServerPath);
          await this._regenerateIniFiles(serverDir, updatedConfig);
        }

        return {
          success: true,
          message: `Server settings updated for ${serverName}`,
          updatedConfig,
        };
      }
      // Try clusters
      const clusterDirs = await fs.readdir(this.parent.clustersPath);
      for (const clusterName of clusterDirs) {
        const clusterServerPath = path.join(
          this.parent.clustersPath,
          clusterName,
          serverName,
          "server-config.json",
        );
        if (existsSync(clusterServerPath)) {
          let configContent = await fs.readFile(clusterServerPath, "utf8");
          let serverConfig = JSON.parse(configContent);
          const updatedConfig = { ...serverConfig, ...newSettings };
          await fs.writeFile(
            clusterServerPath,
            JSON.stringify(updatedConfig, null, 2),
          );
          await upsertServerConfig(serverName, JSON.stringify(updatedConfig));
          logger.info(
            `Cluster server configuration updated for ${serverName} in cluster ${clusterName}`,
          );

          // Regenerate INI files on disk
          if (regenerateConfigs) {
            const serverDir = path.dirname(clusterServerPath);
            await this._regenerateIniFiles(serverDir, updatedConfig);
          }

          // PATCH: Also update the cluster.json
          const clusterJsonPath = path.join(
            this.parent.clustersPath,
            clusterName,
            "cluster.json",
          );
          if (existsSync(clusterJsonPath)) {
            let clusterConfig = JSON.parse(
              await fs.readFile(clusterJsonPath, "utf8"),
            );
            if (Array.isArray(clusterConfig.servers)) {
              const idx = clusterConfig.servers.findIndex(
                (s) => s.name === serverName,
              );
              if (idx !== -1) {
                clusterConfig.servers[idx] = {
                  ...clusterConfig.servers[idx],
                  ...newSettings,
                };
                await fs.writeFile(
                  clusterJsonPath,
                  JSON.stringify(clusterConfig, null, 2),
                );
                logger.info(
                  `Cluster config updated for server ${serverName} in cluster ${clusterName}`,
                );
              }
            }
          }

          return {
            success: true,
            message: `Server settings updated for ${serverName} in cluster ${clusterName}`,
            updatedConfig,
          };
        }
      }
      throw new Error(`Server configuration not found for ${serverName}`);
    } catch (error) {
      logger.error(
        `Failed to update server settings for ${serverName}:`,
        error,
      );
      throw error;
    }
  }
}
