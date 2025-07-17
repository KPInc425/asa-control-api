import { getAllServerConfigs, getServerConfig } from './services/database.js';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

async function testDatabaseConfig() {
  try {
    console.log('Testing database configuration...\n');
    
    // Get all server configs from database
    const allConfigs = getAllServerConfigs();
    console.log(`Total server configs in database: ${allConfigs.length}\n`);
    
    if (allConfigs.length === 0) {
      console.log('No server configurations found in database.');
      console.log('This is expected if no servers have been provisioned yet.');
      console.log('The BattleEye setting will be saved when you create or update server configurations.\\n');
      return;
    }
    
    // Check each server config
    for (const config of allConfigs) {
      console.log(`Server: ${config.name}`);
      console.log(`Created: ${config.created_at}`);
      console.log(`Updated: ${config.updated_at}`);
      
      try {
        const parsedConfig = JSON.parse(config.config_data);
        console.log(`Config data keys: ${Object.keys(parsedConfig).join(', ')}`);
        console.log(`disableBattleEye: ${parsedConfig.disableBattleEye}`);
        console.log(`Map: ${parsedConfig.map}`);
        console.log(`Game Port: ${parsedConfig.gamePort}`);
        console.log(`RCON Port: ${parsedConfig.rconPort}`);
        console.log('---');
      } catch (error) {
        console.log(`Error parsing config: ${error.message}`);
        console.log('---');
      }
    }
    
    // Check if log files exist
    console.log('\nChecking log files...');
    const logPaths = [
      './logs/combined.log',
      './logs/error.log',
      './logs/asa-api-service.log',
      './logs/node-out.log',
      './logs/node-err.log'
    ];
    
    for (const logPath of logPaths) {
      const exists = existsSync(logPath);
      console.log(`${logPath}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      
      if (exists) {
        try {
          const fileStat = await stat(logPath);
          console.log(`  Size: ${(fileStat.size / 1024).toFixed(2)} KB`);
          console.log(`  Modified: ${fileStat.mtime.toISOString()}`);
          
          // Read first few lines to check content
          const content = await readFile(logPath, 'utf8');
          const lines = content.split('\n').slice(0, 3);
          console.log(`  First 3 lines: ${lines.join(' | ')}`);
        } catch (error) {
          console.log(`  Error reading file: ${error.message}`);
        }
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('Error testing database config:', error);
  }
}

testDatabaseConfig(); 
