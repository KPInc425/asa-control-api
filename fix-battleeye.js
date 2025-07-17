import { ServerProvisioner } from './services/server-provisioner.js';
import { createServerManager } from './services/server-manager.js';
import { getAllServerConfigs } from './services/database.js';
import logger from './utils/logger.js';

async function fixBattleEyeSettings() {
  try {
    console.log('Fixing BattleEye settings for all servers...\\n');
    
    const provisioner = new ServerProvisioner();
    const serverManager = createServerManager();
    
    // Get all server configurations from database
    const dbConfigs = getAllServerConfigs();
    console.log(`Found ${dbConfigs.length} server configurations in database\\n`);
    
    // Process each server
    for (const dbConfig of dbConfigs) {
      try {
        const serverName = dbConfig.name;
        console.log(`Processing server: ${serverName}`);
        
        // Parse database config
        let configData;
        try {
          configData = JSON.parse(dbConfig.config_data);
        } catch (error) {
          console.log(`  Error parsing config for ${serverName}: ${error.message}`);
          continue;
        }
        
        console.log(`  Current disableBattleEye setting: ${configData.disableBattleEye}`);
        console.log(`  BattleEye should be: ${configData.disableBattleEye ? 'DISABLED' : 'ENABLED'}`);
        
        // Get server info from server manager
        const servers = await serverManager.listServers();
        const serverInfo = servers.find(s => s.name === serverName);
        
        if (!serverInfo) {
          console.log(`  Server ${serverName} not found in server manager`);
          continue;
        }
        
        console.log(`  Server manager shows disableBattleEye: ${serverInfo.disableBattleEye}`);
        
        // Regenerate start script with correct BattleEye setting
        console.log(`  Regenerating start script...`);
        await serverManager.regenerateServerStartScript(serverName);
        console.log(`  ✓ Start script regenerated for ${serverName}\\n`);
        
      } catch (error) {
        console.log(`  Error processing ${dbConfig.name}: ${error.message}\\n`);
      }
    }
    
    console.log('BattleEye settings fix completed!');
    console.log('\\nNext steps:');
    console.log('1. Restart any running servers to apply the new BattleEye settings');
    console.log('2. Check the start.bat files to verify the -NoBattleEye flag is present/absent as expected');
    console.log('3. Test server connections to ensure BattleEye is working correctly');
    
  } catch (error) {
    console.error('Error fixing BattleEye settings:', error);
  }
}

fixBattleEyeSettings(); 
