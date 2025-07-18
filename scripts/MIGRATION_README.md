# ASA Management API Migration Guide

This guide explains how to migrate from JSON-based configuration to SQLite database for the ASA Management API.

## Overview

The migration script moves existing JSON data to a SQLite database, supporting both development and production environments:

- **Development**: Database created in project directory (`./data/asa-data.sqlite`)
- **Production**: Database created in service directory (`C:\ASA-API\data\asa-data.sqlite`)

## What Gets Migrated

The migration script processes the following data:

1. **Clusters and Servers**: From `C:\ARK\clusters\*\cluster.json` and `C:\ARK\clusters\*\*\server-config.json`
2. **Server Mods**: From `C:\ARK\server-mods.json` and `C:\ARK\server-mods\*.json`
3. **Shared Mods**: From `C:\ARK\shared-mods.json`
4. **Mods from Server Configs**: Mods defined in individual server configuration files

## Migration Methods

### Method 1: Development Environment

Run from the project directory:

```bash
# From the asa-docker-control-api directory
node scripts/migrate-json-to-sqlite.js
```

This will:
- Detect development environment automatically
- Create database in `./data/asa-data.sqlite`
- Use relative paths for JSON files

### Method 2: Production Service Environment

#### Option A: PowerShell Script (Recommended)

```powershell
# From C:\ASA-API directory
.\scripts\migrate-production.ps1
```

#### Option B: Batch File

```cmd
# From C:\ASA-API directory
scripts\migrate-production.bat
```

#### Option C: Direct Node.js Command

```bash
# From C:\ASA-API directory
node scripts/migrate-json-to-sqlite.js --service-path
```

### Method 3: Custom Database Path

```bash
# Specify custom database location
node scripts/migrate-json-to-sqlite.js --db-path "D:\custom\path\asa-data.sqlite"
```

## Command Line Options

The migration script supports the following options:

- `--service-path`: Force using service path (`C:\ASA-API\data\asa-data.sqlite`)
- `--db-path <path>`: Specify custom database path
- `--help` or `-h`: Show help message

## Environment Variables

The script respects these environment variables:

- `NATIVE_BASE_PATH`: Base path for ARK files (default: `C:\ARK`)
- `NATIVE_CLUSTERS_PATH`: Path to clusters directory (default: `C:\ARK\clusters`)
- `DB_PATH`: Custom database path (overrides automatic detection)
- `NODE_ENV`: Set to `production` to force service path detection
- `SERVICE_MODE`: Set to `true` to force service path detection

## Production Migration Steps

1. **Stop the ASA-API Service**:
   ```powershell
   Stop-Service ASA-API
   ```

2. **Run Migration**:
   ```powershell
   cd C:\ASA-API
   .\scripts\migrate-production.ps1
   ```

3. **Verify Migration**:
   - Check that `C:\ASA-API\data\asa-data.sqlite` was created
   - Review migration output for any errors

4. **Restart Service**:
   ```powershell
   Start-Service ASA-API
   ```

5. **Verify in Dashboard**:
   - Open the web dashboard
   - Check that servers and mods are visible
   - Test functionality

## Troubleshooting

### Common Issues

1. **"Node.js not found"**
   - Install Node.js from https://nodejs.org/
   - Ensure it's in your PATH

2. **"better-sqlite3 module not found"**
   - Run `npm install better-sqlite3` in the API directory
   - The PowerShell script will attempt to install it automatically

3. **"Migration script not found"**
   - Ensure you're running from the correct directory
   - Check that `scripts/migrate-json-to-sqlite.js` exists

4. **"No data migrated"**
   - Verify JSON files exist in expected locations
   - Check file permissions
   - Review migration output for specific errors

5. **"Database created but data not visible"**
   - Restart the ASA-API service
   - Check service logs for database connection issues
   - Verify database file permissions

### Database Location Detection

The script automatically detects the environment:

- **Development**: Current directory contains project files
- **Production**: Current directory is `C:\ASA-API` or environment variables indicate production

### Manual Database Path Override

If automatic detection fails, you can manually specify the database path:

```bash
node scripts/migrate-json-to-sqlite.js --db-path "C:\ASA-API\data\asa-data.sqlite"
```

## Backup Recommendations

Before running migration:

1. **Backup JSON Files**:
   ```powershell
   # Create backup directory
   mkdir C:\ARK\backup-$(Get-Date -Format 'yyyy-MM-dd-HHmm')
   
   # Copy JSON files
   Copy-Item C:\ARK\*.json C:\ARK\backup-$(Get-Date -Format 'yyyy-MM-dd-HHmm')\
   Copy-Item C:\ARK\clusters C:\ARK\backup-$(Get-Date -Format 'yyyy-MM-dd-HHmm')\ -Recurse
   ```

2. **Backup Database** (after migration):
   ```powershell
   Copy-Item C:\ASA-API\data\asa-data.sqlite C:\ASA-API\data\asa-data-backup.sqlite
   ```

## Rollback

If migration fails or causes issues:

1. **Stop the service**:
   ```powershell
   Stop-Service ASA-API
   ```

2. **Remove database**:
   ```powershell
   Remove-Item C:\ASA-API\data\asa-data.sqlite
   ```

3. **Restore JSON files** (if needed):
   ```powershell
   Copy-Item C:\ARK\backup-*\*.json C:\ARK\
   Copy-Item C:\ARK\backup-*\clusters\* C:\ARK\clusters\ -Recurse
   ```

4. **Restart service**:
   ```powershell
   Start-Service ASA-API
   ```

## Support

If you encounter issues:

1. Check the migration script output for specific error messages
2. Verify all prerequisites are met (Node.js, better-sqlite3)
3. Ensure you're running from the correct directory
4. Check file permissions on source JSON files and destination directory
5. Review service logs for database connection issues

## Migration Log

The migration script provides detailed output including:
- Database path being used
- Number of clusters and servers migrated
- Number of mods migrated
- Any errors or warnings encountered

Save this output for troubleshooting if issues arise. 
