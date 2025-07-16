# ASA Management API Logging System

## Overview

The ASA Management API includes a comprehensive logging system with automatic service detection, log rotation, and backup management. The system automatically detects whether it's running as a Windows service or in development mode and adjusts log file locations accordingly.

## Log Files

### Winston Application Logs
- **`combined.log`** - All application logs (info level and above) - Main application log
- **`error.log`** - Error-level logs only - For quick error identification
- **`asa-api-service.log`** - Service-level events only (startup, shutdown, health checks, critical events)
- **`node-out.log`** - Node.js stdout logs (process output, console.log)
- **`node-err.log`** - Node.js stderr logs (process errors, console.error, uncaught exceptions)

### NSSM Service Logs (Windows Service Only)
- **`nssm-out.log`** - NSSM stdout logs (when running as Windows service)
- **`nssm-err.log`** - NSSM stderr logs (when running as Windows service)

## Non-Redundant Log Setup

The logging system is designed to minimize redundancy while providing comprehensive coverage:

### **`combined.log`** - Main Application Log
- Contains all application logs at `info` level and above
- Includes API requests, database operations, business logic events
- **Purpose**: Complete application activity record

### **`error.log`** - Error-Only Log
- Contains only `error` level logs
- **Purpose**: Quick error identification and monitoring

### **`asa-api-service.log`** - Service Events Only
- Contains only service-level events (startup, shutdown, health checks)
- Uses custom filtering to exclude regular application logs
- **Purpose**: Service lifecycle monitoring and health tracking

### **`node-out.log`** & **`node-err.log`** - Process Output
- Capture all stdout/stderr from the Node.js process
- Include logs not handled by Winston (uncaught exceptions, native module output)
- **Purpose**: Complete process output capture

### **`nssm-out.log`** & **`nssm-err.log`** - Service Wrapper Logs
- Only available when running as Windows service
- Capture NSSM service wrapper output
- **Purpose**: Service wrapper monitoring

## Service Detection

The API automatically detects its running mode:

### Development Mode
- **Detection**: Running from working directory, not as Windows service
- **Log Location**: `./logs/` (relative to working directory)
- **NSSM Logs**: Not available
- **Example Path**: `E:\Programming\ARK\asa-management\asa-docker-control-api\logs\`

### Service Mode
- **Detection**: Running as Windows service via NSSM
- **Log Location**: Service installation directory
- **NSSM Logs**: Available
- **Example Path**: `C:\ASA-API\logs\` or custom installation path

### Docker Mode
- **Detection**: Running in Docker container
- **Log Location**: `/app/logs/`
- **NSSM Logs**: Not available

## Log Rotation and Backup

### Automatic Rotation
- **Trigger**: API startup/restart
- **Action**: Current log files are moved to backup directory
- **Backup Location**: `logs/backups/YYYY-MM-DD_HH-mm-ss/`
- **Cleanup**: Backups older than 7 days are automatically removed

### Backup Structure
```
logs/
├── combined.log          # Current logs
├── error.log
├── asa-api-service.log
├── node-out.log
├── node-err.log
├── nssm-out.log         # Service mode only
├── nssm-err.log         # Service mode only
└── backups/
    ├── 2024-01-15_14-30-25/
    │   ├── combined.log
    │   ├── error.log
    │   └── ...
    └── 2024-01-15_10-15-42/
        ├── combined.log
        ├── error.log
        └── ...
```

## Log File Headers

Each log file includes a header with metadata:

```
Log file: combined.log
Path: C:\ASA-API\logs\combined.log
Size: 45.23 KB
Modified: 2024-01-15T10:30:00.000Z
Lines: 1000 total, showing last 100
────────────────────────────────────────────────────────────────────────────────
[actual log content...]
```

## Service Event Logging

The `asa-api-service.log` file contains only service-level events:

### Service Events Include:
- **Startup Events**: API initialization, server startup
- **Shutdown Events**: Graceful shutdown, signal handling
- **Health Checks**: Service health monitoring
- **Critical Errors**: Service-level failures
- **Configuration Changes**: Service configuration updates

### Example Service Events:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "ASA Control API starting up",
  "service": "asa-control-api",
  "type": "service-event",
  "event": "startup",
  "version": "1.0.0"
}
```

### Using Service Event Logging:
```javascript
// Log service events
logger.serviceEvent('info', 'Service health check completed', {
  event: 'health-check',
  status: 'healthy',
  uptime: process.uptime()
});
```

