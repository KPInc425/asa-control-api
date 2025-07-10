# Check ASA API Service Configuration
# This script checks the current service configuration and identifies issues
# Compatible with PowerShell 5.1

param(
    [string]$ServiceName = "ASA-API",
    [int]$Port = 4000
)

Write-Host "=== ASA API Service Configuration Check ===" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
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

# 1. Check if service exists
Write-Host "1. Service Status" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "✅ Service found: $($service.DisplayName)" -ForegroundColor Green
    Write-Host "   Status: $($service.Status)" -ForegroundColor Cyan
    Write-Host "   Startup Type: $($service.StartType)" -ForegroundColor Cyan
} else {
    Write-Host "❌ Service not found: $ServiceName" -ForegroundColor Red
    Write-Host "   Run the installer to create the service" -ForegroundColor Yellow
    exit 1
}

# 2. Check service binary path
Write-Host "`n2. Service Binary Path" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

$serviceInfo = Get-WmiObject -Class Win32_Service -Filter "Name='$ServiceName'"
if ($serviceInfo) {
    Write-Host "✅ Binary Path: $($serviceInfo.PathName)" -ForegroundColor Green
    
    # Check if it's using the PowerShell script
    if ($serviceInfo.PathName -like "*asa-api-service.ps1*") {
        Write-Host "✅ Using PowerShell service script" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Not using PowerShell service script" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Could not retrieve service information" -ForegroundColor Red
}

# 3. Check API directory
Write-Host "`n3. API Directory" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan

$apiDir = "C:\ASA-API"
if (Test-Path $apiDir) {
    Write-Host "✅ API directory exists: $apiDir" -ForegroundColor Green
    
    # Check key files
    $requiredFiles = @("package.json", "server.js", "config", "routes", "services")
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $apiDir $file
        if (Test-Path $filePath) {
            Write-Host "   ✅ $file" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $file (missing)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "❌ API directory not found: $apiDir" -ForegroundColor Red
}

# 4. Check environment file
Write-Host "`n4. Environment Configuration" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$envFile = Join-Path $apiDir ".env"
if (Test-Path $envFile) {
    Write-Host "✅ Environment file exists: $envFile" -ForegroundColor Green
    
    # Read and check key environment variables
    $envContent = Get-Content $envFile
    $envVars = @{}
    foreach ($line in $envContent) {
        if ($line -match "^([^#][^=]+)=(.*)$") {
            $envVars[$matches[1]] = $matches[2]
        }
    }
    
    # Check critical variables
    $criticalVars = @{
        "CORS_ORIGIN" = "http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010"
        "SERVER_MODE" = "native"
        "NATIVE_BASE_PATH" = "G:\ARK"
        "PORT" = $Port.ToString()
        "NODE_ENV" = "production"
    }
    
    foreach ($var in $criticalVars.GetEnumerator()) {
        if ($envVars.ContainsKey($var.Key)) {
            $value = $envVars[$var.Key]
            if ($value -eq $var.Value) {
                Write-Host "   ✅ $($var.Key)=$value" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  $($var.Key)=$value (expected: $($var.Value))" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   ❌ $($var.Key) (missing)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "❌ Environment file not found: $envFile" -ForegroundColor Red
}

# 5. Check service script
Write-Host "`n5. Service Script" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan

$serviceScript = Join-Path $apiDir "asa-api-service.ps1"
if (Test-Path $serviceScript) {
    Write-Host "✅ Service script exists: $serviceScript" -ForegroundColor Green
    
    # Check if script has updated environment variables
    $scriptContent = Get-Content $serviceScript -Raw
    if ($scriptContent -match "CORS_ORIGIN.*localhost:4010") {
        Write-Host "   ✅ CORS configuration includes localhost:4010" -ForegroundColor Green
    } else {
        Write-Host "   ❌ CORS configuration missing localhost:4010" -ForegroundColor Red
    }
    
    if ($scriptContent -match "SERVER_MODE.*native") {
        Write-Host "   ✅ Server mode set to native" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Server mode not set to native" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Service script not found: $serviceScript" -ForegroundColor Red
}

# 6. Check port availability
Write-Host "`n6. Port Availability" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

$portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "⚠️  Port $Port is in use by process: $($portInUse.ProcessName)" -ForegroundColor Yellow
} else {
    Write-Host "✅ Port $Port is available" -ForegroundColor Green
}

# 7. Test API if service is running
Write-Host "`n7. API Connectivity Test" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

if ($service.Status -eq "Running") {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -Method Get -TimeoutSec 10
        Write-Host "✅ API is responding correctly" -ForegroundColor Green
        Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
        Write-Host "   Uptime: $($response.uptime) seconds" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ API is not responding: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Service is not running, cannot test API" -ForegroundColor Yellow
}

# 8. Check logs
Write-Host "`n8. Service Logs" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

$logFile = Join-Path $apiDir "logs\asa-api-service.log"
if (Test-Path $logFile) {
    Write-Host "✅ Service log exists: $logFile" -ForegroundColor Green
    
    # Show last few lines
    $lastLines = Get-Content $logFile -Tail 5
    Write-Host "   Last 5 log entries:" -ForegroundColor Cyan
    foreach ($line in $lastLines) {
        Write-Host "   $line" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ Service log not found: $logFile" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Green
Write-Host "===============" -ForegroundColor Green

# Determine if reinstallation is needed
$needsReinstall = $false
$issues = @()

if (-not (Test-Path $envFile)) {
    $needsReinstall = $true
    $issues += "Missing environment file"
}

if (-not (Test-Path $serviceScript)) {
    $needsReinstall = $true
    $issues += "Missing service script"
}

if ($service.Status -ne "Running") {
    $issues += "Service not running"
}

if ($needsReinstall) {
    Write-Host "❌ Service needs reinstallation" -ForegroundColor Red
    Write-Host "   Issues found:" -ForegroundColor Yellow
    foreach ($issue in $issues) {
        Write-Host "   - $issue" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "   Run: .\reinstall-api-service.ps1" -ForegroundColor Cyan
} else {
    Write-Host "✅ Service configuration looks good" -ForegroundColor Green
    if ($issues.Count -gt 0) {
        Write-Host "   Minor issues:" -ForegroundColor Yellow
        foreach ($issue in $issues) {
            Write-Host "   - $issue" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Yellow
Write-Host "  .\reinstall-api-service.ps1              # Reinstall with updated config" -ForegroundColor Gray
Write-Host "  Get-Service $ServiceName                 # Check service status" -ForegroundColor Gray
Write-Host "  Start-Service $ServiceName               # Start the service" -ForegroundColor Gray
Write-Host "  Get-Content $logFile -Tail 20           # View recent logs" -ForegroundColor Gray 
