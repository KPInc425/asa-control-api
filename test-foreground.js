/**
 * Test script to demonstrate foreground operations
 * Run this script to see operations happening in the terminal
 */

import { ServerProvisioner } from './services/server-provisioner.js';

async function testForegroundOperations() {
  console.log('=== Testing Foreground Operations ===\n');
  
  const provisioner = new ServerProvisioner();
  
  try {
    // Test 1: Install SteamCMD in foreground
    console.log('Test 1: Installing SteamCMD in foreground mode...');
    console.log('This will show the download and extraction progress in the terminal.\n');
    
    await provisioner.installSteamCmd(true);
    
    console.log('\n=== SteamCMD installation completed ===\n');
    
    // Test 2: Install ASA binaries in foreground
    console.log('Test 2: Installing ASA binaries in foreground mode...');
    console.log('This will show the SteamCMD download progress in the terminal.\n');
    
    await provisioner.installASABinaries(true);
    
    console.log('\n=== ASA binaries installation completed ===\n');
    
    // Test 3: Create a simple cluster in foreground
    console.log('Test 3: Creating a test cluster in foreground mode...');
    console.log('This will show the server installation progress for each server.\n');
    
    const testClusterConfig = {
      name: 'TestForegroundCluster',
      description: 'Test cluster created in foreground mode',
      basePort: 30000,
      servers: [
        {
          name: 'TestServer1',
          map: 'TheIsland_WP',
          port: 30000,
          queryPort: 27015,
          rconPort: 32330,
          maxPlayers: 70,
          adminPassword: 'admin123',
          serverPassword: '',
          rconPassword: 'rcon123',
          harvestMultiplier: 3.0,
          xpMultiplier: 3.0,
          tamingMultiplier: 5.0
        }
      ]
    };
    
    await provisioner.createCluster(testClusterConfig, true);
    
    console.log('\n=== Test cluster creation completed ===\n');
    
    console.log('All foreground operations completed successfully!');
    console.log('You should have seen the progress in the terminal for each operation.');
    
  } catch (error) {
    console.error('Error during foreground operations:', error);
  }
}

// Run the test
testForegroundOperations(); 
