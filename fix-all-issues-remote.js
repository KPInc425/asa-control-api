import { 
  getServerConfig, 
  getAllServerConfigs, 
  getAllSharedMods, 
  getServerMods,
  getServerSettings,
  upsertSharedMod,
  upsertServerMod,
  upsertServerSettings
} from './services/database.js';
import { createServerManager } from './services/server-manager.js';
import fs from 'fs/promises';
import path from 'path';

async function fixAllIssues() {
  console.log('=== Fixing All Issues ===\n');
  
  // Step 1: Check Server Mode
  console.log('1. Checking Server Mode...');
  const serverMode = process.env.SERVER_MODE || 'docker';
  console.log(`   Current SERVER_MODE: ${serverMode}`);
  
  if (serverMode !== 'native' && serverMode !== 'hybrid') {
    console.log('   ⚠ WARNING: SERVER_MODE is not set to "native" or "hybrid"');
    console.log('   This may cause server discovery issues.');
    console.log('   Consider setting SERVER_MODE=native in your environment.\n');
  } else {
    console.log('   ✓ Server mode is correct\n');
  }
  
  // Step 2: Check Database State
  console.log('2. Checking Database State...');
  const allConfigs = getAllServerConfigs();
  const sharedMods = getAllSharedMods();
  console.log(`   Server configs: ${allConfigs.length}`);
  console.log(`   Shared mods: ${sharedMods.length}`);
  
  const testServers = [
    'iLGaming-The Island',
    'iLGaming-Ragnarok', 
    'iLGaming-Club ARK'
  ];
  
  for (const serverName of testServers) {
    const serverMods = getServerMods(serverName);
    const serverSettings = getServerSettings(serverName);
    console.log(`   ${serverName}: ${serverMods.length} mods, excludeSharedMods: ${serverSettings?.excludeSharedMods}`);
  }
  console.log();
  
  // Step 3: Import Mods if Missing
  console.log('3. Checking and Importing Mods...');
  if (sharedMods.length === 0) {
    console.log('   No shared mods found, importing from config...');
    try {
      const configPath = path.join('..', 'testClusterConfigFile.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const clusterConfig = JSON.parse(configContent);
      
      if (clusterConfig.globalMods && Array.isArray(clusterConfig.globalMods)) {
        for (const modId of clusterConfig.globalMods) {
          await upsertSharedMod(modId.toString(), null, true);
          console.log(`     ✓ Imported global mod: ${modId}`);
        }
      }
      
      if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
        for (const server of clusterConfig.servers) {
          if (server.mods && Array.isArray(server.mods)) {
            for (const modId of server.mods) {
              await upsertServerMod(
                server.name, 
                modId.toString(), 
                null, 
                true, 
                server.excludeSharedMods || false
              );
            }
          }
          
          if (server.excludeSharedMods !== undefined) {
            await upsertServerSettings(server.name, server.excludeSharedMods);
          }
        }
        console.log('     ✓ Imported server mods and settings');
      }
    } catch (error) {
      console.log(`     ✗ Failed to import mods: ${error.message}`);
    }
  } else {
    console.log('   ✓ Mods already imported');
  }
  console.log();
  
  // Step 4: Test Server Manager
  console.log('4. Testing Server Manager...');
  try {
    const serverManager = createServerManager();
    console.log(`   ✓ Server manager created: ${serverManager.constructor.name}`);
    
    // Check if we have native capabilities
    let hasNativeCapabilities = false;
    if (serverManager.constructor.name === 'NativeServerManager') {
      hasNativeCapabilities = true;
      console.log('   ✓ Native manager (direct)');
    } else if (serverManager.nativeManager) {
      hasNativeCapabilities = true;
      console.log('   ✓ Native manager (via property)');
    } else {
      console.log('   ✗ Native manager not available');
      console.log('   This will prevent server discovery and start.bat regeneration.');
      return;
    }
  } catch (error) {
    console.log(`   ✗ Server manager creation failed: ${error.message}`);
    return;
  }
  console.log();
  
  // Step 5: Test Server Discovery
  console.log('5. Testing Server Discovery...');
  const serverManager = createServerManager();
  let allServersFound = true;
  
  // Get the native manager (either direct or via property)
  const nativeManager = serverManager.constructor.name === 'NativeServerManager' 
    ? serverManager 
    : serverManager.nativeManager;
  
  for (const serverName of testServers) {
    try {
      const serverInfo = await nativeManager.getClusterServerInfo(serverName);
      if (serverInfo) {
        console.log(`   ✓ ${serverName}: Found`);
        console.log(`     - Map: ${serverInfo.map}`);
        console.log(`     - Port: ${serverInfo.gamePort}`);
      } else {
        console.log(`   ✗ ${serverName}: Not found`);
        allServersFound = false;
      }
    } catch (error) {
      console.log(`   ✗ ${serverName}: Error - ${error.message}`);
      allServersFound = false;
    }
  }
  console.log();
  
  // Step 6: Regenerate Start.bat Files
  if (allServersFound) {
    console.log('6. Regenerating Start.bat Files...');
    for (const serverName of testServers) {
      try {
        await nativeManager.regenerateServerStartScript(serverName);
        console.log(`   ✓ Regenerated start.bat for ${serverName}`);
        
        // Test mod list generation
        const modList = await nativeManager.getFinalModListForServer(serverName);
        if (modList && Array.isArray(modList)) {
          console.log(`     - Mods: ${modList.length} (${modList.join(', ')})`);
        } else {
          console.log(`     - No mods found`);
        }
      } catch (error) {
        console.log(`   ✗ Failed to regenerate start.bat for ${serverName}: ${error.message}`);
      }
    }
  } else {
    console.log('6. Skipping start.bat regeneration (servers not found)');
  }
  console.log();
  
  // Step 7: Final Test
  console.log('7. Final Test...');
  console.log('   Testing API endpoints:');
  console.log('   - GET /api/native-servers (should list all servers)');
  console.log('   - GET /api/native-servers/iLGaming-Ragnarok/start-bat (should return start.bat with mods)');
  console.log('   - GET /api/provisioning/mods (should show global mods)');
  console.log();
  
  console.log('=== Fix Complete ===');
  console.log('');
  console.log('If servers are still not found by the frontend:');
  console.log('1. Check that SERVER_MODE=native is set in your environment');
  console.log('2. Restart the API server');
  console.log('3. Check the error.log for any remaining issues');
}

fixAllIssues().catch(console.error); 
