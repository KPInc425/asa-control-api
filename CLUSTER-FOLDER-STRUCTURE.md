# ASA Cluster Folder Structure

## 🏗️ Separate Binary Architecture

This document shows the complete folder structure for ASA servers using the separate binary architecture where each server has its own complete installation.

## 📁 Root Directory Structure

```
C:\ARK\                                    # Base directory for all ASA content
├── steamcmd\                             # SteamCMD installation
│   ├── steamcmd.exe                      # SteamCMD executable
│   ├── steamapps\                        # Steam apps directory
│   └── ... (other SteamCMD files)
├── servers\                              # Individual server installations
│   ├── server1\                          # First server
│   ├── server2\                          # Second server
│   └── ... (additional servers)
├── clusters\                             # Cluster configurations
│   ├── my-cluster\                       # Cluster configuration
│   └── ... (additional clusters)
└── logs\                                 # System logs
```

## 🖥️ Individual Server Structure

Each server gets its own complete installation:

```
C:\ARK\servers\server1\                   # Server root directory
├── binaries\                             # Complete ASA installation
│   ├── ShooterGame\                      # Main game directory
│   │   ├── Binaries\                     # Game binaries
│   │   │   └── Win64\                    # 64-bit Windows binaries
│   │   │       ├── ArkAscendedServer.exe # Main server executable
│   │   │       ├── ShooterGameServer.exe # Alternative server executable
│   │   │       └── ... (other binaries)
│   │   ├── Content\                      # Game content
│   │   │   ├── Maps\                     # Map files
│   │   │   ├── PrimalEarth\              # Core game content
│   │   │   └── ... (other content)
│   │   ├── Engine\                       # Engine files
│   │   └── ... (other game directories)
│   ├── Engine\                           # Unreal Engine files
│   ├── steamapps\                        # Steam apps (if using Steam)
│   └── ... (other Steam/Engine files)
├── configs\                              # Server-specific configurations
│   ├── GameUserSettings.ini              # Main game settings
│   ├── Game.ini                          # Game configuration
│   └── Engine.ini                        # Engine configuration
├── saves\                                # Server saves and data
│   ├── SavedArks\                        # ARK save files
│   │   ├── TheIsland.ark                 # Map save file
│   │   ├── TheIsland_Backup.ark          # Backup save file
│   │   └── ... (other save files)
│   ├── SaveGames\                        # Additional save data
│   └── ... (other save directories)
├── logs\                                 # Server logs
│   ├── ShooterGame.log                   # Main game log
│   ├── ShooterGame_Backup.log            # Backup log
│   └── ... (other log files)
├── start.bat                             # Server startup script
├── stop.bat                              # Server stop script
└── server-config.json                    # Server configuration metadata
```

## 🗂️ Cluster Configuration Structure

Cluster configurations are stored separately from server installations:

```
C:\ARK\clusters\my-cluster\               # Cluster configuration directory
├── cluster.json                          # Cluster configuration
├── servers\                              # Server references
│   ├── server1.json                      # Server 1 configuration
│   ├── server2.json                      # Server 2 configuration
│   └── ... (additional server configs)
└── mods\                                 # Cluster-wide mods
    ├── mod-list.json                     # Mod configuration
    └── ... (mod files if needed)
```

## 📋 Configuration Files

### Server Configuration (server-config.json)

```json
{
  "name": "server1",
  "map": "TheIsland",
  "gamePort": 7777,
  "queryPort": 27015,
  "rconPort": 32330,
  "maxPlayers": 70,
  "adminPassword": "admin123",
  "serverPassword": "",
  "rconPassword": "rcon123",
  "harvestMultiplier": 3.0,
  "xpMultiplier": 3.0,
  "tamingMultiplier": 5.0,
  "created": "2024-01-15T10:30:00.000Z",
  "lastStarted": "2024-01-15T11:00:00.000Z",
  "status": "stopped"
}
```

### Cluster Configuration (cluster.json)

