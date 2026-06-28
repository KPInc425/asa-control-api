import { ServerManager } from "./server-manager-base.js";
import { ServerStats } from "./server-stats.js";
import config from "../config/index.js";
import logger from "../utils/logger.js";

/**
 * Docker-based Server Manager
 */
export class DockerServerManager extends ServerManager {
  constructor(dockerService) {
    super();
    this.dockerService = dockerService;
  }

  async start(name) {
    try {
      logger.info(`Starting Docker container: ${name}`);
      await this.dockerService.startContainer(name);
      return {
        success: true,
        message: `Container ${name} started successfully`,
      };
    } catch (error) {
      logger.error(`Failed to start Docker container ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      logger.info(`Stopping Docker container: ${name}`);
      await this.dockerService.stopContainer(name);
      return {
        success: true,
        message: `Container ${name} stopped successfully`,
      };
    } catch (error) {
      logger.error(`Failed to stop Docker container ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      logger.info(`Restarting Docker container: ${name}`);
      await this.dockerService.restartContainer(name);
      return {
        success: true,
        message: `Container ${name} restarted successfully`,
      };
    } catch (error) {
      logger.error(`Failed to restart Docker container ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      const stats = await this.dockerService.getContainerStats(name);
      return new ServerStats(
        name,
        "running",
        parseFloat(stats.cpu.percentage),
        parseFloat(stats.memory.percentage),
        0,
        null,
      );
    } catch (error) {
      logger.error(`Failed to get Docker stats for ${name}:`, error);
      throw error;
    }
  }

  async getLogs(name, options = {}) {
    try {
      const logs = await this.dockerService.getContainerLogs(name, options);
      return logs.split("\n").filter((line) => line.trim());
    } catch (error) {
      logger.error(`Failed to get Docker logs for ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      const containers = await this.dockerService.listContainers();
      return containers.map((container) => ({
        name: container.name,
        status: container.status,
        image: container.image,
        ports: container.ports,
        created: container.created,
        type: "container",
      }));
    } catch (error) {
      if (error.code === "ENOENT" && error.message.includes("docker_engine")) {
        logger.warn(
          "Docker is not running or not accessible. Returning empty server list.",
        );
        return [];
      }
      logger.error("Failed to list Docker containers:", error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      const containers = await this.dockerService.listContainers();
      const container = containers.find((c) => c.name === name);
      return container ? container.status === "running" : false;
    } catch (error) {
      return false;
    }
  }
}
