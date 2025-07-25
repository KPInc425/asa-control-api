import { db } from './services/database.js';

async function autoCleanupDatabase() {
  console.log('=== Auto Database Cleanup ===\n');
  
  // Check for server_mods with null values
  const nullServerMods = db.prepare('SELECT * FROM server_mods WHERE server_name IS NULL OR mod_id IS NULL').all();
  console.log(`Found ${nullServerMods.length} server mods with NULL values`);
  
  for (const mod of nullServerMods) {
    console.log(`  - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
  }
  
  // Check for shared_mods with null mod_id
  const nullSharedMods = db.prepare('SELECT * FROM shared_mods WHERE mod_id IS NULL').all();
  console.log(`Found ${nullSharedMods.length} shared mods with NULL mod_id`);
  
  for (const mod of nullSharedMods) {
    console.log(`  - ID: ${mod.id}, Mod: ${mod.mod_id}, Name: ${mod.mod_name}`);
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
    const result = db.prepare('DELETE FROM server_mods WHERE server_name IS NULL OR mod_id IS NULL').run();
    console.log(`✓ Removed ${result.changes} NULL server mods`);
    totalRemoved += result.changes;
  }
  
  if (nullSharedMods.length > 0) {
    const result = db.prepare('DELETE FROM shared_mods WHERE mod_id IS NULL').run();
    console.log(`✓ Removed ${result.changes} NULL shared mods`);
    totalRemoved += result.changes;
  }
  
  if (nullServerConfigs.length > 0) {
    const result = db.prepare('DELETE FROM server_configs WHERE server_name IS NULL').run();
    console.log(`✓ Removed ${result.changes} NULL server configs`);
    totalRemoved += result.changes;
  }
  
  if (totalRemoved === 0) {
    console.log('✓ No NULL entries found - database is already clean!');
  } else {
    console.log(`\n✓ Total entries removed: ${totalRemoved}`);
  }
  
  console.log('\n=== Cleanup Complete ===');
}

autoCleanupDatabase().catch(console.error); 
