/**
 * Stop and restart the Survive the Night server.
 * Usage: node scripts/restart-survive-the-night.js
 */
import { createServerManager } from "../services/server-manager.js";

const SERVER = "iLGaming - Survive the Night";

async function main() {
  console.log(`Restarting "${SERVER}"...`);
  const mgr = createServerManager("native");

  // Stop
  try {
    const stopResult = await mgr.stop(SERVER);
    console.log(`  Stop: ${JSON.stringify(stopResult)}`);
  } catch (e) {
    console.log(`  Stop (may be fine): ${e.message}`);
  }

  // Wait
  console.log("  Waiting 3s...");
  await new Promise((r) => setTimeout(r, 3000));

  // Start
  const result = await mgr.start(SERVER);
  console.log(`  Start: ${JSON.stringify(result, null, 2)}`);
  console.log("\nDone. Check dashboard in ~30s for updated status.");
}

main().catch(console.error);