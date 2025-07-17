import { getAllServerConfigs, getServerConfig } from './services/database.js';
import { ServerProvisioner } from './services/server-provisioner.js';
import { createServerManager } from './services/server-manager.js';
import logger from './utils/logger.js';

async function testBattleEyeConfig() {
  try {
    console.log('Testing BattleEye configuration...\\n');
    
    // Check database configurations
    console.log('=== Database Configurations ===');
    const allConfigs = getAllServerConfigs();
    console.log(`Total server configs in database: ${allConfigs.length}`);
    
    for (const config of allConfigs) {
      console.log(`\\nServer: ${config.name}`);
      console.log(`Created: ${config.created_at}`);
      console.log(`Updated: ${config.updated_at}`);
      
      try {
        const configData = JSON.parse(config.config_data);
        console.log(`disableBattleEye: ${configData.disableBattleEye}`);
        console.log(`BattleEye should be: ${configData.disableBattleEye ? 'DISABLED' : 'ENABLED'}`);
      } catch (error) {
        console.log(`Error parsing config: ${error.message}`);
      }
    }
    
    // Check server manager
    console.log('\\n=== Server Manager ===');
    const serverManager = createServerManager();
    const servers = await serverManager.listServers();
    console.log(`Total servers found: ${servers.length}`);
    
    for (const server of servers) {
      console.log(`\\nServer: ${server.name}`);
      console.log(`Status: ${server.status}`);
      console.log(`disableBattleEye: ${server.disableBattleEye}`);
      console.log(`BattleEye should be: ${server.disableBattleEye ? 'DISABLED' : 'ENABLED'}`);
      
      // Check if server is running and get its command line
      try {
        const isRunning = await serverManager.isRunning(server.name);
        console.log(`Running: ${isRunning}`);
        
        if (isRunning) {
          // Try to get process info to see if NoBattleEye is in command line
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          
          try {
            const { stdout } = await execAsync(`wmic process where "name='ArkAscendedServer.exe'" get commandline /format:list`);
            const lines = stdout.split('\\n');
            for (const line of lines) {
              if (line.includes(server.name) && line.includes('ArkAscendedServer.exe')) {
                console.log(`Command line: ${line}`);
                const hasNoBattleEye = line.includes('-NoBattleEye');
                console.log(`Has -NoBattleEye flag: ${hasNoBattleEye}`);
                break;
              }
            }
          } catch (error) {
            console.log(`Could not get command line: ${error.message}`);
          }
        }
      } catch (error) {
        console.log(`Error checking server status: ${error.message}`);
      }
    }
    
    // Check provisioner
    console.log('\\n=== Server Provisioner ===');
    const provisioner = new ServerProvisioner();
    const clusters = await provisioner.listClusters();
    console.log(`Total clusters found: ${clusters.length}`);
    
    for (const cluster of clusters) {
      console.log(`\\nCluster: ${cluster.name}`);
      if (cluster.config && cluster.config.servers) {
        for (const server of cluster.config.servers) {
          console.log(`  Server: ${server.name}`);
          console.log(`  disableBattleEye: ${server.disableBattleEye}`);
          console.log(`  BattleEye should be: ${server.disableBattleEye ? 'DISABLED' : 'ENABLED'}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error testing BattleEye configuration:', error);
  }
}

testBattleEyeConfig(); 
