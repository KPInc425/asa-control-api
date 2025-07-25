import { 
  getAllServerConfigs, 
  getAllSharedMods, 
  getAllServerMods,
  deleteServerMod,
  deleteSharedMod,
  deleteServerConfig
} from './services/database.js';
import { db } from './services/database.js';

async function cleanupDatabase() {
  console.log('=== Database Cleanup ===\n');
  
  // Check server configs
  console.log('1. Checking Server Configs:');
  const allConfigs = getAllServerConfigs();
  console.log(`   Total server configs: ${allConfigs.length}`);
  
  for (const config of allConfigs) {
    console.log(`   - ${config.server_name || 'NULL_NAME'}`);
    if (!config.server_name) {
      console.log(`     ⚠ WARNING: Server config with NULL name found!`);
    }
  }
  console.log();
  
  // Check shared mods
  console.log('2. Checking Shared Mods:');
  const sharedMods = getAllSharedMods();
  console.log(`   Total shared mods: ${sharedMods.length}`);
  
  for (const mod of sharedMods) {
    console.log(`   - ${mod.mod_id || 'NULL_ID'} (${mod.mod_name || 'NULL_NAME'})`);
    if (!mod.mod_id) {
      console.log(`     ⚠ WARNING: Shared mod with NULL ID found!`);
    }
  }
  console.log();
  
  // Check server mods
  console.log('3. Checking Server Mods:');
  const allServerMods = getAllServerMods();
  console.log(`   Total server mods: ${allServerMods.length}`);
  
  let nullEntries = 0;
  for (const mod of allServerMods) {
    console.log(`   - Server: ${mod.server_name || 'NULL_SERVER'}, Mod: ${mod.mod_id || 'NULL_ID'} (${mod.mod_name || 'NULL_NAME'})`);
    if (!mod.server_name || !mod.mod_id) {
      nullEntries++;
      console.log(`     ⚠ WARNING: Server mod with NULL values found!`);
    }
  }
  console.log();
  
  // Check for specific problematic entries
  console.log('4. Checking for Specific Issues:');
  
  // Check for server_mods with null server_name
  const nullServerMods = db.prepare('SELECT * FROM server_mods WHERE server_name IS NULL OR mod_id IS NULL').all();
  console.log(`   Server mods with NULL values: ${nullServerMods.length}`);
  
  for (const mod of nullServerMods) {
    console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
  }
  
  // Check for shared_mods with null mod_id
  const nullSharedMods = db.prepare('SELECT * FROM shared_mods WHERE mod_id IS NULL').all();
  console.log(`   Shared mods with NULL mod_id: ${nullSharedMods.length}`);
  
  for (const mod of nullSharedMods) {
    console.log(`   - ID: ${mod.id}, Mod: ${mod.mod_id}, Name: ${mod.mod_name}`);
  }
  
  // Check for server_configs with null server_name
  const nullServerConfigs = db.prepare('SELECT * FROM server_configs WHERE server_name IS NULL').all();
  console.log(`   Server configs with NULL server_name: ${nullServerConfigs.length}`);
  
  for (const config of nullServerConfigs) {
    console.log(`   - ID: ${config.id}, Name: ${config.server_name}`);
  }
  console.log();
  
  // Offer cleanup options
  if (nullServerMods.length > 0 || nullSharedMods.length > 0 || nullServerConfigs.length > 0) {
    console.log('5. Cleanup Options:');
    console.log('   The following commands can be run to clean up NULL entries:');
    console.log('');
    
    if (nullServerMods.length > 0) {
      console.log('   To remove server mods with NULL values:');
      console.log('   db.prepare("DELETE FROM server_mods WHERE server_name IS NULL OR mod_id IS NULL").run();');
    }
    
    if (nullSharedMods.length > 0) {
      console.log('   To remove shared mods with NULL mod_id:');
      console.log('   db.prepare("DELETE FROM shared_mods WHERE mod_id IS NULL").run();');
    }
    
    if (nullServerConfigs.length > 0) {
      console.log('   To remove server configs with NULL server_name:');
      console.log('   db.prepare("DELETE FROM server_configs WHERE server_name IS NULL").run();');
    }
    
    console.log('');
    console.log('   Or run the cleanup automatically (uncomment the lines below):');
    console.log('');
    console.log('   // Uncomment these lines to automatically clean up:');
    console.log('   // if (nullServerMods.length > 0) {');
    console.log('   //   db.prepare("DELETE FROM server_mods WHERE server_name IS NULL OR mod_id IS NULL").run();');
    console.log('   //   console.log(`Removed ${nullServerMods.length} NULL server mods`);');
    console.log('   // }');
    console.log('   // if (nullSharedMods.length > 0) {');
    console.log('   //   db.prepare("DELETE FROM shared_mods WHERE mod_id IS NULL").run();');
    console.log('   //   console.log(`Removed ${nullSharedMods.length} NULL shared mods`);');
    console.log('   // }');
    console.log('   // if (nullServerConfigs.length > 0) {');
    console.log('   //   db.prepare("DELETE FROM server_configs WHERE server_name IS NULL").run();');
    console.log('   //   console.log(`Removed ${nullServerConfigs.length} NULL server configs`);');
    console.log('   // }');
  } else {
    console.log('5. Cleanup Status:');
    console.log('   ✓ No NULL entries found - database is clean!');
  }
  
  console.log('\n=== Cleanup Complete ===');
}

cleanupDatabase().catch(console.error); 
