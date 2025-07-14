# ASA API Service File Update Script
# This script copies updated files to the service directory without reinstalling the service

param(
    [string]$ServicePath = "C:\ASA-API",
    [switch]$Backup = $true,
    [switch]$InstallDependencies = $true,
    [switch]$RestartService = $true
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "=== ASA API Service File Update Script ===" -ForegroundColor Cyan
Write-Host "This script will copy updated files to the service directory" -ForegroundColor White
Write-Host "Service Path: $ServicePath" -ForegroundColor Gray
Write-Host ""

# Verify source directory
$sourceDir = $PSScriptRoot
if (!(Test-Path $sourceDir)) {
    Write-Host "Error: Source directory not found: $sourceDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Source directory: $sourceDir" -ForegroundColor Gray
Write-Host ""

# Check if service directory exists
if (!(Test-Path $ServicePath)) {
    Write-Host "Error: Service directory not found: $ServicePath" -ForegroundColor Red
    Write-Host "The service may not be installed or is using a different path." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Create backup if requested
if ($Backup) {
    Write-Host "Creating backup of current service files..." -ForegroundColor Cyan
    $backupPath = "$ServicePath\backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    try {
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
        
        # Copy current files to backup
        $backupItems = Get-ChildItem -Path $ServicePath -Exclude "node_modules", "logs", "backup-*"
        foreach ($item in $backupItems) {
            if ($item.PSIsContainer) {
                Copy-Item -Path $item.FullName -Destination $backupPath -Recurse -Force
            } else {
                Copy-Item -Path $item.FullName -Destination $backupPath -Force
            }
        }
        
        Write-Host "✓ Backup created at: $backupPath" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Warning: Failed to create backup: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Stop the service before updating files
if ($RestartService) {
    Write-Host "Stopping ASA API service..." -ForegroundColor Cyan
    try {
        $service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Running") {
            Stop-Service -Name "ASA-API" -Force
            Start-Sleep -Seconds 3
            Write-Host "✓ Service stopped successfully" -ForegroundColor Green
        } else {
            Write-Host "Service not running or not found" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠ Warning: Could not stop service: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Copy updated files
Write-Host "Copying updated files..." -ForegroundColor Cyan

$copyCount = 0
$errorCount = 0

# Get all files and directories to copy
$itemsToCopy = Get-ChildItem -Path $sourceDir -Exclude "node_modules", "logs", ".git", "windows-service", "*.ps1", "backup-*", "update-service-files.ps1"

foreach ($item in $itemsToCopy) {
    if ($item.PSIsContainer) {
        Write-Host "Copying directory: $($item.Name)" -ForegroundColor Gray
        try {
            Copy-Item -Path $item.FullName -Destination $ServicePath -Recurse -Force
            $copyCount++
        } catch {
            Write-Host "✗ Failed to copy $($item.Name): $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
        }
    } else {
        Write-Host "Copying file: $($item.Name)" -ForegroundColor Gray
        try {
            Copy-Item -Path $item.FullName -Destination $ServicePath -Force
            $copyCount++
        } catch {
            Write-Host "✗ Failed to copy $($item.Name): $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
        }
    }
}

Write-Host ""
Write-Host "✓ Successfully copied $copyCount items" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "⚠ Failed to copy $errorCount items" -ForegroundColor Yellow
}

# Verify key files were copied
Write-Host ""
Write-Host "Verifying key files..." -ForegroundColor Cyan
$requiredFiles = @("server.js", "package.json")
$missingFiles = @()

foreach ($file in $requiredFiles) {
    if (Test-Path "$ServicePath\$file") {
        Write-Host "✓ $file" -ForegroundColor Green
    } else {
        Write-Host "✗ $file missing!" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Error: Required files are missing!" -ForegroundColor Red
    Write-Host "Missing files: $($missingFiles -join ', ')" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies if requested
if ($InstallDependencies) {
    Write-Host ""
    Write-Host "Installing Node.js dependencies..." -ForegroundColor Cyan
    Push-Location $ServicePath
    try {
        npm install --production
        Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install dependencies: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please run 'npm install' manually in $ServicePath" -ForegroundColor Yellow
    }
    Pop-Location
}

# Start the service if requested
if ($RestartService) {
    Write-Host ""
    Write-Host "Starting ASA API service..." -ForegroundColor Cyan
    try {
        Start-Service -Name "ASA-API"
        Start-Sleep -Seconds 2
        
        $service = Get-Service -Name "ASA-API"
        if ($service.Status -eq "Running") {
            Write-Host "✓ Service started successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠ Service may not have started properly. Status: $($service.Status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "✗ Failed to start service: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please start the service manually: Start-Service ASA-API" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Update Complete ===" -ForegroundColor Cyan
Write-Host "Service files have been updated successfully!" -ForegroundColor Green

if ($Backup) {
    Write-Host "A backup of the previous files was created." -ForegroundColor Gray
}

Write-Host ""
Write-Host "You can now test the API at: http://localhost:4000/health" -ForegroundColor White

Read-Host "Press Enter to exit" 
