# ASA Management Suite Restore Script
# This script restores persistent data from a backup

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath,
    [switch]$IncludeServers = $false,
    [switch]$IncludeLogs = $false,
    [switch]$Force = $false
)

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges for complete restore." -ForegroundColor Yellow
    Write-Host "Requesting elevated permissions..." -ForegroundColor Cyan
    
    # Get the current script path
    $scriptPath = $MyInvocation.MyCommand.Path
    if (!$scriptPath) {
        $scriptPath = $PSCommandPath
    }
    
    # Restart the script with elevated permissions
    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$scriptPath`" -BackupPath `"$BackupPath`"" -Verb RunAs -Wait
        exit 0
    } catch {
        Write-Host "Failed to request elevated permissions: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please run this script as Administrator for complete restore." -ForegroundColor Yellow
    }
}

Write-Host "=== ASA Management Suite Restore ===" -ForegroundColor Green
Write-Host "Backup Path: $BackupPath" -ForegroundColor Cyan
Write-Host "Include Servers: $IncludeServers" -ForegroundColor Cyan
Write-Host "Include Logs: $IncludeLogs" -ForegroundColor Cyan
Write-Host "Force: $Force" -ForegroundColor Cyan
Write-Host ""

# Check if backup exists
if (!(Test-Path $BackupPath)) {
    Write-Host "✗ Backup path not found: $BackupPath" -ForegroundColor Red
    exit 1
}

