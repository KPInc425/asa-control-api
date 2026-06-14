/**
 * One-time script to apply global configs (Game.ini, GameUserSettings.ini)
 * to all existing cluster servers.
 *
 * Usage: node scripts/apply-global-configs.js
 */
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const BASE_PATH = "D:\\ARK";
const CLUSTERS_PATH = path.join(BASE_PATH, "clusters");
const SERVERS_PATH = path.join(BASE_PATH, "servers");
const GLOBAL_CONFIGS_PATH = path.join(BASE_PATH, "global-configs", "ark");
const EXCLUSIONS_PATH = path.join(BASE_PATH, "config-exclusions.json");

async function main() {
  console.log("=== Applying global configs to all cluster & standalone servers ===\n");

  // Read global configs
  let globalGameIni = null;
  let globalGameUserSettings = null;

  try {
    globalGameIni = await fs.readFile(
      path.join(GLOBAL_CONFIGS_PATH, "Game.ini"),
      "utf8",
    );
    console.log(`✓ Read global Game.ini (${globalGameIni.length} chars)`);
  } catch {
    console.log("✗ No global Game.ini found");
  }

  try {
    globalGameUserSettings = await fs.readFile(
      path.join(GLOBAL_CONFIGS_PATH, "GameUserSettings.ini"),
      "utf8",
    );
    console.log(
      `✓ Read global GameUserSettings.ini (${globalGameUserSettings.length} chars)`,
    );
  } catch {
    console.log("✗ No global GameUserSettings.ini found");
  }

  if (!globalGameIni && !globalGameUserSettings) {
    console.log("\nNo global configs to apply. Set them up in the dashboard first.");
    process.exit(0);
  }

  // Read exclusions
  let excludedServers = [];
  try {
    excludedServers =
      JSON.parse(await fs.readFile(EXCLUSIONS_PATH, "utf8")).excludedServers ||
      [];
    if (excludedServers.length > 0) {
      console.log(`\nExcluded servers: ${excludedServers.join(", ")}`);
    }
  } catch {
    // No exclusions file
  }

  let totalApplied = 0;
  let totalSkipped = 0;

  // --- Helper to apply configs to one server ---
  async function applyToServer(serverName, serverPath, sourceLabel) {
    if (excludedServers.includes(serverName)) {
      console.log(`  ⏭  [${sourceLabel}] ${serverName} (excluded)`);
      totalSkipped++;
      return;
    }

    // For standalone servers created by the provisioner, configs live in a "configs/" subfolder.
    // For cluster servers (and older layouts), they live under ShooterGame/Saved/Config/WindowsServer.
    // Try both locations.
    const possibleDirs = [
      path.join(serverPath, "ShooterGame", "Saved", "Config", "WindowsServer"),
      path.join(serverPath, "configs"),
    ];

    let appliedToDir = null;
    for (const configDir of possibleDirs) {
      if (existsSync(configDir)) {
        appliedToDir = configDir;
        break;
      }
    }

    if (!appliedToDir) {
      console.log(
        `  ⏭  [${sourceLabel}] ${serverName} (no config dir found — tried: ${possibleDirs.join(", ")})`,
      );
      totalSkipped++;
      return;
    }

    try {
      if (globalGameIni) {
        await fs.writeFile(path.join(appliedToDir, "Game.ini"), globalGameIni);
      }
      if (globalGameUserSettings) {
        await fs.writeFile(
          path.join(appliedToDir, "GameUserSettings.ini"),
          globalGameUserSettings,
        );
      }
      console.log(`  ✓ [${sourceLabel}] ${serverName} — applied to ${appliedToDir}`);
      totalApplied++;
    } catch (err) {
      console.log(`  ✗ [${sourceLabel}] ${serverName} — error: ${err.message}`);
    }
  }

  // --- Cluster servers ---
  console.log("\n--- Cluster Servers ---");
  const clusters = await fs.readdir(CLUSTERS_PATH);
  for (const clusterName of clusters) {
    const clusterPath = path.join(CLUSTERS_PATH, clusterName);
    const stat = await fs.stat(clusterPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const serverDirs = await fs.readdir(clusterPath);
    for (const serverName of serverDirs) {
      const serverPath = path.join(clusterPath, serverName);
      const sStat = await fs.stat(serverPath).catch(() => null);
      if (!sStat || !sStat.isDirectory()) continue;
      await applyToServer(serverName, serverPath, `cluster:${clusterName}`);
    }
  }

  // --- Standalone servers ---
  console.log("\n--- Standalone Servers ---");
  if (existsSync(SERVERS_PATH)) {
    const serverDirs = await fs.readdir(SERVERS_PATH);
    for (const serverName of serverDirs) {
      const serverPath = path.join(SERVERS_PATH, serverName);
      const sStat = await fs.stat(serverPath).catch(() => null);
      if (!sStat || !sStat.isDirectory()) continue;
      await applyToServer(serverName, serverPath, "standalone");
    }
  } else {
    console.log("  (no servers directory found)");
  }

  console.log(
    `\n=== Done! Applied to ${totalApplied} servers${totalSkipped ? `, skipped ${totalSkipped}` : ""} ===`,
  );
}

main().catch(console.error);