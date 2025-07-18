# ASA Management API Scripts

This directory contains utility scripts for the ASA Management API, including service installation, migration, and maintenance tools.

## Service Installation

### Flexible Service Installer (Recommended)

The flexible service installer is the recommended way to install the ASA API as a Windows service:

```powershell
# Run from the project directory
.\scripts\install-service-flexible.ps1

# Options:
.\scripts\install-service-flexible.ps1 -CopyFiles -InstallPath "C:\ASA-API"
.\scripts\install-service-flexible.ps1 -RunFromCurrent
```

**Features:**
- Choose between running from current directory or copying files
- Automatic NSSM installation and configuration
- Comprehensive error checking and validation
- Service testing and verification

## Data Migration

### JSON to SQLite Migration

Migrate existing JSON configuration files to SQLite database:

```bash
# Development environment (from project directory)
node scripts/migrate-json-to-sqlite.js

# Production environment (from service directory)
node scripts/migrate-json-to-sqlite.js --service-path

# Custom database path
node scripts/migrate-json-to-sqlite.js --db-path "D:\custom\path\asa-data.sqlite"
```

**What gets migrated:**
- Clusters and servers from `C:\ARK\clusters\*`
- Server mods from `C:\ARK\server-mods.json` and `C:\ARK\server-mods\*.json`
- Shared mods from `C:\ARK\shared-mods.json`
- Mods from server configuration files

### Production Migration Scripts

For production environments, use these helper scripts:

```powershell
# PowerShell script (recommended)
.\scripts\migrate-production.ps1

# Batch file alternative
scripts\migrate-production.bat
```

### Dependency Installation

If you encounter module issues during migration:

```powershell
# Install required dependencies
.\scripts\install-dependencies.ps1
```

## Backup and Restore

### Data Backup

```powershell
# Backup ASA data
.\scripts\backup-asa-data.ps1

# Options:
.\scripts\backup-asa-data.ps1 -Destination "D:\backups"
.\scripts\backup-asa-data.ps1 -Compress
```

### Data Restore

```powershell
# Restore ASA data
.\scripts\restore-asa-data.ps1 -Source "D:\backups\backup-2024-01-01"

# Options:
.\scripts\restore-asa-data.ps1 -Source "D:\backups\backup-2024-01-01" -Verify
```

## Configuration and Setup

### Environment Configuration

```powershell
# Configure G: drive mapping for native servers
.\scripts\set-g-drive-native.ps1

# Configure G: drive mapping for Docker
.\scripts\set-g-drive.ps1
```

### Firewall Configuration

```powershell
# Configure Windows Firewall for ASA servers
.\scripts\configure-firewall.ps1

# Options:
.\scripts\configure-firewall.ps1 -PortRange "7777-7780"
.\scripts\configure-firewall.ps1 -RemoveRules
```

## Development and Testing

### Interactive Console

```bash
# Start interactive console for testing
node scripts/interactive-console.js
```

### Setup and Initialization

```bash
# Run initial setup
node scripts/setup.js

# Options:
node scripts/setup.js --config cluster-config-example.json
```

## Utility Scripts

### Port Management

```bash
# Migrate port configuration to gameport format
node scripts/migrate-port-to-gameport.js
```

### Console Logging

```bash
# Console logger utility
node scripts/console-logger.js
```

## Deployment Scripts

### Production Deployment

```bash
# Deploy to production server
./scripts/deploy-production.sh

# Remote deployment
./scripts/deploy-remote.sh
```

### Docker Integration

```bash
# Docker entrypoint script
./scripts/docker-entrypoint.sh
```

## Documentation

- **Migration Guide**: See `MIGRATION_README.md` for detailed migration instructions
- **Service Installation**: The flexible installer includes comprehensive help and validation
- **API Documentation**: See the main project README for API usage

## Troubleshooting

### Common Issues

1. **Service Installation Fails**
   - Ensure running as Administrator
   - Check if NSSM is available or let the script download it
   - Verify Node.js is installed and in PATH

2. **Migration Fails**
   - Run `.\scripts\install-dependencies.ps1` first
   - Check file permissions on source JSON files
   - Verify database directory is writable

3. **Backup/Restore Issues**
   - Ensure sufficient disk space
   - Check file permissions
   - Verify source/destination paths

### Getting Help

- Check script output for specific error messages
- Review the migration guide for detailed troubleshooting
- Ensure all prerequisites are met (Node.js, PowerShell, Administrator rights)

## Script Categories

### Core Scripts
- `install-service-flexible.ps1` - Service installation
- `migrate-json-to-sqlite.js` - Data migration
- `backup-asa-data.ps1` / `restore-asa-data.ps1` - Backup/restore

### Helper Scripts
- `install-dependencies.ps1` - Dependency management
- `migrate-production.ps1` / `migrate-production.bat` - Production migration
- `configure-firewall.ps1` - Firewall configuration

### Development Scripts
- `interactive-console.js` - Testing console
- `setup.js` - Initial setup
- `migrate-port-to-gameport.js` - Port migration

### Deployment Scripts
- `deploy-production.sh` - Production deployment
- `deploy-remote.sh` - Remote deployment
- `docker-entrypoint.sh` - Docker integration 
