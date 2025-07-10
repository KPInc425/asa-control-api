# Reinstall ASA API Service with Updated Configuration
# This script reinstalls the ASA API service with proper CORS and environment configuration
# Compatible with PowerShell 5.1

param(
    [string]$ServiceName = "ASA-API",
    [int]$Port = 4000
)

Write-Host "=== Reinstall ASA API Service with Updated Configuration ===" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "   Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Stop and remove existing service if it exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Found existing service: $ServiceName" -ForegroundColor Cyan
    Write-Host "Status: $($existingService.Status)" -ForegroundColor Cyan
    
    if ($existingService.Status -eq "Running") {
        Write-Host "Stopping existing service..." -ForegroundColor Yellow
        Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    
    Write-Host "Removing existing service..." -ForegroundColor Yellow
    # Use sc.exe for PowerShell 5.1 compatibility
    $result = sc.exe delete $ServiceName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Existing service removed" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Service removal result: $result" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No existing service found" -ForegroundColor Green
}

# Run the updated installer
Write-Host "`nInstalling updated service..." -ForegroundColor Cyan
$installerScript = Join-Path $PSScriptRoot "windows-service\install-api-service.ps1"

if (Test-Path $installerScript) {
    try {
        & $installerScript -ServiceName $ServiceName -Port $Port
        Write-Host "✅ Service installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install service: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ Installer script not found: $installerScript" -ForegroundColor Red
    exit 1
}

# Verify service is running
Write-Host "`nVerifying service status..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "✅ Service Status: $($service.Status)" -ForegroundColor Green
    Write-Host "✅ Service Name: $($service.DisplayName)" -ForegroundColor Green
} else {
    Write-Host "❌ Service not found after installation" -ForegroundColor Red
    exit 1
}

# Test API functionality
Write-Host "`nTesting API functionality..." -ForegroundColor Cyan
$maxRetries = 10
$retryCount = 0

while ($retryCount -lt $maxRetries) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -Method Get -TimeoutSec 10
        Write-Host "✅ API is responding correctly" -ForegroundColor Green
        Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
        Write-Host "   Uptime: $($response.uptime) seconds" -ForegroundColor Cyan
        break
    } catch {
        $retryCount++
        if ($retryCount -ge $maxRetries) {
            Write-Host "❌ API is not responding after $maxRetries attempts" -ForegroundColor Red
            Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "   Check the service logs: C:\ASA-API\logs\asa-api-service.log" -ForegroundColor Yellow
            break
        } else {
            Write-Host "   Attempt $retryCount of $maxRetries - API not ready yet, retrying in 3 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    }
}

Write-Host ""
Write-Host "🎉 ASA API Service reinstalled successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Details:" -ForegroundColor Cyan
Write-Host "  Name: $($service.DisplayName)" -ForegroundColor White
Write-Host "  Status: $($service.Status)" -ForegroundColor White
Write-Host "  Port: $Port" -ForegroundColor White
Write-Host "  Directory: C:\ASA-API" -ForegroundColor White
Write-Host ""
Write-Host "Environment Configuration:" -ForegroundColor Cyan
Write-Host "  CORS Origins: http://localhost:3000, http://localhost:5173, http://localhost:4000, http://localhost:4010" -ForegroundColor White
Write-Host "  Server Mode: native" -ForegroundColor White
Write-Host "  Base Path: G:\ARK" -ForegroundColor White
Write-Host "  JWT Secret: fallback-secret-change-in-production" -ForegroundColor White
Write-Host ""
Write-Host "API Access:" -ForegroundColor Cyan
Write-Host "  Health Check: http://localhost:$Port/health" -ForegroundColor White
Write-Host "  API Base: http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "Logs:" -ForegroundColor Cyan
Write-Host "  Service Log: C:\ASA-API\logs\asa-api-service.log" -ForegroundColor White
Write-Host "  App Log: C:\ASA-API\logs\app.log" -ForegroundColor White
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Yellow
Write-Host "  Get-Service $ServiceName                    # Check service status" -ForegroundColor Gray
Write-Host "  Start-Service $ServiceName                  # Start the service" -ForegroundColor Gray
Write-Host "  Stop-Service $ServiceName                   # Stop the service" -ForegroundColor Gray
Write-Host "  Restart-Service $ServiceName                # Restart the service" -ForegroundColor Gray
Write-Host "  sc.exe delete $ServiceName                  # Uninstall the service" -ForegroundColor Gray 
