# Fix ASA Agent Service
# This script removes the broken ASA Agent service and reinstalls it properly

param(
    [string]$ServiceName = "ASA-Agent",
    [int]$Port = 5000
)

Write-Host "Fixing ASA Agent Service" -ForegroundColor Green
Write-Host "=======================" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if service exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Found existing service: $ServiceName" -ForegroundColor Yellow
    Write-Host "Status: $($existingService.Status)" -ForegroundColor Cyan
    
    # Stop the service if it's running
    if ($existingService.Status -eq "Running") {
        Write-Host "Stopping service..." -ForegroundColor Yellow
        Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    
    # Remove the service
    Write-Host "Removing existing service..." -ForegroundColor Yellow
    try {
        Remove-Service $ServiceName -Force
        Write-Host "Service removed successfully" -ForegroundColor Green
    } catch {
        Write-Host "Failed to remove service: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "You may need to manually remove it from Services.msc" -ForegroundColor Yellow
    }
} else {
    Write-Host "No existing service found" -ForegroundColor Green
}

# Run the fixed installer
Write-Host "`nInstalling fixed service..." -ForegroundColor Cyan
$installerScript = Join-Path $PSScriptRoot "windows-agent\install-service-fixed.ps1"

if (Test-Path $installerScript) {
    try {
        & $installerScript -ServiceName $ServiceName -Port $Port
        Write-Host "`nService fixed successfully!" -ForegroundColor Green
    } catch {
        Write-Error "Failed to install fixed service: $($_.Exception.Message)"
        exit 1
    }
} else {
    Write-Error "Fixed installer not found: $installerScript"
    exit 1
}

Write-Host "`nTesting the service..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

$service = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Service Status: $($service.Status)" -ForegroundColor Cyan
    
    if ($service.Status -eq "Running") {
        Write-Host "✅ Service is running successfully!" -ForegroundColor Green
        
        # Test the HTTP endpoint
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ HTTP endpoint is responding!" -ForegroundColor Green
                $healthData = $response.Content | ConvertFrom-Json
                Write-Host "Health Status: $($healthData.status)" -ForegroundColor Cyan
            }
        } catch {
            Write-Host "⚠️  HTTP endpoint not responding yet (may take a moment to start)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Service is not running. Status: $($service.Status)" -ForegroundColor Yellow
        Write-Host "Try starting it manually: Start-Service '$ServiceName'" -ForegroundColor Cyan
    }
} else {
    Write-Host "❌ Service not found after installation" -ForegroundColor Red
}

Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "  Get-Service $ServiceName                    # Check service status" -ForegroundColor Gray
Write-Host "  Start-Service $ServiceName                  # Start the service" -ForegroundColor Gray
Write-Host "  Stop-Service $ServiceName                   # Stop the service" -ForegroundColor Gray
Write-Host "  Restart-Service $ServiceName                # Restart the service" -ForegroundColor Gray
Write-Host "  curl http://localhost:$Port/health          # Test HTTP endpoint" -ForegroundColor Gray 
