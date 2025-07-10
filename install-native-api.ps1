# ASA Native API Installer
# Installs the ASA API as a Windows service and sets up monitoring

param(
    [string]$ServiceName = "ASA-API",
    [int]$ApiPort = 4000
)

Write-Host "ASA Native API Installer" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if Node.js is installed
Write-Host "Checking for Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "Node.js is required but not found. Please install Node.js and try again."
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is available for monitoring
Write-Host "Checking for Docker..." -ForegroundColor Cyan
try {
    $dockerVersion = docker --version
    Write-Host "Docker found: $dockerVersion" -ForegroundColor Green
    $dockerAvailable = $true
} catch {
    Write-Host "Docker not found. Monitoring will not be available." -ForegroundColor Yellow
    $dockerAvailable = $false
}

# Install the API service
Write-Host "`nInstalling ASA API as Windows service..." -ForegroundColor Cyan
$installerScript = Join-Path $PSScriptRoot "windows-service\install-api-service.ps1"

if (Test-Path $installerScript) {
    try {
        & $installerScript -ServiceName $ServiceName -Port $ApiPort
        Write-Host "API service installed successfully!" -ForegroundColor Green
    } catch {
        Write-Error "Failed to install API service: $($_.Exception.Message)"
        exit 1
    }
} else {
    Write-Error "API service installer not found: $installerScript"
    exit 1
}

# Start monitoring services if Docker is available
if ($dockerAvailable) {
    Write-Host "`nStarting monitoring services..." -ForegroundColor Cyan
    $monitoringCompose = Join-Path $PSScriptRoot "docker-compose.monitoring.yml"
    
    if (Test-Path $monitoringCompose) {
        try {
            Set-Location $PSScriptRoot
            docker-compose -f docker-compose.monitoring.yml up -d
            Write-Host "Monitoring services started successfully!" -ForegroundColor Green
        } catch {
            Write-Host "Failed to start monitoring services: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "You can start them manually later with: docker-compose -f docker-compose.monitoring.yml up -d" -ForegroundColor Cyan
        }
    } else {
        Write-Host "Monitoring compose file not found: $monitoringCompose" -ForegroundColor Yellow
    }
}

Write-Host "`nInstallation completed successfully!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

Write-Host "`nWhat's running:" -ForegroundColor Yellow
Write-Host "✅ ASA API Service (Windows Service)" -ForegroundColor Green
Write-Host "   - Endpoint: http://localhost:$ApiPort" -ForegroundColor Cyan
Write-Host "   - Service Name: $ServiceName" -ForegroundColor Cyan
Write-Host "   - Auto-starts on boot" -ForegroundColor Cyan

if ($dockerAvailable) {
    Write-Host "✅ Monitoring Services (Docker)" -ForegroundColor Green
    Write-Host "   - Prometheus: http://localhost:9090" -ForegroundColor Cyan
    Write-Host "   - Grafana: http://localhost:3001 (admin/admin)" -ForegroundColor Cyan
    Write-Host "   - cAdvisor: http://localhost:8080" -ForegroundColor Cyan
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Update your frontend to point to: http://localhost:$ApiPort" -ForegroundColor Cyan
Write-Host "2. Test the API: curl http://localhost:$ApiPort/health" -ForegroundColor Cyan
Write-Host "3. Start your frontend dashboard" -ForegroundColor Cyan

Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "  Get-Service $ServiceName                    # Check API service status" -ForegroundColor Gray
Write-Host "  Start-Service $ServiceName                  # Start the API service" -ForegroundColor Gray
Write-Host "  Stop-Service $ServiceName                   # Stop the API service" -ForegroundColor Gray
Write-Host "  Restart-Service $ServiceName                # Restart the API service" -ForegroundColor Gray

if ($dockerAvailable) {
    Write-Host "  docker-compose -f docker-compose.monitoring.yml up -d    # Start monitoring" -ForegroundColor Gray
    Write-Host "  docker-compose -f docker-compose.monitoring.yml down     # Stop monitoring" -ForegroundColor Gray
}

Write-Host "`nThe API is now running natively on Windows with full access to ASA servers!" -ForegroundColor Green 
