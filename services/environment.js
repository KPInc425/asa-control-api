import { fileURLToPath } from 'url';
import { readFile, writeFile, access } from 'fs/promises';
import { existsSync as existsSyncFS } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

// Proper __dirname for ES modules (cross-platform)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class EnvironmentService {
  constructor() {
    // Determine the base directory for the application
    const baseDir = process.cwd();
    
    // Environment file path
    this.envPath = join(baseDir, '.env');
    
    // Docker Compose file paths - try multiple locations
    const possibleDockerComposePaths = [
      join(baseDir, 'docker-compose.yml'),
      join(baseDir, 'docker-compose.unified.yml'),
      join(baseDir, 'docker', 'docker-compose.yml'),
      join(baseDir, 'docker', 'docker-compose.unified.yml'),
      join(baseDir, 'asa-docker-control-api', 'docker-compose.yml'),
      join(baseDir, 'asa-docker-control-api', 'docker-compose.unified.yml'),
      join(baseDir, 'asa-docker-control-api', 'docker', 'docker-compose.yml'),
      join(baseDir, 'asa-docker-control-api', 'docker', 'docker-compose.unified.yml')
    ];
    
    // Find the first existing docker-compose file
    this.dockerComposePath = possibleDockerComposePaths.find(path => existsSyncFS(path));
    
    if (!this.dockerComposePath) {
      logger.warn('No docker-compose.yml file found in any of the expected locations:');
      possibleDockerComposePaths.forEach(path => {
        logger.warn(`  - ${path}`);
      });
      // Use the first path as default for creation
      this.dockerComposePath = possibleDockerComposePaths[0];
    } else {
      logger.info(`Using docker-compose file: ${this.dockerComposePath}`);
    }
    
    // Backup directory
    this.backupDir = join(baseDir, 'backups');
    
    // Ensure backup directory exists
    this.createDirectory(this.backupDir).catch(err => {
      logger.warn('Failed to create backup directory:', err);
    });
  }

  /**
   * Read the current .env file
   */
  async readEnvironmentFile() {
    try {
      if (!existsSyncFS(this.envPath)) {
        throw new Error('.env file not found');
      }

      const content = await readFile(this.envPath, 'utf8');
      const variables = this.parseEnvContent(content);

      return {
        success: true,
        content,
        variables,
        path: this.envPath
      };
    } catch (error) {
      logger.error('Error reading .env file:', error);
      throw new Error(`Failed to read .env file: ${error.message}`);
    }
  }

  /**
   * Update the .env file
   */
  async updateEnvironmentFile(content) {
    try {
      // Validate the content
      this.validateEnvContent(content);

      // Create backup
      await this.createBackup(this.envPath, 'env');

      // Write the new content
      await writeFile(this.envPath, content, 'utf8');

      logger.info('Environment file updated successfully');

      return {
        success: true,
        message: 'Environment file updated successfully',
        path: this.envPath,
        variables: this.parseEnvContent(content)
      };
    } catch (error) {
      logger.error('Error updating .env file:', error);
      throw new Error(`Failed to update .env file: ${error.message}`);
    }
  }

  /**
   * Update a specific environment variable
   */
  async updateEnvironmentVariable(key, value) {
    try {
      const { content } = await this.readEnvironmentFile();
      const lines = content.split('\n');
      let found = false;

      const newLines = lines.map(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(`${key}=`) && !trimmedLine.startsWith('#')) {
          found = true;
          return `${key}=${value}`;
        }
        return line;
      });

      if (!found) {
        // Add new variable at the end
        newLines.push(`${key}=${value}`);
      }

      const newContent = newLines.join('\n');
      return await this.updateEnvironmentFile(newContent);
    } catch (error) {
      logger.error(`Error updating environment variable ${key}:`, error);
      throw new Error(`Failed to update environment variable: ${error.message}`);
    }
  }

  /**
   * Read the Docker Compose file
   */
  async readDockerComposeFile() {
    try {
      if (!existsSyncFS(this.dockerComposePath)) {
        logger.warn(`Docker compose file not found at: ${this.dockerComposePath}`);
        logger.info('Creating default docker-compose.yml file...');
        
        // Create a default docker-compose.yml file
        const defaultContent = `version: '3.8'

services:
  # ASA Control API
  asa-control-api:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  # Add your ASA servers here
  # Example:
  # asa-server-theisland:
  #   image: asa-server:latest
  #   ports:
  #     - "7777:7777/udp"
  #     - "32330:32330"
  #   environment:
  #     - MAP_NAME=TheIsland
  #     - SERVER_NAME=My ASA Server
  #   volumes:
  #     - ./servers/theisland:/ark
  #   restart: unless-stopped
`;
        
        await writeFile(this.dockerComposePath, defaultContent, 'utf8');
        logger.info(`Created default docker-compose.yml at: ${this.dockerComposePath}`);

        return {
          success: true,
          content: defaultContent,
          path: this.dockerComposePath,
          isDefault: true
        };
      }

      const content = await readFile(this.dockerComposePath, 'utf8');
      logger.info(`Successfully read docker-compose file from: ${this.dockerComposePath}`);

      return {
        success: true,
        content,
        path: this.dockerComposePath,
        isDefault: false
      };
    } catch (error) {
      logger.error('Error reading docker-compose.yml file:', error);
      throw new Error(`Failed to read docker-compose.yml file: ${error.message}`);
    }
  }

  /**
   * Update the Docker Compose file
   */
  async updateDockerComposeFile(content) {
    try {
      // Validate YAML content
      await this.validateYamlContent(content);

      // Create backup
      await this.createBackup(this.dockerComposePath, 'docker-compose');

      // Write the new content
      await writeFile(this.dockerComposePath, content, 'utf8');

      logger.info('Docker Compose file updated successfully');

      return {
        success: true,
        message: 'Docker Compose file updated successfully',
        path: this.dockerComposePath
      };
    } catch (error) {
      logger.error('Error updating docker-compose.yml file:', error);
      throw new Error(`Failed to update docker-compose.yml file: ${error.message}`);
    }
  }

  /**
   * Get ARK server configurations from Docker Compose
   */
  async getArkServerConfigs() {
    try {
      const { content } = await this.readDockerComposeFile();
      const servers = this.extractArkServers(content);

      return {
        success: true,
        servers,
        count: servers.length
      };
    } catch (error) {
      logger.error('Error getting ARK server configs:', error);
      throw new Error(`Failed to get ARK server configs: ${error.message}`);
    }
  }

  /**
   * Add a new ARK server to Docker Compose
   */
  async addArkServer(serverConfig) {
    try {
      const { content } = await this.readDockerComposeFile();
      const newContent = this.addServerToCompose(content, serverConfig);

      return await this.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error adding ARK server:', error);
      throw new Error(`Failed to add ARK server: ${error.message}`);
    }
  }

  /**
   * Remove an ARK server from Docker Compose
   */
  async removeArkServer(serverName) {
    try {
      const { content } = await this.readDockerComposeFile();
      const newContent = this.removeServerFromCompose(content, serverName);

      return await this.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error removing ARK server:', error);
      throw new Error(`Failed to remove ARK server: ${error.message}`);
    }
  }

  /**
   * Update ARK server configuration
   */
  async updateArkServer(serverName, serverConfig) {
    try {
      const { content } = await this.readDockerComposeFile();
      const newContent = this.updateServerInCompose(content, serverName, serverConfig);

      return await this.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error updating ARK server:', error);
      throw new Error(`Failed to update ARK server: ${error.message}`);
    }
  }

  /**
   * Reload Docker Compose configuration
   */
  async reloadDockerCompose() {
    try {
      logger.info('Reloading Docker Compose configuration...');
      
      // Stop existing containers
      await execAsync('docker compose down');
      
      // Start with new configuration
      await execAsync('docker compose up -d');
      
      logger.info('Docker Compose configuration reloaded successfully');

      return {
        success: true,
        message: 'Docker Compose configuration reloaded successfully'
      };
    } catch (error) {
      logger.error('Error reloading Docker Compose:', error);
      throw new Error(`Failed to reload Docker Compose: ${error.message}`);
    }
  }

  /**
   * Parse .env content into key-value pairs
   */
  parseEnvContent(content) {
    const variables = {};
    const lines = content.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex);
          const value = trimmedLine.substring(equalIndex + 1);
          variables[key] = value;
        }
      }
    });

    return variables;
  }

  /**
   * Validate .env content
   */
  validateEnvContent(content) {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        if (!trimmedLine.includes('=')) {
          throw new Error(`Invalid environment variable format: ${trimmedLine}`);
        }
      }
    }
  }

  /**
   * Validate YAML content
   */
  async validateYamlContent(content) {
    try {
      // Basic YAML validation - check for common syntax errors
      const lines = content.split('\n');
      let indentLevel = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const currentIndent = line.length - line.trimStart().length;
          
          // Check for consistent indentation
          if (currentIndent % 2 !== 0 && currentIndent > 0) {
            throw new Error(`Inconsistent indentation at line ${i + 1}`);
          }
        }
      }
    } catch (error) {
      throw new Error(`YAML validation failed: ${error.message}`);
    }
  }

  /**
   * Extract ARK server configurations from Docker Compose content
   */
  extractArkServers(content) {
    const servers = [];
    const lines = content.split('\n');
    let currentService = null;
    let inService = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('asa-server-') && trimmedLine.endsWith(':')) {
        // Found an ASA server service
        currentService = {
          name: trimmedLine.slice(0, -1), // Remove trailing colon
          lines: [],
          startLine: i,
          endLine: i
        };
        inService = true;
      } else if (inService && currentService) {
        if (trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t')) {
          // End of service
          inService = false;
          currentService.endLine = i - 1;
          servers.push(currentService);
          currentService = null;
        } else {
          currentService.lines.push(line);
        }
      }
    }

    // Add the last service if still in one
    if (inService && currentService) {
      currentService.endLine = lines.length - 1;
      servers.push(currentService);
    }

    return servers;
  }

  /**
   * Add server to Docker Compose content
   */
  addServerToCompose(content, serverConfig) {
    const lines = content.split('\n');
    const servicesIndex = lines.findIndex(line => line.trim() === 'services:');
    
    if (servicesIndex === -1) {
      throw new Error('Could not find services section in docker-compose.yml');
    }

    // Find the end of services section
    let endIndex = servicesIndex + 1;
    let indentLevel = 0;
    
    for (let i = servicesIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const currentIndent = line.length - line.trimStart().length;
        
        if (currentIndent === 0 && trimmedLine !== 'services:') {
          endIndex = i;
          break;
        }
      }
    }

    // Generate server configuration
    const serverLines = this.generateServerConfig(serverConfig);
    
    // Insert the new server
    lines.splice(endIndex, 0, ...serverLines);

    return lines.join('\n');
  }

  /**
   * Remove server from Docker Compose content
   */
  removeServerFromCompose(content, serverName) {
    const lines = content.split('\n');
    let startIndex = -1;
    let endIndex = -1;
    let inService = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === `${serverName}:`) {
        startIndex = i;
        inService = true;
      } else if (inService && trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t')) {
        endIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      throw new Error(`Server ${serverName} not found in docker-compose.yml`);
    }

    if (endIndex === -1) {
      endIndex = lines.length;
    }

    // Remove the service lines
    lines.splice(startIndex, endIndex - startIndex);

    return lines.join('\n');
  }

  /**
   * Update server in Docker Compose content
   */
  updateServerInCompose(content, serverName, serverConfig) {
    // First remove the existing server
    let newContent = this.removeServerFromCompose(content, serverName);
    
    // Then add the updated server
    return this.addServerToCompose(newContent, serverConfig);
  }

  /**
   * Generate server configuration lines
   */
  generateServerConfig(serverConfig) {
    const lines = [];
    
    // Ensure the service name follows the asa-server- prefix convention
    const serviceName = serverConfig.name.startsWith('asa-server-') 
      ? serverConfig.name 
      : `asa-server-${serverConfig.name}`;
    
    // Ensure container name follows the same convention
    const containerName = serverConfig.containerName && serverConfig.containerName.startsWith('asa-server-')
      ? serverConfig.containerName
      : `asa-server-${serverConfig.containerName || serverConfig.name}`;
    
    lines.push(`  ${serviceName}:`);
    lines.push(`    container_name: ${containerName}`);
    lines.push(`    image: ${serverConfig.image || 'mschnitzer/asa-linux-server:latest'}`);
    lines.push(`    ports:`);
    lines.push(`      - "${serverConfig.gamePort || '7777'}:7777"`);
    lines.push(`      - "${serverConfig.rconPort || '32330'}:32330"`);
    lines.push(`    environment:`);
    lines.push(`      - SERVER_NAME=${serverConfig.serverName || serverConfig.name}`);
    lines.push(`      - MAP_NAME=${serverConfig.mapName || 'TheIsland'}`);
    lines.push(`      - SERVER_PASSWORD=${serverConfig.serverPassword || ''}`);
    lines.push(`      - ADMIN_PASSWORD=${serverConfig.adminPassword || 'admin123'}`);
    lines.push(`      - MAX_PLAYERS=${serverConfig.maxPlayers || '70'}`);
    
    if (serverConfig.mods && serverConfig.mods.length > 0) {
      lines.push(`      - MODS=${serverConfig.mods.join(',')}`);
    }
    
    if (serverConfig.additionalArgs) {
      lines.push(`      - ADDITIONAL_ARGS=${serverConfig.additionalArgs}`);
    }
    
    lines.push(`    volumes:`);
    lines.push(`      - /opt/asa/asa-server/${serverConfig.name}:/opt/asa/asa-server`);
    lines.push(`    restart: unless-stopped`);
    lines.push(`    networks:`);
    lines.push(`      - ark-network`);
    lines.push(``);

    return lines;
  }

  /**
   * Create backup of a file
   */
  async createBackup(filePath, prefix) {
    try {
      if (!existsSyncFS(this.backupDir)) {
        await this.createDirectory(this.backupDir);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${prefix}-backup-${timestamp}`;
      const backupPath = join(this.backupDir, fileName);

      const content = await readFile(filePath, 'utf8');
      await writeFile(backupPath, content, 'utf8');

      logger.info(`Backup created: ${backupPath}`);
    } catch (error) {
      logger.warn(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Create directory if it doesn't exist
   */
  async createDirectory(dirPath) {
    const { mkdir } = await import('fs/promises');
    await mkdir(dirPath, { recursive: true });
  }

  /**
   * Reload environment configuration
   * This will reload the .env file and restart the application if needed
   */
  async reloadEnvironment() {
    try {
      logger.info('Reloading environment configuration...');
      
      // Reload dotenv configuration
      const dotenv = await import('dotenv');
      dotenv.config({ path: this.envPath, override: true });
      
      // Check if Docker restart is needed
      const needsRestart = await this.checkIfRestartNeeded();
      
      return {
        success: true,
        message: 'Environment configuration reloaded',
        needsRestart,
        restartCommand: needsRestart ? 'docker compose down && docker compose up -d' : null
      };
    } catch (error) {
      logger.error('Error reloading environment:', error);
      throw new Error(`Failed to reload environment: ${error.message}`);
    }
  }

  /**
   * Check if Docker restart is needed after environment changes
   */
  async checkIfRestartNeeded() {
    try {
      const { content } = await this.readEnvironmentFile();
      const variables = this.parseEnvContent(content);
      
      // Check for variables that require Docker restart
      const restartRequiredVars = [
        'NATIVE_BASE_PATH',
        'SERVER_MODE',
        'PORT',
        'DOCKER_SOCKET_PATH'
      ];
      
      for (const varName of restartRequiredVars) {
        if (variables[varName] && process.env[varName] !== variables[varName]) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking restart requirements:', error);
      return true; // Default to requiring restart if we can't determine
    }
  }
}

export const environmentService = new EnvironmentService();
export default EnvironmentService; 
