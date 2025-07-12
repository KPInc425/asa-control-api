# Fix ASA API Service Node.js Path
# This script fixes the incorrect Node.js path in the NSSM service configuration

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges to modify the Windows service." -ForegroundColor Yellow
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

Write-Host "Fixing ASA API Service Node.js path..." -ForegroundColor Yellow
Write-Host "Running with Administrator privileges ✓" -ForegroundColor Green
Write-Host ""

# Find NSSM
$nssmPath = $null
$possiblePaths = @(
    "C:\nssm\nssm.exe",
    "C:\nssm\nssm-2.24\win64\nssm.exe",
    "C:\nssm\nssm-2.24\win32\nssm.exe"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $nssmPath = $path
        Write-Host "Found NSSM at: $nssmPath" -ForegroundColor Green
        break
    }
}

if (!$nssmPath) {
    Write-Host "NSSM not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Get current Node.js path
$currentNodePath = & $nssmPath get ASA-API Application
Write-Host "Current Node.js path: $currentNodePath" -ForegroundColor Cyan

# Get correct Node.js path
$correctNodePath = (Get-Command node.exe).Source
Write-Host "Correct Node.js path: $correctNodePath" -ForegroundColor Cyan

if ($currentNodePath -eq $correctNodePath) {
    Write-Host "Node.js path is already correct!" -ForegroundColor Green
} else {
    Write-Host "Updating Node.js path..." -ForegroundColor Yellow
    
    # Stop the service first
    Write-Host "Stopping service..." -ForegroundColor Cyan
    & $nssmPath stop ASA-API 2>$null
    Start-Sleep -Seconds 3
    
    # Update the path
    & $nssmPath set ASA-API Application $correctNodePath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Node.js path updated successfully!" -ForegroundColor Green
        
        # Verify the change
        $newNodePath = & $nssmPath get ASA-API Application
        Write-Host "New Node.js path: $newNodePath" -ForegroundColor Green
        
        # Test starting the service
        Write-Host ""
        Write-Host "Testing service start..." -ForegroundColor Cyan
        & $nssmPath start ASA-API
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Service started successfully!" -ForegroundColor Green
            Start-Sleep -Seconds 5
            
            # Check service status
            $status = & $nssmPath status ASA-API
            Write-Host "Service status: $status" -ForegroundColor Cyan
            
            if ($status -eq "SERVICE_RUNNING") {
                Write-Host "Service is running correctly!" -ForegroundColor Green
                
                # Test API
                Write-Host "Testing API..." -ForegroundColor Yellow
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 10 -ErrorAction Stop
                    Write-Host "API is responding: $($response.StatusCode)" -ForegroundColor Green
                } catch {
                    Write-Host "API not responding yet: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                # Stop the service
                Write-Host "Stopping service..." -ForegroundColor Yellow
                & $nssmPath stop ASA-API
                Write-Host "Service stopped successfully!" -ForegroundColor Green
            } else {
                Write-Host "Service failed to start properly. Status: $status" -ForegroundColor Red
                Write-Host "Check the logs at C:\ASA-API\logs\nssm-*.log" -ForegroundColor Yellow
            }
        } else {
            Write-Host "Failed to start service!" -ForegroundColor Red
        }
    } else {
        Write-Host "Failed to update Node.js path!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Service path fix completed!" -ForegroundColor Green
Write-Host "You can now start the service using:" -ForegroundColor Cyan
Write-Host "  Start-Service ASA-API" -ForegroundColor White
Write-Host "  or" -ForegroundColor White
Write-Host "  C:\nssm\nssm-2.24\win64\nssm.exe start ASA-API" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit" 
