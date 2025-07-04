import { readFile, writeFile, access, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class ConfigService {
  constructor() {
    this.serverRootPath = config.asa.serverRootPath;
    this.configSubPath = config.asa.configSubPath;
    this.updateLockPath = config.asa.updateLockPath;
    this.defaultConfigFiles = config.asa.defaultConfigFiles;
  }

  /**
   * Get the full config path for a specific server and file
   */
  getConfigFilePath(serverName, fileName = 'GameUserSettings.ini') {
    return join(this.serverRootPath, serverName, this.configSubPath, fileName);
  }

  /**
   * Get the config directory path for a specific server
   */
  getConfigDirPath(serverName) {
    return join(this.serverRootPath, serverName, this.configSubPath);
  }

  /**
   * Create default config files if they don't exist
   */
  async ensureDefaultConfigs(serverName) {
    const configDirPath = this.getConfigDirPath(serverName);
    
    // Create directory if it doesn't exist
    if (!existsSync(configDirPath)) {
      await this.createDirectory(configDirPath);
    }

    // Default Game.ini content
    const defaultGameIni = `[/script/shootergame.shootergamemode]
MaxPlayers=70
ServerPassword=
ServerAdminPassword=admin123
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    // Default GameUserSettings.ini content
    const defaultGameUserSettings = `[ServerSettings]
ServerPassword=
ServerAdminPassword=admin123
MaxPlayers=70
ReservedPlayerSlots=0
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    const configsToCreate = [
      { fileName: 'Game.ini', content: defaultGameIni },
      { fileName: 'GameUserSettings.ini', content: defaultGameUserSettings }
    ];

    for (const config of configsToCreate) {
      const filePath = join(configDirPath, config.fileName);
      if (!existsSync(filePath)) {
        try {
          await writeFile(filePath, config.content, 'utf8');
          logger.info(`Created default ${config.fileName} for server ${serverName}: ${filePath}`);
        } catch (error) {
          logger.error(`Failed to create default ${config.fileName} for server ${serverName}:`, error);
        }
      }
    }
  }

  /**
   * List all available ASA servers
   */
  async listServers() {
    logger.info(`[listServers] Using serverRootPath: ${this.serverRootPath}`);
    try {
      const entries = await readdir(this.serverRootPath, { withFileTypes: true });
      logger.info(`[listServers] Entries in root: ${entries.map(e => e.name + (e.isDirectory() ? '/' : '')).join(', ')}`);
      const servers = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
      logger.info(`[listServers] Found server directories: ${servers.join(', ')}`);
      
      logger.info(`Found ${servers.length} ASA servers: ${servers.join(', ')}`);
      
      return {
        success: true,
        servers,
        count: servers.length,
        rootPath: this.serverRootPath
      };
    } catch (error) {
      logger.error(`[listServers] Error: ${error.message}`);
      if (error.code === 'ENOENT') {
        logger.warn(`[listServers] ASA server root directory not found: ${this.serverRootPath}`);
        return {
          success: true,
          servers: [],
          count: 0,
          rootPath: this.serverRootPath,
          message: 'No ASA servers found'
        };
      }
      
      logger.error('Error listing ASA servers:', error);
      throw new Error(`Failed to list ASA servers: ${error.message}`);
    }
  }

  /**
   * Get config file contents for a specific server
   */
  async getConfigFile(serverName, fileName = 'GameUserSettings.ini') {
    try {
      const filePath = this.getConfigFilePath(serverName, fileName);
      
      // Check if file exists, create default if it doesn't
      try {
        await access(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info(`Config file not found: ${filePath}`);
          
          // Only create the specific file that was requested
          if (fileName === 'GameUserSettings.ini') {
            await this.createDefaultConfigFile(serverName, fileName);
          } else if (fileName === 'Game.ini') {
            // Only create Game.ini if GameUserSettings.ini already exists
            const gameUserSettingsPath = this.getConfigFilePath(serverName, 'GameUserSettings.ini');
            try {
              await access(gameUserSettingsPath);
              await this.createDefaultConfigFile(serverName, fileName);
            } catch (gameUserSettingsError) {
              throw new Error(`Cannot create Game.ini without GameUserSettings.ini for server ${serverName}`);
            }
          } else {
            throw new Error(`Config file not found: ${fileName} for server ${serverName}`);
          }
          
          // Try to access the file again after creation
          try {
            await access(filePath);
          } catch (secondError) {
            logger.error(`Failed to create or access config file: ${filePath}`, secondError);
            throw new Error(`Config file not found and could not be created: ${fileName} for server ${serverName}`);
          }
        } else {
          throw error;
        }
      }
      
      const content = await readFile(filePath, 'utf8');
      logger.info(`Config file read: ${filePath}`);
      
      return {
        success: true,
        content,
        filePath,
        fileName,
        serverName,
        configPath: this.getConfigDirPath(serverName)
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Config file not found: ${this.getConfigFilePath(serverName, fileName)}`);
        throw new Error(`Config file not found: ${fileName} for server ${serverName}`);
      }
      
      logger.error(`Error reading config file ${fileName} for server ${serverName}:`, error);
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  /**
   * Create a single default config file
   */
  async createDefaultConfigFile(serverName, fileName) {
    const configDirPath = this.getConfigDirPath(serverName);
    
    // Create directory if it doesn't exist
    if (!existsSync(configDirPath)) {
      await this.createDirectory(configDirPath);
    }

    let content = '';
    if (fileName === 'Game.ini') {
      content = `[/script/shootergame.shootergamemode]
MaxPlayers=70
ServerPassword=
ServerAdminPassword=admin123
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;
    } else if (fileName === 'GameUserSettings.ini') {
      content = `[ServerSettings]
ServerPassword=
ServerAdminPassword=admin123
MaxPlayers=70
ReservedPlayerSlots=0
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;
    } else {
      throw new Error(`Unknown config file type: ${fileName}`);
    }

    const filePath = join(configDirPath, fileName);
    try {
      await writeFile(filePath, content, 'utf8');
      logger.info(`Created default ${fileName} for server ${serverName}: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to create default ${fileName} for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Update config file contents for a specific server
   */
  async updateConfigFile(serverName, content, fileName = 'GameUserSettings.ini') {
    try {
      const filePath = this.getConfigFilePath(serverName, fileName);
      
      // Create directory if it doesn't exist
      const dirPath = this.getConfigDirPath(serverName);
      if (!existsSync(dirPath)) {
        await this.createDirectory(dirPath);
      }
      
      // Write file
      await writeFile(filePath, content, 'utf8');
      
      logger.info(`Config file updated: ${filePath}`);
      
      return {
        success: true,
        message: `Config file ${fileName} updated successfully for server ${serverName}`,
        filePath,
        fileName,
        serverName,
        configPath: dirPath
      };
    } catch (error) {
      logger.error(`Error updating config file ${fileName} for server ${serverName}:`, error);
      throw new Error(`Failed to update config file: ${error.message}`);
    }
  }

  /**
   * Get update lock status
   */
  async getUpdateLockStatus() {
    try {
      await access(this.updateLockPath);
      const lockContent = await readFile(this.updateLockPath, 'utf8');
      
      return {
        locked: true,
        content: lockContent.trim(),
        timestamp: new Date().toISOString(),
        path: this.updateLockPath
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          locked: false,
          content: null,
          timestamp: new Date().toISOString(),
          path: this.updateLockPath
        };
      }
      
      logger.error('Error checking update lock status:', error);
      throw new Error(`Failed to check update lock status: ${error.message}`);
    }
  }

  /**
   * Create update lock
   */
  async createUpdateLock(reason = 'Manual lock') {
    try {
      const lockContent = `${reason}\nCreated: ${new Date().toISOString()}`;
      await writeFile(this.updateLockPath, lockContent, 'utf8');
      
      logger.info(`Update lock created: ${this.updateLockPath}`);
      
      return {
        success: true,
        message: 'Update lock created successfully',
        path: this.updateLockPath,
        content: lockContent
      };
    } catch (error) {
      logger.error('Error creating update lock:', error);
      throw new Error(`Failed to create update lock: ${error.message}`);
    }
  }

  /**
   * Remove update lock
   */
  async removeUpdateLock() {
    try {
      await access(this.updateLockPath);
      await this.deleteFile(this.updateLockPath);
      
      logger.info(`Update lock removed: ${this.updateLockPath}`);
      
      return {
        success: true,
        message: 'Update lock removed successfully',
        path: this.updateLockPath
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: true,
          message: 'Update lock already removed',
          path: this.updateLockPath
        };
      }
      
      logger.error('Error removing update lock:', error);
      throw new Error(`Failed to remove update lock: ${error.message}`);
    }
  }

  /**
   * List available config files for a server
   */
  async listConfigFiles(serverName) {
    logger.info(`[listConfigFiles] serverName: ${serverName}`);
    try {
      const serverPath = join(this.serverRootPath, serverName);
      logger.info(`[listConfigFiles] serverPath: ${serverPath}`);
      await access(serverPath);
      const configDirPath = this.getConfigDirPath(serverName);
      logger.info(`[listConfigFiles] configDirPath: ${configDirPath}`);
      try {
        await access(configDirPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info(`[listConfigFiles] Config directory not found for server ${serverName}`);
          return {
            success: true,
            files: [],
            serverName,
            path: configDirPath,
            defaultFiles: this.defaultConfigFiles,
            message: 'No config directory found'
          };
        } else {
          throw error;
        }
      }
      const files = await readdir(configDirPath);
      logger.info(`[listConfigFiles] Files in configDirPath: ${files.join(', ')}`);
      const configFiles = files.filter(file => 
        file.endsWith('.ini') || file.endsWith('.cfg') || file.endsWith('.json')
      );
      logger.info(`[listConfigFiles] Filtered config files: ${configFiles.join(', ')}`);
      return {
        success: true,
        files: configFiles,
        serverName,
        path: configDirPath,
        defaultFiles: this.defaultConfigFiles
      };
    } catch (error) {
      logger.error(`[listConfigFiles] Error: ${error.message}`);
      if (error.code === 'ENOENT') {
        return {
          success: true,
          files: [],
          serverName,
          path: join(this.serverRootPath, serverName),
          message: 'Server directory not found'
        };
      }
      throw new Error(`Failed to list config files: ${error.message}`);
    }
  }

  /**
   * Get server information including config status
   */
  async getServerInfo(serverName) {
    logger.info(`[getServerInfo] serverName: ${serverName}`);
    try {
      const serverPath = join(this.serverRootPath, serverName);
      logger.info(`[getServerInfo] serverPath: ${serverPath}`);
      const configDirPath = this.getConfigDirPath(serverName);
      logger.info(`[getServerInfo] configDirPath: ${configDirPath}`);
      await access(serverPath);
      let configExists = false;
      let configFiles = [];
      try {
        await access(configDirPath);
        configExists = true;
        const files = await readdir(configDirPath);
        logger.info(`[getServerInfo] Files in configDirPath: ${files.join(', ')}`);
        configFiles = files.filter(file => 
          file.endsWith('.ini') || file.endsWith('.cfg') || file.endsWith('.json')
        );
        logger.info(`[getServerInfo] Filtered config files: ${configFiles.join(', ')}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info(`[getServerInfo] Config directory not found for server ${serverName}`);
          configExists = false;
          configFiles = [];
        } else {
          throw error;
        }
      }
      return {
        success: true,
        serverName,
        serverPath,
        configPath: configDirPath,
        configExists,
        configFiles,
        defaultFiles: this.defaultConfigFiles,
        hasGameIni: configFiles.includes('Game.ini'),
        hasGameUserSettings: configFiles.includes('GameUserSettings.ini')
      };
    } catch (error) {
      logger.error(`[getServerInfo] Error: ${error.message}`);
      if (error.code === 'ENOENT') {
        throw new Error(`Server ${serverName} not found`);
      }
      throw new Error(`Failed to get server info: ${error.message}`);
    }
  }

  /**
   * Parse INI file content
   */
  parseIniContent(content) {
    try {
      const lines = content.split('\n');
      const sections = {};
      let currentSection = 'default';
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
          currentSection = trimmedLine.slice(1, -1);
          sections[currentSection] = {};
        } else if (trimmedLine.includes('=') && !trimmedLine.startsWith(';')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          const value = valueParts.join('=').trim();
          
          if (!sections[currentSection]) {
            sections[currentSection] = {};
          }
          
          sections[currentSection][key.trim()] = value;
        }
      });
      
      return sections;
    } catch (error) {
      logger.warn('Error parsing INI content:', error);
      return { raw: content };
    }
  }

  /**
   * Convert parsed INI back to string
   */
  stringifyIniContent(parsedContent) {
    try {
      let content = '';
      
      Object.entries(parsedContent).forEach(([section, items]) => {
        if (section !== 'default') {
          content += `[${section}]\n`;
        }
        
        Object.entries(items).forEach(([key, value]) => {
          content += `${key}=${value}\n`;
        });
        
        content += '\n';
      });
      
      return content.trim();
    } catch (error) {
      logger.warn('Error stringifying INI content:', error);
      throw new Error('Failed to convert INI content to string');
    }
  }

  /**
   * Create directory recursively
   */
  async createDirectory(dirPath) {
    try {
      const { mkdir } = await import('fs/promises');
      await mkdir(dirPath, { recursive: true });
      logger.info(`Directory created: ${dirPath}`);
    } catch (error) {
      logger.error(`Error creating directory ${dirPath}:`, error);
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath) {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
      logger.info(`File deleted: ${filePath}`);
    } catch (error) {
      logger.error(`Error deleting file ${filePath}:`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Validate config file path
   */
  validateConfigPath(filePath) {
    const normalizedPath = filePath.replace(/\.\./g, ''); // Prevent directory traversal
    return normalizedPath === filePath;
  }
}

export default new ConfigService(); 
