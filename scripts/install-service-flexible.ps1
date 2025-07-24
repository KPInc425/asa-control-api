# Flexible ASA API Service Installation Script
# This script allows users to choose where to install the service
# and whether to copy files or run from the current directory

param(
    [string]$InstallPath = "",
    [switch]$CopyFiles = $false,
    [switch]$RunFromCurrent = $false
)

Write-Host "=== Flexible ASA API Service Installation ===" -ForegroundColor Green
Write-Host ""

# Get current directory
$currentDir = Get-Location
Write-Host "Current directory: $currentDir" -ForegroundColor Cyan

# Determine installation method
if ($RunFromCurrent) {
    $installMethod = "current"
    $servicePath = $currentDir
    Write-Host "Installation method: Run from current directory" -ForegroundColor Green
} elseif ($CopyFiles) {
    $installMethod = "copy"
    if ([string]::IsNullOrEmpty($InstallPath)) {
        $InstallPath = "C:\ASA-API"
    }
    $servicePath = $InstallPath
    Write-Host "Installation method: Copy files to $servicePath" -ForegroundColor Green
} else {
    # Interactive mode
    Write-Host "Choose installation method:" -ForegroundColor Yellow
    Write-Host "1. Run from current directory (recommended for development)" -ForegroundColor White
    Write-Host "2. Copy files to custom location" -ForegroundColor White
    Write-Host "3. Copy files to default location (C:\ASA-API)" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-3)"
    
    switch ($choice) {
        "1" {
            $installMethod = "current"
            $servicePath = $currentDir
            Write-Host "Selected: Run from current directory" -ForegroundColor Green
        }
        "2" {
            $installMethod = "copy"
            $InstallPath = Read-Host "Enter installation path (e.g., D:\ASA-API)"
            $servicePath = $InstallPath
            Write-Host "Selected: Copy files to $servicePath" -ForegroundColor Green
        }
        "3" {
            $installMethod = "copy"
            $InstallPath = "C:\ASA-API"
            $servicePath = $InstallPath
            Write-Host "Selected: Copy files to default location" -ForegroundColor Green
        }
        default {
            Write-Host "Invalid choice. Using current directory." -ForegroundColor Yellow
            $installMethod = "current"
            $servicePath = $currentDir
        }
    }
}

Write-Host ""
Write-Host "Service will be installed with:" -ForegroundColor Cyan
Write-Host "  Path: $servicePath" -ForegroundColor White
Write-Host "  Method: $installMethod" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue with installation? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Installation cancelled." -ForegroundColor Yellow
    exit 0
}

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires administrator privileges!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Service configuration
$serviceName = "ASA-API"
$displayName = "ASA Management API"
$description = "ASA Management API Backend Service"

Write-Host "Installing ASA API Service..." -ForegroundColor Yellow

# Remove existing service if it exists
Write-Host "Checking for existing service..." -ForegroundColor Cyan
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Found existing service. Stopping and removing..." -ForegroundColor Yellow
    
    try {
        Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    } catch {
        Write-Host "Warning: Could not stop existing service" -ForegroundColor Yellow
    }
    
    # Try to remove with sc.exe first
    try {
        sc.exe delete $serviceName
        Write-Host "Service removed with sc.exe" -ForegroundColor Green
    } catch {
        Write-Host "sc.exe removal failed, trying NSSM..." -ForegroundColor Yellow
    }
    
    # Wait for service to be fully removed
    $maxWait = 30
    $waitCount = 0
    do {
        Start-Sleep -Seconds 2
        $waitCount += 2
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($service) {
            Write-Host "Service still exists, waiting... ($waitCount/$maxWait seconds)" -ForegroundColor Yellow
        }
    } while ($service -and $waitCount -lt $maxWait)
    
    if ($service) {
        Write-Host "Warning: Service is still marked for deletion!" -ForegroundColor Red
        Write-Host "This can happen when Windows hasn't fully processed the deletion." -ForegroundColor Yellow
        Write-Host "You may need to restart the computer and try again." -ForegroundColor Yellow
        Read-Host "Press Enter to continue anyway"
    }
}

