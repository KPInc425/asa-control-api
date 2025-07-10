# Update ASA API Service with Latest Code
# This script updates the service with the latest code without full reinstallation
# Compatible with PowerShell 5.1

param(
    [string]$ServiceName = "ASA-API",
    [string]$ApiPath = "C:\ASA-API",
    [switch]$ForceReinstall
)

Write-Host "=== Update ASA API Service ===" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
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

# Check if service exists
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "❌ Service not found: $ServiceName" -ForegroundColor Red
    Write-Host "   Run .\reinstall-api-service.ps1 to install the service first" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found service: $($service.DisplayName)" -ForegroundColor Cyan
Write-Host "Current status: $($service.Status)" -ForegroundColor Cyan

# Stop the service if it's running
if ($service.Status -eq "Running") {
    Write-Host "`nStopping service..." -ForegroundColor Yellow
    Stop-Service $ServiceName -Force
    Start-Sleep -Seconds 3
    Write-Host "✅ Service stopped" -ForegroundColor Green
}

# Copy latest files
Write-Host "`nCopying latest files..." -ForegroundColor Cyan
$sourceDir = Split-Path $PSScriptRoot -Parent
$filesToCopy = @(
    "package.json",
    "package-lock.json", 
    "server.js",
    "config",
    "middleware",
    "routes",
    "services",
    "utils",
    "env.example"
)

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $sourceDir $file
    $destPath = Join-Path $ApiPath $file
    
    if (Test-Path $sourcePath) {
        if (Test-Path $destPath) {
            Remove-Item $destPath -Recurse -Force
        }
        Copy-Item $sourcePath $destPath -Recurse -Force
        Write-Host "   ✅ Updated: $file" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Not found: $file" -ForegroundColor Yellow
    }
}

# Install dependencies if package.json changed
Write-Host "`nChecking dependencies..." -ForegroundColor Cyan
$packageJsonPath = Join-Path $ApiPath "package.json"
if (Test-Path $packageJsonPath) {
    Write-Host "Installing/updating npm dependencies..." -ForegroundColor Yellow
    Set-Location $ApiPath
    & npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies updated" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Dependency installation had issues" -ForegroundColor Yellow
    }
}

# Update service script if needed
Write-Host "`nUpdating service script..." -ForegroundColor Cyan
$serviceScriptPath = Join-Path $ApiPath "asa-api-service.ps1"
$sourceScriptPath = Join-Path $PSScriptRoot "windows-service\asa-api-service.ps1"

if (Test-Path $sourceScriptPath) {
    Copy-Item $sourceScriptPath $serviceScriptPath -Force
    Write-Host "✅ Service script updated" -ForegroundColor Green
} else {
    Write-Host "⚠️  Service script not found in source" -ForegroundColor Yellow
}

# Check if we need to update environment file
Write-Host "`nChecking environment configuration..." -ForegroundColor Cyan
$envFile = Join-Path $ApiPath ".env"
$envExampleFile = Join-Path $ApiPath "env.example"

if (Test-Path $envExampleFile) {
    if (-not (Test-Path $envFile)) {
        Write-Host "Creating .env file from example..." -ForegroundColor Yellow
        Copy-Item $envExampleFile $envFile
        Write-Host "✅ Created .env file" -ForegroundColor Green
        Write-Host "   Please review and update C:\ASA-API\.env with your settings" -ForegroundColor Cyan
    } else {
        Write-Host "✅ .env file exists (preserved)" -ForegroundColor Green
        Write-Host "   Check env.example for any new variables you might need" -ForegroundColor Cyan
    }
}

# Start the service
Write-Host "`nStarting service..." -ForegroundColor Cyan
try {
    Start-Service $ServiceName
    Start-Sleep -Seconds 5
    $newStatus = (Get-Service $ServiceName).Status
    
    if ($newStatus -eq "Running") {
        Write-Host "✅ Service started successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Service failed to start" -ForegroundColor Red
        Write-Host "   Check logs: C:\ASA-API\logs\asa-api-service.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error starting service: $($_.Exception.Message)" -ForegroundColor Red
}

# Test API
Write-Host "`nTesting API..." -ForegroundColor Cyan
$maxRetries = 5
$retryCount = 0

while ($retryCount -lt $maxRetries) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method Get -TimeoutSec 10
        Write-Host "✅ API is responding correctly" -ForegroundColor Green
        Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
        Write-Host "   Uptime: $($response.uptime) seconds" -ForegroundColor Cyan
        break
    } catch {
        $retryCount++
        if ($retryCount -ge $maxRetries) {
            Write-Host "❌ API is not responding after $maxRetries attempts" -ForegroundColor Red
            Write-Host "   Check service logs for errors" -ForegroundColor Yellow
            break
        } else {
            Write-Host "   Attempt $retryCount of $maxRetries - API not ready yet..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    }
}

Write-Host ""
Write-Host "🎉 Service update completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Details:" -ForegroundColor Cyan
Write-Host "  Status: $((Get-Service $ServiceName).Status)" -ForegroundColor White
Write-Host "  Directory: $ApiPath" -ForegroundColor White
Write-Host "  API: http://localhost:4000" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  - Test your frontend connection" -ForegroundColor Cyan
Write-Host "  - Check logs if there are issues" -ForegroundColor Cyan
Write-Host "  - Review .env file if needed" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Yellow
Write-Host "  Get-Service $ServiceName                    # Check status" -ForegroundColor Gray
Write-Host "  Get-Content C:\ASA-API\logs\asa-api-service.log -Tail 20  # View logs" -ForegroundColor Gray
Write-Host "  .\reinstall-api-service.ps1                # Full reinstall if needed" -ForegroundColor Gray 
