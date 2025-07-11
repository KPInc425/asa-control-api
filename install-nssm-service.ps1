﻿# Install ASA API Service using NSSM
# NSSM (Non-Sucking Service Manager) is much more reliable for Windows services

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges to install the Windows service." -ForegroundColor Yellow
    Write-Host "Requesting elevated permissions..." -ForegroundColor Cyan
    
    # Get the current script path
    $scriptPath = $MyInvocation.MyCommand.Path
    if (!$scriptPath) {
        $scriptPath = $PSCommandPath
    }
    
    # Restart the script with elevated permissions
    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs -Wait
        exit 0
    } catch {
        Write-Host "Failed to request elevated permissions: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please run this script as Administrator:" -ForegroundColor Yellow
        Write-Host "1. Right-click on PowerShell" -ForegroundColor White
        Write-Host "2. Select 'Run as Administrator'" -ForegroundColor White
        Write-Host "3. Navigate to this directory and run the script again" -ForegroundColor White
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# If we get here, we're running as Administrator
Write-Host "Installing ASA API Service using NSSM..." -ForegroundColor Yellow
Write-Host "Running with Administrator privileges ✓" -ForegroundColor Green
Write-Host ""

# Stop any existing Node.js processes
Write-Host "Stopping any existing Node.js processes..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Note: Service removal will happen after NSSM is available

# Create directories
Write-Host "Setting up directories..." -ForegroundColor Cyan
if (!(Test-Path "C:\ASA-API")) {
    New-Item -ItemType Directory -Path "C:\ASA-API" -Force | Out-Null
}
if (!(Test-Path "C:\ASA-API\logs")) {
    New-Item -ItemType Directory -Path "C:\ASA-API\logs" -Force | Out-Null
}

# Copy files
Write-Host "Copying files..." -ForegroundColor Cyan
$sourceDir = $PSScriptRoot

if (Test-Path $sourceDir) {
    Write-Host "Copying from: $sourceDir" -ForegroundColor Gray
    Get-ChildItem -Path $sourceDir -Exclude "node_modules", "logs", ".git", "windows-service", "*.ps1" | ForEach-Object {
        if ($_.PSIsContainer) {
            Write-Host "Copying directory: $($_.Name)" -ForegroundColor Gray
            Copy-Item -Path $_.FullName -Destination "C:\ASA-API" -Recurse -Force
        } else {
            Write-Host "Copying file: $($_.Name)" -ForegroundColor Gray
            Copy-Item -Path $_.FullName -Destination "C:\ASA-API" -Force
        }
    }
    
    # Verify key files were copied
    $requiredFiles = @("server.js", "package.json", ".env")
    foreach ($file in $requiredFiles) {
        if (Test-Path "C:\ASA-API\$file") {
            Write-Host "✓ $file copied successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ $file missing!" -ForegroundColor Red
        }
    }
    
    # Install Node.js dependencies
    Write-Host "Installing Node.js dependencies..." -ForegroundColor Cyan
    Push-Location "C:\ASA-API"
    try {
        npm install --production
        Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install dependencies: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please run 'npm install' manually in C:\ASA-API" -ForegroundColor Yellow
    }
    Pop-Location
} else {
    Write-Host "Source directory not found: $sourceDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if NSSM is available in multiple locations
$nssmPath = $null
$possiblePaths = @(
    "C:\nssm\nssm.exe",
    "C:\nssm\nssm-2.24\win64\nssm.exe",
    "C:\nssm\nssm-2.24\win32\nssm.exe",
    "C:\Program Files\nssm\nssm.exe",
    "C:\Program Files (x86)\nssm\nssm.exe"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $nssmPath = $path
        Write-Host "Found NSSM at: $nssmPath" -ForegroundColor Green
        break
    }
}

if (!$nssmPath) {
    Write-Host "NSSM not found in any expected location" -ForegroundColor Yellow
    Write-Host "Downloading NSSM..." -ForegroundColor Cyan
    
    # Create NSSM directory
    if (!(Test-Path "C:\nssm")) {
        New-Item -ItemType Directory -Path "C:\nssm" -Force | Out-Null
    }
    
    # Download NSSM (latest version)
    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $nssmZip = "C:\nssm\nssm.zip"
    
    try {
        Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip
        Expand-Archive -Path $nssmZip -DestinationPath "C:\nssm" -Force
        Remove-Item $nssmZip -Force
        
        # Find the correct executable (32-bit or 64-bit)
        if (Test-Path "C:\nssm\win64\nssm.exe") {
            Copy-Item "C:\nssm\win64\nssm.exe" "C:\nssm\nssm.exe" -Force
            $nssmPath = "C:\nssm\nssm.exe"
        } elseif (Test-Path "C:\nssm\win32\nssm.exe") {
            Copy-Item "C:\nssm\win32\nssm.exe" "C:\nssm\nssm.exe" -Force
            $nssmPath = "C:\nssm\nssm.exe"
        } else {
            # If copy failed, try using the extracted version directly
            if (Test-Path "C:\nssm\nssm-2.24\win64\nssm.exe") {
                $nssmPath = "C:\nssm\nssm-2.24\win64\nssm.exe"
            } elseif (Test-Path "C:\nssm\nssm-2.24\win32\nssm.exe") {
                $nssmPath = "C:\nssm\nssm-2.24\win32\nssm.exe"
            }
        }
        
        if ($nssmPath) {
            Write-Host "NSSM downloaded and installed successfully at: $nssmPath" -ForegroundColor Green
        } else {
            throw "Failed to locate NSSM executable after download"
        }
    } catch {
        Write-Host "Failed to download NSSM: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please download NSSM manually from https://nssm.cc/" -ForegroundColor Yellow
        Write-Host "Extract nssm.exe to C:\nssm\ and run this script again" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Remove existing service if it exists (now that NSSM is available)
$service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Removing existing service..." -ForegroundColor Cyan
    if ($service.Status -eq "Running") {
        Stop-Service -Name "ASA-API" -Force
        Start-Sleep -Seconds 3
    }
    # Use NSSM to remove the service properly
    try {
        & $nssmPath remove ASA-API confirm 2>$null
        Write-Host "Service removal command executed" -ForegroundColor Green
    } catch {
        Write-Host "Failed to remove service with NSSM, trying sc.exe..." -ForegroundColor Yellow
        sc.exe delete ASA-API 2>$null
    }
    
    # Wait for service to be fully removed
    Write-Host "Waiting for service removal to complete..." -ForegroundColor Cyan
    $maxWait = 30
    $waitCount = 0
    do {
        Start-Sleep -Seconds 2
        $waitCount += 2
        $service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
        if ($service) {
            Write-Host "Service still exists, waiting... ($waitCount/$maxWait seconds)" -ForegroundColor Yellow
        }
    } while ($service -and $waitCount -lt $maxWait)
    
    if ($service) {
        Write-Host "Warning: Service is still marked for deletion!" -ForegroundColor Red
        Write-Host "This can happen when Windows hasn't fully processed the deletion." -ForegroundColor Yellow
        Write-Host "Options:" -ForegroundColor Cyan
        Write-Host "1. Run the force-remove-service.ps1 script to clean up" -ForegroundColor White
        Write-Host "2. Restart the computer and try again" -ForegroundColor White
        Write-Host "3. Use a different service name" -ForegroundColor White
        Write-Host ""
        
        $choice = Read-Host "Choose option (1-3) or press Enter to use different service name"
        
        if ($choice -eq "1") {
            Write-Host "Please run: .\force-remove-service.ps1" -ForegroundColor Yellow
            Write-Host "Then run this installation script again." -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        } elseif ($choice -eq "2") {
            Write-Host "Please restart the computer and run this script again." -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        } else {
            # Use a different service name
            $serviceName = "ASA-API-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Write-Host "Using alternative service name: $serviceName" -ForegroundColor Green
        }
    } else {
        Write-Host "Service removed successfully" -ForegroundColor Green
        $serviceName = "ASA-API"
    }
    
    # Additional wait to ensure deletion is complete
    Start-Sleep -Seconds 3
} else {
    $serviceName = "ASA-API"
}

# Install service using NSSM
Write-Host "Installing service using NSSM..." -ForegroundColor Cyan

# Get Node.js path
$nodePath = (Get-Command node.exe).Source
Write-Host "Node.js path: $nodePath" -ForegroundColor Gray

# Install the service with retry logic
$maxRetries = 3
$retryCount = 0
$installSuccess = $false

do {
    $retryCount++
    Write-Host "Installation attempt $retryCount of $maxRetries..." -ForegroundColor Cyan
    
    try {
        $result = & $nssmPath install $serviceName $nodePath "server.js"
        $exitCode = $LASTEXITCODE
    } catch {
        Write-Host "Error executing NSSM: $($_.Exception.Message)" -ForegroundColor Red
        $exitCode = 1
    }
    
    if ($exitCode -eq 0) {
        $installSuccess = $true
        Write-Host "Service installed successfully on attempt $retryCount!" -ForegroundColor Green
    } else {
        Write-Host "Installation failed on attempt $retryCount. Error: $result" -ForegroundColor Yellow
        if ($retryCount -lt $maxRetries) {
            Write-Host "Waiting 5 seconds before retry..." -ForegroundColor Cyan
            Start-Sleep -Seconds 5
        }
    }
} while (-not $installSuccess -and $retryCount -lt $maxRetries)

if ($installSuccess) {
    Write-Host "Service installed successfully!" -ForegroundColor Green
    
    # Configure the service
    Write-Host "Configuring service..." -ForegroundColor Cyan
    
    # Set working directory
    & $nssmPath set $serviceName AppDirectory "C:\ASA-API"
    
    # Set display name
    & $nssmPath set $serviceName DisplayName "ASA Management API"
    
    # Set description
    & $nssmPath set $serviceName Description "ASA Management API Backend Service"
    
    # Set startup type to automatic
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    
    # Set output files
    & $nssmPath set $serviceName AppStdout "C:\ASA-API\logs\nssm-out.log"
    & $nssmPath set $serviceName AppStderr "C:\ASA-API\logs\nssm-err.log"
    
    # Set restart on failure
    & $nssmPath set $serviceName AppRestartDelay 10000
    & $nssmPath set $serviceName AppStopMethodSkip 0
    & $nssmPath set $serviceName AppStopMethodConsole 1500
    & $nssmPath set $serviceName AppStopMethodWindow 1500
    & $nssmPath set $serviceName AppStopMethodThreads 1500
    
    Write-Host "Service configured successfully!" -ForegroundColor Green
    
    # Test service control
    Write-Host ""
    Write-Host "Testing service control..." -ForegroundColor Cyan
    
    # Test start
    Write-Host "Starting service..." -ForegroundColor Yellow
    Start-Service $serviceName
    Start-Sleep -Seconds 5
    
    $service = Get-Service $serviceName
    Write-Host "Service status: $($service.Status)" -ForegroundColor Cyan
    
    if ($service.Status -eq "Running") {
        Write-Host "Service started successfully!" -ForegroundColor Green
        
        # Test API
        Write-Host "Testing API..." -ForegroundColor Yellow
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 10 -ErrorAction Stop
            Write-Host "API is responding: $($response.StatusCode)" -ForegroundColor Green
        } catch {
            Write-Host "API not responding yet: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Test stop
        Write-Host "Stopping service..." -ForegroundColor Yellow
        Stop-Service $serviceName
        Start-Sleep -Seconds 3
        
        $service = Get-Service $serviceName
        Write-Host "Service status after stop: $($service.Status)" -ForegroundColor Cyan
        
        if ($service.Status -eq "Stopped") {
            Write-Host "Service control test: PASSED" -ForegroundColor Green
        } else {
            Write-Host "Service control test: PARTIAL" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Service control test: FAILED" -ForegroundColor Red
        Write-Host "Check the service logs at C:\ASA-API\logs\nssm-*.log" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Service Details:" -ForegroundColor Cyan
    Write-Host "  Name: $serviceName" -ForegroundColor White
    Write-Host "  Display Name: ASA Management API" -ForegroundColor White
    Write-Host "  Path: C:\ASA-API" -ForegroundColor White
    Write-Host "  Node.js: $nodePath" -ForegroundColor White
    Write-Host "  NSSM: $nssmPath" -ForegroundColor White
    Write-Host "  Logs: C:\ASA-API\logs\nssm-*.log" -ForegroundColor White
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  Start-Service $serviceName" -ForegroundColor White
    Write-Host "  Stop-Service $serviceName" -ForegroundColor White
    Write-Host "  Get-Service $serviceName" -ForegroundColor White
    Write-Host "  nssm.exe restart $serviceName" -ForegroundColor White
    Write-Host ""
    Write-Host "NSSM Commands:" -ForegroundColor Cyan
    Write-Host "  nssm.exe start $serviceName" -ForegroundColor White
    Write-Host "  nssm.exe stop $serviceName" -ForegroundColor White
    Write-Host "  nssm.exe restart $serviceName" -ForegroundColor White
    Write-Host "  nssm.exe remove $serviceName confirm" -ForegroundColor White
    Write-Host ""
    Write-Host "The service should now respond properly to start/stop commands." -ForegroundColor Green
    Write-Host "NSSM is much more reliable than custom service wrappers!" -ForegroundColor Green
    
} else {
    Write-Host "Failed to install service after $maxRetries attempts!" -ForegroundColor Red
    Write-Host "This may be due to the service still being marked for deletion." -ForegroundColor Yellow
    Write-Host "Try running this script again in a few minutes, or restart the computer." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to exit"
