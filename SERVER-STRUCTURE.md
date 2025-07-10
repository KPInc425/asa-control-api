# ASA Server Structure

## Overview

The ASA Management Suite now supports two distinct types of server configurations to keep things organized and prevent clutter:

1. **Clusters** - Multiple related servers (for multi-map gameplay)
2. **Individual Servers** - Standalone servers (for single-map or special purposes)

## Directory Structure

```
G:\ARK\
├── clusters\                    # Multi-server clusters
│   ├── iLGaming\               # Your existing cluster
│   │   └── cluster.json
│   └── MyCluster\              # New cluster with multiple servers
│       └── cluster.json
└── servers\                    # Individual standalone servers
    ├── MyPvPServer\            # Single PvP server
    │   └── server.json
    ├── MyEventServer\          # Event server
    │   └── server.json
    └── MyTestServer\           # Testing server
        └── server.json
```

## Server Types

### 1. Clusters (Multiple Servers)

**Purpose**: Groups of related servers that share a cluster for character transfers

**Use Cases**:
- Multi-map gameplay (Ragnarok + TheIsland + ScorchedEarth)
- Character transfers between maps
- Shared cluster settings and mods
- Community servers with multiple maps

**Example**:
```json
{
  "name": "MyCluster",
  "servers": [
    {"name": "MyCluster-Ragnarok", "map": "Ragnarok"},
    {"name": "MyCluster-TheIsland", "map": "TheIsland"},
    {"name": "MyCluster-Scorched", "map": "ScorchedEarth"}
  ]
}
```

**Benefits**:
- ✅ Character transfers between maps
- ✅ Shared cluster settings
- ✅ Centralized management
- ✅ Advanced mod management with exclusions

### 2. Individual Servers (Single Server)

**Purpose**: Standalone servers not part of any cluster

**Use Cases**:
- Single-map servers
- Testing servers
- Event servers
- Different game modes (PvP vs PvE)
- Temporary servers

**Example**:
```json
{
  "name": "MyPvPServer",
  "map": "Ragnarok",
  "type": "individual-server",
  "port": 7777
}
```

**Benefits**:
- ✅ Clean, simple configuration
- ✅ Independent operation
- ✅ No cluster complexity
- ✅ Easy to manage and delete

## When to Use Each Type

### Use Clusters When:
- You want character transfers between maps
- You have multiple related servers
- You want shared settings across servers
- You're building a community with multiple maps

### Use Individual Servers When:
- You only need one server
- You want to test different configurations
- You're running temporary or event servers
- You want to keep things simple

## API Endpoints

### Clusters
- `GET /api/provisioning/clusters` - List all clusters
- `POST /api/provisioning/create-cluster` - Create new cluster
- `PUT /api/provisioning/clusters/:clusterName/mods` - Update cluster mods

### Individual Servers
- `GET /api/provisioning/servers` - List all individual servers
- `POST /api/provisioning/create-server` - Create new individual server

### All Servers
- `GET /api/native-servers` - List all servers (clusters + individual)

## Dashboard Integration

The dashboard will provide clear options:

```
Create New:
├── 🏗️ Create Cluster    → Multi-server wizard
└── 🖥️ Create Server     → Single server wizard

Manage:
├── 📁 Clusters          → List and manage clusters
├── 🖥️ Individual Servers → List and manage standalone servers
└── 📊 All Servers       → Combined view of everything
```

## Migration Strategy

### Existing Clusters
- Your existing `iLGaming` cluster continues to work unchanged
- All existing functionality preserved
- Can be enhanced with new features when ready

### New Servers
- Choose appropriate type based on needs
- Individual servers for simple cases
- Clusters for multi-map gameplay

## Benefits of This Structure

1. **Clean Organization**: No clutter from single-server "clusters"
2. **Clear Purpose**: Each type has a specific use case
3. **Scalable**: Easy to add more servers of either type
4. **Maintainable**: Simple structure for individual servers
5. **Flexible**: Choose the right tool for the job

## File Formats

### Cluster Format (`cluster.json`)
- Comprehensive configuration with multiple servers
- Advanced mod management
- Global settings and cluster settings
- Port configuration with increments

### Individual Server Format (`server.json`)
- Simple, focused configuration
- Single server settings
- Direct mod list
- Independent operation

## Best Practices

1. **Use Individual Servers** for:
   - Testing configurations
   - Single-map gameplay
   - Temporary servers
   - Simple setups

2. **Use Clusters** for:
   - Multi-map communities
   - Character transfers
   - Complex mod management
   - Production environments

3. **Naming Conventions**:
   - Individual servers: `MyServer`, `PvPServer`, `TestServer`
   - Clusters: `MyCluster`, `CommunityCluster`, `EventCluster`

This structure provides the best of both worlds: simplicity for individual servers and power for complex clusters! 
