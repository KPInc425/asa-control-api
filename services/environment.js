import { fileURLToPath } from 'url';
import { existsSync as existsSyncFS } from 'fs';
import { join, dirname } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

import { EnvFileModule } from './environment/env-file-module.js';
import { DockerComposeModule } from './environment/docker-compose-module.js';
import { ArkServerModule } from './environment/ark-server-module.js';
import { BackupModule } from './environment/backup-module.js';
import { ReloadModule } from './environment/reload-module.js';

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

    // Initialize modules
    this.envFile = new EnvFileModule(this);
    this.dockerCompose = new DockerComposeModule(this);
    this.arkServer = new ArkServerModule(this);
    this.backup = new BackupModule(this);
    this.reload = new ReloadModule(this);

    // Ensure backup directory exists
    this.createDirectory(this.backupDir).catch(err => {
      logger.warn('Failed to create backup directory:', err);
    });
  }

  // ── Env file methods ──

  async readEnvironmentFile() {
    return this.envFile.readEnvironmentFile();
  }

  async updateEnvironmentFile(content) {
    return this.envFile.updateEnvironmentFile(content);
  }

  async updateEnvironmentVariable(key, value) {
    return this.envFile.updateEnvironmentVariable(key, value);
  }

  parseEnvContent(content) {
    return this.envFile.parseEnvContent(content);
  }

  validateEnvContent(content) {
    return this.envFile.validateEnvContent(content);
  }

  // ── Docker Compose methods ──

  async readDockerComposeFile() {
    return this.dockerCompose.readDockerComposeFile();
  }

  async updateDockerComposeFile(content) {
    return this.dockerCompose.updateDockerComposeFile(content);
  }

  async validateYamlContent(content) {
    return this.dockerCompose.validateYamlContent(content);
  }

  async reloadDockerCompose() {
    return this.dockerCompose.reloadDockerCompose();
  }

  // ── ARK server methods ──

  async getArkServerConfigs() {
    return this.arkServer.getArkServerConfigs();
  }

  async addArkServer(serverConfig) {
    return this.arkServer.addArkServer(serverConfig);
  }

  async removeArkServer(serverName) {
    return this.arkServer.removeArkServer(serverName);
  }

  async updateArkServer(serverName, serverConfig) {
    return this.arkServer.updateArkServer(serverName, serverConfig);
  }

  extractArkServers(content) {
    return this.arkServer.extractArkServers(content);
  }

  addServerToCompose(content, serverConfig) {
    return this.arkServer.addServerToCompose(content, serverConfig);
  }

  removeServerFromCompose(content, serverName) {
    return this.arkServer.removeServerFromCompose(content, serverName);
  }

  updateServerInCompose(content, serverName, serverConfig) {
    return this.arkServer.updateServerInCompose(content, serverName, serverConfig);
  }

  generateServerConfig(serverConfig) {
    return this.arkServer.generateServerConfig(serverConfig);
  }

  // ── Backup methods ──

  async createBackup(filePath, prefix) {
    return this.backup.createBackup(filePath, prefix);
  }

  // ── Reload methods ──

  async reloadEnvironment() {
    return this.reload.reloadEnvironment();
  }

  async checkIfRestartNeeded() {
    return this.reload.checkIfRestartNeeded();
  }

  // ── Utility methods ──

  /**
   * Create directory if it doesn't exist
   */
  async createDirectory(dirPath) {
    const { mkdir } = await import('fs/promises');
    await mkdir(dirPath, { recursive: true });
  }
}

export const environmentService = new EnvironmentService();
export default EnvironmentService;
