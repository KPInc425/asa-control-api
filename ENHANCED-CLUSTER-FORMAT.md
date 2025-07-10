# Enhanced Cluster Configuration Format

## Overview

The ASA Management Suite now uses an enhanced cluster configuration format that provides comprehensive server management, advanced mod handling, and full integration with the dashboard functionality.

## File Structure

Clusters are stored as `cluster.json` files in the clusters directory:
```
G:\ARK\clusters\
├── MyCluster\
│   └── cluster.json
└── AnotherCluster\
    └── cluster.json
```

## Enhanced Cluster Configuration Format

```json
{
  "name": "MyCluster",
  "description": "My awesome ASA cluster",
  "basePort": 7777,
  "serverCount": 3,
  "selectedMaps": [
    {
      "map": "Ragnarok",
      "count": 1,
      "enabled": true
    },
    {
      "map": "TheIsland", 
      "count": 2,
      "enabled": true
    }
  ],
  "modManagement": {
    "sharedMods": ["12345", "67890"],
    "serverMods": {
      "MyCluster-Ragnarok": {
        "additionalMods": ["extra1", "extra2"],
        "excludeSharedMods": false,
        "lastUpdated": "2025-07-08T06:15:00.000Z"
      },
      "MyCluster-TheIsland-1": {
        "additionalMods": ["extra3"],
        "excludeSharedMods": true,
        "lastUpdated": "2025-07-08T06:16:00.000Z"
      }
    },
    "excludedServers": ["MyCluster-TheIsland-1"],
    "lastUpdated": "2025-07-08T06:10:00.000Z"
  },
  "servers": [
    {
      "name": "MyCluster-Ragnarok",
      "map": "Ragnarok",
      "port": 7777,
      "queryPort": 27015,
      "rconPort": 32330,
      "maxPlayers": 70,
      "password": "",
      "adminPassword": "admin123",
      "clusterId": "MyCluster",
      "clusterName": "MyCluster",
      "clusterPassword": "",
      "clusterOwner": "Admin",
      "gameUserSettings": {
        "ServerSettings": {
          "MaxPlayers": 70,
          "DifficultyOffset": 1,
          "HarvestAmountMultiplier": 2,
          "TamingSpeedMultiplier": 3,
          "XPMultiplier": 2,
          "AllowThirdPersonPlayer": true,
          "AlwaysNotifyPlayerLeft": true,
          "AlwaysNotifyPlayerJoined": true,
          "ServerCrosshair": true,
          "ServerForceNoHUD": false,
          "ServerThirdPersonPlayer": false,
          "ServerHardcore": false,
          "ServerAllowThirdPersonPlayer": true,
          "ServerShowMapPlayerLocation": true,
          "ServerEnablePvPGamma": true,
          "ServerAllowFlyerCarryPvE": true,
          "ServerDisableStructurePlacementCollision": true,
          "ServerAllowCaveBuildingPvE": true,
          "ServerAllowFlyingStaminaRecovery": true,
          "ServerAllowUnlimitedRespecs": true,
          "ServerPreventSpawnFlier": true,
          "ServerPreventOfflinePvP": true,
          "ServerPreventOfflinePvPInterval": 300,
          "ServerPreventOfflinePvPUseStructurePrevention": true,
          "ServerPreventOfflinePvPUseStructurePreventionRadius": 1000
        },
        "MultiHome": {
          "MultiHome": ""
        },
        "SessionSettings": {
          "SessionName": "MyCluster-Ragnarok",
          "ServerPassword": "",
          "ServerAdminPassword": "admin123",
          "MaxPlatformSaddleStructureLimit": 130
        }
      },
      "gameIni": {
        "ServerSettings": {
          "AllowCaveBuildingPvE": true,
          "AllowFlyingStaminaRecovery": true,
          "AllowUnlimitedRespecs": true,
          "PreventSpawnFlier": true,
          "PreventOfflinePvP": true,
          "PreventOfflinePvPInterval": 300,
          "PreventOfflinePvPUseStructurePrevention": true,
          "PreventOfflinePvPUseStructurePreventionRadius": 1000
        }
      }
    }
  ],
  "created": "2025-07-08T06:00:00.000Z",
  "globalSettings": {
    "gameUserSettings": {
      "ServerSettings": {
        "MaxPlayers": 70,
        "DifficultyOffset": 1,
        "HarvestAmountMultiplier": 2,
        "TamingSpeedMultiplier": 3,
        "XPMultiplier": 2,
        "AllowThirdPersonPlayer": true,
        "AlwaysNotifyPlayerLeft": true,
        "AlwaysNotifyPlayerJoined": true,
        "ServerCrosshair": true,
        "ServerForceNoHUD": false,
        "ServerThirdPersonPlayer": false,
        "ServerHardcore": false,
        "ServerAllowThirdPersonPlayer": true,
        "ServerShowMapPlayerLocation": true,
        "ServerEnablePvPGamma": true,
        "ServerAllowFlyerCarryPvE": true,
        "ServerDisableStructurePlacementCollision": true,
        "ServerAllowCaveBuildingPvE": true,
        "ServerAllowFlyingStaminaRecovery": true,
        "ServerAllowUnlimitedRespecs": true,
        "ServerPreventSpawnFlier": true,
        "ServerPreventOfflinePvP": true,
        "ServerPreventOfflinePvPInterval": 300,
        "ServerPreventOfflinePvPUseStructurePrevention": true,
        "ServerPreventOfflinePvPUseStructurePreventionRadius": 1000
      },
      "MultiHome": {
        "MultiHome": ""
      },
      "SessionSettings": {
        "SessionName": "MyCluster",
        "ServerPassword": "",
        "ServerAdminPassword": "admin123",
        "MaxPlatformSaddleStructureLimit": 130
      }
    },
    "gameIni": {
      "ServerSettings": {
        "AllowCaveBuildingPvE": true,
        "AllowFlyingStaminaRecovery": true,
        "AllowUnlimitedRespecs": true,
        "PreventSpawnFlier": true,
        "PreventOfflinePvP": true,
        "PreventOfflinePvPInterval": 300,
        "PreventOfflinePvPUseStructurePrevention": true,
        "PreventOfflinePvPUseStructurePreventionRadius": 1000
      }
    }
  },
  "clusterSettings": {
    "clusterId": "MyCluster",
    "clusterName": "MyCluster",
    "clusterDescription": "My awesome ASA cluster",
    "clusterPassword": "",
    "clusterOwner": "Admin"
  },
  "portConfiguration": {
    "basePort": 7777,
    "portIncrement": 1,
    "queryPortBase": 27015,
    "queryPortIncrement": 1,
    "rconPortBase": 32330,
    "rconPortIncrement": 1
  }
}
```

