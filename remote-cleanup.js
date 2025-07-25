import { db } from './services/database.js';

async function remoteCleanup() {
  console.log('=== Remote Server Database Cleanup ===\n');
  
  // Check for NULL mod_id entries
  const nullServerMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  console.log(`1. Found ${nullServerMods.length} server mods with NULL mod_id`);
  
  if (nullServerMods.length > 0) {
    console.log('   Removing NULL entries:');
    nullServerMods.forEach(mod => {
      console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
    });
    
    const result = db.prepare('DELETE FROM server_mods WHERE mod_id IS NULL').run();
    console.log(`   ✓ Removed ${result.changes} NULL entries`);
  } else {
    console.log('   ✅ No NULL entries found');
  }
  
  // Check for NULL mod_id in shared_mods
  const nullSharedMods = db.prepare('SELECT * FROM shared_mods WHERE mod_id IS NULL').all();
  console.log(`\n2. Found ${nullSharedMods.length} shared mods with NULL mod_id`);
  
  if (nullSharedMods.length > 0) {
    console.log('   Removing NULL entries:');
    nullSharedMods.forEach(mod => {
      console.log(`   - ID: ${mod.id}, Mod: ${mod.mod_id}, Name: ${mod.mod_name}`);
    });
    
    const result = db.prepare('DELETE FROM shared_mods WHERE mod_id IS NULL').run();
    console.log(`   ✓ Removed ${result.changes} NULL entries`);
  } else {
    console.log('   ✅ No NULL entries found');
  }
  
  // Verify cleanup
  console.log('\n--- Verification ---');
  const remainingNullServerMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  const remainingNullSharedMods = db.prepare('SELECT * FROM shared_mods WHERE mod_id IS NULL').all();
  
  console.log(`Remaining server mods with NULL mod_id: ${remainingNullServerMods.length}`);
  console.log(`Remaining shared mods with NULL mod_id: ${remainingNullSharedMods.length}`);
  
  if (remainingNullServerMods.length === 0 && remainingNullSharedMods.length === 0) {
    console.log('\n✅ Database cleanup successful!');
    console.log('✅ The API fixes will prevent NULL entries from being recreated');
  } else {
    console.log('\n❌ Some NULL entries remain - manual intervention may be needed');
  }
  
  console.log('\n=== Cleanup Complete ===');
}

remoteCleanup().catch(console.error); 
