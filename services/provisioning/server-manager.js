import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';

/**
 * Server Manager
 * Handles all standalone server operations: create, delete, list, backup, restore
 */
export class ServerManager {
  constructor(basePath, clustersPath, serversPath, asaBinariesManager, configGenerator, scriptGenerator) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.asaBinariesManager = asaBinariesManager;
    this.configGenerator = configGenerator;
    this.scriptGenerator = scriptGenerator;
    this.emitProgress = null;
  }

  /**
   * Set progress callback for real-time feedback
   */
  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  /**
   * Create a new standalone server
   */
  async createServer(serverConfig) {
    const serverName = serverConfig.name;
    const serverPath = path.join(this.serversPath, serverName);

    try {
      logger.info(`Creating standalone server: ${serverName}`);
      this.emitProgress?.(`Creating server: ${serverName}`);

      // Check if server already exists
      if (existsSync(serverPath)) {
        throw new Error(`Server "${serverName}" already exists`);
      }

      // Create server directory structure
      await fs.mkdir(serverPath, { recursive: true });
      await fs.mkdir(path.join(serverPath, 'binaries'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'configs'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'saves'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'logs'), { recursive: true });

      this.emitProgress?.(`Server directories created: ${serverName}`);

      // Install ASA binaries
      await this.asaBinariesManager.installForServer(serverName);
      this.emitProgress?.(`ASA binaries installed: ${serverName}`);

      // Create server configuration files
      await this.configGenerator.createServerConfig(serverPath, serverConfig);
      this.emitProgress?.(`Server configuration created: ${serverName}`);

      // Create start and stop scripts
      await this.scriptGenerator.createStartScript(serverPath, serverConfig);
      await this.scriptGenerator.createStopScript(serverPath, serverName);
      this.emitProgress?.(`Server scripts created: ${serverName}`);

      logger.info(`Standalone server ${serverName} created successfully`);
      this.emitProgress?.(`Server ${serverName} created successfully`);

      return {
        success: true,
        message: `Server "${serverName}" created successfully`,
        serverPath: serverPath
      };
    } catch (error) {
      logger.error(`Failed to create server ${serverName}:`, error);
      this.emitProgress?.(`Failed to create server ${serverName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all standalone servers
   */
  async listServers() {
    try {
      const servers = [];
      
      // Ensure servers directory exists
      await fs.mkdir(this.serversPath, { recursive: true });
      
      if (!existsSync(this.serversPath)) {
        return servers;
      }

      const serverDirs = await fs.readdir(this.serversPath);

      for (const serverName of serverDirs) {
        try {
          const serverPath = path.join(this.serversPath, serverName);
          const stat = await fs.stat(serverPath);

          if (stat.isDirectory()) {
            // Read server configuration if it exists
            const configPath = path.join(serverPath, 'server-config.json');
            let serverConfig = {};

            try {
              const configContent = await fs.readFile(configPath, 'utf8');
              serverConfig = JSON.parse(configContent);
            } catch {
              // Server config not found, create a basic one
              serverConfig = {
                name: serverName,
                map: 'TheIsland',
                gamePort: 7777,
                queryPort: 27015,
                rconPort: 32330,
                maxPlayers: 70,
                created: stat.birthtime.toISOString()
              };
            }

            // Check if ASA binaries are installed
            const binariesInstalled = await this.asaBinariesManager.verifyInstallation(serverPath, 'standalone');

            servers.push({
              name: serverName,
              path: serverPath,
              config: serverConfig,
              created: serverConfig.created || stat.birthtime.toISOString(),
              binariesInstalled: binariesInstalled.installed,
              map: serverConfig.map,
              gamePort: serverConfig.gamePort,
              queryPort: serverConfig.queryPort,
              rconPort: serverConfig.rconPort,
              maxPlayers: serverConfig.maxPlayers
            });
          }
        } catch (error) {
          logger.error(`Error reading server ${serverName}:`, error);
        }
      }

      return servers.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to list servers:', error);
      return [];
    }
  }

  /**
   * Delete a standalone server
   */
  async deleteServer(serverName) {
    const serverPath = path.join(this.serversPath, serverName);

    try {
      logger.info(`Deleting server: ${serverName}`);

      // Check if server exists
      if (!existsSync(serverPath)) {
        throw new Error(`Server "${serverName}" does not exist`);
      }

      // Delete server directory
      await this.deleteDirectoryManually(serverPath);

      logger.info(`Server ${serverName} deleted successfully`);
      return {
        success: true,
        message: `Server "${serverName}" deleted successfully`
      };
    } catch (error) {
      logger.error(`Failed to delete server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Backup a standalone server
   */
  async backupServer(serverName, options = {}) {
    const { 
      includeConfigs = true, 
      includeBinaries = false, 
      customDestination = null,
      compressionLevel = 'fast' 
    } = options;

    const serverPath = path.join(this.serversPath, serverName);

    try {
      logger.info(`Creating backup for server: ${serverName}`);

      // Check if server exists
      if (!existsSync(serverPath)) {
        throw new Error(`Server "${serverName}" does not exist`);
      }

      // Create backup directory structure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${serverName}_backup_${timestamp}`;
      
      const backupDestination = customDestination || path.join(this.basePath, 'backups', 'servers');
      await fs.mkdir(backupDestination, { recursive: true });

      const backupPath = path.join(backupDestination, backupName);
      await fs.mkdir(backupPath, { recursive: true });

      // Backup saves (always included)
      const savesPath = path.join(serverPath, 'saves');
      if (existsSync(savesPath)) {
        await this.copyDirectory(savesPath, path.join(backupPath, 'saves'));
      }

      // Backup configs if requested
      if (includeConfigs) {
        const configsPath = path.join(serverPath, 'configs');
        if (existsSync(configsPath)) {
          await this.copyDirectory(configsPath, path.join(backupPath, 'configs'));
        }

        // Also backup server-config.json
        const serverConfigPath = path.join(serverPath, 'server-config.json');
        if (existsSync(serverConfigPath)) {
          await fs.copyFile(serverConfigPath, path.join(backupPath, 'server-config.json'));
        }
      }

      // Backup binaries if requested (usually not needed as they can be re-downloaded)
      if (includeBinaries) {
        const binariesPath = path.join(serverPath, 'binaries');
        if (existsSync(binariesPath)) {
          await this.copyDirectory(binariesPath, path.join(backupPath, 'binaries'));
        }
      }

      // Create backup metadata
      const backupInfo = {
        serverName: serverName,
        backupName: backupName,
        created: new Date().toISOString(),
        originalPath: serverPath,
        backupPath: backupPath,
        options: {
          includeConfigs,
          includeBinaries,
          compressionLevel
        },
        type: 'server'
      };

      await fs.writeFile(
        path.join(backupPath, 'backup-info.json'),
        JSON.stringify(backupInfo, null, 2)
      );

      logger.info(`Server backup created: ${backupPath}`);
      return {
        success: true,
        message: `Server "${serverName}" backed up successfully`,
        backupPath: backupPath,
        backupName: backupName,
        includeConfigs: includeConfigs,
        includeBinaries: includeBinaries
      };
    } catch (error) {
      logger.error(`Failed to backup server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Restore a server from backup
   */
  async restoreServer(serverName, sourcePath, options = {}) {
    const { 
      overwrite = false, 
      restoreConfigs = true, 
      restoreBinaries = false,
      downloadMissingBinaries = true 
    } = options;

    const serverPath = path.join(this.serversPath, serverName);

    try {
      logger.info(`Restoring server: ${serverName} from ${sourcePath}`);

      // Check if source backup exists
      if (!existsSync(sourcePath)) {
        throw new Error(`Backup source does not exist: ${sourcePath}`);
      }

      // Check if server already exists
      if (existsSync(serverPath) && !overwrite) {
        throw new Error(`Server "${serverName}" already exists. Use overwrite option or choose a different name.`);
      }

      // If overwriting, delete existing server
      if (existsSync(serverPath) && overwrite) {
        await this.deleteDirectoryManually(serverPath);
      }

      // Create server directory structure
      await fs.mkdir(serverPath, { recursive: true });
      await fs.mkdir(path.join(serverPath, 'saves'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'configs'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'binaries'), { recursive: true });
      await fs.mkdir(path.join(serverPath, 'logs'), { recursive: true });

      // Restore saves (always restore saves)
      const backupSavesPath = path.join(sourcePath, 'saves');
      if (existsSync(backupSavesPath)) {
        await this.copyDirectory(backupSavesPath, path.join(serverPath, 'saves'));
      }

      // Restore configs if requested
      if (restoreConfigs) {
        const backupConfigsPath = path.join(sourcePath, 'configs');
        if (existsSync(backupConfigsPath)) {
          await this.copyDirectory(backupConfigsPath, path.join(serverPath, 'configs'));
        }

        // Restore server-config.json
        const backupServerConfigPath = path.join(sourcePath, 'server-config.json');
        if (existsSync(backupServerConfigPath)) {
          await fs.copyFile(backupServerConfigPath, path.join(serverPath, 'server-config.json'));
        }
      }

      // Restore binaries if requested and available
      if (restoreBinaries) {
        const backupBinariesPath = path.join(sourcePath, 'binaries');
        if (existsSync(backupBinariesPath)) {
          await this.copyDirectory(backupBinariesPath, path.join(serverPath, 'binaries'));
        } else if (downloadMissingBinaries) {
          // Download fresh binaries if backup doesn't contain them
          logger.info(`Binaries not found in backup, downloading fresh binaries for ${serverName}`);
          await this.asaBinariesManager.installForServer(serverName);
        }
      } else if (downloadMissingBinaries) {
        // Always download binaries if not restoring from backup
        logger.info(`Downloading fresh binaries for restored server ${serverName}`);
        await this.asaBinariesManager.installForServer(serverName);
      }

      // Remove backup metadata file from restored server
      const backupInfoPath = path.join(serverPath, 'backup-info.json');
      if (existsSync(backupInfoPath)) {
        await fs.unlink(backupInfoPath);
      }

      // Regenerate scripts if config was restored
      if (restoreConfigs) {
        try {
          const serverConfigPath = path.join(serverPath, 'server-config.json');
          if (existsSync(serverConfigPath)) {
            const configContent = await fs.readFile(serverConfigPath, 'utf8');
            const serverConfig = JSON.parse(configContent);
            
            await this.scriptGenerator.createStartScript(serverPath, serverConfig);
            await this.scriptGenerator.createStopScript(serverPath, serverName);
          }
        } catch (error) {
          logger.warn(`Failed to regenerate scripts for restored server ${serverName}:`, error);
        }
      }

      logger.info(`Server restored: ${serverName}`);
      return {
        success: true,
        message: `Server "${serverName}" restored successfully`,
        serverPath: serverPath,
        restoredConfigs: restoreConfigs,
        restoredBinaries: restoreBinaries
      };
    } catch (error) {
      logger.error(`Failed to restore server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * List server backups
   */
  async listServerBackups() {
    try {
      const backups = [];
      const backupsPath = path.join(this.basePath, 'backups', 'servers');

      if (!existsSync(backupsPath)) {
        return backups;
      }

      const backupDirs = await fs.readdir(backupsPath);

      for (const backupDir of backupDirs) {
        try {
          const backupPath = path.join(backupsPath, backupDir);
          const stat = await fs.stat(backupPath);

          if (stat.isDirectory()) {
            const backupInfoPath = path.join(backupPath, 'backup-info.json');
            
            if (existsSync(backupInfoPath)) {
              const infoContent = await fs.readFile(backupInfoPath, 'utf8');
              const backupInfo = JSON.parse(infoContent);
              
              backups.push({
                ...backupInfo,
                size: await this.getDirectorySize(backupPath),
                path: backupPath
              });
            } else {
              // Backup without metadata, try to parse from directory name
              const match = backupDir.match(/^(.+)_backup_(.+)$/);
              if (match) {
                backups.push({
                  serverName: match[1],
                  backupName: backupDir,
                  created: stat.birthtime.toISOString(),
                  backupPath: backupPath,
                  size: await this.getDirectorySize(backupPath),
                  type: 'server',
                  hasMetadata: false
                });
              }
            }
          }
        } catch (error) {
          logger.error(`Error reading backup ${backupDir}:`, error);
        }
      }

      return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      logger.error('Failed to list server backups:', error);
      return [];
    }
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
        }
      }
    } catch (error) {
      // Ignore errors and return current total
    }

    return totalSize;
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(source, destination) {
    try {
      await fs.mkdir(destination, { recursive: true });
      const entries = await fs.readdir(source, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      logger.error(`Failed to copy directory from ${source} to ${destination}:`, error);
      throw error;
    }
  }

  /**
   * Delete directory manually with retry logic
   */
  async deleteDirectoryManually(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.deleteDirectoryManually(fullPath);
        } else {
          await fs.unlink(fullPath);
        }
      }

      await fs.rmdir(dirPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Update paths if they change
   */
  updatePaths(basePath, clustersPath, serversPath) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }
} 
