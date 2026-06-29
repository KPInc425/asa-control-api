import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";

/**
 * Global config management (merge, fetch, exclusions)
 */
export class GlobalConfigManager {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Get final configs for a server (global + server-specific)
   */
  async getFinalConfigsForServer(serverName) {
    try {
      const exclusionsPath = path.join(this.parent.basePath, "config-exclusions.json");
      let excludedServers = [];

      try {
        const exclusionsData = await fs.readFile(exclusionsPath, "utf8");
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch {
        // Exclusions file doesn't exist
      }

      if (excludedServers.includes(serverName)) {
        return { gameIni: null, gameUserSettings: null };
      }

      const effectiveGameType = this.parent.gameType || "ark";
      const globalConfigsPath = path.join(
        this.parent.basePath,
        "global-configs",
        effectiveGameType,
      );
      let gameIni = null;
      let gameUserSettings = null;

      try {
        const gameIniPath = path.join(globalConfigsPath, "Game.ini");
        gameIni = await fs.readFile(gameIniPath, "utf8");
      } catch {
        // Global Game.ini doesn't exist
      }

      try {
        const gameUserSettingsIniPath = path.join(
          globalConfigsPath,
          "GameUserSettings.ini",
        );
        gameUserSettings = await fs.readFile(gameUserSettingsIniPath, "utf8");
      } catch {
        // Global GameUserSettings.ini doesn't exist
      }

      return { gameIni, gameUserSettings };
    } catch (error) {
      logger.error(
        `Failed to get final configs for server ${serverName}:`,
        error,
      );
      return { gameIni: null, gameUserSettings: null };
    }
  }

  /**
   * Apply global config settings on top of base INI content (merge).
   */
  mergeGlobalSettings(baseIni, globalIni) {
    if (!globalIni) return baseIni;

    const globalSettings = new Map();
    const globalLines = globalIni.split("\n");
    let currentSection = "";
    for (const line of globalLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        currentSection = trimmed;
      } else if (trimmed.includes("=") && !trimmed.startsWith(";")) {
        const eqIdx = trimmed.indexOf("=");
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        if (!this._isInfrastructureKey(key)) {
          globalSettings.set(`${currentSection}\t${key}`, value);
        }
      }
    }

    if (globalSettings.size === 0) return baseIni;

    const resultLines = [];
    let inScalability = false;
    let inGraphicsSettings = false;
    for (const line of baseIni.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[ScalabilityGroups]")) inScalability = true;
      else if (trimmed.startsWith("[/Script/ShooterGame.ShooterGameUserSettings]")) inGraphicsSettings = true;
      else if (trimmed.startsWith("[")) {
        inScalability = false;
        inGraphicsSettings = false;
      }

      if (trimmed.includes("=") && !trimmed.startsWith(";") && !trimmed.startsWith("[")) {
        const eqIdx = trimmed.indexOf("=");
        const key = trimmed.substring(0, eqIdx).trim();
        const section = this._findSectionForLine(resultLines);
        const mapKey = `${section}\t${key}`;
        if (globalSettings.has(mapKey)) {
          resultLines.push(`${key}=${globalSettings.get(mapKey)}`);
          globalSettings.delete(mapKey);
          continue;
        }
      }

      resultLines.push(line);
    }

    let appendedSection = "";
    for (const [mapKey, value] of globalSettings) {
      const [section, key] = mapKey.split("\t");
      if (section !== appendedSection) {
        resultLines.push(`\n${section}`);
        appendedSection = section;
      }
      resultLines.push(`${key}=${value}`);
    }

    return resultLines.join("\n");
  }

  _findSectionForLine(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t.startsWith("[")) return t;
    }
    return "[ServerSettings]";
  }

  _isInfrastructureKey(key) {
    const infraKeys = [
      "RCONPort", "RCONEnabled", "RCONServerGameLogBuffer",
      "ServerAdminPassword", "AdminPassword", "ServerPassword",
      "CustomDynamicConfigUrl", "MaxPlayers", "SessionName", "WinLivePlayers",
      "ServerHardcore", "ServerPVE", "ServerForceNoHUD",
      "NoTributeDownloads", "PreventDownloadItems", "PreventDownloadDinos",
      "ActiveEvent", "OverrideOfficialDifficulty", "OverrideStartTime",
      "StartTimeOverride",
    ];
    return infraKeys.some(
      (k) => key === k || key.toLowerCase() === k.toLowerCase(),
    );
  }

  /**
   * Get global custom dynamic config URL from global-settings.json
   */
  async getGlobalDynamicConfigUrl() {
    try {
      const globalSettingsPath = path.join(
        this.parent.basePath,
        "global-configs",
        this.parent.gameType || "ark",
        "global-settings.json",
      );
      const data = JSON.parse(await fs.readFile(globalSettingsPath, "utf8"));
      return data.customDynamicConfigUrl || "";
    } catch {
      return "";
    }
  }
}
