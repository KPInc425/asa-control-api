import { promises as fs, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../../utils/logger.js";
import { getServerConfig } from "../database.js";

/**
 * Several ASA mods keep their configuration in a save game under
 * ShooterGame/Saved/SaveGames rather than in GameUserSettings.ini. KP edits them
 * on one map only (the anchor, The Island) and expects every cluster member to
 * start from that copy.
 *
 * Only files that hold SETTINGS are listed here. Anything holding per-map state
 * (caches, known-creature lists, world or player data) must never be copied
 * across, and KPTweaks has no file here at all because its persistent actor
 * lives inside the world save.
 *
 * The copy may only happen while the target is stopped, because these mods
 * rewrite their save from memory on shutdown. The start path guarantees that:
 * it stops a running instance before regenerating the launch script.
 */
const DEFAULT_ANCHOR = "iLGaming-The Island";

/** Settings files, relative to Saved/SaveGames. Verified by inspecting each save. */
export const SYNC_FILES = [
  // Dino Depot: BabyAgeCap, BabyGrowthMultiplier, imprinting, stat recovery
  ["DinoDepotModSettings.sav"],
  // Sprinkles (Vanilla with Sprinkles): stack size/weight multipliers and presets
  ["VwS_StackingConfig.sav"],
  // Alien Plants: harvest ranges, seed/leaf weights, craft times, greenhouse effect
  ["AlienPlants.sav"],
  // Cybers Structures: per-structure bool/float/int configuration
  ["CS", "CyberStructures_Settings.sav"],
];

/**
 * Deliberately NOT synced, so a future reader does not "helpfully" add them:
 * - DinoDepotModCache.sav : per-server list of known dinos, not settings
 * - any world/player/tribe file : lives under SavedArks, not here
 * - KPTweaks : no file in SaveGames; its state is inside the world save
 */
export const NEVER_SYNC = ["DinoDepotModCache.sav"];

export function anchorServerName() {
  return process.env.MOD_SETTINGS_ANCHOR || process.env.DINO_DEPOT_ANCHOR || DEFAULT_ANCHOR;
}

/** Pure decision so it can be tested without touching the filesystem. */
export function shouldSyncSettings({ targetName, targetClusterId, anchor } = {}) {
  if (!targetName || !anchor) return false;
  if (targetName === anchor) return false;
  return Boolean(targetClusterId);
}

export function saveGamesDir(serverPath) {
  return path.join(serverPath, "ShooterGame", "Saved", "SaveGames");
}

async function hashFile(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function copyVerified(source, destFile) {
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  const sourceHash = await hashFile(source);
  if (existsSync(destFile) && (await hashFile(destFile)) === sourceHash) {
    return { changed: false, reason: "already-current" };
  }
  const staging = `${destFile}.sync-tmp`;
  await fs.copyFile(source, staging);
  if ((await hashFile(staging)) !== sourceHash) {
    await fs.rm(staging, { force: true });
    return { changed: false, reason: "hash-mismatch-after-copy" };
  }
  await fs.rm(destFile, { force: true });
  await fs.rename(staging, destFile);
  if ((await hashFile(destFile)) !== sourceHash) {
    return { changed: false, reason: "hash-mismatch-after-move" };
  }
  return { changed: true };
}

/**
 * Copy every allowlisted settings file from the anchor onto the target install.
 * Never throws: a failure here must not prevent the server from starting.
 */
export async function syncModSettingsForStart(targetName) {
  const anchor = anchorServerName();
  const results = [];
  try {
    const targetRow = getServerConfig(targetName);
    if (!targetRow) return { synced: false, reason: "no-config", files: results };

    let targetCfg = {};
    try { targetCfg = JSON.parse(targetRow.config_data || "{}"); } catch { /* keep {} */ }

    const targetClusterId = targetCfg.clusterId || targetCfg.clusterName || null;
    if (!shouldSyncSettings({ targetName, targetClusterId, anchor })) {
      return { synced: false, reason: "not-a-cluster-member", files: results };
    }
    if (!targetCfg.serverPath) return { synced: false, reason: "target-path-missing", files: results };

    const anchorRow = getServerConfig(anchor);
    if (!anchorRow) return { synced: false, reason: "anchor-not-found", files: results };
    let anchorCfg = {};
    try { anchorCfg = JSON.parse(anchorRow.config_data || "{}"); } catch { /* keep {} */ }
    if (!anchorCfg.serverPath) return { synced: false, reason: "anchor-path-missing", files: results };

    const anchorDir = saveGamesDir(anchorCfg.serverPath);
    const targetDir = saveGamesDir(targetCfg.serverPath);

    let changedAny = false;
    for (const rel of SYNC_FILES) {
      const label = rel.join("/");
      const source = path.join(anchorDir, ...rel);
      const dest = path.join(targetDir, ...rel);
      if (!existsSync(source)) {
        results.push({ file: label, changed: false, reason: "anchor-has-no-file" });
        continue;
      }
      try {
        const outcome = await copyVerified(source, dest);
        results.push({ file: label, ...outcome });
        if (outcome.changed) changedAny = true;
      } catch (error) {
        results.push({ file: label, changed: false, reason: error.message });
      }
    }

    const copied = results.filter((r) => r.changed).map((r) => r.file);
    if (changedAny) logger.info(`[mod-settings-sync] copied to ${targetName} from ${anchor}: ${copied.join(", ")}`);
    return { synced: changedAny, reason: changedAny ? "copied" : "nothing-to-do", files: results };
  } catch (error) {
    logger.warn(`[mod-settings-sync] skipped for ${targetName}: ${error.message}`);
    return { synced: false, reason: error.message, files: results };
  }
}
