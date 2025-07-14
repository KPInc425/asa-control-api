# ASA Management - Native Windows Setup

This setup runs the ASA API backend natively on Windows as a service, providing direct access to ASA servers without Docker container limitations.

## Why Native Windows?

✅ **Direct Process Control** - Can start/stop Windows processes directly  
✅ **Native PowerShell** - Full PowerShell functionality without mounting issues  
✅ **Real-time Status** - Direct process monitoring without network calls  
✅ **Simpler Architecture** - No container-to-host communication needed  
✅ **Better Performance** - No network overhead for local operations  
✅ **Easier Debugging** - Direct access to Windows logs and processes  
✅ **Automatic Restart** - Windows service with auto-restart capabilities  
✅ **Secure** - Runs as Windows service with appropriate permissions  

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   ASA API       │    │   Monitoring    │
│   (Docker)      │◄──►│   (Windows      │    │   (Docker)      │
│                 │    │    Service)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   ASA Servers   │
                       │   (Windows)     │
                       └─────────────────┘
```

## Prerequisites

- Windows 10/11
- Node.js 18+ installed
- PowerShell 5.1+
- Administrator privileges (for installation)
- Docker (optional, for monitoring)

## Quick Installation

1. **Download Node.js** from https://nodejs.org/ (if not installed)

2. **Run the installer** as Administrator:
   ```powershell
   # Open PowerShell as Administrator
   cd "E:\Programming\ARK\asa-management\asa-docker-control-api"
   .\install-native-api.ps1
   ```

3. **Update your frontend** to point to `http://localhost:4000`

## What Gets Installed

### ASA API Service
- **Location**: `C:\ASA-API`
- **Service Name**: `ASA-API`
- **Port**: 4000
- **Auto-start**: Yes (on boot)
- **Auto-restart**: Yes (on failure)

### Monitoring (Optional)
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **cAdvisor**: http://localhost:8080

## Service Management

### Check Status
```powershell
Get-Service "ASA-API"
```

### Start/Stop/Restart
```powershell
Start-Service "ASA-API"
Stop-Service "ASA-API"
Restart-Service "ASA-API"
```

### View Logs
```powershell
Get-Content "C:\ASA-API\logs\asa-api-service.log" -Tail 50
```

### Uninstall
```powershell
Remove-Service "ASA-API"
Remove-Item "C:\ASA-API" -Recurse -Force
```

## Configuration

The API creates a `.env` file at `C:\ASA-API\.env`:

```env
NODE_ENV=production
PORT=4000
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK
JWT_SECRET=fallback-secret-change-in-production
CORS_ORIGIN=http://localhost:4010
LOG_LEVEL=info
LOG_FILE_PATH=C:\ASA-API\logs\app.log
```

## API Endpoints

All existing API endpoints work the same:

- `GET /health` - Health check
- `GET /api/containers` - List containers/servers
- `POST /api/containers/{name}/start` - Start server
- `POST /api/containers/{name}/stop` - Stop server
- `GET /api/native-servers` - List native servers
- `POST /api/native-servers/{name}/start` - Start native server
- And more...

## Monitoring Setup

If you want monitoring, the installer will start Prometheus, Grafana, and cAdvisor in Docker containers.

### Start Monitoring
```powershell
docker-compose -f docker-compose.monitoring.yml up -d
```

### Stop Monitoring
```powershell
docker-compose -f docker-compose.monitoring.yml down
```

### Access Monitoring
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **cAdvisor**: http://localhost:8080

## Troubleshooting

### Service Won't Start
1. Check Node.js is installed: `node --version`
2. Check logs: `Get-Content "C:\ASA-API\logs\asa-api-service.log"`
3. Verify service status: `Get-Service "ASA-API"`

### API Not Responding
1. Check if service is running: `Get-Service "ASA-API"`
2. Test endpoint: `curl http://localhost:4000/health`
3. Check firewall settings

### Servers Won't Start
1. Verify ASA paths in configuration
2. Check ASA server executables exist
3. Ensure start.bat files are present

### Monitoring Issues
1. Check Docker is running
2. Verify ports are available (9090, 3001, 8080)
3. Check Docker logs: `docker-compose -f docker-compose.monitoring.yml logs`

## Migration from Docker

If you're currently running the API in Docker:

1. **Stop the Docker API**:
   ```powershell
   docker-compose down
   ```

2. **Install the native service**:
   ```powershell
   .\install-native-api.ps1
   ```

3. **Update your frontend** to point to `http://localhost:4000`

4. **Keep monitoring** (optional):
   ```powershell
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

## Security Considerations

- The API runs as a Windows service with appropriate permissions
- JWT authentication is still required for API access
- CORS is configured for local development
- Consider changing the JWT secret in production
- The service runs on localhost by default

## Performance Benefits

- **Faster server operations** - No Docker overhead
- **Real-time status** - Direct process monitoring
- **Lower resource usage** - No container virtualization
- **Better reliability** - No container networking issues
- **Easier debugging** - Direct access to Windows processes

## Support

The native setup provides the same functionality as the Docker version but with better performance and reliability for Windows ASA server management. 
