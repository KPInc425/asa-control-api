import logger from "../../utils/logger.js";

export class FileUtilsModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Create directory recursively
   */
  async createDirectory(dirPath) {
    try {
      const { mkdir } = await import("fs/promises");
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
      const { unlink } = await import("fs/promises");
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
    const normalizedPath = filePath.replace(/\.\./g, ""); // Prevent directory traversal
    return normalizedPath === filePath;
  }
}
