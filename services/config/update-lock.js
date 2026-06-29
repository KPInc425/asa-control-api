import { readFile, writeFile, access } from "fs/promises";
import logger from "../../utils/logger.js";

export class UpdateLockModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Get update lock status
   */
  async getUpdateLockStatus() {
    try {
      await access(this.service.updateLockPath);
      const lockContent = await readFile(this.service.updateLockPath, "utf8");

      return {
        locked: true,
        content: lockContent.trim(),
        timestamp: new Date().toISOString(),
        path: this.service.updateLockPath,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          locked: false,
          content: null,
          timestamp: new Date().toISOString(),
          path: this.service.updateLockPath,
        };
      }

      logger.error("Error checking update lock status:", error);
      throw new Error(`Failed to check update lock status: ${error.message}`);
    }
  }

  /**
   * Create update lock
   */
  async createUpdateLock(reason = "Manual lock") {
    try {
      const lockContent = `${reason}\nCreated: ${new Date().toISOString()}`;
      await writeFile(this.service.updateLockPath, lockContent, "utf8");

      logger.info(`Update lock created: ${this.service.updateLockPath}`);

      return {
        success: true,
        message: "Update lock created successfully",
        path: this.service.updateLockPath,
        content: lockContent,
      };
    } catch (error) {
      logger.error("Error creating update lock:", error);
      throw new Error(`Failed to create update lock: ${error.message}`);
    }
  }

  /**
   * Remove update lock
   */
  async removeUpdateLock() {
    try {
      await access(this.service.updateLockPath);
      await this.service.deleteFile(this.service.updateLockPath);

      logger.info(`Update lock removed: ${this.service.updateLockPath}`);

      return {
        success: true,
        message: "Update lock removed successfully",
        path: this.service.updateLockPath,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          success: true,
          message: "Update lock already removed",
          path: this.service.updateLockPath,
        };
      }

      logger.error("Error removing update lock:", error);
      throw new Error(`Failed to remove update lock: ${error.message}`);
    }
  }
}
