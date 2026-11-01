/**
 * Mod name resolver
 *
 * Maps a CurseForge mod id to its display name without calling CurseForge (its
 * API needs a key and 403s unauthenticated, and the site is behind Cloudflare).
 * Two local sources, both produced by the game itself:
 *
 *   1. The install's mod cache:
 *      <install>/ShooterGame/Mods/<manifest>/<id>_<version>/<InternalModName>/
 *      Gives every downloaded mod, including ones that never started.
 *
 *   2. The server log:
 *      "LogCFCore: Mod valid: <Display Name> (<id>)"
 *      Gives the real storefront name, including spaces and punctuation.
 *
 * Log names win over folder names. Folder names are humanised as a fallback
 * ("SpookyDecor" -> "Spooky Decor").
 */

import fs from "fs/promises";
import path from "path";
import { existsSync, readdirSync } from "fs";
import config from "../config/index.js";
import logger from "../utils/logger.js";

const LOG_TAIL_BYTES = 512 * 1024;
const CACHE_TTL_MS = 60 * 1000;

let cache = { at: 0, names: {} };

function humanise(folderName) {
  if (!folderName) return null;
  // Split camel case and letter/digit boundaries, collapse separators.
  const spaced = folderName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || null;
}

async function listDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Every server install this API knows about: standalone servers and cluster members.
 */
function installRoots(basePath) {
  const roots = new Set();
  const serversPath = path.join(basePath, "servers");
  if (existsSync(serversPath)) {
    for (const entry of safeDirSync(serversPath)) {
      if (entry.isDirectory()) roots.add(path.join(serversPath, entry.name));
    }
  }
  const clustersPath = path.join(basePath, "clusters");
  if (existsSync(clustersPath)) {
    for (const cluster of safeDirSync(clustersPath)) {
      if (!cluster.isDirectory()) continue;
      const clusterPath = path.join(clustersPath, cluster.name);
      for (const server of safeDirSync(clusterPath)) {
        if (server.isDirectory()) roots.add(path.join(clusterPath, server.name));
      }
    }
  }
  return [...roots];
}

function safeDirSync(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function namesFromModCache(installDir) {
  const found = new Map();
  const modsRoot = path.join(installDir, "ShooterGame", "Mods");
  for (const manifestDir of await listDirSafe(modsRoot)) {
    if (!manifestDir.isDirectory()) continue;
    const manifestPath = path.join(modsRoot, manifestDir.name);
    for (const versionDir of await listDirSafe(manifestPath)) {
      if (!versionDir.isDirectory()) continue;
      // "<id>_<version>"
      const id = versionDir.name.split("_")[0];
      if (!/^\d+$/.test(id)) continue;
      const versionPath = path.join(manifestPath, versionDir.name);
      const inner = await listDirSafe(versionPath);
      const nameDir = inner.find((e) => e.isDirectory());
      const name = humanise(nameDir?.name) || humanise(path.basename(versionDir.name));
      if (name) found.set(id, name);
    }
  }
  return found;
}

async function readTail(file, bytes) {
  try {
    const stat = await fs.stat(file);
    const start = Math.max(0, stat.size - bytes);
    const handle = await fs.open(file, "r");
    try {
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

async function namesFromLogs(installDir) {
  const found = new Map();
  const logsDir = path.join(installDir, "ShooterGame", "Saved", "Logs");
  const entries = await listDirSafe(logsDir);
  const logFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".log"))
    .map((e) => path.join(logsDir, e.name));

  for (const file of logFiles) {
    const text = await readTail(file, LOG_TAIL_BYTES);
    if (!text) continue;
    const re = /LogCFCore:\s*Mod valid:\s*(.+?)\s*\((\d+)\)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const [, name, id] = match;
      if (name && id) found.set(id, name.trim());
    }
  }
  return found;
}

/**
 * Build the id -> display name map for every install under basePath.
 * @param {string} [basePath] defaults to the native base path in config
 * @returns {Promise<Record<string,string>>}
 */
export async function collectModNames(basePath) {
  const base =
    basePath ||
    process.env.NATIVE_BASE_PATH ||
    config.server?.native?.basePath ||
    "C:\\ARK";

  const merged = {};
  for (const install of installRoots(base)) {
    const fromCache = await namesFromModCache(install);
    for (const [id, name] of fromCache) merged[id] = name;
    // Log wins.
    const fromLogs = await namesFromLogs(install);
    for (const [id, name] of fromLogs) merged[id] = name;
  }
  return merged;
}

/**
 * Cached wrapper, so the GET routes can attach names without re-reading the disk
 * on every poll.
 */
export async function getModNames({ force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_TTL_MS) return cache.names;
  try {
    const names = await collectModNames();
    cache = { at: Date.now(), names };
    return names;
  } catch (error) {
    logger.warn(`[mod-names] resolve failed: ${error.message}`);
    return cache.names;
  }
}

export function invalidateModNameCache() {
  cache = { at: 0, names: cache.names };
}
