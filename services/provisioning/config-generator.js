import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';
import { upsertServerConfig } from '../database.js';

/**
 * Configuration Generator
 * Handles generation of INI files and server configuration files
 */
export class ConfigGenerator {
  constructor(basePath) {
    this.basePath = basePath;
  }

  /**
   * Generate GameUserSettings.ini content
   */
  generateGameUserSettings(serverConfig) {
    const settings = `[ServerSettings]
SessionName=${serverConfig.name || 'ASA Server'}
Port=${serverConfig.gamePort || 7777}
QueryPort=${serverConfig.queryPort || 27015}
RCONEnabled=True
RCONPort=${serverConfig.rconPort || 32330}
AdminPassword=${serverConfig.adminPassword || 'admin123'}
ServerPassword=${serverConfig.serverPassword || ''}
WinLivePlayers=${serverConfig.maxPlayers || 70}
DifficultyOffset=1.0
OverrideOfficialDifficulty=5.0
HarvestAmountMultiplier=${serverConfig.harvestMultiplier || 3.0}
TamingSpeedMultiplier=${serverConfig.tamingMultiplier || 5.0}
XPMultiplier=${serverConfig.xpMultiplier || 3.0}
ResourcesRespawnPeriodMultiplier=0.5
AllowFlyerCarryPvE=True
ShowMapPlayerLocation=True
EnablePvPGamma=True
EnablePvEGamma=True
AllowCaveBuildingPvE=True
AllowCaveBuildingPvP=True
bShowCreativeMode=False
bUseCorpseLocator=True
bDisableStructurePlacementCollision=False
bAllowPlatformSaddleMultiFloors=True
bDisablePvEGamma=False
bDisableGenesis=False
bAutoPvETimer=False
bAutoPvEUseSystemTime=False
AutoPvEStartTimeSeconds=0
AutoPvEStopTimeSeconds=0
KickIdlePlayersPeriod=900.0
MaxIdleTime=900.0
bUseBPTaxonomyTree=False
bAutoCreateNewPlayerData=True
bDisableStructureDecayPvE=False
PvEStructureDecayPeriodMultiplier=1.0
PvEStructureDecayDestructionPeriod=1.0
bForceCanRideFlyers=False
bDisableDinoDecayPvE=False
PvEDinoDecayPeriodMultiplier=1.0
bAllowUnlimitedSpecsPerTribe=False
bUseTameLimitForStructuresOnly=False
bPassiveDefensesDamageRiderlessDinos=False
bPvEAllowStructuresAtSupplyDrops=False
bLimitTurretsInRange=False
LimitTurretsRange=10000.0
LimitTurretsNum=100
bHardLimitTurretsInRange=False

[/script/shootergame.shootergamemode]
bUseCorpseLocator=True
bDisableGenesis=False
bDisableStructurePlacementCollision=False
bAllowPlatformSaddleMultiFloors=True
bDisablePvEGamma=False
bAutoPvETimer=False
bAutoPvEUseSystemTime=False
AutoPvEStartTimeSeconds=0
AutoPvEStopTimeSeconds=0
bDisableStructureDecayPvE=False
PvEStructureDecayPeriodMultiplier=1.0
PvEStructureDecayDestructionPeriod=1.0
bForceCanRideFlyers=False
bDisableDinoDecayPvE=False
PvEDinoDecayPeriodMultiplier=1.0
bAllowUnlimitedSpecsPerTribe=False
bUseTameLimitForStructuresOnly=False
bPassiveDefensesDamageRiderlessDinos=False
bPvEAllowStructuresAtSupplyDrops=False
bLimitTurretsInRange=False
LimitTurretsRange=10000.0
LimitTurretsNum=100
bHardLimitTurretsInRange=False

[MessageOfTheDay]
Message=Welcome to ${serverConfig.name || 'ASA Server'}!
Duration=10
`;

    return settings;
  }

  /**
   * Generate Game.ini content
   */
  generateGameIni(serverConfig) {
    const settings = `[/script/shootergame.shootergamemode]
bUseCorpseLocator=True
bDisableGenesis=False
bDisableStructurePlacementCollision=False
bAllowPlatformSaddleMultiFloors=True
bDisablePvEGamma=False
bAutoPvETimer=False
bAutoPvEUseSystemTime=False
AutoPvEStartTimeSeconds=0
AutoPvEStopTimeSeconds=0
bDisableStructureDecayPvE=False
PvEStructureDecayPeriodMultiplier=1.0
PvEStructureDecayDestructionPeriod=1.0
bForceCanRideFlyers=False
bDisableDinoDecayPvE=False
PvEDinoDecayPeriodMultiplier=1.0
bAllowUnlimitedSpecsPerTribe=False
bUseTameLimitForStructuresOnly=False
bPassiveDefensesDamageRiderlessDinos=False
bPvEAllowStructuresAtSupplyDrops=False
bLimitTurretsInRange=False
LimitTurretsRange=10000.0
LimitTurretsNum=100
bHardLimitTurretsInRange=False

[/script/engine.gamesession]
WinLivePlayers=${serverConfig.maxPlayers || 70}

[/script/shootergame.shootergamemode]
DifficultyOffset=1.0
OverrideOfficialDifficulty=5.0
`;

    return settings;
  }

