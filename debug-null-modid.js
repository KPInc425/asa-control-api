import { db } from './services/database.js';
import { upsertServerMod, deleteAllServerMods } from './services/database.js';

// Override the upsertServerMod function to add debugging
const originalUpsertServerMod = upsertServerMod;

// Create a debug version that logs all calls
function debugUpsertServerMod(serverName, modId, modName = null, enabled = true, excludeSharedMods = false) {
  console.log(`[DEBUG] upsertServerMod called:`);
  console.log(`  - serverName: ${serverName} (type: ${typeof serverName})`);
  console.log(`  - modId: ${modId} (type: ${typeof modId})`);
  console.log(`  - modName: ${modName} (type: ${typeof modName})`);
  console.log(`  - enabled: ${enabled} (type: ${typeof enabled})`);
  console.log(`  - excludeSharedMods: ${excludeSharedMods} (type: ${typeof excludeSharedMods})`);
  
  // Check if modId is problematic
  if (!modId || modId === null || modId === undefined || modId === '') {
    console.log(`  ⚠ WARNING: Invalid modId detected!`);
    console.log(`  Stack trace:`);
    console.trace();
  }
  
  // Call the original function
  return originalUpsertServerMod(serverName, modId, modName, enabled, excludeSharedMods);
}

// Override the function
global.upsertServerMod = debugUpsertServerMod;

async function debugNullModId() {
  console.log('=== Debug NULL modId Recreation ===\n');
  
  // Check current state
  const nullServerMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  console.log(`Current NULL modId entries: ${nullServerMods.length}`);
  
  for (const mod of nullServerMods) {
    console.log(`  - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
  }
  console.log();
  
  console.log('=== Monitoring Database Operations ===');
  console.log('The upsertServerMod function is now being monitored.');
  console.log('Any calls with NULL/invalid modId will be logged with stack traces.');
  console.log('');
  console.log('To test:');
  console.log('1. Try removing a mod from the frontend');
  console.log('2. Save the configuration');
  console.log('3. Check this console for debug output');
  console.log('');
  console.log('Press Ctrl+C to stop monitoring');
  
  // Keep the script running to monitor
  process.on('SIGINT', () => {
    console.log('\n=== Monitoring Stopped ===');
    process.exit(0);
  });
  
  // Check every 5 seconds for new NULL entries
  setInterval(() => {
    const currentNullMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
    if (currentNullMods.length > nullServerMods.length) {
      console.log(`\n⚠ NEW NULL modId entry detected!`);
      const newEntries = currentNullMods.filter(mod => 
        !nullServerMods.some(existing => existing.id === mod.id)
      );
      for (const mod of newEntries) {
        console.log(`  - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
      }
    }
  }, 5000);
}

debugNullModId().catch(console.error); 
