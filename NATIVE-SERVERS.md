# Native Windows Server Management

This document describes how to use the ASA Management Suite to manage native Windows ARK: Survival Ascended servers alongside Docker-based servers.

## Overview

The ASA Management Suite now supports both Docker-based and native Windows ASA servers. You can switch between modes using the `SERVER_MODE` environment variable.

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```bash
# Server Management Mode
# Set to 'docker' for Docker-based servers or 'native' for Windows native servers
SERVER_MODE=native

# Native Windows Server Configuration (only used when SERVER_MODE=native)
# Default path where ASA server executable is located
# NATIVE_SERVER_PATH is automatically calculated as NATIVE_BASE_PATH/servers
# Configuration file for native servers
NATIVE_CONFIG_FILE=native-servers.json
```

### Server Modes

- **`docker`** (default): Uses Docker containers for server management
- **`native`**: Uses native Windows processes for server management

## Native Server Setup

### Prerequisites

1. **ASA Server Installation**: Install ARK: Survival Ascended dedicated server on Windows
2. **Server Path**: Ensure the server executable is accessible at the configured path
3. **Permissions**: The application needs permission to start/stop processes

### Server Configuration

Native servers are configured through the web interface or by editing the `native-servers.json` file directly.

#### Configuration Structure

```json
{
  "server-name": {
    "serverPath": "C:\\ARK\\Server",
    "mapName": "TheIsland",
    "gamePort": 7777,
    "queryPort": 27015,
    "rconPort": 32330,
    "serverName": "My ASA Server",
    "maxPlayers": 70,
    "serverPassword": "",
    "adminPassword": "admin123",
    "mods": [],
    "additionalArgs": "?AllowCaveBuildingPvE=true"
  }
}
```

#### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverPath` | string | Yes | Path to ASA server executable directory |
| `mapName` | string | No | Map to load (default: TheIsland) |
| `gamePort` | number | No | Game port (default: 7777) |
| `queryPort` | number | No | Query port (default: 27015) |
| `rconPort` | number | No | RCON port (default: 32330) |
| `serverName` | string | No | Server name displayed to players |
| `maxPlayers` | number | No | Maximum players (default: 70) |
| `serverPassword` | string | No | Server password (optional) |
| `adminPassword` | string | No | Admin password (default: admin123) |
| `mods` | array | No | Array of mod IDs |
| `additionalArgs` | string | No | Additional command line arguments |

## API Endpoints

### Native Server Management

- `GET /api/native-servers` - List all native servers
- `POST /api/native-servers` - Add/update server configuration
- `GET /api/native-servers/:name/config` - Get server configuration
- `DELETE /api/native-servers/:name` - Delete server configuration
- `GET /api/native-servers/:name/stats` - Get server statistics
- `POST /api/native-servers/:name/start` - Start server
- `POST /api/native-servers/:name/stop` - Stop server
- `POST /api/native-servers/:name/restart` - Restart server

### Docker Server Management (when SERVER_MODE=docker)

- `GET /api/containers` - List all Docker containers
- `POST /api/containers/:name/start` - Start container
- `POST /api/containers/:name/stop` - Stop container
- `POST /api/containers/:name/restart` - Restart container
- `GET /api/containers/:name/logs` - Get container logs

## Web Interface

The web interface automatically adapts based on the server mode:

### Native Mode Features

- **Server Management**: Add, edit, delete native server configurations
- **Process Control**: Start, stop, restart native server processes
- **Configuration Editor**: Web-based configuration management
- **Status Monitoring**: Real-time server status and statistics
- **Log Streaming**: Stream server logs in real-time

### Docker Mode Features

- **Container Management**: Manage Docker containers
- **Container Logs**: View and stream container logs
- **Resource Monitoring**: CPU, memory, and network statistics
- **Configuration Management**: Edit server configuration files

## Usage Examples

### Starting a Native Server

1. Navigate to the "Native Servers" page in the web interface
2. Click "Add Server" to create a new server configuration
3. Fill in the required fields (server path is mandatory)
4. Click "Add Server" to save the configuration
5. Click "Start" on the server card to start the server

### Managing Multiple Servers

You can run both Docker and native servers simultaneously by:

1. Setting up Docker servers in the "Docker Servers" section
2. Setting up native servers in the "Native Servers" section
3. Both types will appear in the main dashboard

### Server Configuration

Each server type has its own configuration management:

- **Docker Servers**: Use the "Configs" page to edit Game.ini and GameUserSettings.ini
- **Native Servers**: Use the server configuration form to set startup parameters

## Troubleshooting

### Common Issues

1. **Server Won't Start**
   - Verify the server path is correct
   - Check that ShooterGameServer.exe exists in the specified directory
   - Ensure the application has permission to start processes

2. **Port Conflicts**
   - Make sure the specified ports are not in use by other applications
   - Check Windows Firewall settings

3. **Configuration Not Saving**
   - Verify the application has write permission to the working directory
   - Check that the native-servers.json file is not read-only

### Logs

- **Application Logs**: Check the application logs for errors
- **Server Logs**: Use the log viewer in the web interface
- **Windows Event Logs**: Check Windows Event Viewer for process-related errors

## Security Considerations

1. **Admin Passwords**: Use strong admin passwords for production servers
2. **Network Security**: Configure Windows Firewall appropriately
3. **File Permissions**: Restrict access to server configuration files
4. **Process Isolation**: Consider running the management application with limited permissions

## Performance Notes

- **Native servers** typically have better performance than Docker-based servers
- **Resource usage** is more predictable with native servers
- **Startup time** is generally faster for native servers
- **Memory usage** may be higher without container isolation

## Migration from Docker

To migrate from Docker to native servers:

1. Stop all Docker containers
2. Set `SERVER_MODE=native` in your environment
3. Configure native servers using the web interface
4. Start the native servers
5. Verify all functionality works as expected

## Hybrid Mode

You can maintain both Docker and native server configurations by:

1. Keeping both server configurations
2. Switching `SERVER_MODE` as needed
3. Using different server names to avoid conflicts
4. Managing both types through the appropriate interfaces 
