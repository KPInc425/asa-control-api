import { readFile, writeFile } from 'fs/promises';
import { existsSync as existsSyncFS } from 'fs';
import logger from '../../utils/logger.js';

export class EnvFileModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Read the current .env file
   */
  async readEnvironmentFile() {
    try {
      if (!existsSyncFS(this.service.envPath)) {
        throw new Error('.env file not found');
      }

      const content = await readFile(this.service.envPath, 'utf8');
      const variables = this.parseEnvContent(content);

      return {
        success: true,
        content,
        variables,
        path: this.service.envPath
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
      await this.service.backup.createBackup(this.service.envPath, 'env');

      // Write the new content
      await writeFile(this.service.envPath, content, 'utf8');

      logger.info('Environment file updated successfully');

      return {
        success: true,
        message: 'Environment file updated successfully',
        path: this.service.envPath,
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
}
