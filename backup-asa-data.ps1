# ASA Management Suite Backup Script
# This script backs up all persistent data for the ASA Management Suite

param(
    [string]$BackupPath = "C:\ASA-Backups",
    [switch]$IncludeServers = $false,
    [switch]$IncludeLogs = $false,
    [switch]$Compress = $false
)

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges for complete backup." -ForegroundColor Yellow
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
        Write-Host "Please run this script as Administrator for complete backup." -ForegroundColor Yellow
    }
}

Write-Host "=== ASA Management Suite Backup ===" -ForegroundColor Green
Write-Host "Backup Path: $BackupPath" -ForegroundColor Cyan
Write-Host "Include Servers: $IncludeServers" -ForegroundColor Cyan
Write-Host "Include Logs: $IncludeLogs" -ForegroundColor Cyan
Write-Host "Compress: $Compress" -ForegroundColor Cyan
Write-Host ""

# Create backup directory structure
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = Join-Path $BackupPath $timestamp

$backupDirs = @(
    "data",
    "config", 
    "logs"
)

if ($IncludeServers) {
    $backupDirs += "servers"
}

foreach ($dir in $backupDirs) {
    $fullPath = Join-Path $backupDir $dir
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
}

Write-Host "Created backup directory: $backupDir" -ForegroundColor Green

# 1. Backup User Authentication Data (CRITICAL)
Write-Host ""
Write-Host "1. Backing up user authentication data..." -ForegroundColor Yellow
$dataSource = "C:\ASA-API\data"
$dataDest = Join-Path $backupDir "data"

if (Test-Path $dataSource) {
    Copy-Item -Path "$dataSource\*" -Destination $dataDest -Recurse -Force
    Write-Host "✓ User data backed up successfully" -ForegroundColor Green
    
    # Show what was backed up
    $userFiles = Get-ChildItem $dataDest
    foreach ($file in $userFiles) {
        Write-Host "  - $($file.Name)" -ForegroundColor Gray
    }
} else {
    Write-Host "✗ User data directory not found: $dataSource" -ForegroundColor Red
}

# 2. Backup Configuration Files
Write-Host ""
Write-Host "2. Backing up configuration files..." -ForegroundColor Yellow
$configDest = Join-Path $backupDir "config"

# Backup .env file
$envFile = "C:\ASA-API\.env"
if (Test-Path $envFile) {
    Copy-Item -Path $envFile -Destination $configDest -Force
    Write-Host "✓ .env file backed up" -ForegroundColor Green
} else {
    Write-Host "✗ .env file not found" -ForegroundColor Red
}

# Backup native-servers.json if it exists
$nativeConfig = "C:\ASA-API\native-servers.json"
if (Test-Path $nativeConfig) {
    Copy-Item -Path $nativeConfig -Destination $configDest -Force
    Write-Host "✓ native-servers.json backed up" -ForegroundColor Green
} else {
    Write-Host "- native-servers.json not found (normal if not using native mode)" -ForegroundColor Gray
}