```json
{
  "name": "my-cluster",
  "description": "My awesome ARK cluster",
  "serverCount": 3,
  "basePort": 7777,
  "maxPlayers": 70,
  "adminPassword": "admin123",
  "clusterPassword": "cluster123",
  "harvestMultiplier": 3.0,
  "xpMultiplier": 3.0,
  "tamingMultiplier": 5.0,
  "servers": [
    {
      "name": "server1",
      "map": "TheIsland",
      "port": 7777
    },
    {
      "name": "server2", 
      "map": "Ragnarok",
      "port": 7778
    },
    {
      "name": "server3",
      "map": "CrystalIsles", 
      "port": 7779
    }
  ],
  "created": "2024-01-15T10:00:00.000Z"
}
```

### Game Settings (GameUserSettings.ini)

```ini
[/script/shootergame.shootergamemode]
ServerSettings=(MaxPlayers=70,OverrideOfficialDifficulty=5.0,HarvestAmountMultiplier=3.0,TamingSpeedMultiplier=5.0,XPMultiplier=3.0)

[/script/engine.engine]
ServerSettings=(SessionName=My Server,ServerPassword=,ServerAdminPassword=admin123,MaxPlatformSaddleStructureLimit=130)

[/script/engine.gamesession]
ServerSettings=(ClusterId=my-cluster,ClusterName=My Cluster,ClusterDescription=My awesome ARK cluster,ClusterPassword=cluster123)
```

## 🚀 Startup Script (start.bat)

```batch
@echo off
cd /d "C:\ARK\servers\server1\binaries\ShooterGame\Binaries\Win64"

REM Check for SteamCMD lock
if exist "C:\ARK\steamcmd\steamcmd.lock" (
    echo SteamCMD update in progress, waiting...
    timeout /t 30 /nobreak >nul
)

REM Start the server
start "ARK Server - server1" ArkAscendedServer.exe TheIsland?listen?SessionName=server1?ServerPassword=?ServerAdminPassword=admin123?MaxPlayers=70?OverrideOfficialDifficulty=5.0?HarvestAmountMultiplier=3.0?TamingSpeedMultiplier=5.0?XPMultiplier=3.0?ClusterId=my-cluster?ClusterName=My Cluster?ClusterDescription=My awesome ARK cluster?ClusterPassword=cluster123?AltSaveDirectoryName=server1?customdynamicconfigurl=? -server -log
```

## 🔧 Benefits of This Structure

### ✅ Advantages

1. **Complete Isolation**: Each server has its own binaries, configs, saves, and logs
2. **Easy Management**: No complex shared binary coordination
3. **Independent Updates**: Update servers individually without affecting others
4. **Simple Debugging**: Self-contained servers are easier to troubleshoot
5. **No Conflicts**: Each server runs independently with its own resources
6. **Easy Backup**: Copy entire server directory for complete backup
7. **Flexible Configuration**: Each server can have different settings

### 📊 Space Usage

- **Base ASA Installation**: ~30GB per server
- **Server Data**: ~1-5GB per server (configs, saves, logs)
- **Total per Server**: ~31-35GB
- **3-Server Cluster**: ~93-105GB total

### 🔄 Migration Path

This structure makes it easy to migrate to Windows Docker later:

1. **Current**: Separate binary installations
2. **Future**: Windows Docker containers with shared binaries
3. **Data Structure**: Remains the same, only runtime environment changes

## 🛠️ Management Commands

### Create Server
```bash
# Via API
POST /api/provisioning/servers
{
  "name": "server1",
  "map": "TheIsland",
  "gamePort": 7777,
  "maxPlayers": 70
}

# Via Console
node scripts/interactive-console.js
# Select option 1: Create New Server
```

### Create Cluster
```bash
# Via API
POST /api/provisioning/clusters
{
  "name": "my-cluster",
  "serverCount": 3,
  "basePort": 7777
}

# Via Console
node scripts/interactive-console.js
# Select option 2: Create New Cluster
```

### Update Server
```bash
# Via API
POST /api/provisioning/servers/{serverName}/update

# Via Console
node scripts/interactive-console.js
# Select option 9: Update Server Binaries
```

## 📝 Notes

- Each server installation is completely independent
- SteamCMD updates are locked to prevent concurrent updates
- Logs are stored per-server in `{server}/logs/`
- Configs are stored per-server in `{server}/configs/`
- Saves are stored per-server in `{server}/saves/`
- Cluster configurations are separate from server installations
- Easy to backup by copying entire server directory
- Future Docker migration will maintain same data structure 
