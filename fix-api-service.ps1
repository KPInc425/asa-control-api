# Fix ASA API Service
# This script fixes the ASA API service by updating it to use a batch file wrapper

param(
    [string]$ServiceName = "ASA-API",
    [int]$Port = 4000
)

Write-Host "Fixing ASA API Service" -ForegroundColor Green
Write-Host "=====================" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Copy the batch file wrapper
$ApiDir = "C:\ASA-API"
$SourceBatch = Join-Path $PSScriptRoot "windows-service\asa-api-service.bat"
$DestBatch = Join-Path $ApiDir "asa-api-service.bat"

if (Test-Path $SourceBatch) {
    Copy-Item $SourceBatch $DestBatch -Force
    Write-Host "Copied service wrapper to: $DestBatch" -ForegroundColor Green
} else {
    Write-Error "Source batch file not found: $SourceBatch"
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
    
    # Update the service to use the batch file
    Write-Host "Updating service configuration..." -ForegroundColor Yellow
    try {
        $service = Get-WmiObject -Class Win32_Service -Filter "Name='$ServiceName'"
        $service.Change($null, $null, $null, $null, $null, $null, $null, $null, $null, $null, "`"$DestBatch`"")
        Write-Host "Service configuration updated successfully" -ForegroundColor Green
    } catch {
        Write-Host "Failed to update service: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Removing and recreating service..." -ForegroundColor Yellow
        
        # Remove and recreate the service
        Remove-Service $ServiceName -Force
        Start-Sleep -Seconds 2
        
        $serviceArgs = @{
            Name = $ServiceName
            DisplayName = "ASA Management API"
            Description = "ASA Management Dashboard API Backend"
            StartupType = "Automatic"
            BinaryPathName = "`"$DestBatch`""
        }
        
        New-Service @serviceArgs
        Write-Host "Service recreated successfully" -ForegroundColor Green
    }
} else {
    Write-Host "No existing service found" -ForegroundColor Green
}

# Start the service
Write-Host "`nStarting service..." -ForegroundColor Cyan
try {
    Start-Service $ServiceName
    Write-Host "Service started successfully!" -ForegroundColor Green
} catch {
    Write-Host "Failed to start service: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test the service
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
            Write-Host "Check logs: Get-Content 'C:\ASA-API\logs\asa-api-service.log' -Tail 20" -ForegroundColor Cyan
        }
    } else {
        Write-Host "⚠️  Service is not running. Status: $($service.Status)" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Service not found after fix" -ForegroundColor Red
}

Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "  Get-Service $ServiceName                    # Check service status" -ForegroundColor Gray
Write-Host "  Start-Service $ServiceName                  # Start the service" -ForegroundColor Gray
Write-Host "  Stop-Service $ServiceName                   # Stop the service" -ForegroundColor Gray
Write-Host "  Restart-Service $ServiceName                # Restart the service" -ForegroundColor Gray
Write-Host "  curl http://localhost:$Port/health          # Test HTTP endpoint" -ForegroundColor Gray
Write-Host "  Get-Content 'C:\ASA-API\logs\asa-api-service.log' -Tail 20  # View logs" -ForegroundColor Gray 
