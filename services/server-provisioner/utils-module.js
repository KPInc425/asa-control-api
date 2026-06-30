import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import https from "https";
import logger from "../../utils/logger.js";

const execAsync = promisify(exec);

/**
 * Utility methods for the ServerProvisioner
 */
export class UtilsModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Execute command in foreground mode with real-time output
   */
  async execForeground(command, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { execSync } = await import("child_process");

        logger.info(`Executing command in foreground: ${command}`);
        console.log(`\n=== Executing: ${command} ===\n`);

        execSync(command, {
          stdio: "inherit",
          ...options,
        });

        console.log(`\n=== Command completed successfully ===\n`);
        logger.info("Foreground command completed successfully");
        resolve({ success: true });
      } catch (error) {
        console.log(`\n=== Command failed ===\n`);
        logger.error("Foreground command failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Create necessary directories
   */
  async createDirectories() {
    try {
      await fs.mkdir(this.service.basePath, { recursive: true });
      await fs.mkdir(this.service.serversPath, { recursive: true });
      await fs.mkdir(this.service.clustersPath, { recursive: true });
      await fs.mkdir(path.join(this.service.basePath, "steamcmd"), { recursive: true });
      await fs.mkdir(path.join(this.service.basePath, "backups"), { recursive: true });
      await fs.mkdir(path.join(this.service.basePath, "backups", "servers"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.service.basePath, "backups", "clusters"), {
        recursive: true,
      });
      logger.info("All directories created successfully");
    } catch (error) {
      logger.error("Failed to create directories:", error);
      throw error;
    }
  }

  /**
   * Initialize the provisioner
   */
  async initialize() {
    try {
      logger.info("Initializing ServerProvisioner...");

      await this.createDirectories();
      await this.service.ensureSteamCmd();

      logger.info("ServerProvisioner initialized successfully");
      return { success: true, message: "ServerProvisioner initialized" };
    } catch (error) {
      logger.error("Failed to initialize ServerProvisioner:", error);
      throw error;
    }
  }

  /**
   * Set progress callback for real-time feedback
   */
  setProgressCallback(cb) {
    this.service.emitProgress = cb;
    this.service.asaBinariesManager?.setProgressCallback(cb);
    this.service.scriptGenerator?.setProgressCallback(cb);
    this.service.clusterManager?.setProgressCallback(cb);
    this.service.serverManager?.setProgressCallback(cb);
  }

  /**
   * Download file from URL
   */
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(destination).catch(() => {});
            reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
          file.on("error", (err) => {
            file.close();
            fs.unlink(destination).catch(() => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          file.close();
          fs.unlink(destination).catch(() => {});
          reject(err);
        });
    });
  }
}
