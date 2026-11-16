import { promises as fs, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../../utils/logger.js";
import { getServerConfig } from "../database.js";

/**
 * Dino Depot keeps its settings in a save game, not in GameUserSettings.ini, and
 * the file is per-install. KP edits them only on the anchor map (The Island) and
 * wants every cluster member to start from that copy.
 *
 * The copy must happen while the target is stopped, because the mod rewrites the
 * file from memory on shutdown. The start path already guarantees that: it stops
 * a running instance before regenerating the launch script.
 */
export const DEPOT_SETTINGS_FILE = "DinoDepotModSettings.sav";
const DEFAULT_ANCHOR = "iLGaming-The Island";

export function anchorServerName() {
  return process.env.DINO_DEPOT_ANCHOR || DEFAULT_ANCHOR;
}

/** Pure decision so it can be tested without touching the filesystem. */
export function shouldSyncSettings({ targetName, targetClusterId, anchor } = {}) {
  if (!targetName || !anchor) return false;
  if (targetName === anchor) return false;
  return Boolean(targetClusterId);
}

export function settingsPaths(serverPath) {
  const dir = path.join(serverPath, "ShooterGame", "Saved", "SaveGames");
  return { dir, file: path.join(dir, DEPOT_SETTINGS_FILE) };
}

async function hashFile(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

/**
 * Copy the anchor's Dino Depot settings onto the target install, if the target
 * is a cluster member that is not the anchor. Never throws: a failure here must
 * not prevent the server from starting.
 */
export async function syncDinoDepotSettingsForStart(targetName) {
  const anchor = anchorServerName();
  try {
    const targetRow = getServerConfig(targetName);
    if (!targetRow) return { synced: false, reason: "no-config" };

    let targetCfg = {};
    try { targetCfg = JSON.parse(targetRow.config_data || "{}"); } catch { /* keep {} */ }

    const targetClusterId = targetCfg.clusterId || targetCfg.clusterName || null;
    if (!shouldSyncSettings({ targetName, targetClusterId, anchor })) {
      return { synced: false, reason: "not-a-cluster-member" };
    }

    const anchorRow = getServerConfig(anchor);
    if (!anchorRow) return { synced: false, reason: "anchor-not-found" };
    let anchorCfg = {};
    try { anchorCfg = JSON.parse(anchorRow.config_data || "{}"); } catch { /* keep {} */ }

    if (!anchorCfg.serverPath) return { synced: false, reason: "anchor-path-missing" };
    if (!targetCfg.serverPath) return { synced: false, reason: "target-path-missing" };

    const source = settingsPaths(anchorCfg.serverPath).file;
    if (!existsSync(source)) return { synced: false, reason: "anchor-has-no-settings" };

    const dest = settingsPaths(targetCfg.serverPath);
    await fs.mkdir(dest.dir, { recursive: true });

    const sourceHash = await hashFile(source);
    if (existsSync(dest.file) && (await hashFile(dest.file)) === sourceHash) {
      return { synced: false, reason: "already-current" };
    }

    const staging = `${dest.file}.sync-tmp`;
    await fs.copyFile(source, staging);
    if ((await hashFile(staging)) !== sourceHash) {
      await fs.rm(staging, { force: true });
      return { synced: false, reason: "hash-mismatch-after-copy" };
    }

    await fs.rm(dest.file, { force: true });
    await fs.rename(staging, dest.file);
    if ((await hashFile(dest.file)) !== sourceHash) {
      return { synced: false, reason: "hash-mismatch-after-move" };
    }

    logger.info(`[dino-depot-sync] ${DEPOT_SETTINGS_FILE} copied to ${targetName} from ${anchor}`);
    return { synced: true };
  } catch (error) {
    logger.warn(`[dino-depot-sync] skipped for ${targetName}: ${error.message}`);
    return { synced: false, reason: error.message };
  }
}
