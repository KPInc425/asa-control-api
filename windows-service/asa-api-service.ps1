# ASA API Windows Service
# Runs the ASA API backend as a Windows service

param(
    [string]$ApiPath = "C:\ASA-API",
    [int]$Port = 4000,
    [string]$LogPath = "C:\ASA-API\logs",
    [string]$NodeExe = "node.exe"
)

# Create directories if they don't exist
if (!(Test-Path $ApiPath)) { New-Item -ItemType Directory -Path $ApiPath -Force }
if (!(Test-Path $LogPath)) { New-Item -ItemType Directory -Path $LogPath -Force }

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path "$LogPath\asa-api-service.log" -Value $logMessage
}

# Check if Node.js is installed
function Test-NodeJS {
    try {
        $nodeVersion = & $NodeExe --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Node.js found: $nodeVersion"
            return $true
        }
    }
    catch {
        Write-Log "Node.js not found in PATH" "ERROR"
        return $false
    }
    return $false
}

# Start the API server
function Start-APIServer {
    try {
        Write-Log "Starting ASA API server on port $Port"
        
        # Change to API directory
        Set-Location $ApiPath
        
        # Check if package.json exists
        if (!(Test-Path "package.json")) {
            Write-Log "package.json not found in $ApiPath" "ERROR"
            return $false
        }
        
        # Install dependencies if node_modules doesn't exist
        if (!(Test-Path "node_modules")) {
            Write-Log "Installing dependencies..."
            & npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Failed to install dependencies" "ERROR"
                return $false
            }
        }
        
        # Set environment variables
        $env:NODE_ENV = "production"
        $env:PORT = $Port
        $env:SERVER_MODE = "native"
        $env:NATIVE_BASE_PATH = "G:\ARK"
        $env:JWT_SECRET = "fallback-secret-change-in-production"
        $env:CORS_ORIGIN = "http://localhost:4010"
        
        # Start the server
        Write-Log "Starting server with: $NodeExe server.js"
        & $NodeExe server.js
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Server exited with code $LASTEXITCODE" "ERROR"
            return $false
        }
        
        return $true
    }
    catch {
        Write-Log "Error starting API server: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Main service loop
function Start-Service {
    Write-Log "ASA API Service starting..."
    
    # Check Node.js
    if (!(Test-NodeJS)) {
        Write-Log "Node.js is required but not found. Please install Node.js and try again." "ERROR"
        return
    }
    
    # Create environment file if it doesn't exist
    $envFile = Join-Path $ApiPath ".env"
    if (!(Test-Path $envFile)) {
        $envContent = @"
NODE_ENV=production
PORT=$Port
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK
JWT_SECRET=fallback-secret-change-in-production
CORS_ORIGIN=http://localhost:4010
LOG_LEVEL=info
LOG_FILE_PATH=$LogPath\app.log
"@
        $envContent | Set-Content $envFile
        Write-Log "Created environment file: $envFile"
    }
    
    # Service loop with restart capability
    $restartCount = 0
    $maxRestarts = 5
    $restartDelay = 30
    
    while ($true) {
        try {
            Write-Log "Starting API server (attempt $($restartCount + 1))"
            $success = Start-APIServer
            
            if ($success) {
                Write-Log "API server stopped normally"
                break
            } else {
                $restartCount++
                if ($restartCount -ge $maxRestarts) {
                    Write-Log "Maximum restart attempts reached. Service will stop." "ERROR"
                    break
                }
                
                Write-Log "API server failed. Restarting in $restartDelay seconds... (attempt $restartCount of $maxRestarts)"
                Start-Sleep -Seconds $restartDelay
            }
        }
        catch {
            Write-Log "Service error: $($_.Exception.Message)" "ERROR"
            $restartCount++
            
            if ($restartCount -ge $maxRestarts) {
                Write-Log "Maximum restart attempts reached due to errors. Service will stop." "ERROR"
                break
            }
            
            Write-Log "Restarting in $restartDelay seconds... (attempt $restartCount of $maxRestarts)"
            Start-Sleep -Seconds $restartDelay
        }
    }
    
    Write-Log "ASA API Service stopped"
}

# Start the service
Start-Service 