# Copy files if needed
if ($installMethod -eq "copy") {
    Write-Host "Copying files to $servicePath..." -ForegroundColor Cyan
    
    # Create directory if it doesn't exist
    if (!(Test-Path $servicePath)) {
        New-Item -ItemType Directory -Path $servicePath -Force | Out-Null
        Write-Host "Created directory: $servicePath" -ForegroundColor Green
    }
    
    # Copy all files from current directory
    try {
        Copy-Item -Path "$currentDir\*" -Destination $servicePath -Recurse -Force
        Write-Host "Files copied successfully" -ForegroundColor Green
    } catch {
        Write-Host "Error copying files: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    # Create logs directory
    $logsDir = Join-Path $servicePath "logs"
    if (!(Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
        Write-Host "Created logs directory: $logsDir" -ForegroundColor Green
    }
}

# Find NSSM
Write-Host "Looking for NSSM..." -ForegroundColor Cyan
$nssmPath = $null
$nssmPaths = @(
    "C:\nssm\nssm.exe",
    "C:\nssm\nssm-2.24\win64\nssm.exe",
    "C:\nssm\nssm-2.24\win32\nssm.exe",
    "C:\Program Files\nssm\nssm.exe",
    "C:\Program Files (x86)\nssm\nssm.exe"
)

foreach ($path in $nssmPaths) {
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
        
        if (Test-Path "C:\nssm\win64\nssm.exe") {
            Copy-Item "C:\nssm\win64\nssm.exe" "C:\nssm\nssm.exe" -Force
        }
        
        $nssmPath = "C:\nssm\nssm.exe"
        Write-Host "NSSM downloaded and installed successfully" -ForegroundColor Green
        # Wait for NSSM to be available
        $retries = 5
        while (-Not (Test-Path $nssmPath) -and $retries -gt 0) {
            Start-Sleep -Seconds 1
            $retries--
        }
        if (-Not (Test-Path $nssmPath)) {
            Write-Host "NSSM was not found at $nssmPath after download. Please check permissions or download manually." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Failed to download NSSM: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Get Node.js path
$nodePath = (Get-Command node.exe).Source
Write-Host "Node.js path: $nodePath" -ForegroundColor Gray

# Install the service
Write-Host "Installing service using NSSM..." -ForegroundColor Cyan

try {
    $result = & $nssmPath install $serviceName $nodePath "server.js"
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "Service installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Service installation failed. Error: $result" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "Error installing service: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Configure the service
Write-Host "Configuring service..." -ForegroundColor Cyan

# Set working directory
& $nssmPath set $serviceName AppDirectory $servicePath

# Set display name
& $nssmPath set $serviceName DisplayName $displayName

# Set description
& $nssmPath set $serviceName Description $description

# Set startup type to automatic
& $nssmPath set $serviceName Start SERVICE_AUTO_START

# Set output files
$logsDir = Join-Path $servicePath "logs"
& $nssmPath set $serviceName AppStdout (Join-Path $logsDir "nssm-out.log")
& $nssmPath set $serviceName AppStderr (Join-Path $logsDir "nssm-err.log")

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
    Write-Host "Check the service logs at $logsDir\nssm-*.log" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Service Details:" -ForegroundColor Cyan
Write-Host "  Name: $serviceName" -ForegroundColor White
Write-Host "  Display Name: $displayName" -ForegroundColor White
Write-Host "  Path: $servicePath" -ForegroundColor White
Write-Host "  Method: $installMethod" -ForegroundColor White
Write-Host "  Node.js: $nodePath" -ForegroundColor White
Write-Host "  NSSM: $nssmPath" -ForegroundColor White
Write-Host "  Logs: $logsDir\nssm-*.log" -ForegroundColor White
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

if ($installMethod -eq "current") {
    Write-Host "✓ Service is configured to run from the current directory" -ForegroundColor Green
    Write-Host "✓ No files were copied - service runs from: $currentDir" -ForegroundColor Green
    Write-Host "✓ This is ideal for development and testing" -ForegroundColor Green
} else {
    Write-Host "✓ Service files copied to: $servicePath" -ForegroundColor Green
    Write-Host "✓ Service runs from the copied location" -ForegroundColor Green
    Write-Host "✓ Original files remain in: $currentDir" -ForegroundColor Green
}

Write-Host ""
Write-Host "The service should now respond properly to start/stop commands." -ForegroundColor Green
Write-Host "NSSM is much more reliable than custom service wrappers!" -ForegroundColor Green

# Ensure the service is running at the end
$service = Get-Service $serviceName
if ($service.Status -ne "Running") {
    Write-Host "Starting service to complete installation..." -ForegroundColor Yellow
    Start-Service $serviceName
    Start-Sleep -Seconds 3
    $service = Get-Service $serviceName
    Write-Host "Service status after final start: $($service.Status)" -ForegroundColor Cyan
    if ($service.Status -eq "Running") {
        Write-Host "Service is now running." -ForegroundColor Green
    } else {
        Write-Host "Service could not be started automatically. Please start it manually." -ForegroundColor Red
    }
}

Write-Host ""
Read-Host "Press Enter to exit" 
