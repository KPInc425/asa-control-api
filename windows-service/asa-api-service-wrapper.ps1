# ASA API Windows Service Wrapper
# This PowerShell script properly communicates with Windows Service Control Manager

param(
    [string]$ApiPath = "C:\ASA-API",
    [string]$LogPath = "C:\ASA-API\logs"
)

# Global variables
$global:nodeProcess = $null
$global:serviceRunning = $true

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path "$LogPath\service-wrapper.log" -Value $logMessage
}

# Stop the Node.js process
function Stop-NodeProcess {
    if ($global:nodeProcess -and (Get-Process -Id $global:nodeProcess.Id -ErrorAction SilentlyContinue)) {
        Write-Log "Stopping Node.js process (PID: $($global:nodeProcess.Id))"
        try {
            Stop-Process -Id $global:nodeProcess.Id -Force
            Wait-Process -Id $global:nodeProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
            Write-Log "Node.js process stopped"
        } catch {
            Write-Log "Error stopping Node.js process: $($_.Exception.Message)" "ERROR"
        }
    }
    $global:nodeProcess = $null
}

# Start the Node.js process
function Start-NodeProcess {
    try {
        Write-Log "Starting Node.js process..."
        
        # Change to API directory
        Set-Location $ApiPath
        
        # Start Node.js with proper process management
        $processArgs = @{
            FilePath = "node.exe"
            ArgumentList = "server.js"
            WorkingDirectory = $ApiPath
            RedirectStandardOutput = "$LogPath\node-out.log"
            RedirectStandardError = "$LogPath\node-err.log"
            WindowStyle = "Hidden"
            PassThru = $true
        }
        
        $global:nodeProcess = Start-Process @processArgs
        
        if ($global:nodeProcess) {
            Write-Log "Node.js process started with PID $($global:nodeProcess.Id)"
            
            # Wait a moment for the process to start
            Start-Sleep -Seconds 2
            
            # Check if process is still running
            $process = Get-Process -Id $global:nodeProcess.Id -ErrorAction SilentlyContinue
            if ($process) {
                Write-Log "Node.js process is running successfully"
                return $true
            } else {
                Write-Log "Node.js process exited immediately" "ERROR"
                return $false
            }
        } else {
            Write-Log "Failed to start Node.js process" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "Error starting Node.js process: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Handle service stop signal
function Stop-Service {
    Write-Log "Received stop signal"
    $global:serviceRunning = $false
    Stop-NodeProcess
}

# Set up signal handling
try {
    $null = Register-EngineEvent PowerShell.Exiting -Action {
        Write-Log "PowerShell is exiting"
        Stop-Service
    }
} catch {
    Write-Log "Could not register exit handler: $($_.Exception.Message)" "WARN"
}

# Main service execution
Write-Log "ASA API Service Wrapper starting..."

# Start the Node.js process
$success = Start-NodeProcess
if (!$success) {
    Write-Log "Failed to start Node.js process" "ERROR"
    exit 1
}

Write-Log "Service wrapper is now running. Monitoring Node.js process..."

# Main monitoring loop - keep PowerShell alive for SCM
while ($global:serviceRunning) {
    try {
        # Check if Node.js process is still running
        if ($global:nodeProcess) {
            $process = Get-Process -Id $global:nodeProcess.Id -ErrorAction SilentlyContinue
            if (!$process) {
                Write-Log "Node.js process has stopped unexpectedly" "ERROR"
                
                # Try to restart if service is still supposed to be running
                if ($global:serviceRunning) {
                    Write-Log "Attempting to restart Node.js process..."
                    $success = Start-NodeProcess
                    if (!$success) {
                        Write-Log "Failed to restart Node.js process" "ERROR"
                        break
                    }
                }
            }
        }
        
        # Sleep for a short time before checking again
        Start-Sleep -Seconds 5
    }
    catch {
        Write-Log "Error in monitoring loop: $($_.Exception.Message)" "ERROR"
        Start-Sleep -Seconds 5
    }
}

# Clean up when service is stopping
Write-Log "Service wrapper is stopping..."
Stop-NodeProcess
Write-Log "ASA API Service Wrapper stopped"
exit 0 
