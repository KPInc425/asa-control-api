#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(query) {
    return new Promise((resolve) => {
      this.rl.question(query, resolve);
    });
  }

  async validateAndCreateBasePath(basePath) {
    try {
      // Check if the drive exists (Windows-specific)
      const drive = path.parse(basePath).root;
      if (!await this.checkDriveExists(drive)) {
        console.log(`❌ Drive ${drive} does not exist.`);
        const retry = await this.question('Enter a different path (or press Enter to cancel): ');
        if (!retry.trim()) return null;
        return await this.validateAndCreateBasePath(retry.trim());
      }

      // Check if the base path exists
      if (await this.pathExists(basePath)) {
        console.log(`✓ Path ${basePath} already exists.`);
        return basePath;
      }

      // Path doesn't exist, offer to create it
      console.log(`Path ${basePath} does not exist.`);
      const createPath = await this.question('Create this directory? (Y/n): ') || 'y';
      
      if (createPath.toLowerCase() === 'y') {
        try {
          await fs.mkdir(basePath, { recursive: true });
          console.log(`✓ Created directory: ${basePath}`);
          return basePath;
        } catch (error) {
          console.log(`❌ Failed to create directory: ${error.message}`);
          const retry = await this.question('Enter a different path (or press Enter to cancel): ');
          if (!retry.trim()) return null;
          return await this.validateAndCreateBasePath(retry.trim());
        }
      } else {
        const retry = await this.question('Enter a different path (or press Enter to cancel): ');
        if (!retry.trim()) return null;
        return await this.validateAndCreateBasePath(retry.trim());
      }
    } catch (error) {
      console.log(`❌ Error validating path: ${error.message}`);
      const retry = await this.question('Enter a different path (or press Enter to cancel): ');
      if (!retry.trim()) return null;
      return await this.validateAndCreateBasePath(retry.trim());
    }
  }

  async checkDriveExists(drive) {
    try {
      // On Windows, check if the drive exists
      if (process.platform === 'win32') {
        const { execSync } = await import('child_process');
        try {
          execSync(`dir ${drive}`, { stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      }
      // On other platforms, just check if the root path exists
      return await this.pathExists(drive);
    } catch {
      return false;
    }
  }

  async pathExists(pathToCheck) {
    try {
      await fs.access(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  async start() {
    console.log('\n=== ASA Server Management Setup Wizard ===\n');
    console.log('This wizard will help you configure ASA Server Management for first-time use.');
    console.log('This includes:');
    console.log('- Setting up the .env configuration file');
    console.log('- Creating necessary directories');
    console.log('- Configuring SteamCMD settings');
    console.log('- Setting server mode preferences\n');

    try {
      // Step 1: Welcome and confirmation
      const startSetup = await this.question('Start setup wizard? (Y/n): ');
      if (startSetup.toLowerCase() === 'n') {
        console.log('Setup cancelled. You can run this script again later.');
        return;
      }

      // Step 2: Base path configuration
      console.log('\n=== Step 1: Base Path Configuration ===');
      console.log('This is where all ASA server files will be stored.');
      console.log('Requirements:');
      console.log('- At least 50GB free disk space');
      console.log('- Write permissions');
      console.log('- Recommended: Use a dedicated drive (e.g., C:\\ARK, D:\\ASA, G:\\ARK)');
      
      let basePath = await this.question('\nEnter base path (e.g., C:\\ARK): ');
      if (!basePath.trim()) {
        console.log('❌ Base path is required. Setup cancelled.');
        return;
      }
      
      // Validate and potentially create the base path
      basePath = await this.validateAndCreateBasePath(basePath.trim());
      if (!basePath) {
        console.log('❌ Setup cancelled due to invalid base path.');
        return;
      }

      // Step 3: Server mode selection
      console.log('\n=== Step 2: Server Mode ===');
      console.log('Choose how you want to run ASA servers:');
      console.log('  native: Run servers directly on Windows (recommended)');
      console.log('    - Better performance');
      console.log('    - Direct file access');
      console.log('    - Easier debugging');
      console.log('  docker: Run servers in Docker containers');
      console.log('    - Isolated environment');
      console.log('    - Consistent deployment');
      console.log('    - Requires Docker Desktop');
      
      const serverMode = await this.question('\nServer mode (native/docker, default: native): ') || 'native';

      // Step 4: SteamCMD configuration
      console.log('\n=== Step 3: SteamCMD Configuration ===');
      console.log('SteamCMD is required to download ASA server files.');
      console.log('Options:');
      console.log('  1. Use existing SteamCMD installation');
      console.log('  2. Let the system install SteamCMD automatically (recommended)');
      
      const steamCmdChoice = await this.question('\nSteamCMD option (1/2, default: 2): ') || '2';
      let steamCmdPath = '';
      let autoInstallSteamCmd = true;
      
      if (steamCmdChoice === '1') {
        steamCmdPath = await this.question('Enter SteamCMD path (e.g., C:\\Steam\\steamcmd): ');
        if (!steamCmdPath.trim()) {
          console.log('❌ SteamCMD path is required when using existing installation.');
          return;
        }
        autoInstallSteamCmd = false;
      } else {
        console.log('SteamCMD will be installed to: ' + path.join(basePath, 'steamcmd'));
      }

      // Step 5: Additional settings
      console.log('\n=== Step 4: Additional Settings ===');
      const port = await this.question('Backend API port (default: 3000): ') || '3000';
      const logLevel = await this.question('Log level (debug/info/warn/error, default: info): ') || 'info';

      // Step 6: Create .env file
      console.log('\n=== Step 5: Creating Configuration ===');
      await this.createEnvFile({
        basePath: basePath.trim(),
        serverMode: serverMode.trim(),
        steamCmdPath: steamCmdPath.trim(),
        autoInstallSteamCmd,
        port: port.trim(),
        logLevel: logLevel.trim()
      });

      // Step 7: Create directories
      console.log('\n=== Step 6: Creating Directories ===');
      await this.createDirectories(basePath);

      console.log('\n✓ Setup completed successfully!');
      console.log('\nNext steps:');
      console.log('1. The setup script will continue with the remaining steps');
      console.log('2. Install SteamCMD (if not auto-installing)');
      console.log('3. Install ASA binaries');
      console.log('4. Create your first cluster');
      
      console.log('\nConfiguration created:');
      console.log(`  Base Path: ${basePath}`);
      console.log(`  Server Mode: ${serverMode}`);
      console.log(`  SteamCMD: ${steamCmdChoice === '1' ? steamCmdPath : 'Auto-install'}`);
      console.log(`  API Port: ${port}`);

    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async createEnvFile(config) {
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), 'env.example');
    
    try {
      // Read example file
      let envContent = '';
      try {
        envContent = await fs.readFile(envExamplePath, 'utf8');
      } catch (error) {
        // Create basic template if example doesn't exist
        envContent = `# ASA Server Management Configuration
# Generated by setup wizard

# Server Configuration
SERVER_MODE=${config.serverMode}
NATIVE_BASE_PATH=${config.basePath.replace(/\\/g, '\\\\')}

# SteamCMD Configuration
STEAMCMD_PATH=${config.steamCmdPath}
AUTO_INSTALL_STEAMCMD=${config.autoInstallSteamCmd}

# API Configuration
PORT=${config.port}
LOG_LEVEL=${config.logLevel}

# Docker Configuration (if using docker mode)
DOCKER_NETWORK=asa-network
DOCKER_VOLUME_PREFIX=asa

# Authentication
JWT_SECRET=your-secret-key-here
SESSION_SECRET=your-session-secret-here

# Database
DB_HOST=localhost
DB_PORT=27017
DB_NAME=asa-management
DB_USER=
DB_PASS=

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
`;
      }

      // Update with user configuration
      envContent = this.updateEnvContent(envContent, config);
      
      // Write .env file
      await fs.writeFile(envPath, envContent, 'utf8');
      console.log('✓ .env file created successfully');

    } catch (error) {
      throw new Error(`Failed to create .env file: ${error.message}`);
    }
  }

  updateEnvContent(content, config) {
    const updates = {
      'NATIVE_BASE_PATH': config.basePath.replace(/\\/g, '\\\\'),
      'SERVER_MODE': config.serverMode,
      'STEAMCMD_PATH': config.steamCmdPath || '',
      'AUTO_INSTALL_STEAMCMD': config.autoInstallSteamCmd.toString(),
      'PORT': config.port,
      'LOG_LEVEL': config.logLevel
    };
    
    let updatedContent = content;
    
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const replacement = `${key}=${value}`;
      
      if (regex.test(updatedContent)) {
        // Update existing line
        updatedContent = updatedContent.replace(regex, replacement);
      } else {
        // Add new line
        updatedContent += `\n${replacement}`;
      }
    }
    
    return updatedContent;
  }

  async createDirectories(basePath) {
    const directories = [
      basePath,
      path.join(basePath, 'steamcmd'),
      path.join(basePath, 'shared-binaries'),
      path.join(basePath, 'servers'),
      path.join(basePath, 'clusters'),
      path.join(basePath, 'logs'),
      path.join(basePath, 'backups')
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`✓ Created: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.log(`⚠️  Warning: Could not create ${dir}: ${error.message}`);
        }
      }
    }
  }
}

// Run setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const setup = new SetupWizard();
  setup.start().catch(error => {
    console.error('Setup failed:', error.message);
    process.exit(1);
  });
}

export default SetupWizard; 
 