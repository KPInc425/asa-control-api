import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import https from 'https';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';

const execAsync = promisify(exec);

/**
 * SteamCMD Manager
 * Handles SteamCMD installation, verification, and management
 */
export class SteamCmdManager {
  constructor(basePath, steamCmdPath = null) {
    this.basePath = basePath || config.server.native.basePath || process.env.NATIVE_BASE_PATH || 'C:\\ARK';
    
    // Handle custom SteamCMD path or default to basePath
    if (steamCmdPath || config.server.native.steamCmdPath) {
      this.steamCmdPath = steamCmdPath || config.server.native.steamCmdPath;
      this.steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    } else {
      this.steamCmdPath = path.join(this.basePath, 'steamcmd');
      this.steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    }
    
    this.autoInstallSteamCmd = config.server.native.autoInstallSteamCmd !== false;
  }

  /**
   * Check if SteamCMD is installed
   */
  async isInstalled() {
    try {
      await fs.access(this.steamCmdExe);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check SteamCMD availability without installing
   */
  async checkAvailability() {
    try {
      await fs.access(this.steamCmdExe);
      logger.info('SteamCMD found at configured path');
      return { success: true, message: 'SteamCMD available' };
    } catch (error) {
      // Try to find existing SteamCMD installation
      const existingSteamCmd = await this.findExisting();
      if (existingSteamCmd) {
        logger.info(`Found existing SteamCMD at: ${existingSteamCmd}`);
        this.steamCmdExe = existingSteamCmd;
        this.steamCmdPath = path.dirname(existingSteamCmd);
        return { success: true, message: 'SteamCMD found at existing location' };
      }

      logger.warn('SteamCMD not found. Use option 7 to install SteamCMD.');
      return { success: false, message: 'SteamCMD not found' };
    }
  }

  /**
   * Find existing SteamCMD installation
   */
  async findExisting() {
    const possiblePaths = [
      'C:\\steamcmd\\steamcmd.exe',
      'D:\\steamcmd\\steamcmd.exe',
      'C:\\SteamCMD\\steamcmd.exe',
      'D:\\SteamCMD\\steamcmd.exe',
      path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'steamcmd', 'steamcmd.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'steamcmd', 'steamcmd.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'steamcmd', 'steamcmd.exe')
    ];

    for (const steamCmdPath of possiblePaths) {
      try {
        await fs.access(steamCmdPath);
        logger.info(`Found existing SteamCMD at: ${steamCmdPath}`);
        return steamCmdPath;
      } catch {
        // Continue searching
      }
    }

    return null;
  }

  /**
   * Ensure SteamCMD is available (for explicit installation)
   */
  async ensure() {
    try {
      await fs.access(this.steamCmdExe);
      logger.info('SteamCMD already installed at configured path');
      return { success: true, message: 'SteamCMD available' };
    } catch (error) {
      // Try to find existing SteamCMD installation
      const existingSteamCmd = await this.findExisting();
      if (existingSteamCmd) {
        logger.info(`Using existing SteamCMD at: ${existingSteamCmd}`);
        this.steamCmdExe = existingSteamCmd;
        this.steamCmdPath = path.dirname(existingSteamCmd);
        return { success: true, message: 'SteamCMD found at existing location' };
      }

      if (this.autoInstallSteamCmd) {
        logger.info('SteamCMD not found, installing...');
        return await this.install();
      } else {
        logger.warn('SteamCMD not found and auto-install is disabled');
        throw new Error(`SteamCMD not found. Please install SteamCMD manually or set STEAMCMD_PATH environment variable.`);
      }
    }
  }

  /**
   * Install SteamCMD
   */
  async install(foreground = false) {
    const startTime = Date.now();
    logger.info(`[SteamCMD] Starting installation (foreground: ${foreground})`);
    logger.info(`[SteamCMD] Target directory: ${this.steamCmdPath}`);
    
    try {
      // Check if already installed
      const isInstalled = await this.isInstalled();
      if (isInstalled) {
        logger.info(`[SteamCMD] Already installed at ${this.steamCmdExe}`);
        if (!foreground) {
          return true;
        }
      }

      // Create SteamCMD directory
      logger.info(`[SteamCMD] Creating directory: ${this.steamCmdPath}`);
      await fs.mkdir(this.steamCmdPath, { recursive: true });
      logger.info(`[SteamCMD] Directory created successfully`);
      
      // Download SteamCMD
      const steamCmdUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
      const zipPath = path.join(this.steamCmdPath, 'steamcmd.zip');
      
      if (foreground) {
        console.log('\n=== Downloading SteamCMD ===');
      }
      logger.info(`[SteamCMD] Downloading from: ${steamCmdUrl}`);
      logger.info(`[SteamCMD] Download target: ${zipPath}`);
      
      const downloadStartTime = Date.now();
      await this.downloadFile(steamCmdUrl, zipPath);
      const downloadDuration = Date.now() - downloadStartTime;
      
      // Log download completion with file size
      try {
        const stats = await fs.stat(zipPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        logger.info(`[SteamCMD] Download completed: ${fileSizeMB}MB in ${downloadDuration}ms`);
      } catch (statError) {
        logger.warn(`[SteamCMD] Could not read file stats: ${statError.message}`);
      }
      
      // Extract SteamCMD
      if (foreground) {
        console.log('\n=== Extracting SteamCMD ===');
      }
      logger.info(`[SteamCMD] Starting extraction to: ${this.steamCmdPath}`);
      
      const extractStartTime = Date.now();
      const extractCommand = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.steamCmdPath}' -Force"`;
      logger.info(`[SteamCMD] Extract command: ${extractCommand}`);
      
      if (foreground) {
        await this.execForeground(extractCommand);
      } else {
        const { execSync } = await import('child_process');
        const output = execSync(extractCommand, { encoding: 'utf8', stdio: 'pipe' });
        logger.info(`[SteamCMD] Extract output: ${output}`);
      }
      
      const extractDuration = Date.now() - extractStartTime;
      logger.info(`[SteamCMD] Extraction completed in ${extractDuration}ms`);
      
      // Clean up zip file
      logger.info(`[SteamCMD] Cleaning up download file: ${zipPath}`);
      await fs.unlink(zipPath);
      logger.info(`[SteamCMD] Download file removed`);
      
      // Verify installation
      logger.info(`[SteamCMD] Verifying installation at: ${this.steamCmdExe}`);
      if (await this.isInstalled()) {
        const totalDuration = Date.now() - startTime;
        if (foreground) {
          console.log('\n=== SteamCMD installed successfully ===');
        }
        logger.info(`[SteamCMD] Installation completed successfully in ${totalDuration}ms`);
        logger.info(`[SteamCMD] Executable verified at: ${this.steamCmdExe}`);
        
        // Log additional installation details
        try {
          const stats = await fs.stat(this.steamCmdExe);
          const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
          logger.info(`[SteamCMD] Executable size: ${fileSizeMB}MB`);
          logger.info(`[SteamCMD] Last modified: ${stats.mtime.toISOString()}`);
        } catch (statError) {
          logger.warn(`[SteamCMD] Could not read executable stats: ${statError.message}`);
        }
        
        return true;
      } else {
        const error = new Error('SteamCMD installation verification failed');
        logger.error(`[SteamCMD] ${error.message}`);
        throw error;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error(`[SteamCMD] Installation failed after ${totalDuration}ms:`, error);
      logger.error(`[SteamCMD] Error details: ${error.message}`);
      logger.error(`[SteamCMD] Stack trace: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Download a file from URL to destination
   */
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(destination).catch(() => {}); // Clean up on error
        reject(err);
      });
    });
  }

  /**
   * Execute command in foreground mode with real-time output
   */
  async execForeground(command, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { execSync } = await import('child_process');
        
        logger.info(`Executing command in foreground: ${command}`);
        console.log(`\n=== Executing: ${command} ===\n`);
        
        execSync(command, {
          stdio: 'inherit', // This makes the output visible in the terminal
          ...options
        });
        
        console.log(`\n=== Command completed successfully ===\n`);
        logger.info('Foreground command completed successfully');
        resolve({ success: true });
      } catch (error) {
        console.log(`\n=== Command failed ===\n`);
        logger.error('Foreground command failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Get SteamCMD executable path
   */
  getExecutablePath() {
    return this.steamCmdExe;
  }

  /**
   * Get SteamCMD installation path
   */
  getInstallationPath() {
    return this.steamCmdPath;
  }
} 
