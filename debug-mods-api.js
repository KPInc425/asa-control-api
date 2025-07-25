import { db } from './services/database.js';
import { deleteAllServerMods, upsertServerMod, upsertServerSettings } from './services/database.js';

// Debug version of the mods API logic
async function debugModsAPI(serverName, additionalMods, excludeSharedMods) {
  console.log('=== Debug Mods API ===\n');
  console.log(`Server: ${serverName}`);
  console.log(`Additional Mods: ${JSON.stringify(additionalMods)}`);
  console.log(`Exclude Shared Mods: ${excludeSharedMods}`);
  console.log('');
  
  // Check the data types and values
  console.log('1. Data Analysis:');
  console.log(`   additionalMods type: ${typeof additionalMods}`);
  console.log(`   additionalMods length: ${additionalMods?.length || 'undefined'}`);
  console.log(`   additionalMods is array: ${Array.isArray(additionalMods)}`);
  console.log('');
  
  if (Array.isArray(additionalMods)) {
    console.log('2. Individual Mod Analysis:');
    for (let i = 0; i < additionalMods.length; i++) {
      const modId = additionalMods[i];
      console.log(`   [${i}] modId: ${modId} (type: ${typeof modId})`);
      console.log(`       - null check: ${modId === null}`);
      console.log(`       - undefined check: ${modId === undefined}`);
      console.log(`       - empty string check: ${modId === ''}`);
      console.log(`       - isNaN check: ${isNaN(modId)}`);
      console.log(`       - truthy check: ${!!modId}`);
    }
  }
  console.log('');
  
  // Simulate the API logic
  console.log('3. Simulating API Logic:');
  
  // Check current state
  const currentMods = db.prepare('SELECT * FROM server_mods WHERE server_name = ?').all(serverName);
  console.log(`   Current mods for ${serverName}: ${currentMods.length}`);
  
  // Simulate deleteAllServerMods
  console.log('   Step 1: Would delete all existing mods');
  
  // Simulate adding each mod
  console.log('   Step 2: Would add each mod:');
  if (Array.isArray(additionalMods)) {
    for (const modId of additionalMods) {
      console.log(`     Processing modId: ${modId} (type: ${typeof modId})`);
      
      // Apply the same validation as the API
      if (modId !== null && modId !== undefined && modId !== '' && !isNaN(modId)) {
        console.log(`     ✓ Would insert: ${modId.toString()}`);
      } else {
        console.log(`     ✗ Would skip: ${modId} (invalid)`);
      }
    }
  }
  
  console.log('');
  console.log('4. Current NULL modId entries:');
  const nullMods = db.prepare('SELECT * FROM server_mods WHERE mod_id IS NULL').all();
  console.log(`   Found: ${nullMods.length}`);
  for (const mod of nullMods) {
    console.log(`   - ID: ${mod.id}, Server: ${mod.server_name}, Mod: ${mod.mod_id}`);
  }
  
  console.log('\n=== Debug Complete ===');
}

// Test with some sample data
async function testDebug() {
  console.log('Testing with sample data...\n');
  
  // Test case 1: Normal data
  await debugModsAPI('iLGaming-Ragnarok', [964434, 931877, 1188679], false);
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test case 2: Data with potential issues
  await debugModsAPI('iLGaming-Ragnarok', [964434, null, 931877, '', 1188679, undefined], false);
}

testDebug().catch(console.error); 
