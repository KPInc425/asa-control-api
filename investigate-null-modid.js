import { db } from './services/database.js';
import { getAllServerMods, getServerMods } from './services/database.js';

async function investigateNullModId() {
  console.log('=== Investigate NULL modId Issue ===\n');
  
  // Check all server mods
  console.log('1. All Server Mods:');
  const allServerMods = getAllServerMods();
  console.log(`   Total server mods: ${allServerMods.length}`);
  
  for (const mod of allServerMods) {
    console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}, Enabled: ${mod.enabled}`);
  }
  console.log();
  
  // Check specific server
  console.log('2. iLGaming-Ragnarok Server Mods:');
  const ragnarokMods = getServerMods('iLGaming-Ragnarok');
  console.log(`   Total mods for iLGaming-Ragnarok: ${ragnarokMods.length}`);
  
  for (const mod of ragnarokMods) {
    console.log(`   - ID: ${mod.id}, Mod: ${mod.mod_id}, Enabled: ${mod.enabled}, ExcludeShared: ${mod.excludeSharedMods}`);
  }
  console.log();
  
  // Check for NULL mod_id entries
  console.log('3. NULL mod_id Entries:');
  const nullMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  console.log(`   Total NULL mod_id entries: ${nullMods.length}`);
  
  for (const mod of nullMods) {
    console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}, Created: ${mod.created_at}`);
  }
  console.log();
  
  // Check the most recent entries
  console.log('4. Most Recent Server Mod Entries:');
  const recentMods = db.prepare('SELECT * FROM server_mods ORDER BY created_at DESC LIMIT 10').all();
  
  for (const mod of recentMods) {
    console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}, Created: ${mod.created_at}`);
  }
  console.log();
  
  // Check if there are any patterns
  console.log('5. Analysis:');
  if (nullMods.length > 0) {
    console.log(`   ⚠ Found ${nullMods.length} NULL mod_id entries`);
    console.log(`   These should not exist and indicate a bug in the mod management system.`);
    
    // Check if they're all for the same server
    const servers = [...new Set(nullMods.map(mod => mod.server_name))];
    console.log(`   Affected servers: ${servers.join(', ')}`);
    
    // Check creation times
    const creationTimes = nullMods.map(mod => mod.created_at);
    console.log(`   Creation times: ${creationTimes.join(', ')}`);
  } else {
    console.log(`   ✓ No NULL mod_id entries found`);
  }
  
  console.log('\n=== Investigation Complete ===');
  console.log('');
  console.log('Next steps:');
  console.log('1. Run the cleanup script to remove NULL entries');
  console.log('2. Monitor the system to see if they get recreated');
  console.log('3. Check the frontend/API calls for invalid modId values');
}

investigateNullModId().catch(console.error); 
