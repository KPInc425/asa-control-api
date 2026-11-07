import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import logger from "../utils/logger.js";

/**
 * File bridge between this API and the KPTweaks mod.
 *
 * The mod cannot host an HTTP server and cannot register console commands (both need
 * C++), but Blueprint can read and write local files. So the API writes definitions and
 * a queue of pending actions, the mod applies them and writes results, and the API reads
 * those back. See docs/kptweaks-kit-guide.md.
 *
 * Two rules make this safe and they are not negotiable:
 *   - every write is atomic (temp file then rename), because the mod polls and must never
 *     read a half-written JSON;
 *   - every command carries an id and processed ids are persisted, so a server restart
 *     does not replay the queue and hand out a second kit.
 */

const MAX_PROCESSED_KEEP = 500;

export function bridgeDir() {
  return process.env.KIT_BRIDGE_DIR || "D:\\ARK\\bridge";
}

function paths() {
  const dir = bridgeDir();
  return {
    dir,
    kits: path.join(dir, "kits.json"),
    queue: path.join(dir, "queue.json"),
    results: path.join(dir, "results.json"),
    processed: path.join(dir, "processed.json"),
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const text = await fs.readFile(file, "utf8");
    if (!text.trim()) return fallback;
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    // A malformed file is a real problem, but throwing here would take the API down for
    // a mod-side artefact. Log loudly and fall back.
    logger.warn(`[kit-bridge] could not parse ${file}: ${error.message}`);
    return fallback;
  }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 1), "utf8");
  await fs.rename(tmp, file);
}

function validateKit(kit) {
  if (!kit || typeof kit !== "object") throw new Error("kit must be an object");
  if (!kit.name || typeof kit.name !== "string") throw new Error("kit.name is required");
  if (!Array.isArray(kit.items)) throw new Error(`kit ${kit.name}: items must be an array`);
  const items = kit.items.map((item, index) => {
    const className = item.class || item.className;
    if (!className || typeof className !== "string") {
      throw new Error(`kit ${kit.name}: item ${index} needs a class`);
    }
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`kit ${kit.name}: item ${index} has an invalid quantity`);
    }
    const quality = Number(item.quality ?? 0);
    return { class: className, quantity: Math.trunc(quantity), quality: Number.isFinite(quality) ? quality : 0 };
  });

  const creature = kit.creature
    ? {
        class: kit.creature.class || kit.creature.className || null,
        saddle: kit.creature.saddle || kit.creature.saddleClass || null,
        level: Math.trunc(Number(kit.creature.level ?? 150) || 150),
      }
    : null;

  const trigger = ["firstJoin", "cooldown", "manual"].includes(kit.trigger) ? kit.trigger : "firstJoin";

  return {
    name: kit.name,
    enabled: kit.enabled !== false,
    trigger,
    cooldownSeconds: Math.max(0, Math.trunc(Number(kit.cooldownSeconds ?? 0) || 0)),
    items,
    creature,
  };
}

/** Write the kit definitions. Returns the normalised set that landed on disk. */
export async function writeKits(kits) {
  if (!Array.isArray(kits)) throw new Error("kits must be an array");
  const normalised = kits.map(validateKit);
  const p = paths();
  await ensureDir(p.dir);
  await writeJsonAtomic(p.kits, { version: 1, updatedAt: new Date().toISOString(), kits: normalised });
  logger.info(`[kit-bridge] wrote ${normalised.length} kit(s) to ${p.kits}`);
  return normalised;
}

export async function readKits() {
  const p = paths();
  const data = await readJson(p.kits, { version: 1, kits: [] });
  return Array.isArray(data.kits) ? data.kits : [];
}

async function readProcessed() {
  const data = await readJson(paths().processed, { ids: [] });
  return Array.isArray(data.ids) ? data.ids : [];
}

async function writeProcessed(ids) {
  await writeJsonAtomic(paths().processed, { ids: ids.slice(-MAX_PROCESSED_KEEP) });
}

/**
 * Queue a grant. Returns the command id the mod will echo back in results.json.
 *
 * The player is identified by their unique id, not their in-game index: index 0 is
 * whoever connected first, so an index would silently target the wrong person.
 */
export async function queueGrant({ playerId, kitName, requestedBy = "api" }) {
  if (!playerId || typeof playerId !== "string") throw new Error("playerId is required");
  if (!kitName || typeof kitName !== "string") throw new Error("kitName is required");

  const kits = await readKits();
  const kit = kits.find((k) => k.name === kitName);
  if (!kit) throw new Error(`unknown kit: ${kitName}`);

  const p = paths();
  await ensureDir(p.dir);
  const queue = await readJson(p.queue, { commands: [] });
  const commands = Array.isArray(queue.commands) ? queue.commands : [];

  const command = {
    id: crypto.randomUUID(),
    type: "giveKit",
    playerId,
    kitName,
    requestedBy,
    queuedAt: new Date().toISOString(),
  };
  commands.push(command);
  await writeJsonAtomic(p.queue, { version: 1, commands });
  logger.info(`[kit-bridge] queued ${command.id} (${kitName} for ${playerId})`);
  return command;
}

/** Read results the mod has written, and retire the ids already reported. */
export async function readResults() {
  const p = paths();
  const data = await readJson(p.results, { results: [] });
  const results = Array.isArray(data.results) ? data.results : [];
  const processed = await readProcessed();
  const seen = new Set(processed);

  const fresh = results.filter((r) => r && r.id && !seen.has(r.id));
  if (fresh.length) {
    const updated = processed.concat(fresh.map((r) => r.id));
    await writeProcessed(updated);
  }
  return fresh;
}

/** Current queue depth plus what the mod last reported, for a status endpoint. */
export async function status() {
  const p = paths();
  const queue = await readJson(p.queue, { commands: [] });
  const commands = Array.isArray(queue.commands) ? queue.commands : [];
  const processed = await readProcessed();
  let kitsMtime = null;
  try {
    kitsMtime = (await fs.stat(p.kits)).mtime.toISOString();
  } catch {
    kitsMtime = null;
  }
  return {
    dir: p.dir,
    kits: (await readKits()).length,
    kitsUpdatedAt: kitsMtime,
    queued: commands.length,
    processed: processed.length,
  };
}
