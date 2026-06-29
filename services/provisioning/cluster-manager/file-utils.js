import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";

/**
 * File system utility operations (shared across cluster modules)
 */
export class FileUtils {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(source, destination) {
    try {
      await fs.mkdir(destination, { recursive: true });
      const entries = await fs.readdir(source, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      logger.error(
        `Failed to copy directory from ${source} to ${destination}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete directory manually with retry logic
   */
  async deleteDirectoryManually(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.deleteDirectoryManually(fullPath);
        } else {
          await fs.unlink(fullPath);
        }
      }

      await fs.rmdir(dirPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}