## Key Features

### 1. Advanced Mod Management

The `modManagement` section provides sophisticated mod handling:

- **sharedMods**: Mods applied to all servers in the cluster
- **serverMods**: Server-specific additional mods and exclusions
- **excludedServers**: Servers that don't use shared mods

#### Mod Combination Logic

1. **Cluster shared mods** (unless server is excluded)
2. **Cluster server-specific mods**
3. **Global shared mods** (from `mods-config.json`)
4. **Global server-specific mods** (from `server-mods.json`)

### 2. Comprehensive Server Configuration

Each server includes:
- **Basic settings**: name, map, ports, passwords
- **Game settings**: detailed `gameUserSettings` and `gameIni`
- **Cluster settings**: cluster ID, name, password
- **Mod management**: integration with mod system

### 3. Global Settings

The `globalSettings` section provides default settings that apply to all servers unless overridden.

### 4. Port Configuration

The `portConfiguration` section defines how ports are assigned:
- **basePort**: Starting game port
- **portIncrement**: Increment between servers
- **queryPortBase**: Starting query port
- **rconPortBase**: Starting RCON port

## API Endpoints

### Cluster Management

- `GET /api/provisioning/clusters` - List all clusters
- `POST /api/provisioning/create-cluster` - Create new cluster
- `PUT /api/provisioning/clusters/:clusterName/mods` - Update cluster mods
- `GET /api/provisioning/clusters/:clusterName/mods` - Get cluster mods

### Server Management

- `PUT /api/provisioning/clusters/:clusterName/servers/:serverName/mods` - Update server mods
- `POST /api/provisioning/generate-cluster-startup-command` - Generate startup command

### Global Mod Management

- `GET /api/provisioning/shared-mods` - Get global shared mods
- `PUT /api/provisioning/shared-mods` - Update global shared mods
- `GET /api/provisioning/server-mods/:serverName` - Get server mods
- `PUT /api/provisioning/server-mods/:serverName` - Update server mods

## Backward Compatibility

The system maintains backward compatibility with older cluster formats:
- Old `globalMods` arrays are automatically converted to `modManagement.sharedMods`
- Missing sections are populated with sensible defaults
- Existing clusters continue to work without modification

## Dashboard Integration

The enhanced format fully supports all dashboard features:
- **Cluster creation wizard** with map selection and mod management
- **Server management** with individual server configuration
- **Mod management** with shared, server-specific, and exclusion controls
- **Configuration editing** with whitelisted environment variables
- **Startup command generation** with combined mod lists

## Migration

Existing clusters are automatically upgraded when accessed:
1. Old `globalMods` are preserved in `modManagement.sharedMods`
2. Missing sections are populated with defaults
3. Enhanced features become available immediately

## Benefits

1. **Comprehensive**: All server settings in one place
2. **Flexible**: Advanced mod management with exclusions
3. **Scalable**: Supports unlimited servers and mods
4. **Maintainable**: Clear structure and documentation
5. **Compatible**: Works with existing clusters
6. **Integrated**: Full dashboard and API support 
