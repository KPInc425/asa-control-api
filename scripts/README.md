# ARK Empire Creator Scripts

This directory contains scripts and tools for creating ARK: Survival Ascended server clusters from the command line, without needing to use the web dashboard.

## Overview

The ARK Empire Creator provides multiple ways to create and manage ARK server clusters:

1. **Node.js CLI Script** - Cross-platform command-line tool
2. **PowerShell Script** - Windows-specific PowerShell tool
3. **Configuration Files** - JSON-based cluster configuration
4. **API Integration** - Direct API calls for automation

## Quick Start

### Prerequisites

1. **Backend Server Running**: Ensure the ASA Management backend is running on `http://localhost:3000`
2. **Node.js**: Required for the Node.js CLI script
3. **PowerShell**: Required for the PowerShell script (Windows only)

### Basic Usage

#### Node.js CLI Script

```bash
# Create a simple cluster
node create-ark-empire.js --name "MyCluster" --servers 3

# Interactive mode
node create-ark-empire.js --interactive

# From configuration file
node create-ark-empire.js --config cluster-config.json

# Show help
node create-ark-empire.js --help
```

#### PowerShell Script

```powershell
# Create a simple cluster
.\create-ark-empire.ps1 -Name "MyCluster" -Servers 3

# Interactive mode
.\create-ark-empire.ps1 -Interactive

# From configuration file
.\create-ark-empire.ps1 -ConfigFile cluster-config.json

# Show help
.\create-ark-empire.ps1 -Help
```

## Configuration Files

### Basic Configuration

Create a JSON file with your cluster configuration:

```json
{
  "name": "MyARKCluster",
  "description": "My awesome ARK cluster",
  "basePort": 7777,
  "serverCount": 3
}
```

### Advanced Configuration

For more control, use the advanced configuration format:

```json
{
  "name": "MyARKCluster",
  "description": "My awesome ARK cluster",
  "basePort": 7777,
  "serverCount": 3,
  "settings": {
    "maxPlayers": 70,
    "difficulty": 1.0,
    "harvestAmount": 2.0,
    "tamingSpeed": 3.0,
    "xpMultiplier": 2.0
  },
  "maps": ["TheIsland", "ScorchedEarth", "Aberration"],
  "clusterSettings": {
    "clusterId": "MyClusterID",
    "clusterName": "MyARKCluster",
    "clusterPassword": "",
    "clusterOwner": "Admin"
  }
}
```

## Script Options

### Node.js CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--name` | `-n` | Cluster name | Required |
| `--description` | `-d` | Cluster description | "" |
| `--servers` | `-s` | Number of servers | 1 |
| `--base-port` | `-p` | Base port for servers | 7777 |
| `--config` | `-c` | Load from JSON file | - |
| `--interactive` | `-i` | Interactive mode | false |
| `--help` | `-h` | Show help | - |

### PowerShell Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Name` | Cluster name | Required |
| `-Description` | Cluster description | "" |
| `-Servers` | Number of servers | 1 |
| `-BasePort` | Base port for servers | 7777 |
| `-ConfigFile` | Load from JSON file | - |
| `-Interactive` | Interactive mode | false |
| `-Help` | Show help | - |

## API Integration

### Direct API Calls

You can also create clusters directly via API calls:

```bash
# Create cluster via API
curl -X POST http://localhost:3000/api/provisioning/clusters/script \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyCluster",
    "description": "My ARK cluster",
    "serverCount": 3,
    "basePort": 7777,
    "autoStart": true
  }'

# Validate configuration
curl -X POST http://localhost:3000/api/provisioning/validate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyCluster",
    "serverCount": 3,
    "basePort": 7777
  }'

# Start cluster
curl -X POST http://localhost:3000/api/provisioning/clusters/MyCluster/start

# Stop cluster
curl -X POST http://localhost:3000/api/provisioning/clusters/MyCluster/stop
```

### Enhanced Script Endpoint

The `/api/provisioning/clusters/script` endpoint provides additional features:

- **Validation**: Pre-flight configuration validation
- **Auto-start**: Automatically start servers after creation
- **Advanced settings**: Support for game settings and cluster configuration

## Cluster Management

