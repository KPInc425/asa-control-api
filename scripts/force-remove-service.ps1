# Force Remove ASA API Service (Fixed Version)
# This script forcefully removes a stuck service that's marked for deletion
# Updated to fix invisible character issues

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges to remove the Windows service." -ForegroundColor Yellow
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

Write-Host "Force removing ASA API Service..." -ForegroundColor Yellow
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

# Check if service exists
$service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Service exists with status: $($service.Status)" -ForegroundColor Cyan
    
    # Stop the service if running
    if ($service.Status -eq "Running") {
        Write-Host "Stopping service..." -ForegroundColor Yellow
        Stop-Service -Name "ASA-API" -Force
        Start-Sleep -Seconds 5
    }
    
    # Try NSSM removal
    Write-Host "Attempting NSSM removal..." -ForegroundColor Cyan
    & $nssmPath remove ASA-API confirm 2>$null
    
    # Try sc.exe removal
    Write-Host "Attempting sc.exe removal..." -ForegroundColor Cyan
    sc.exe delete ASA-API 2>$null
    
    # Wait for removal
    Write-Host "Waiting for service removal..." -ForegroundColor Cyan
    Start-Sleep -Seconds 10
    
    # Check if still exists
    $service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
    if ($service) {
        Write-Host "Service still exists, trying registry removal..." -ForegroundColor Yellow
        
        # Try to remove from registry directly
        try {
            $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\ASA-API"
            if (Test-Path $regPath) {
                Write-Host "Removing service from registry..." -ForegroundColor Cyan
                Remove-Item -Path $regPath -Recurse -Force
                Write-Host "Registry entry removed" -ForegroundColor Green
            }
        } catch {
            Write-Host "Failed to remove registry entry: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Restart service manager
        Write-Host "Restarting service manager..." -ForegroundColor Cyan
        try {
            Restart-Service -Name "DcomLaunch" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 5
        } catch {
            Write-Host "Failed to restart DcomLaunch service" -ForegroundColor Yellow
        }
        
        # Try to restart other critical services
        try {
            Restart-Service -Name "RpcEptMapper" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        } catch {
            # Ignore errors
        }
        
        try {
            Restart-Service -Name "RpcSs" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        } catch {
            # Ignore errors
        }
        
        # Final check
        Start-Sleep -Seconds 10
        $service = Get-Service -Name "ASA-API" -ErrorAction SilentlyContinue
        if ($service) {
            Write-Host "Service still exists after all attempts!" -ForegroundColor Red
            Write-Host "You may need to restart the computer to complete the removal." -ForegroundColor Yellow
        } else {
            Write-Host "Service successfully removed!" -ForegroundColor Green
        }
    } else {
        Write-Host "Service successfully removed!" -ForegroundColor Green
    }
} else {
    Write-Host "Service does not exist" -ForegroundColor Green
}

# Clean up any remaining registry entries
Write-Host "Cleaning up registry entries..." -ForegroundColor Cyan
try {
    $regPaths = @(
        "HKLM:\SYSTEM\CurrentControlSet\Services\ASA-API",
        "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SvcHost\ASA-API"
    )
    
    foreach ($regPath in $regPaths) {
        if (Test-Path $regPath) {
            Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Removed registry entry: $regPath" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "Registry cleanup completed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Service removal completed!" -ForegroundColor Green
Write-Host "You can now run the install script again." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit" 
