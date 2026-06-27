/**
 * Quick script to clear stuck FAILED state for specific servers.
 * Usage: node scripts/clear-stuck-state.js
 */
import { stateReconciliation } from "../services/state-reconciliation.js";

const servers = [
  "iLGaming - Lost Colony",
  "iLGaming - Survive the Night",
];

for (const name of servers) {
  stateReconciliation.clearServerState(name);
  console.log(`✓ Cleared state for: ${name}`);
}

console.log("\nDone. Refresh the dashboard to see updated status.");
