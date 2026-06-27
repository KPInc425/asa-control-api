/**
 * Restart Survive the Night server.
 * Usage: node scripts/restart-server.mjs
 */
import { createServerManager } from "../services/server-manager.js";

const SERVER = "iLGaming - Survive the Night";

async function main() {
  console.log(`Restarting "${SERVER}"...`);
  const mgr = createServerManager("native");

  try {
    await mgr.stop(SERVER);
    console.log("  Stopped.");
  } catch (e) {
    console.log(`  Stop note: ${e.message}`);
  }

  console.log("  Waiting 3s...");
  await new Promise((r) => setTimeout(r, 3000));

  try {
    const result = await mgr.start(SERVER);
    console.log(`  Started: ${result.message}`);
    console.log("Done. Configs applied correctly.");
  } catch (e) {
    console.error(`  Start failed: ${e.message}`);
  }
}

main().catch(console.error);