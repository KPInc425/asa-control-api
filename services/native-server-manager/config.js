import path from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";
import { upsertServerConfig, getServerConfig } from "../database.js";

/**
 * Server configuration helpers: DB access, arg building
 */
export class ServerConfigHelper {
  constructor(manager) {
    this.manager = manager;
  }

  getServerConfigFromDatabase(name) {
    try {
      const dbConfig = getServerConfig(name);
      if (dbConfig) return JSON.parse(dbConfig.config_data);
      return null;
    } catch (error) {
      logger.warn(`Failed to get database config for ${name}:`, error.message);
      return null;
    }
  }

  getClusterIdFromConfig(serverConfig) {
    if (!serverConfig) return null;
    return (
      serverConfig.clusterId ||
      serverConfig.clusterName ||
      (serverConfig.config &&
        (serverConfig.config.clusterId || serverConfig.config.clusterName)) ||
      null
    );
  }

  async addServerConfig(name, configData) {
    await upsertServerConfig(name, JSON.stringify(configData));
    logger.info(`Server configuration saved to database: ${name}`);
  }

  buildServerArgs(serverCfg) {
    const args = [
      (serverCfg.mapName || "TheIsland") + "_WP",
      "?listen",
      `?Port=${serverCfg.gamePort || 7777}`,
      `?QueryPort=${serverCfg.queryPort || 27015}`,
      `?RCONPort=${serverCfg.rconPort || 32330}`,
      `?ServerName="${serverCfg.serverName || "ASA Server"}"`,
      `?MaxPlayers=${serverCfg.maxPlayers || 70}`,
      `?ServerPassword="${serverCfg.serverPassword || ""}"`,
      `?AdminPassword="${serverCfg.adminPassword || "admin123"}"`,
    ];
    if (serverCfg.mods && serverCfg.mods.length > 0) args.push(`?Mods=${serverCfg.mods.join(",")}`);
    if (serverCfg.disableBattleEye) args.push("-NoBattleEye");
    const dynamicConfigUrl = serverCfg.dynamicConfigUrl || (serverCfg.asa && serverCfg.asa.dynamicConfigUrl) || config.asa.dynamicConfigUrl;
    if (dynamicConfigUrl) args.push(`-DynamicConfigURL=${dynamicConfigUrl}`);
    const customDynamicConfigUrl = serverCfg.customDynamicConfigUrl || (serverCfg.asa && serverCfg.asa.customDynamicConfigUrl) || config.asa.customDynamicConfigUrl;
    if (customDynamicConfigUrl) args.push(`?CustomDynamicConfigUrl="${customDynamicConfigUrl}"`);
    if (serverCfg.additionalArgs) args.push(...serverCfg.additionalArgs.split(" "));
    return args;
  }

  buildServerArgsFromCluster(server) {
    const args = [];
    args.push((server.map || "TheIsland") + "_WP");
    args.push("?listen");
    args.push(`?Port=${server.gamePort || 7777}`);
    args.push(`?QueryPort=${server.queryPort || 27015}`);
    args.push(`?RCONPort=${server.rconPort || 32330}`);
    args.push(`?MaxPlayers=${server.maxPlayers || 70}`);
    if (server.adminPassword) args.push(`?ServerAdminPassword=${server.adminPassword}`);
    if (server.serverPassword) args.push(`?ServerPassword=${server.serverPassword}`);
    if (server.clusterId) args.push(`?ClusterId=${server.clusterId}`);
    if (server.clusterPassword) args.push(`?ClusterPassword=${server.clusterPassword}`);
    const clusterDataPath = path.join(path.dirname(server.serverPath || ""), "clusterdata").replace(/\\/g, "/");
    args.push(`?ClusterDirOverride=${clusterDataPath}`);
    const dynamicConfigUrl = server.dynamicConfigUrl || config.asa.dynamicConfigUrl;
    if (dynamicConfigUrl) args.push(`-DynamicConfigURL=${dynamicConfigUrl}`);
    const customDynamicConfigUrl = server.customDynamicConfigUrl || config.asa.customDynamicConfigUrl;
    if (customDynamicConfigUrl) args.push(`?CustomDynamicConfigUrl="${customDynamicConfigUrl}"`);
    return args;
  }
}
