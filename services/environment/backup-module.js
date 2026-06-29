import { readFile, writeFile } from 'fs/promises';
import { existsSync as existsSyncFS } from 'fs';
import { join } from 'path';
import logger from '../../utils/logger.js';

export class BackupModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Create backup of a file
   */
  async createBackup(filePath, prefix) {
    try {
      if (!existsSyncFS(this.service.backupDir)) {
        await this.service.createDirectory(this.service.backupDir);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${prefix}-backup-${timestamp}`;
      const backupPath = join(this.service.backupDir, fileName);

      const content = await readFile(filePath, 'utf8');
      await writeFile(backupPath, content, 'utf8');

      logger.info(`Backup created: ${backupPath}`);
    } catch (error) {
      logger.warn(`Failed to create backup: ${error.message}`);
    }
  }
}
