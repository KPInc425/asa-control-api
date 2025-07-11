import { readFile, writeFile, access, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class ConfigService {
  constructor() {
    this.updateLockPath = config.asa.updateLockPath;
    this.defaultConfigFiles = config.asa.defaultConfigFiles;
  }

  /**
   * Get the current server root path dynamically
   */
  get serverRootPath() {
    const path = config.asa.serverRootPath;
    console.log(`[ConfigService] serverRootPath getter - path: ${path}`);
    console.log(`[ConfigService] serverRootPath getter - SERVER_MODE: ${process.env.SERVER_MODE}`);
    console.log(`[ConfigService] serverRootPath getter - NATIVE_BASE_PATH: ${process.env.NATIVE_BASE_PATH}`);
    console.log(`[ConfigService] serverRootPath getter - config.asa.serverRootPath: ${config.asa.serverRootPath}`);
    console.log(`[ConfigService] serverRootPath getter - process.cwd(): ${process.cwd()}`);
    return path;
  }

  /**
   * Find the actual config path for a server by searching through possible locations
   */
  async findServerConfigPath(serverName) {
    const currentPath = this.serverRootPath;
    console.log(`[findServerConfigPath] Looking for server: ${serverName}`);
    console.log(`[findServerConfigPath] Using serverRootPath: ${currentPath}`);
    console.log(`[findServerConfigPath] Server name length: ${serverName.length}`);
    console.log(`[findServerConfigPath] Server name bytes: ${Buffer.from(serverName).toString('hex')}`);
    
    // Check if serverRootPath exists
    if (!existsSync(currentPath)) {
      logger.error(`[findServerConfigPath] Server root path does not exist: ${currentPath}`);
      return null;
    }
    
    // First, check if it's a standalone server
    const standalonePath = join(currentPath, serverName, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    logger.info(`[findServerConfigPath] Checking standalone path: ${standalonePath}`);
    logger.info(`[findServerConfigPath] Standalone path exists: ${existsSync(standalonePath)}`);
    if (existsSync(standalonePath)) {
      logger.info(`[findServerConfigPath] Found standalone server at: ${standalonePath}`);
      return {
        type: 'standalone',
        path: standalonePath,
        serverName: serverName
      };
    } else {
      logger.info(`[findServerConfigPath] Standalone path does not exist`);
    }

    // If not standalone, check if it's a cluster server
    const clusterPath = join(currentPath, 'clusters');
    logger.info(`[findServerConfigPath] Checking cluster path: ${clusterPath}`);
    logger.info(`[findServerConfigPath] Cluster path exists: ${existsSync(clusterPath)}`);
    if (existsSync(clusterPath)) {
      try {
        const clusterEntries = await readdir(clusterPath, { withFileTypes: true });
        logger.info(`[findServerConfigPath] All cluster entries: ${clusterEntries.map(e => e.name + (e.isDirectory() ? '/' : '')).join(', ')}`);
        const clusterDirs = clusterEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        logger.info(`[findServerConfigPath] Found cluster directories: ${clusterDirs.join(', ')}`);
        
        for (const clusterName of clusterDirs) {
          logger.info(`[findServerConfigPath] Checking cluster: ${clusterName}`);
          const clusterServerPath = join(clusterPath, clusterName, serverName, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
          logger.info(`[findServerConfigPath] Checking cluster server path: ${clusterServerPath}`);
          logger.info(`[findServerConfigPath] Cluster server path exists: ${existsSync(clusterServerPath)}`);
          
          // Also check if the server directory exists without the config subpath
          const serverDirPath = join(clusterPath, clusterName, serverName);
          logger.info(`[findServerConfigPath] Server directory path: ${serverDirPath}`);
          logger.info(`[findServerConfigPath] Server directory exists: ${existsSync(serverDirPath)}`);
          
          if (existsSync(clusterServerPath)) {
            logger.info(`[findServerConfigPath] Found cluster server at: ${clusterServerPath}`);
            return {
              type: 'cluster',
              path: clusterServerPath,
              serverName: serverName,
              clusterName: clusterName
            };
          } else {
            logger.info(`[findServerConfigPath] Cluster server path does not exist`);
          }
        }
      } catch (error) {
        logger.error(`[findServerConfigPath] Error checking cluster directories:`, error);
      }
    } else {
      logger.info(`[findServerConfigPath] Cluster path does not exist`);
    }

    logger.warn(`[findServerConfigPath] Server ${serverName} not found in any location`);
    return null;
  }

  /**
   * Get the full config path for a specific server and file
   */
  async getConfigFilePath(serverName, fileName = 'GameUserSettings.ini') {
    const serverInfo = await this.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }
    return join(serverInfo.path, fileName);
  }

  /**
   * Get the config directory path for a specific server
   */
  async getConfigDirPath(serverName) {
    const serverInfo = await this.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }
    return serverInfo.path;
  }

  /**
   * Create default config files if they don't exist
   */
  async ensureDefaultConfigs(serverName) {
    const serverInfo = await this.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }

    const configDirPath = serverInfo.path;
    
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
   * List all available ASA servers by scanning both standalone and cluster directories
   */
  async listServers() {
    const currentPath = this.serverRootPath;
    logger.info(`[listServers] Using serverRootPath: ${currentPath}`);
    logger.info(`[listServers] NATIVE_BASE_PATH env: ${process.env.NATIVE_BASE_PATH}`);
    logger.info(`[listServers] SERVER_MODE env: ${process.env.SERVER_MODE}`);
    logger.info(`[listServers] config.asa.serverRootPath: ${config.asa.serverRootPath}`);
    const servers = [];
    
    try {
      // Check if serverRootPath exists
      if (!existsSync(currentPath)) {
        logger.warn(`[listServers] Server root path does not exist: ${currentPath}`);
        return {
          success: true,
          servers: [],
          serverDetails: [],
          count: 0,
          rootPath: currentPath,
          message: `Server root path does not exist: ${currentPath}`
        };
      }

      // Check standalone servers
      const entries = await readdir(currentPath, { withFileTypes: true });
      logger.info(`[listServers] Found entries in root: ${entries.map(e => e.name + (e.isDirectory() ? '/' : '')).join(', ')}`);
      
      const standaloneServers = entries
        .filter(entry => entry.isDirectory())
        .filter(entry => {
          // Check if this directory contains a ShooterGame folder (indicating it's an ASA server)
          const shooterGamePath = join(currentPath, entry.name, 'ShooterGame');
          const exists = existsSync(shooterGamePath);
          logger.info(`[listServers] Checking ${entry.name}: ShooterGame exists = ${exists}`);
          return exists;
        })
        .map(entry => ({
          name: entry.name,
          type: 'standalone',
          path: join(currentPath, entry.name)
        }));
      
      servers.push(...standaloneServers);
      logger.info(`[listServers] Found standalone servers: ${standaloneServers.map(s => s.name).join(', ')}`);

      // Check cluster servers
      const clusterPath = join(currentPath, 'clusters');
      logger.info(`[listServers] Checking for cluster path: ${clusterPath}`);
      if (existsSync(clusterPath)) {
        logger.info(`[listServers] Cluster path exists, scanning clusters...`);
        const clusterEntries = await readdir(clusterPath, { withFileTypes: true });
        const clusterDirs = clusterEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        logger.info(`[listServers] Found cluster directories: ${clusterDirs.join(', ')}`);
        
        for (const clusterName of clusterDirs) {
          const clusterServerPath = join(clusterPath, clusterName);
          logger.info(`[listServers] Scanning cluster: ${clusterName} at ${clusterServerPath}`);
          try {
            const clusterServerEntries = await readdir(clusterServerPath, { withFileTypes: true });
            logger.info(`[listServers] Found entries in ${clusterName}: ${clusterServerEntries.map(e => e.name + (e.isDirectory() ? '/' : '')).join(', ')}`);
            
            const clusterServers = clusterServerEntries
              .filter(entry => entry.isDirectory())
              .filter(entry => {
                // Check if this directory contains a ShooterGame folder
                const shooterGamePath = join(clusterServerPath, entry.name, 'ShooterGame');
                const exists = existsSync(shooterGamePath);
                logger.info(`[listServers] Checking ${clusterName}/${entry.name}: ShooterGame exists = ${exists}`);
                return exists;
              })
              .map(entry => ({
                name: entry.name,
                type: 'cluster',
                clusterName: clusterName,
                path: join(clusterServerPath, entry.name)
              }));
            
            servers.push(...clusterServers);
            logger.info(`[listServers] Found cluster servers in ${clusterName}: ${clusterServers.map(s => s.name).join(', ')}`);
          } catch (error) {
            logger.error(`[listServers] Error reading cluster ${clusterName}:`, error);
          }
        }
      } else {
        logger.info(`[listServers] No cluster directory found at: ${clusterPath}`);
      }
      
      logger.info(`[listServers] Total servers found: ${servers.length}`);
      
              return {
          success: true,
          servers: servers.map(s => s.name),
          serverDetails: servers,
          count: servers.length,
          rootPath: currentPath
        };
    } catch (error) {
      logger.error(`[listServers] Error: ${error.message}`);
      if (error.code === 'ENOENT') {
        logger.warn(`[listServers] ASA server root directory not found: ${this.serverRootPath}`);
        return {
          success: true,
          servers: [],
          serverDetails: [],
          count: 0,
          rootPath: currentPath,
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
    console.log(`[getConfigFile] Called with serverName: ${serverName}, fileName: ${fileName}`);
    try {
      const serverInfo = await this.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const filePath = join(serverInfo.path, fileName);
      
      // Check if file exists
      try {
        await access(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info(`Config file not found: ${filePath}`);
          
          // Only create Game.ini if GameUserSettings.ini already exists
          if (fileName === 'Game.ini') {
            const gameUserSettingsPath = join(serverInfo.path, 'GameUserSettings.ini');
            try {
              await access(gameUserSettingsPath);
              await this.createDefaultConfigFile(serverInfo, fileName);
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
        configPath: serverInfo.path,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Config file not found for server ${serverName}: ${fileName}`);
        throw new Error(`Config file not found: ${fileName} for server ${serverName}`);
      }
      
      logger.error(`Error reading config file ${fileName} for server ${serverName}:`, error);
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  /**
   * Create a single default config file
   */
  async createDefaultConfigFile(serverInfo, fileName) {
    const configDirPath = serverInfo.path;
    
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

    const content = fileName === 'Game.ini' ? defaultGameIni : defaultGameUserSettings;
    const filePath = join(configDirPath, fileName);
    
    try {
      await writeFile(filePath, content, 'utf8');
      logger.info(`Created default ${fileName} for server ${serverInfo.serverName}: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to create default ${fileName} for server ${serverInfo.serverName}:`, error);
      throw error;
    }
  }

  /**
   * Update config file contents for a specific server
   */
  async updateConfigFile(serverName, content, fileName = 'GameUserSettings.ini') {
    try {
      const serverInfo = await this.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const filePath = join(serverInfo.path, fileName);
      
      // Validate the file path is within the allowed directory
      this.validateConfigPath(filePath);
      
      await writeFile(filePath, content, 'utf8');
      logger.info(`Config file updated: ${filePath}`);
      
      return {
        success: true,
        message: `Config file ${fileName} updated successfully for server ${serverName}`,
        filePath,
        fileName,
        serverName,
        configPath: serverInfo.path,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName
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
      const serverInfo = await this.findServerConfigPath(serverName);
      if (!serverInfo) {
        logger.warn(`[listConfigFiles] Server ${serverName} not found in any location`);
        return {
          success: true,
          files: [],
          serverName,
          path: null,
          defaultFiles: this.defaultConfigFiles,
          message: 'Server not found'
        };
      }

      const configDirPath = serverInfo.path;
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
        defaultFiles: this.defaultConfigFiles,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName
      };
    } catch (error) {
      logger.error(`[listConfigFiles] Error: ${error.message}`);
      throw new Error(`Failed to list config files: ${error.message}`);
    }
  }

  /**
   * Get server information including config status
   */
  async getServerInfo(serverName) {
    logger.info(`[getServerInfo] serverName: ${serverName}`);
    try {
      const serverInfo = await this.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const serverPath = serverInfo.type === 'standalone' 
        ? join(this.serverRootPath, serverName)
        : join(this.serverRootPath, 'cluster', serverInfo.clusterName, serverName);
      
      logger.info(`[getServerInfo] serverPath: ${serverPath}`);
      const configDirPath = serverInfo.path;
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
        hasGameUserSettings: configFiles.includes('GameUserSettings.ini'),
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName
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
