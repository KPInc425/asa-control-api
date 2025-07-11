# ASA API Windows Service Installer (Enhanced with Permissions)
# Installs the ASA API backend as a Windows service with proper permissions
# Requires Administrator privileges

param(
    [string]$ServiceName = "ASA-API",
    [string]$DisplayName = "ASA Management API",
    [string]$Description = "ASA Management API Backend Service",
    [string]$ApiPath = "C:\ASA-API",
    [int]$Port = 4000,
    [string]$LogPath = "C:\ASA-API\logs",
    [string]$NodeExe = "node.exe",
    [switch]$Uninstall,
    [switch]$Reinstall
)

# Check if running as Administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
}

# Check if service exists
function Test-ServiceExists {
    param([string]$ServiceName)
    try {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        return $service -ne $null
    }
    catch {
        return $false
    }
}

# Stop and remove existing service
function Remove-ExistingService {
    param([string]$ServiceName)
    
    if (Test-ServiceExists $ServiceName) {
        Write-Log "Removing existing service: $ServiceName"
        
        try {
            # Stop the service if it's running
            $service = Get-Service -Name $ServiceName
            if ($service.Status -eq "Running") {
                Write-Log "Stopping service..."
                Stop-Service -Name $ServiceName -Force
                Start-Sleep -Seconds 5
            }
            
            # Remove the service using sc.exe
            $result = sc.exe delete $ServiceName 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Service removed successfully"
            } else {
                Write-Log "Failed to remove service: $result" "ERROR"
                return $false
            }
        }
        catch {
            Write-Log "Error removing service: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
    
    return $true
}

# Install the service with proper permissions
function Install-Service {
    param(
        [string]$ServiceName,
        [string]$DisplayName,
        [string]$Description,
        [string]$ApiPath,
        [int]$Port,
        [string]$LogPath,
        [string]$NodeExe
    )
    
    Write-Log "Installing ASA API service with enhanced permissions..."
    
    # Get the path to the service batch file
    $batchPath = Join-Path $PSScriptRoot "asa-api-service.bat"
    if (!(Test-Path $batchPath)) {
        Write-Log "Service batch file not found: $batchPath" "ERROR"
        return $false
    }
    
    # Build the command line for the service
    $commandLine = "`"$batchPath`""
    
    Write-Log "Installing service with command: $commandLine"
    
    # Install the service using sc.exe
    $result = sc.exe create $ServiceName binPath= "`"$commandLine`"" DisplayName= "`"$DisplayName`"" start= auto 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Service installed successfully"
        
        # Set the description
        $descResult = sc.exe description $ServiceName "`"$Description`"" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Warning: Could not set service description: $descResult" "WARN"
        }
        
        # Configure service to restart on failure
        $failureResult = sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Warning: Could not configure service failure actions: $failureResult" "WARN"
        }
        
        # Set enhanced security descriptor with proper permissions
        Write-Log "Setting enhanced service permissions..."
        $securityDescriptor = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPDTLOCRRC;;;AU)(A;;CCLCSWRPWPDTLOCRRC;;;PU)"
        $permResult = sc.exe sdset $ServiceName $securityDescriptor 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Enhanced permissions set successfully"
        } else {
            Write-Log "Warning: Could not set enhanced permissions: $permResult" "WARN"
        }
        
        return $true
    } else {
        Write-Log "Failed to install service: $result" "ERROR"
        return $false
    }
}

# Test service control
function Test-ServiceControl {
    param([string]$ServiceName)
    
    Write-Log "Testing service control..."
    
    # Test start
    Write-Log "Testing service start..."
    $result = sc.exe start $ServiceName 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Service start test successful"
        
        # Wait a moment
        Start-Sleep -Seconds 3
        
        # Check status
        $service = Get-Service -Name $ServiceName
        Write-Log "Service status after start: $($service.Status)"
        
        # Test stop
        Write-Log "Testing service stop..."
        $result = sc.exe stop $ServiceName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Service stop test successful"
            
            # Wait a moment
            Start-Sleep -Seconds 3
            
            # Check final status
            $service = Get-Service -Name $ServiceName
            Write-Log "Service status after stop: $($service.Status)"
            
            return $true
        } else {
            Write-Log "Service stop test failed: $result" "ERROR"
            return $false
        }
    } else {
        Write-Log "Service start test failed: $result" "ERROR"
        return $false
    }
}

# Main execution
if (!(Test-Administrator)) {
    Write-Log "This script must be run as Administrator" "ERROR"
    Write-Log "Please right-click PowerShell and select 'Run as Administrator'" "ERROR"
    exit 1
}

Write-Log "ASA API Windows Service Installer (Enhanced with Permissions)"
Write-Log "============================================================="

if ($Uninstall) {
    Write-Log "Uninstalling service: $ServiceName"
    $success = Remove-ExistingService $ServiceName
    if ($success) {
        Write-Log "Service uninstalled successfully"
    } else {
        Write-Log "Failed to uninstall service" "ERROR"
        exit 1
    }
    exit 0
}

if ($Reinstall) {
    Write-Log "Reinstalling service: $ServiceName"
    $success = Remove-ExistingService $ServiceName
    if (!$success) {
        Write-Log "Failed to remove existing service" "ERROR"
        exit 1
    }
}

# Check if service already exists
if (Test-ServiceExists $ServiceName) {
    Write-Log "Service '$ServiceName' already exists" "WARN"
    Write-Log "Use -Reinstall to reinstall the service" "WARN"
    Write-Log "Use -Uninstall to remove the service" "WARN"
    exit 1
}

# Create directories
Write-Log "Creating directories..."
if (!(Test-Path $ApiPath)) {
    New-Item -ItemType Directory -Path $ApiPath -Force | Out-Null
    Write-Log "Created API directory: $ApiPath"
}

if (!(Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
    Write-Log "Created log directory: $LogPath"
}

# Copy files to service directory
Write-Log "Copying files to service directory..."
$sourceDir = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sourceDir = Join-Path $sourceDir "asa-docker-control-api"

if (Test-Path $sourceDir) {
    Write-Log "Copying from: $sourceDir"
    Write-Log "Copying to: $ApiPath"
    
    # Copy all files except node_modules and logs
    Get-ChildItem -Path $sourceDir -Exclude "node_modules", "logs", ".git" | ForEach-Object {
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination $ApiPath -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination $ApiPath -Force
        }
    }
    Write-Log "Files copied successfully"
} else {
    Write-Log "Source directory not found: $sourceDir" "ERROR"
    Write-Log "Please ensure the API files are available" "ERROR"
    exit 1
}

# Install the service
$success = Install-Service -ServiceName $ServiceName -DisplayName $DisplayName -Description $Description -ApiPath $ApiPath -Port $Port -LogPath $LogPath -NodeExe $NodeExe

if ($success) {
    Write-Log "Service installed successfully!"
    
    # Test service control
    $testSuccess = Test-ServiceControl $ServiceName
    
    Write-Log ""
    Write-Log "Service Details:"
    Write-Log "  Name: $ServiceName"
    Write-Log "  Display Name: $DisplayName"
    Write-Log "  API Path: $ApiPath"
    Write-Log "  Port: $Port"
    Write-Log "  Log Path: $LogPath"
    Write-Log "  Enhanced Permissions: Enabled"
    Write-Log ""
    
    if ($testSuccess) {
        Write-Log "Service control test: PASSED" -ForegroundColor Green
        Write-Log "The service should now respond properly to start/stop commands." -ForegroundColor Green
    } else {
        Write-Log "Service control test: FAILED" -ForegroundColor Red
        Write-Log "The service may still have control issues." -ForegroundColor Yellow
    }
    
    Write-Log ""
    Write-Log "To start the service:"
    Write-Log "  Start-Service $ServiceName"
    Write-Log ""
    Write-Log "To stop the service:"
    Write-Log "  Stop-Service $ServiceName"
    Write-Log ""
    Write-Log "To view service status:"
    Write-Log "  Get-Service $ServiceName"
    Write-Log ""
    Write-Log "To uninstall the service:"
    Write-Log "  .\install-api-service-with-permissions.ps1 -Uninstall"
    Write-Log ""
    Write-Log "The service will start automatically on system boot."
    Write-Log "You can start it now with: Start-Service $ServiceName"
} else {
    Write-Log "Failed to install service" "ERROR"
    exit 1
} 
