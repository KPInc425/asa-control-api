import logger from '../../utils/logger.js';

export class ReloadModule {
  constructor(service) {
    this.service = service;
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
      dotenv.config({ path: this.service.envPath, override: true });

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
      const { content } = await this.service.envFile.readEnvironmentFile();
      const variables = this.service.envFile.parseEnvContent(content);

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