### Starting Clusters

```bash
# Via API
curl -X POST http://localhost:3000/api/provisioning/clusters/MyCluster/start

# Via PowerShell
.\create-ark-empire.ps1 -StartCluster "MyCluster"
```

### Stopping Clusters

```bash
# Via API
curl -X POST http://localhost:3000/api/provisioning/clusters/MyCluster/stop

# Via PowerShell
.\create-ark-empire.ps1 -StopCluster "MyCluster"
```

### Listing Clusters

```bash
# Via API
curl http://localhost:3000/api/provisioning/clusters

# Via PowerShell
.\create-ark-empire.ps1 -ListClusters
```

## Examples

### Example 1: Simple 3-Server Cluster

```bash
node create-ark-empire.js --name "MyCluster" --servers 3 --base-port 7777
```

### Example 2: Advanced Configuration

Create `my-cluster.json`:
```json
{
  "name": "AdvancedCluster",
  "description": "High-performance ARK cluster",
  "basePort": 7777,
  "serverCount": 5,
  "settings": {
    "maxPlayers": 100,
    "difficulty": 1.5,
    "harvestAmount": 3.0,
    "tamingSpeed": 5.0,
    "xpMultiplier": 3.0
  },
  "maps": ["TheIsland", "ScorchedEarth", "Aberration", "Extinction", "Genesis"],
  "clusterSettings": {
    "clusterId": "AdvancedClusterID",
    "clusterName": "AdvancedCluster",
    "clusterPassword": "mypassword123",
    "clusterOwner": "Admin"
  }
}
```

Then run:
```bash
node create-ark-empire.js --config my-cluster.json
```

### Example 3: Interactive Mode

```bash
node create-ark-empire.js --interactive
```

This will prompt you for:
- Cluster name
- Description
- Number of servers
- Base port

## Troubleshooting

### Common Issues

1. **Backend not running**: Ensure the ASA Management backend is running on port 3000
2. **Permission errors**: Run scripts as Administrator on Windows
3. **Port conflicts**: Check if ports are already in use
4. **Insufficient disk space**: Ensure you have at least 10GB free per server

### Validation

The scripts automatically validate:
- Cluster name format (alphanumeric, underscores, hyphens only)
- Server count (1-10 servers)
- Port range (1024-65535)
- System requirements (disk space, memory)
- Existing clusters (prevents duplicates)

### Logs

Check the backend logs for detailed error information:
```bash
# View backend logs
tail -f logs/app.log
```

## Integration with Dashboard

The script-based approach works alongside the web dashboard:

1. **Create clusters via scripts** - Use CLI tools for automation
2. **Manage via dashboard** - Use the web interface for ongoing management
3. **Hybrid approach** - Create with scripts, monitor with dashboard

## Automation

### Batch Scripts

Create batch files for common operations:

```batch
@echo off
REM start-ark-cluster.bat
node create-ark-empire.js --name "ProductionCluster" --servers 5 --base-port 7777
```

### Scheduled Tasks

Set up scheduled cluster management:

```powershell
# PowerShell scheduled task
Register-ScheduledJob -Name "StartARKCluster" -ScriptBlock {
    .\create-ark-empire.ps1 -StartCluster "MyCluster"
} -Trigger (New-JobTrigger -AtStartup)
```

### CI/CD Integration

Integrate with your deployment pipeline:

```yaml
# GitHub Actions example
- name: Deploy ARK Cluster
  run: |
    node create-ark-empire.js --config cluster-config.json
```

## Security Considerations

1. **Cluster passwords**: Use strong passwords for cluster access
2. **Admin passwords**: Secure admin access with strong passwords
3. **Network security**: Configure firewall rules appropriately
4. **File permissions**: Restrict access to cluster configuration files

## Support

For issues and questions:

1. Check the backend logs for error details
2. Validate your configuration using the validation endpoint
3. Ensure system requirements are met
4. Check network connectivity to the backend API

## File Structure

```
scripts/
├── create-ark-empire.js          # Node.js CLI script
├── create-ark-empire.ps1         # PowerShell script
├── cluster-config-example.json   # Example configuration
└── README.md                     # This file
``` 
