# ASA API Windows Service
# Runs the ASA API backend as a Windows service
# Compatible with PowerShell 5.1

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
    } catch {
        Write-Log "Node.js not found in PATH" "ERROR"
        return $false
    }
    return $false
}

# Start the API server in background
function Start-ASAApiServer {
    try {
        Write-Log "Starting ASA API server on port $Port"

        Set-Location $ApiPath

        if (!(Test-Path "package.json")) {
            Write-Log "package.json not found in $ApiPath" "ERROR"
            return $false
        }

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
        $env:HOST = "0.0.0.0"
        $env:SERVER_MODE = "native"
        $env:NATIVE_BASE_PATH = "G:\ARK"
        $env:JWT_SECRET = "fallback-secret-change-in-production"
        $env:JWT_EXPIRES_IN = "24h"
        $env:CORS_ORIGIN = "http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010"
        $env:DOCKER_ENABLED = "false"
        $env:RATE_LIMIT_MAX = "100"
        $env:RATE_LIMIT_TIME_WINDOW = "900000"
        $env:LOG_LEVEL = "info"
        $env:LOG_FILE_PATH = "$LogPath\app.log"
        $env:METRICS_ENABLED = "true"
        $env:RCON_DEFAULT_PORT = "32330"
        $env:RCON_PASSWORD = "admin"
        $env:ASA_CONFIG_SUB_PATH = "Config/WindowsServer"
        $env:AUTO_INSTALL_STEAMCMD = "true"

        # Launch Node.js in background
        Write-Log "Launching: $NodeExe server.js"
        Start-Process -FilePath $NodeExe `
            -ArgumentList "server.js" `
            -WorkingDirectory $ApiPath `
            -RedirectStandardOutput "$LogPath\node-out.log" `
            -RedirectStandardError "$LogPath\node-err.log" `
            -WindowStyle Hidden

        Write-Log "Node.js process launched successfully"
        return $true
    } catch {
        Write-Log "Error launching API server: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Main entry point
function Start-ASAApiService {
    Write-Log "ASA API Service initializing..."

    if (!(Test-NodeJS)) {
        Write-Log "Node.js is required but not found. Please install Node.js and try again." "ERROR"
        return
    }

    # Create .env file if missing
    $envFile = Join-Path $ApiPath ".env"
    if (!(Test-Path $envFile)) {
        $envContent = @"
NODE_ENV=production
PORT=$Port
HOST=0.0.0.0
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK
JWT_SECRET=fallback-secret-change-in-production
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010
DOCKER_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=900000
LOG_LEVEL=info
LOG_FILE_PATH=$LogPath\app.log
METRICS_ENABLED=true
RCON_DEFAULT_PORT=32330
RCON_PASSWORD=admin
ASA_CONFIG_SUB_PATH=Config/WindowsServer
AUTO_INSTALL_STEAMCMD=true
"@
        $envContent | Set-Content $envFile
        Write-Log "Created .env file at $envFile"
    }

    # Start the server once and exit
    $success = Start-ASAApiServer
    if ($success) {
        Write-Log "ASA API Service launched successfully"
    } else {
        Write-Log "ASA API Service failed to launch" "ERROR"
    }
}

# Start the service
Start-ASAApiService
