# ASA Windows Agent

This Windows Agent runs as a service on the Windows host and provides direct control over ASA servers. It allows the Docker container to start, stop, and monitor ASA servers without manual intervention.

## Features

- **Automatic Server Management**: Start and stop ASA servers directly from the dashboard
- **Real-time Status Monitoring**: Get accurate running status and process information
- **Cluster Support**: Automatically finds and manages cluster servers
- **Secure Communication**: HTTP API with IP-based access control
- **Windows Service**: Runs automatically on boot

## Installation

### Prerequisites

- Windows 10/11 with PowerShell 5.1 or later
- Administrator privileges
- ASA servers installed on the Windows host

### Quick Installation

1. **Download the agent files** to your Windows host
2. **Open PowerShell as Administrator**
3. **Navigate to the agent directory**
4. **Run the installer**:

```powershell
.\install-service.ps1
```

### Manual Installation

If you prefer to install manually:

1. **Create the service directory**:
```powershell
New-Item -ItemType Directory -Path "C:\ASA-Agent" -Force
```

2. **Copy the agent script**:
```powershell
Copy-Item "asa-agent.ps1" "C:\ASA-Agent\asa-agent.ps1"
```

3. **Create the service**:
```powershell
New-Service -Name "ASA-Agent" -DisplayName "ASA Management Agent" -Description "Manages ARK: Survival Ascended servers" -StartupType Automatic -BinaryPathName "powershell.exe -ExecutionPolicy Bypass -File C:\ASA-Agent\asa-agent.ps1"
```

4. **Start the service**:
```powershell
Start-Service "ASA-Agent"
```

## Configuration

The agent creates a default configuration file at `C:\ASA-Agent\config.json`:

```json
{
  "basePath": "G:\\ARK",
  "clustersPath": "G:\\ARK\\clusters",
  "serverExe": "G:\\ARK\\shared-binaries\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
  "allowedIPs": ["127.0.0.1", "172.16.0.0/12", "192.168.0.0/16"],
  "port": 5000,
  "logPath": "C:\\ASA-Agent\\logs"
}
```

### Configuration Options

- **basePath**: Base directory for ASA installation
- **clustersPath**: Directory containing cluster configurations
- **serverExe**: Path to the ASA server executable
- **allowedIPs**: IP addresses/networks allowed to access the agent
- **port**: HTTP port for the agent API
- **logPath**: Directory for log files

## API Endpoints

The agent provides a REST API on port 5000 (configurable):

### Health Check
```
GET /health
```

### List Running Servers
```
GET /api/servers
```

### Start Server
```
POST /api/servers/{serverName}/start
```

### Stop Server
```
POST /api/servers/{serverName}/stop
```

### Get Server Status
```
GET /api/servers/{serverName}/status
```

## Service Management

### Check Service Status
```powershell
Get-Service "ASA-Agent"
```

### Start Service
```powershell
Start-Service "ASA-Agent"
```

### Stop Service
```powershell
Stop-Service "ASA-Agent"
```

### Restart Service
```powershell
Restart-Service "ASA-Agent"
```

### Uninstall Service
```powershell
Remove-Service "ASA-Agent"
```

## Logs

Logs are written to `C:\ASA-Agent\logs\asa-agent.log` and include:
- Service startup/shutdown
- Server start/stop operations
- API requests
- Error messages

## Security

- The agent only accepts connections from configured IP addresses
- Runs as a Windows service with appropriate permissions
- No authentication required (intended for local network use)

## Troubleshooting

### Service Won't Start
1. Check the logs at `C:\ASA-Agent\logs\asa-agent.log`
2. Verify PowerShell execution policy: `Get-ExecutionPolicy`
3. Ensure the agent script exists at `C:\ASA-Agent\asa-agent.ps1`

### Can't Connect from Docker
1. Verify the agent is running: `Get-Service "ASA-Agent"`
2. Check the agent URL in Docker Compose: `WINDOWS_AGENT_URL=http://host.docker.internal:5000`
3. Test connectivity: `curl http://localhost:5000/health`

### Servers Won't Start
1. Check the configuration file paths
2. Verify ASA server executable exists
3. Ensure start.bat files are present in cluster directories

## Integration with Docker Container

The Docker container automatically detects and uses the Windows Agent when:
- `WINDOWS_AGENT_ENABLED=true` is set in the environment
- The agent is running and healthy
- The agent URL is accessible

If the agent is not available, the system falls back to providing manual instructions. 
