import { readFile, writeFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class ConfigService {
  constructor() {
    this.configPath = config.asa.configPath;
    this.updateLockPath = config.asa.updateLockPath;
  }

  /**
   * Get config file contents
   */
  async getConfigFile(mapName, fileName = 'GameUserSettings.ini') {
    try {
      const filePath = join(this.configPath, mapName, fileName);
      
      // Check if file exists
      await access(filePath);
      
      const content = await readFile(filePath, 'utf8');
      logger.info(`Config file read: ${filePath}`);
      
      return {
        success: true,
        content,
        filePath,
        fileName,
        mapName
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Config file not found: ${join(this.configPath, mapName, fileName)}`);
        throw new Error(`Config file not found: ${fileName}`);
      }
      
      logger.error(`Error reading config file ${fileName} for map ${mapName}:`, error);
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  /**
   * Update config file contents
   */
  async updateConfigFile(mapName, content, fileName = 'GameUserSettings.ini') {
    try {
      const filePath = join(this.configPath, mapName, fileName);
      
      // Create directory if it doesn't exist
      const dirPath = join(this.configPath, mapName);
      if (!existsSync(dirPath)) {
        await this.createDirectory(dirPath);
      }
      
      // Write file
      await writeFile(filePath, content, 'utf8');
      
      logger.info(`Config file updated: ${filePath}`);
      
      return {
        success: true,
        message: `Config file ${fileName} updated successfully`,
        filePath,
        fileName,
        mapName
      };
    } catch (error) {
      logger.error(`Error updating config file ${fileName} for map ${mapName}:`, error);
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
   * List available config files for a map
   */
  async listConfigFiles(mapName) {
    try {
      const mapPath = join(this.configPath, mapName);
      
      // Check if map directory exists
      await access(mapPath);
      
      const { readdir } = await import('fs/promises');
      const files = await readdir(mapPath);
      
      const configFiles = files.filter(file => 
        file.endsWith('.ini') || file.endsWith('.cfg') || file.endsWith('.json')
      );
      
      return {
        success: true,
        files: configFiles,
        mapName,
        path: mapPath
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: true,
          files: [],
          mapName,
          path: join(this.configPath, mapName),
          message: 'Map directory not found'
        };
      }
      
      logger.error(`Error listing config files for map ${mapName}:`, error);
      throw new Error(`Failed to list config files: ${error.message}`);
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