## Service Installation Options

### Flexible Installation Script

Use the new flexible installation script to choose your preferred setup:

```powershell
# Interactive mode (recommended)
.\install-service-flexible.ps1

# Run from current directory (development)
.\install-service-flexible.ps1 -RunFromCurrent

# Copy to default location (C:\ASA-API)
.\install-service-flexible.ps1 -CopyFiles

# Copy to custom location
.\install-service-flexible.ps1 -CopyFiles -InstallPath "D:\ASA-API"
```

### Installation Methods

#### 1. Run from Current Directory (Recommended for Development)
- **Pros**: No file copying, easy updates, direct access to source
- **Cons**: Requires keeping working directory accessible
- **Use Case**: Development, testing, frequent updates

#### 2. Copy to Custom Location
- **Pros**: Clean separation, can be on different drive
- **Cons**: Requires manual updates when source changes
- **Use Case**: Production deployment, dedicated service machine

#### 3. Copy to Default Location (C:\ASA-API)
- **Pros**: Standard location, easy to find
- **Cons**: Requires C: drive space, manual updates
- **Use Case**: Traditional Windows service deployment

## Frontend Integration

### System Logs Page

The frontend includes a tab-based system logs viewer:

- **Tab Interface**: Each log file type has its own tab
- **Dynamic Tabs**: Only shows tabs for existing log files
- **Service Info**: Displays current running mode and log locations
- **Auto-refresh**: Optional automatic log updates
- **Download/Copy**: Export log content for analysis

### Log File Types in UI

- 📋 **Combined Logs** - Main application logs
- ❌ **Error Logs** - Error-level messages only
- 🔧 **API Service** - Service-level events only
- 📤 **Node Stdout** - Node.js standard output
- 📥 **Node Stderr** - Node.js error output
- ⚙️ **Service Stdout** - Service wrapper output (service mode only)
- ⚠️ **Service Stderr** - Service wrapper errors (service mode only)

## Configuration

### Environment Variables

```bash
# Logging level
LOG_LEVEL=info

# Log file path (legacy, now auto-detected)
LOG_FILE_PATH=./logs/app.log
```

### Winston Configuration

The logger is configured in `utils/logger.js`:

```javascript
// Main logger for application logs
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.File({ filename: 'node-out.log', level: 'info' }),
    new winston.transports.File({ filename: 'node-err.log', level: 'error' })
  ]
});

// Service-specific logger for service events only
const serviceLogger = winston.createLogger({
  // Configured to only log service events
  transports: [
    new winston.transports.File({ 
      filename: 'asa-api-service.log',
      // Custom format to filter only service events
    })
  ]
});
```

## Troubleshooting

### Common Issues

#### 1. No Logs Appearing
- Check if logs directory exists
- Verify write permissions
- Check service mode detection

#### 2. Service Logs Missing
- Ensure running as Windows service
- Check NSSM configuration
- Verify service installation path

#### 3. Log Rotation Issues
- Check disk space
- Verify backup directory permissions
- Review rotation timing

#### 4. Service Detection Problems
- Check parent process
- Verify working directory
- Review service status

### Debugging Commands

```powershell
# Check service status
Get-Service ASA-API

# View service logs
Get-Content "C:\ASA-API\logs\nssm-*.log"

# Check application logs
Get-Content "C:\ASA-API\logs\combined.log" -Tail 50

# Check service events
Get-Content "C:\ASA-API\logs\asa-api-service.log" -Tail 20

# Check service configuration
nssm.exe dump ASA-API

# View backup logs
Get-ChildItem "C:\ASA-API\logs\backups" -Recurse
```

### API Endpoints

- **`GET /api/provisioning/system-logs`** - Get all available log files
- **`GET /api/provisioning/system-info`** - Get system info including service mode

## Best Practices

### Development
- Use "Run from Current Directory" installation
- Keep logs in source control (add to .gitignore)
- Use auto-refresh for real-time debugging
- Monitor `asa-api-service.log` for service events

### Production
- Use dedicated installation directory
- Monitor log file sizes
- Set up log aggregation if needed
- Regular backup verification
- Monitor service events for health tracking

### Maintenance
- Monitor backup cleanup
- Check disk space regularly
- Review log rotation settings
- Update service configuration as needed
- Use service events for monitoring and alerting 
