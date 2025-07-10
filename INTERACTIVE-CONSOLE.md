# ASA Server Management Interactive Console

This document describes the new interactive console interface and enhanced features for managing ARK: Survival Ascended server clusters.

## New Features

### 1. Map Selection with Multiple Servers per Map
- **Checkbox Selection**: Choose which maps to include in your cluster
- **Multiple Servers**: Create multiple servers for the same map (up to 5 per map)
- **Flexible Configuration**: Each map can have different server counts

### 2. Mod Management System
- **Global Mods**: Apply mods to all servers in the cluster
- **Per-Server Mods**: Add specific mods to individual servers
- **Popular Mods List**: Pre-configured list of popular ARK mods
- **Custom Mod Support**: Add any Steam Workshop mod by ID

### 3. Interactive Console Interface
- **User-Friendly CLI**: Command-line interface for server management
- **Guided Setup**: Step-by-step cluster creation process
- **System Information**: View system status and requirements
- **Cluster Management**: Create, start, stop, and delete clusters

## Interactive Console Usage

### Starting the Console

#### PowerShell (Recommended)
```powershell
# From the asa-docker-control-api directory
.\start-interactive-console.ps1
```

#### Direct Node.js
```bash
# From the asa-docker-control-api directory
node scripts/interactive-console.js
```

### Console Menu Options

1. **Create New Cluster** - Interactive cluster creation with guided setup
2. **List Clusters** - View all existing clusters and their details
3. **Start Cluster** - Start all servers in a selected cluster
4. **Stop Cluster** - Stop all servers in a selected cluster
5. **Delete Cluster** - Remove a cluster and all its data
6. **System Information** - View system status and requirements
7. **Update ASA Binaries** - Update ARK server binaries
8. **Exit** - Close the console

### Creating a Cluster via Console

The interactive console guides you through:

1. **Basic Information**
   - Cluster name and description

2. **Map Selection**
   - Choose from available ARK maps
   - Set number of servers per map (1-5)

3. **Mod Selection**
   - Select from popular mods
   - Add custom mods by Steam Workshop ID

4. **Port Configuration**
   - Base ports for game, query, and RCON
   - Automatic port increment calculation

5. **Game Settings**
   - Player limits, difficulty, multipliers
   - Passwords and admin settings

6. **Cluster Settings**
   - Cluster ID and display name
   - Cluster password and owner

## Frontend Enhancements

### Advanced Cluster Form

The frontend now includes:

- **Map Selection Tab**: Checkbox interface for map selection
- **Mod Management Tab**: Global and per-server mod configuration
- **Enhanced Server Configuration**: Individual server mod management
- **Port Preview**: Real-time port allocation display

### New Configuration Structure

```json
{
  "name": "MyCluster",
  "selectedMaps": [
    {
      "map": "TheIsland",
      "count": 1,
      "enabled": true
    },
    {
      "map": "Ragnarok",
      "count": 2,
      "enabled": true
    }
  ],
  "globalMods": ["111111111", "880871931"],
  "servers": [
    {
      "name": "MyCluster-TheIsland",
      "map": "TheIsland",
      "mods": ["111111111", "880871931", "1404697612"]
    }
  ]
}
```

## Popular Mods Included

The system includes a curated list of popular ARK mods:

- **Structures Plus (S+)** - Enhanced building system
- **Super Structures** - Advanced building features
- **StackMeMore** - Increased stack sizes
- **Dino Storage v2** - Dinosaur management
- **Awesome SpyGlass!** - Enhanced spyglass functionality

## Backend Enhancements

### Server Provisioner Updates

- **Map-Based Generation**: Generate servers based on selected maps
- **Mod Integration**: Include mod parameters in server startup
- **Enhanced Validation**: Validate map selections and mod configurations
- **Flexible Port Allocation**: Automatic port calculation for multiple servers

### Configuration Merging

The system now properly merges:
- Global settings with server-specific settings
- Global mods with per-server mods
- Map configurations with server generation

## Usage Examples

### Quick Cluster Creation
```bash
# Start interactive console
.\start-interactive-console.ps1

# Follow the guided setup process
# 1. Enter cluster name: "MyCluster"
# 2. Select maps: TheIsland (1), Ragnarok (2)
# 3. Add mods: Structures Plus, StackMeMore
# 4. Configure ports and settings
# 5. Create and optionally start the cluster
```

### Frontend Cluster Creation
1. Open the web dashboard
2. Navigate to "Server Provisioner"
3. Choose "Advanced Mode"
4. Configure maps, mods, and settings
5. Generate and create the cluster

## System Requirements

- **Node.js**: Version 16 or higher
- **Windows**: Windows 10/11 (for native server support)
- **Disk Space**: 10GB per server minimum
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Network**: Stable internet connection for mod downloads

## Troubleshooting

### Common Issues

1. **Mods Not Loading**
   - Verify Steam Workshop mod IDs
   - Check internet connection for mod downloads
   - Ensure mods are compatible with ASA

2. **Port Conflicts**
   - Use the port preview feature to check for conflicts
   - Adjust base ports if needed
   - Ensure ports are not used by other applications

3. **Server Startup Issues**
   - Check system requirements
   - Verify ASA binaries are installed
   - Review server logs for specific errors

### Getting Help

- Check the system information in the interactive console
- Review server logs in the cluster directory
- Verify all dependencies are installed
- Ensure proper file permissions

## Future Enhancements

Planned features for future releases:

- **Mod Auto-Update**: Automatic mod updates
- **Backup System**: Cluster backup and restore
- **Performance Monitoring**: Real-time server monitoring
- **Plugin System**: Extensible mod management
- **WebSocket Integration**: Real-time console updates 
