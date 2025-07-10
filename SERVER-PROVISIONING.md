# ASA Server Provisioning

## 🏗️ Architecture Overview

### Native Server Architecture (Current)

**Each server gets its own complete installation:**

**Benefits:**
- **Clean Separation**: Each server has isolated configs, logs, saves, and binaries
- **Simplified Management**: No complex shared binary coordination
- **Easy Debugging**: Self-contained servers are easier to troubleshoot
- **No Process Conflicts**: Each server runs independently
- **Native Performance**: No emulation overhead

**How it Works:**
1. Each server gets its own directory: `C:\ARK\servers\{server-name}\`
2. Complete ASA installation per server: `{server-name}\binaries\`
3. Server-specific data: `{server-name}\configs\`, `{server-name}\saves\`, `{server-name}\logs\`
4. Individual startup scripts per server

### Docker Server Architecture (Unchanged)

Docker servers continue to use shared binaries with volume mounts for separation.

## 🔮 Future Architecture: Windows Docker Migration

### Planned Migration to Windows Docker Containers

**Target Architecture:**
- **Shared Binaries**: Windows Docker containers with shared ASA binaries via volume mounts
- **Space Efficiency**: ~30GB saved per additional server (same as Linux Docker)
- **Native Performance**: Windows containers without emulation overhead
- **Resource Isolation**: Better resource management than native processes
- **Easy Scaling**: Container orchestration for high availability

**Migration Benefits:**
- **Space Savings**: Shared binaries across all containers
- **Performance**: Native Windows containers (no emulation)
- **Isolation**: Better resource and process isolation
- **Scalability**: Easy container orchestration
- **Consistency**: Same environment across different machines

**Migration Path:**
1. **Phase 1**: Current native implementation (separate binaries)
2. **Phase 2**: Windows Docker containers with shared binaries
3. **Phase 3**: Container orchestration and auto-scaling

**Windows Docker Structure:**
```
C:\ASA\
├── shared-binaries\          # Shared ASA installation
├── containers\               # Windows Docker containers
│   ├── server1\             # Container volumes
│   │   ├── configs\         # Server-specific configs
│   │   ├── saves\           # Server saves and data
│   │   └── logs\            # Server logs
│   └── server2\
│       └── ... (same structure)
└── clusters\                 # Cluster configurations
```

**Docker Compose Example:**
```yaml
version: '3.8'
services:
  asa-server-1:
    image: asa-windows-server
    volumes:
      - C:\ASA\shared-binaries:C:\ASA\shared-binaries:ro
      - C:\ASA\containers\server1\configs:C:\ASA\configs
      - C:\ASA\containers\server1\saves:C:\ASA\saves
      - C:\ASA\containers\server1\logs:C:\ASA\logs
    ports:
      - "7777:7777"
      - "27015:27015"
      - "32330:32330"
```

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Server Management Mode
SERVER_MODE=native

# Native Windows Server Configuration
NATIVE_BASE_PATH=C:\\ARK
NATIVE_SERVERS_PATH=C:\\ARK\\servers
NATIVE_CONFIG_FILE=native-servers.json
```

### Directory Structure

```
C:\ARK\
├── servers\                    # All native servers
│   ├── server1\               # Individual server directory
│   │   ├── binaries\          # Complete ASA installation
│   │   ├── configs\           # Server-specific configs
│   │   ├── saves\             # Server saves and data
│   │   ├── logs\              # Server logs
│   │   ├── start.bat\         # Startup script
│   │   └── server-config.json # Server configuration
│   └── server2\
│       └── ... (same structure)
├── clusters\                   # Cluster configurations
│   └── my-cluster\
│       ├── cluster.json       # Cluster settings
│       └── servers\           # Server references
└── steamcmd\                  # SteamCMD installation
```

## 🎮 Usage Examples

### Example 1: Single Server Setup

1. Initialize system
2. Install SteamCMD
3. Create server with complete installation
4. Start server from Native Servers page
5. Connect to your server at `your-ip:7777`

### Example 2: Multi-Server Cluster

1. Create cluster with 3 servers
2. Each server gets its own installation
3. Configure different maps for each server:
   - Server 1: The Island (port 7777)
   - Server 2: Ragnarok (port 7778)
   - Server 3: Crystal Isles (port 7779)
4. Start all servers independently
5. Players can transfer between servers

## 🔄 Updates and Maintenance

### Updating Individual Servers

1. Navigate to Native Servers page
2. Select server to update
3. Click **"Update Server"**
4. Only that server's binaries are updated

### Updating All Servers

1. Navigate to Provisioning page
2. Click **"Update All Servers"**
3. All servers are updated sequentially

### Server Maintenance

- **Restart Servers**: Use the Native Servers page
- **Update Configurations**: Edit server settings
- **Monitor Resources**: Check system status
- **Backup Servers**: Copy entire server directories

## 🛠️ Troubleshooting

### Common Issues

#### Server Installation Fails

**Symptoms**: Server installation button remains active
**Solutions**:
1. Check internet connection
2. Verify administrator permissions
3. Check Windows Firewall settings
4. Ensure sufficient disk space (50GB+ per server)

#### Server Won't Start

**Symptoms**: Server status shows "stopped" after start attempt
**Solutions**:
1. Check port conflicts
2. Verify server installation is complete
3. Check Windows Firewall
4. Review server logs in `{server-name}\logs\`

#### Performance Issues

**Symptoms**: High CPU/memory usage
**Solutions**:
1. Reduce number of concurrent servers
2. Adjust server settings (max players, etc.)
3. Check for mod conflicts
4. Monitor system resources

## 🔮 Future Considerations

### Docker Migration Path

The separate binary architecture makes it easy to migrate to Docker later:

1. **Windows Docker**: Each server becomes a Windows container
2. **Shared Binaries**: Use volume mounts to share binaries between containers
3. **Individual Data**: Each container maintains its own configs/saves/logs
4. **Minimal Changes**: Only the runtime environment changes, not the data structure

### Benefits of Future Docker Migration

- **Resource Isolation**: Better resource management
- **Easy Scaling**: Add/remove servers without affecting others
- **Consistent Environment**: Same setup across different machines
- **Automated Management**: Container orchestration for high availability 