# Handle compressed backups
$extractPath = $null
if ($BackupPath.EndsWith(".zip")) {
    Write-Host "Detected compressed backup, extracting..." -ForegroundColor Yellow
    $extractPath = $BackupPath.Replace(".zip", "_extracted")
    
    if (Test-Path $extractPath) {
        Remove-Item -Path $extractPath -Recurse -Force
    }
    
    try {
        Expand-Archive -Path $BackupPath -DestinationPath $extractPath
        $BackupPath = $extractPath
        Write-Host "✓ Backup extracted to: $BackupPath" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to extract backup: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Read backup manifest
$manifestPath = Join-Path $BackupPath "backup-manifest.json"
if (Test-Path $manifestPath) {
    try {
        $manifest = Get-Content $manifestPath | ConvertFrom-Json
        Write-Host "Backup created: $($manifest.timestamp)" -ForegroundColor Gray
        Write-Host "Backup includes: $($manifest.includes | ConvertTo-Json -Compress)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠ Could not read backup manifest" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ No backup manifest found" -ForegroundColor Yellow
}

# Confirm restore
if (!$Force) {
    Write-Host ""
    Write-Host "WARNING: This will overwrite existing data!" -ForegroundColor Red
    Write-Host "Current data will be backed up before restore." -ForegroundColor Yellow
    
    $confirm = Read-Host "Do you want to continue? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Restore cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Create safety backup of current data
Write-Host ""
Write-Host "Creating safety backup of current data..." -ForegroundColor Yellow
$safetyBackupPath = "C:\ASA-Backups\safety-backup-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
New-Item -ItemType Directory -Path $safetyBackupPath -Force | Out-Null

# Backup current user data
if (Test-Path "C:\ASA-API\data") {
    Copy-Item -Path "C:\ASA-API\data" -Destination $safetyBackupPath -Recurse -Force
    Write-Host "✓ Current user data backed up" -ForegroundColor Green
}

# Backup current config
if (Test-Path "C:\ASA-API\.env") {
    Copy-Item -Path "C:\ASA-API\.env" -Destination $safetyBackupPath -Force
    Write-Host "✓ Current .env backed up" -ForegroundColor Green
}

Write-Host "Safety backup created at: $safetyBackupPath" -ForegroundColor Green

# Stop the ASA API service before restore
Write-Host ""
Write-Host "Stopping ASA API service..." -ForegroundColor Yellow
try {
    Stop-Service -Name "ASA-API" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "✓ ASA API service stopped" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not stop ASA API service (may not be running)" -ForegroundColor Yellow
}

# 1. Restore User Authentication Data
Write-Host ""
Write-Host "1. Restoring user authentication data..." -ForegroundColor Yellow
$dataSource = Join-Path $BackupPath "data"
$dataDest = "C:\ASA-API\data"

if (Test-Path $dataSource) {
    # Create destination directory
    New-Item -ItemType Directory -Path $dataDest -Force | Out-Null
    
    # Restore user data
    Copy-Item -Path "$dataSource\*" -Destination $dataDest -Recurse -Force
    Write-Host "✓ User authentication data restored" -ForegroundColor Green
    
    # Show what was restored
    $userFiles = Get-ChildItem $dataDest
    foreach ($file in $userFiles) {
        Write-Host "  - $($file.Name)" -ForegroundColor Gray
    }
} else {
    Write-Host "✗ User data not found in backup: $dataSource" -ForegroundColor Red
}

# 2. Restore Configuration Files
Write-Host ""
Write-Host "2. Restoring configuration files..." -ForegroundColor Yellow
$configSource = Join-Path $BackupPath "config"

# Restore .env file
$envSource = Join-Path $configSource ".env"
if (Test-Path $envSource) {
    Copy-Item -Path $envSource -Destination "C:\ASA-API\.env" -Force
    Write-Host "✓ .env file restored" -ForegroundColor Green
} else {
    Write-Host "✗ .env file not found in backup" -ForegroundColor Red
}

# Restore native-servers.json
$nativeConfigSource = Join-Path $configSource "native-servers.json"
if (Test-Path $nativeConfigSource) {
    Copy-Item -Path $nativeConfigSource -Destination "C:\ASA-API\native-servers.json" -Force
    Write-Host "✓ native-servers.json restored" -ForegroundColor Green
} else {
    Write-Host "- native-servers.json not found in backup (normal if not using native mode)" -ForegroundColor Gray
}

# 3. Restore Logs (Optional)
if ($IncludeLogs) {
    Write-Host ""
    Write-Host "3. Restoring application logs..." -ForegroundColor Yellow
    $logsSource = Join-Path $BackupPath "logs"
    $logsDest = "C:\ASA-API\logs"
    
    if (Test-Path $logsSource) {
        # Create logs directory
        New-Item -ItemType Directory -Path $logsDest -Force | Out-Null
        
        Copy-Item -Path "$logsSource\*" -Destination $logsDest -Force
        Write-Host "✓ Application logs restored" -ForegroundColor Green
    } else {
        Write-Host "✗ Logs not found in backup: $logsSource" -ForegroundColor Red
    }
}

# 4. Restore ASA Servers (Optional - Large)
if ($IncludeServers) {
    Write-Host ""
    Write-Host "4. Restoring ASA servers..." -ForegroundColor Yellow
    Write-Host "This may take a while depending on server size..." -ForegroundColor Cyan
    
    $serversSource = Join-Path $BackupPath "servers"
    
    if (Test-Path $serversSource) {
        # Get the base path from environment or use default
        $basePath = $env:NATIVE_BASE_PATH
        if (!$basePath) {
            $basePath = "G:\ARK"  # Default fallback
        }
        
        Write-Host "Restoring to: $basePath" -ForegroundColor Gray
        
        # Use robocopy for large file copying
        $robocopyArgs = @(
            $serversSource,
            $basePath,
            "/MIR",           # Mirror (exact copy)
            "/R:3",           # Retry 3 times
            "/W:10",          # Wait 10 seconds between retries
            "/MT:8",          # Use 8 threads
            "/TEE",           # Output to console and log
            "/LOG:$BackupPath\restore-robocopy.log"  # Log file
        )
        
        $robocopyProcess = Start-Process -FilePath "robocopy" -ArgumentList $robocopyArgs -PassThru -NoNewWindow
        
        # Wait for completion
        $robocopyProcess.WaitForExit()
        
        if ($robocopyProcess.ExitCode -le 7) {  # Robocopy success codes are 0-7
            Write-Host "✓ ASA servers restored successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠ ASA server restore completed with warnings (Exit code: $($robocopyProcess.ExitCode))" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ Servers not found in backup: $serversSource" -ForegroundColor Red
    }
}

# 5. Set proper permissions
Write-Host ""
Write-Host "5. Setting file permissions..." -ForegroundColor Yellow
try {
    # Set permissions on restored data
    $acl = Get-Acl "C:\ASA-API\data"
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($rule)
    Set-Acl "C:\ASA-API\data" $acl
    
    Write-Host "✓ File permissions set" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not set file permissions: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 6. Start the ASA API service
Write-Host ""
Write-Host "6. Starting ASA API service..." -ForegroundColor Yellow
try {
    Start-Service -Name "ASA-API"
    Start-Sleep -Seconds 5
    
    $service = Get-Service -Name "ASA-API"
    if ($service.Status -eq "Running") {
        Write-Host "✓ ASA API service started successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠ ASA API service status: $($service.Status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to start ASA API service: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please start the service manually: Start-Service ASA-API" -ForegroundColor Yellow
}

# 7. Cleanup extracted backup
if ($extractPath -and (Test-Path $extractPath)) {
    Write-Host ""
    Write-Host "7. Cleaning up extracted backup..." -ForegroundColor Yellow
    Remove-Item -Path $extractPath -Recurse -Force
    Write-Host "✓ Cleanup completed" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "=== Restore Summary ===" -ForegroundColor Green
Write-Host "Backup Source: $BackupPath" -ForegroundColor White
Write-Host "Safety Backup: $safetyBackupPath" -ForegroundColor White
Write-Host "Restore completed successfully!" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify the ASA API service is running" -ForegroundColor White
Write-Host "2. Test user authentication" -ForegroundColor White
Write-Host "3. Check server configurations" -ForegroundColor White
Write-Host "4. If issues occur, restore from safety backup" -ForegroundColor White

Write-Host ""
Write-Host "Safety backup location: $safetyBackupPath" -ForegroundColor Cyan 
