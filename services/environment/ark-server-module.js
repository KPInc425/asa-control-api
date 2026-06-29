import logger from '../../utils/logger.js';

export class ArkServerModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Get ARK server configurations from Docker Compose
   */
  async getArkServerConfigs() {
    try {
      const { content } = await this.service.dockerCompose.readDockerComposeFile();
      const servers = this.extractArkServers(content);

      return {
        success: true,
        servers,
        count: servers.length
      };
    } catch (error) {
      logger.error('Error getting ARK server configs:', error);
      throw new Error(`Failed to get ARK server configs: ${error.message}`);
    }
  }

  /**
   * Add a new ARK server to Docker Compose
   */
  async addArkServer(serverConfig) {
    try {
      const { content } = await this.service.dockerCompose.readDockerComposeFile();
      const newContent = this.addServerToCompose(content, serverConfig);

      return await this.service.dockerCompose.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error adding ARK server:', error);
      throw new Error(`Failed to add ARK server: ${error.message}`);
    }
  }

  /**
   * Remove an ARK server from Docker Compose
   */
  async removeArkServer(serverName) {
    try {
      const { content } = await this.service.dockerCompose.readDockerComposeFile();
      const newContent = this.removeServerFromCompose(content, serverName);

      return await this.service.dockerCompose.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error removing ARK server:', error);
      throw new Error(`Failed to remove ARK server: ${error.message}`);
    }
  }

  /**
   * Update ARK server configuration
   */
  async updateArkServer(serverName, serverConfig) {
    try {
      const { content } = await this.service.dockerCompose.readDockerComposeFile();
      const newContent = this.updateServerInCompose(content, serverName, serverConfig);

      return await this.service.dockerCompose.updateDockerComposeFile(newContent);
    } catch (error) {
      logger.error('Error updating ARK server:', error);
      throw new Error(`Failed to update ARK server: ${error.message}`);
    }
  }

  /**
   * Extract ARK server configurations from Docker Compose content
   */
  extractArkServers(content) {
    const servers = [];
    const lines = content.split('\n');
    let currentService = null;
    let inService = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('asa-server-') && trimmedLine.endsWith(':')) {
        // Found an ASA server service
        currentService = {
          name: trimmedLine.slice(0, -1), // Remove trailing colon
          lines: [],
          startLine: i,
          endLine: i
        };
        inService = true;
      } else if (inService && currentService) {
        if (trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t')) {
          // End of service
          inService = false;
          currentService.endLine = i - 1;
          servers.push(currentService);
          currentService = null;
        } else {
          currentService.lines.push(line);
        }
      }
    }

    // Add the last service if still in one
    if (inService && currentService) {
      currentService.endLine = lines.length - 1;
      servers.push(currentService);
    }

    return servers;
  }

  /**
   * Add server to Docker Compose content
   */
  addServerToCompose(content, serverConfig) {
    const lines = content.split('\n');
    const servicesIndex = lines.findIndex(line => line.trim() === 'services:');

    if (servicesIndex === -1) {
      throw new Error('Could not find services section in docker-compose.yml');
    }

    // Find the end of services section
    let endIndex = servicesIndex + 1;
    let indentLevel = 0;

    for (let i = servicesIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const currentIndent = line.length - line.trimStart().length;

        if (currentIndent === 0 && trimmedLine !== 'services:') {
          endIndex = i;
          break;
        }
      }
    }

    // Generate server configuration
    const serverLines = this.generateServerConfig(serverConfig);

    // Insert the new server
    lines.splice(endIndex, 0, ...serverLines);

    return lines.join('\n');
  }

  /**
   * Remove server from Docker Compose content
   */
  removeServerFromCompose(content, serverName) {
    const lines = content.split('\n');
    let startIndex = -1;
    let endIndex = -1;
    let inService = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === `${serverName}:`) {
        startIndex = i;
        inService = true;
      } else if (inService && trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t')) {
        endIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      throw new Error(`Server ${serverName} not found in docker-compose.yml`);
    }

    if (endIndex === -1) {
      endIndex = lines.length;
    }

    // Remove the service lines
    lines.splice(startIndex, endIndex - startIndex);

    return lines.join('\n');
  }

  /**
   * Update server in Docker Compose content
   */
  updateServerInCompose(content, serverName, serverConfig) {
    // First remove the existing server
    let newContent = this.removeServerFromCompose(content, serverName);

    // Then add the updated server
    return this.addServerToCompose(newContent, serverConfig);
  }

  /**
   * Generate server configuration lines
   */
  generateServerConfig(serverConfig) {
    const lines = [];

    // Ensure the service name follows the asa-server- prefix convention
    const serviceName = serverConfig.name.startsWith('asa-server-')
      ? serverConfig.name
      : `asa-server-${serverConfig.name}`;

    // Ensure container name follows the same convention
    const containerName = serverConfig.containerName && serverConfig.containerName.startsWith('asa-server-')
      ? serverConfig.containerName
      : `asa-server-${serverConfig.containerName || serverConfig.name}`;

    lines.push(`  ${serviceName}:`);
    lines.push(`    container_name: ${containerName}`);
    lines.push(`    image: ${serverConfig.image || 'mschnitzer/asa-linux-server:latest'}`);
    lines.push(`    ports:`);
    lines.push(`      - "${serverConfig.gamePort || '7777'}:7777"`);
    lines.push(`      - "${serverConfig.rconPort || '32330'}:32330"`);
    lines.push(`    environment:`);
    lines.push(`      - SERVER_NAME=${serverConfig.serverName || serverConfig.name}`);
    lines.push(`      - MAP_NAME=${serverConfig.mapName || 'TheIsland'}`);
    lines.push(`      - SERVER_PASSWORD=${serverConfig.serverPassword || ''}`);
    lines.push(`      - ADMIN_PASSWORD=${serverConfig.adminPassword || 'admin123'}`);
    lines.push(`      - MAX_PLAYERS=${serverConfig.maxPlayers || '70'}`);

    if (serverConfig.mods && serverConfig.mods.length > 0) {
      lines.push(`      - MODS=${serverConfig.mods.join(',')}`);
    }

    if (serverConfig.additionalArgs) {
      lines.push(`      - ADDITIONAL_ARGS=${serverConfig.additionalArgs}`);
    }

    if (serverConfig.disableBattleEye) {
      lines.push(`      - DISABLE_BATTLE_EYE=true`);
    }

    lines.push(`    volumes:`);
    lines.push(`      - /opt/asa/asa-server/${serverConfig.name}:/opt/asa/asa-server`);
    lines.push(`    restart: unless-stopped`);
    lines.push(`    networks:`);
    lines.push(`      - ark-network`);
    lines.push(``);

    return lines;
  }
}