# 3. Backup Logs (Optional)
if ($IncludeLogs) {
    Write-Host ""
    Write-Host "3. Backing up application logs..." -ForegroundColor Yellow
    $logsSource = "C:\ASA-API\logs"
    $logsDest = Join-Path $backupDir "logs"
    
    if (Test-Path $logsSource) {
        Copy-Item -Path "$logsSource\*" -Destination $logsDest -Force
        Write-Host "✓ Application logs backed up" -ForegroundColor Green
        
        # Show log file sizes
        $logFiles = Get-ChildItem $logsDest
        foreach ($file in $logFiles) {
            $size = [math]::Round($file.Length / 1MB, 2)
            Write-Host "  - $($file.Name) ($size MB)" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ Logs directory not found: $logsSource" -ForegroundColor Red
    }
}

# 4. Backup ASA Servers (Optional - Large)
if ($IncludeServers) {
    Write-Host ""
    Write-Host "4. Backing up ASA servers..." -ForegroundColor Yellow
    Write-Host "This may take a while depending on server size..." -ForegroundColor Cyan
    
    # Try to get the base path from environment or config
    $basePath = $env:NATIVE_BASE_PATH
    if (!$basePath) {
        $basePath = "G:\ARK"  # Default fallback
    }
    
    $serversDest = Join-Path $backupDir "servers"
    
    if (Test-Path $basePath) {
        Write-Host "Backing up from: $basePath" -ForegroundColor Gray
        
        # Use robocopy for large file copying with progress
        $robocopyArgs = @(
            $basePath,
            $serversDest,
            "/MIR",           # Mirror (exact copy)
            "/R:3",           # Retry 3 times
            "/W:10",          # Wait 10 seconds between retries
            "/MT:8",          # Use 8 threads
            "/TEE",           # Output to console and log
            "/LOG:$backupDir\robocopy.log"  # Log file
        )
        
        $robocopyProcess = Start-Process -FilePath "robocopy" -ArgumentList $robocopyArgs -PassThru -NoNewWindow
        
        # Wait for completion
        $robocopyProcess.WaitForExit()
        
        if ($robocopyProcess.ExitCode -le 7) {  # Robocopy success codes are 0-7
            Write-Host "✓ ASA servers backed up successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠ ASA server backup completed with warnings (Exit code: $($robocopyProcess.ExitCode))" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ ASA base path not found: $basePath" -ForegroundColor Red
    }
}

# 5. Create backup manifest
Write-Host ""
Write-Host "5. Creating backup manifest..." -ForegroundColor Yellow
$manifest = @{
    timestamp = $timestamp
    backupPath = $backupDir
    includes = @{
        userData = $true
        config = $true
        logs = $IncludeLogs
        servers = $IncludeServers
    }
    system = @{
        os = $env:OS
        nodeVersion = (node --version 2>$null)
        backupScriptVersion = "1.0"
    }
}

$manifestPath = Join-Path $backupDir "backup-manifest.json"
$manifest | ConvertTo-Json -Depth 10 | Out-File -FilePath $manifestPath -Encoding UTF8
Write-Host "✓ Backup manifest created" -ForegroundColor Green

# 6. Compress backup (Optional)
if ($Compress) {
    Write-Host ""
    Write-Host "6. Compressing backup..." -ForegroundColor Yellow
    $zipPath = "$backupDir.zip"
    
    try {
        Compress-Archive -Path $backupDir -DestinationPath $zipPath -Force
        Write-Host "✓ Backup compressed to: $zipPath" -ForegroundColor Green
        
        # Remove uncompressed directory
        Remove-Item -Path $backupDir -Recurse -Force
        Write-Host "✓ Removed uncompressed backup directory" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to compress backup: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Cleanup old backups (keep last 10)
Write-Host ""
Write-Host "7. Cleaning up old backups..." -ForegroundColor Yellow
$oldBackups = Get-ChildItem -Path $BackupPath -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10

if ($oldBackups) {
    foreach ($oldBackup in $oldBackups) {
        Write-Host "Removing old backup: $($oldBackup.Name)" -ForegroundColor Gray
        Remove-Item -Path $oldBackup.FullName -Recurse -Force
    }
    Write-Host "✓ Cleaned up $($oldBackups.Count) old backups" -ForegroundColor Green
} else {
    Write-Host "✓ No old backups to clean up" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "=== Backup Summary ===" -ForegroundColor Green
Write-Host "Backup Location: $backupDir" -ForegroundColor White
Write-Host "Backup Size: $([math]::Round((Get-ChildItem -Path $backupDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 2)) MB" -ForegroundColor White
Write-Host "Timestamp: $timestamp" -ForegroundColor White

if ($Compress) {
    Write-Host "Compressed: Yes" -ForegroundColor White
}

Write-Host ""
Write-Host "Backup completed successfully!" -ForegroundColor Green
Write-Host "Remember to test your backup by restoring it to a test environment." -ForegroundColor Yellow 
