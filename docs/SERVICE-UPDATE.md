# ASA API Service Update Guide

This guide explains how to update the ASA API service files without reinstalling the entire service.

## 🚀 Quick Update

### Option 1: Double-click Update (Easiest)
```bash
# Simply double-click this file:
update-service.bat
```

### Option 2: PowerShell Script
```powershell
# Run PowerShell as Administrator
.\update-service-files.ps1
```

### Option 3: Custom Parameters
```powershell
# Update without backup
.\update-service-files.ps1 -Backup:$false

# Update without installing dependencies
.\update-service-files.ps1 -InstallDependencies:$false

# Update without restarting service
.\update-service-files.ps1 -RestartService:$false

# Custom service path
.\update-service-files.ps1 -ServicePath "D:\ASA-API"
```

## 📋 What the Update Script Does

1. **Creates Backup** (optional)
   - Backs up current service files to `C:\ASA-API\backup-YYYYMMDD-HHMMSS`
   - Can be disabled with `-Backup:$false`

2. **Stops Service** (optional)
   - Stops the ASA-API service before copying files
   - Can be disabled with `-RestartService:$false`

3. **Copies Files**
   - Copies all updated files from development directory to service directory
   - Excludes: `node_modules`, `logs`, `.git`, `*.ps1` files

4. **Installs Dependencies** (optional)
   - Runs `npm install --production` in service directory
   - Can be disabled with `-InstallDependencies:$false`

5. **Starts Service** (optional)
   - Restarts the ASA-API service
   - Can be disabled with `-RestartService:$false`

## 🔧 Manual Update Process

If you prefer to update manually:

```powershell
# 1. Stop the service
Stop-Service ASA-API

# 2. Copy files (from development directory)
$sourceDir = "C:\path\to\your\development\asa-docker-control-api"
$serviceDir = "C:\ASA-API"

# Copy all files except exclusions
Get-ChildItem -Path $sourceDir -Exclude "node_modules", "logs", ".git", "*.ps1" | ForEach-Object {
    if ($_.PSIsContainer) {
        Copy-Item -Path $_.FullName -Destination $serviceDir -Recurse -Force
    } else {
        Copy-Item -Path $_.FullName -Destination $serviceDir -Force
    }
}

# 3. Install dependencies
Push-Location $serviceDir
npm install --production
Pop-Location

# 4. Start the service
Start-Service ASA-API
```

## 🛠️ Troubleshooting

### Service Won't Start
```powershell
# Check service status
Get-Service ASA-API

# Check service logs
Get-EventLog -LogName Application -Source "ASA-API" -Newest 10

# Check NSSM logs
Get-Content "C:\ASA-API\logs\nssm-*.log" -Tail 20
```

### Files Not Copied
```powershell
# Check if service directory exists
Test-Path "C:\ASA-API"

# Check file permissions
Get-Acl "C:\ASA-API"
```

### Dependencies Not Installed
```powershell
# Check Node.js installation
node --version
npm --version

# Install dependencies manually
cd C:\ASA-API
npm install --production
```

## 📁 Service Directory Structure

After update, your service directory should look like:
```
C:\ASA-API\
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env                   # Environment configuration
├── config\                # Configuration files
├── routes\                # API routes
├── services\              # Business logic
├── middleware\            # Express middleware
├── utils\                 # Utility functions
├── logs\                  # Service logs
├── data\                  # User data and sessions
└── backup-YYYYMMDD-HHMMSS\ # Backup of previous files
```

## 🔄 When to Use This Method

Use the update script when you have:
- ✅ Code changes (bug fixes, new features)
- ✅ Configuration updates
- ✅ Dependency updates
- ✅ Environment variable changes

**Do NOT use this method for:**
- ❌ Service path changes
- ❌ Node.js version changes
- ❌ Major architectural changes
- ❌ Service configuration changes

For those cases, use the full reinstallation: `.\install-nssm-service.ps1`

## 🎯 Best Practices

1. **Always backup** before updating (enabled by default)
2. **Test changes** in development before updating production
3. **Check service status** after update
4. **Monitor logs** for any errors
5. **Keep backups** for rollback if needed

## 🚨 Rollback

If something goes wrong, you can rollback:

```powershell
# Stop service
Stop-Service ASA-API

# Restore from backup
$backupPath = "C:\ASA-API\backup-YYYYMMDD-HHMMSS"
Copy-Item -Path "$backupPath\*" -Destination "C:\ASA-API" -Recurse -Force

# Start service
Start-Service ASA-API
``` 
