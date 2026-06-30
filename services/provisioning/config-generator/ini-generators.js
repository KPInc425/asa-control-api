import { gameFor } from "../../../games/index.js";

/**
 * INI file content generators
 */
export class IniGenerators {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Generate GameUserSettings.ini content
   */
  async generateGameUserSettings(serverConfig) {
    const adapter = gameFor(serverConfig.gameType || this.parent.gameType || "ark");
    if (adapter.id !== "ark") {
      const files = await adapter.generateConfigFiles(serverConfig);
      return files["GameUserSettings.ini"] || "";
    }
    const settings = `[ServerSettings]
SessionName=${serverConfig.name || "ASA Server"}
RCONEnabled=True
RCONPort=${serverConfig.rconPort || 32330}
AdminPassword=${serverConfig.adminPassword || "admin123"}
ServerPassword=${serverConfig.serverPassword || ""}
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
Message=Welcome to ${serverConfig.name || "ASA Server"}!
Duration=10
`;

    return settings;
  }

  /**
   * Generate Game.ini content
   */
  async generateGameIni(serverConfig) {
    const adapter = gameFor(serverConfig.gameType || this.parent.gameType || "ark");
    if (adapter.id !== "ark") {
      const files = await adapter.generateConfigFiles(serverConfig);
      return files["Game.ini"] || "";
    }
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
   * Generate Engine.ini content with EOS/OnlineSubsystem configuration
   */
  async generateEngineIni(serverConfig) {
    const adapter = gameFor(serverConfig.gameType || this.parent.gameType || "ark");
    if (adapter.id !== "ark") {
      const files = await adapter.generateConfigFiles(serverConfig);
      return files["Engine.ini"] || "";
    }
    const settings = `[OnlineSubsystem]
DefaultPlatformService=EOS
bUseDefaultEOSAttributeSystem=True

[OnlineSubsystemEOS]
bEnabled=True
bUseEOSSpeech=False
bUseEOSSessions=True
bUseEOSConnect=True
bUseEOSVoice=False

[/Script/Engine.GameEngine]
!OnlineSubsystemDefinitions=ClearArray
+OnlineSubsystemDefinitions=(ConfigName=EOS,DriverClassName=OnlineSubsystemEOS)

[/Script/OnlineSubsystemEOS.EOSSettings]
bUseDevAuth=False
`;
    return settings;
  }
}
