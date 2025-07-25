import { db } from './services/database.js';

async function finalCleanup() {
  console.log('=== Final Database Cleanup ===\n');
  
  // Check for server_mods with null mod_id
  const nullServerMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  console.log(`Found ${nullServerMods.length} server mods with NULL mod_id`);
  
  for (const mod of nullServerMods) {
    console.log(`  - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
  }
  
  // Check for server_configs with null server_name
  const nullServerConfigs = db.prepare('SELECT * FROM server_configs WHERE server_name IS NULL').all();
  console.log(`Found ${nullServerConfigs.length} server configs with NULL server_name`);
  
  for (const config of nullServerConfigs) {
    console.log(`  - ID: ${config.id}, Name: ${config.server_name}`);
  }
  console.log();
  
  // Perform cleanup
  let totalRemoved = 0;
  
  if (nullServerMods.length > 0) {
    const result = db.prepare('DELETE FROM server_mods WHERE mod_id IS NULL').run();
    console.log(`✓ Removed ${result.changes} server mods with NULL mod_id`);
    totalRemoved += result.changes;
  }
  
  if (nullServerConfigs.length > 0) {
    const result = db.prepare('DELETE FROM server_configs WHERE server_name IS NULL').run();
    console.log(`✓ Removed ${result.changes} server configs with NULL server_name`);
    totalRemoved += result.changes;
  }
  
  if (totalRemoved === 0) {
    console.log('✓ No NULL entries found - database is already clean!');
  } else {
    console.log(`\n✓ Total entries removed: ${totalRemoved}`);
  }
  
  // Verify cleanup
  console.log('\n--- Verification ---');
  const remainingNullServerMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  const remainingNullServerConfigs = db.prepare('SELECT * FROM server_configs WHERE server_name IS NULL').all();
  
  console.log(`Remaining server mods with NULL mod_id: ${remainingNullServerMods.length}`);
  console.log(`Remaining server configs with NULL server_name: ${remainingNullServerConfigs.length}`);
  
  console.log('\n=== Prevention Measures Applied ===');
  console.log('✓ Added validation to upsertServerMod() function');
  console.log('✓ Added validation to cluster manager mod import');
  console.log('✓ Added validation to mods route PUT endpoint');
  console.log('');
  console.log('These changes will prevent NULL modId entries from being created in the future.');
  console.log('');
  console.log('=== Cleanup Complete ===');
}

finalCleanup().catch(console.error); 