  /**
   * Create server configuration files for standalone server
   */
  async createServerConfig(serverPath, serverConfig) {
    try {
      const configsPath = path.join(serverPath, 'configs');
      
      // Create Game.ini
      const gameIni = this.generateGameIni(serverConfig);
      await fs.writeFile(path.join(configsPath, 'Game.ini'), gameIni);
      
      // Create GameUserSettings.ini
      const gameUserSettings = this.generateGameUserSettings(serverConfig);
      await fs.writeFile(path.join(configsPath, 'GameUserSettings.ini'), gameUserSettings);
      
      // Create server-config.json
      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || 'TheIsland',
        gamePort: serverConfig.gamePort || 7777,
        queryPort: serverConfig.queryPort || 27015,
        rconPort: serverConfig.rconPort || 32330,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || 'admin123',
        serverPassword: serverConfig.serverPassword || '',
        rconPassword: serverConfig.adminPassword || 'admin123', // RCON password is same as admin password
        clusterId: serverConfig.clusterId || '',
        clusterPassword: serverConfig.clusterPassword || '',
        customDynamicConfigUrl: serverConfig.customDynamicConfigUrl || '',
        disableBattleEye: serverConfig.disableBattleEye || false,
        created: new Date().toISOString(),
        binariesPath: path.join(serverPath, 'binaries'),
        configsPath: configsPath,
        savesPath: path.join(serverPath, 'saves'),
        logsPath: path.join(serverPath, 'logs'),
        mods: serverConfig.mods || []
      };
      
      await fs.writeFile(
        path.join(serverPath, 'server-config.json'),
        JSON.stringify(serverConfigFile, null, 2)
      );
      
      logger.info(`Server configuration created for: ${serverConfig.name}`);
    } catch (error) {
      logger.error(`Failed to create server configuration for ${serverConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Create server configuration files in cluster
   */
  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    try {
      // SteamCMD creates a structure like:
      // serverPath/
      //   ShooterGame/
      //     Saved/
      //       Config/
      //         WindowsServer/
      //           Game.ini
      //           GameUserSettings.ini
      const configsPath = path.join(serverPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      const binariesPath = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64');
      
      // Create configs directory if it doesn't exist
      await fs.mkdir(configsPath, { recursive: true });
      
      // Get final configs for this server (global + server-specific)
      const finalConfigs = await this.getFinalConfigsForServer(serverConfig.name);
      
      // Create Game.ini
      const gameIni = finalConfigs.gameIni || this.generateGameIni(serverConfig);
      await fs.writeFile(path.join(configsPath, 'Game.ini'), gameIni);
      
      // Create GameUserSettings.ini
      const gameUserSettings = finalConfigs.gameUserSettings || this.generateGameUserSettings(serverConfig);
      await fs.writeFile(path.join(configsPath, 'GameUserSettings.ini'), gameUserSettings);
      
      // Create server-config.json
      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || 'TheIsland',
        gamePort: serverConfig.gamePort || 7777,
        queryPort: serverConfig.queryPort || 27015,
        rconPort: serverConfig.rconPort || 32330,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || 'admin123',
        serverPassword: serverConfig.password || serverConfig.serverPassword || '',
        rconPassword: serverConfig.adminPassword || 'admin123', // RCON password is same as admin password
        clusterId: serverConfig.clusterId || clusterName,
        clusterPassword: serverConfig.clusterPassword || '',
        customDynamicConfigUrl: serverConfig.customDynamicConfigUrl || '',
        disableBattleEye: serverConfig.disableBattleEye || false,
        created: new Date().toISOString(),
        binariesPath: binariesPath,
        configsPath: configsPath,
        savesPath: path.join(serverPath, 'ShooterGame', 'Saved', 'SaveGames'),
        logsPath: path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        gameUserSettings: serverConfig.gameUserSettings,
        gameIni: serverConfig.gameIni,
        mods: serverConfig.mods || []
      };
      
      await fs.writeFile(
        path.join(serverPath, 'server-config.json'),
        JSON.stringify(serverConfigFile, null, 2)
      );
      
      logger.info(`Server configuration created for: ${serverConfig.name} in cluster ${clusterName}`);
    } catch (error) {
      logger.error(`Failed to create server configuration for ${serverConfig.name} in cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Get final configs for a server (global + server-specific)
   */
  async getFinalConfigsForServer(serverName) {
    try {
      // Check if server is excluded from global configs
      const exclusionsPath = path.join(this.basePath, 'config-exclusions.json');
      let excludedServers = [];
      
      try {
        const exclusionsData = await fs.readFile(exclusionsPath, 'utf8');
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch (error) {
        // Exclusions file doesn't exist
      }
      
      // If server is excluded, return empty configs (will use defaults)
      if (excludedServers.includes(serverName)) {
        return { gameIni: null, gameUserSettings: null };
      }
      
      // Get global configs
      const globalConfigsPath = path.join(this.basePath, 'global-configs');
      let gameIni = null;
      let gameUserSettings = null;
      
      try {
        const gameIniPath = path.join(globalConfigsPath, 'Game.ini');
        gameIni = await fs.readFile(gameIniPath, 'utf8');
      } catch (error) {
        // Global Game.ini doesn't exist
      }
      
      try {
        const gameUserSettingsIniPath = path.join(globalConfigsPath, 'GameUserSettings.ini');
        gameUserSettings = await fs.readFile(gameUserSettingsIniPath, 'utf8');
      } catch (error) {
        // Global GameUserSettings.ini doesn't exist
      }
      
      return { gameIni, gameUserSettings };
    } catch (error) {
      logger.error(`Failed to get final configs for server ${serverName}:`, error);
      return { gameIni: null, gameUserSettings: null };
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
        regenerateScripts
      });
      // Try standalone servers first
      const standaloneServerPath = path.join(this.serversPath, serverName, 'server-config.json');
      if (existsSync(standaloneServerPath)) {
        let configContent = await fs.readFile(standaloneServerPath, 'utf8');
        let serverConfig = JSON.parse(configContent);
        const updatedConfig = { ...serverConfig, ...newSettings };
        await fs.writeFile(standaloneServerPath, JSON.stringify(updatedConfig, null, 2));
        await upsertServerConfig(serverName, JSON.stringify(updatedConfig));
        logger.info(`Standalone server configuration updated for ${serverName}`);
        return { success: true, message: `Server settings updated for ${serverName}`, updatedConfig };
      }
      // Try clusters
      const clusterDirs = await fs.readdir(this.clustersPath);
      for (const clusterName of clusterDirs) {
        const clusterServerPath = path.join(this.clustersPath, clusterName, serverName, 'server-config.json');
        if (existsSync(clusterServerPath)) {
          let configContent = await fs.readFile(clusterServerPath, 'utf8');
          let serverConfig = JSON.parse(configContent);
          const updatedConfig = { ...serverConfig, ...newSettings };
          await fs.writeFile(clusterServerPath, JSON.stringify(updatedConfig, null, 2));
          await upsertServerConfig(serverName, JSON.stringify(updatedConfig));
          logger.info(`Cluster server configuration updated for ${serverName} in cluster ${clusterName}`);

          // PATCH: Also update the cluster.json
          const clusterJsonPath = path.join(this.clustersPath, clusterName, 'cluster.json');
          if (existsSync(clusterJsonPath)) {
            let clusterConfig = JSON.parse(await fs.readFile(clusterJsonPath, 'utf8'));
            if (Array.isArray(clusterConfig.servers)) {
              const idx = clusterConfig.servers.findIndex(s => s.name === serverName);
              if (idx !== -1) {
                clusterConfig.servers[idx] = { ...clusterConfig.servers[idx], ...newSettings };
                await fs.writeFile(clusterJsonPath, JSON.stringify(clusterConfig, null, 2));
                logger.info(`Cluster config updated for server ${serverName} in cluster ${clusterName}`);
              }
            }
          }

          return { success: true, message: `Server settings updated for ${serverName} in cluster ${clusterName}`, updatedConfig };
        }
      }
      throw new Error(`Server configuration not found for ${serverName}`);
    } catch (error) {
      logger.error(`Failed to update server settings for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to list clusters (needed for updateServerSettings)
   */
  async listClusters() {
    try {
      const clusters = [];
      if (!existsSync(this.clustersPath)) {
        return clusters;
      }
      
      const clusterDirs = await fs.readdir(this.clustersPath);
      
      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);
          
          if (stat.isDirectory()) {
            const configPath = path.join(clusterPath, 'cluster.json');
            let clusterConfig = {};
            
            try {
              const configContent = await fs.readFile(configPath, 'utf8');
              clusterConfig = JSON.parse(configContent);
            } catch {
              // Cluster config not found, use defaults
              clusterConfig = {
                name: clusterName,
                servers: []
              };
            }
            
            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig
            });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }
      
      return clusters;
    } catch (error) {
      logger.error('Failed to list clusters:', error);
      return [];
    }
  }

  /**
   * Update paths if they change
   */
  updatePaths(basePath, clustersPath, serversPath) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }
} 
