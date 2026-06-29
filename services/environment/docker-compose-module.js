import { readFile, writeFile } from 'fs/promises';
import { existsSync as existsSyncFS } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export class DockerComposeModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Read the Docker Compose file
   */
  async readDockerComposeFile() {
    try {
      if (!existsSyncFS(this.service.dockerComposePath)) {
        logger.warn(`Docker compose file not found at: ${this.service.dockerComposePath}`);
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

        await writeFile(this.service.dockerComposePath, defaultContent, 'utf8');
        logger.info(`Created default docker-compose.yml at: ${this.service.dockerComposePath}`);

        return {
          success: true,
          content: defaultContent,
          path: this.service.dockerComposePath,
          isDefault: true
        };
      }

      const content = await readFile(this.service.dockerComposePath, 'utf8');
      logger.info(`Successfully read docker-compose file from: ${this.service.dockerComposePath}`);

      return {
        success: true,
        content,
        path: this.service.dockerComposePath,
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
      await this.service.backup.createBackup(this.service.dockerComposePath, 'docker-compose');

      // Write the new content
      await writeFile(this.service.dockerComposePath, content, 'utf8');

      logger.info('Docker Compose file updated successfully');

      return {
        success: true,
        message: 'Docker Compose file updated successfully',
        path: this.service.dockerComposePath
      };
    } catch (error) {
      logger.error('Error updating docker-compose.yml file:', error);
      throw new Error(`Failed to update docker-compose.yml file: ${error.message}`);
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
}
