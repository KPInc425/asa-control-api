#!/usr/bin/env pwsh

# ASA Server Management - Complete Setup Script
# This script handles the entire setup process from start to finish

param(
    [switch]$Help,
    [switch]$SkipSetup,
    [switch]$StartAfterSetup
)

if ($Help) {
    Write-Host "=== ASA Server Management Setup ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "This script will:" -ForegroundColor White
    Write-Host "1. Configure your environment (.env file)" -ForegroundColor Yellow
    Write-Host "2. Create necessary directories" -ForegroundColor Yellow
    Write-Host "3. Install SteamCMD (if needed)" -ForegroundColor Yellow
    Write-Host "4. Install ASA server binaries" -ForegroundColor Yellow
    Write-Host "5. Start the backend API" -ForegroundColor Yellow
    Write-Host "6. Launch interactive console for cluster creation" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor White
    Write-Host "  .\setup-asa.ps1                    # Run complete setup"
    Write-Host "  .\setup-asa.ps1 -SkipSetup         # Skip setup, just start"
    Write-Host "  .\setup-asa.ps1 -StartAfterSetup   # Start after setup"
    Write-Host "  .\setup-asa.ps1 -Help              # Show this help"
    Write-Host ""
    Write-Host "Requirements:" -ForegroundColor White
    Write-Host "  - Node.js 18+ installed" -ForegroundColor Yellow
    Write-Host "  - At least 50GB free disk space" -ForegroundColor Yellow
    Write-Host "  - Internet connection for downloads" -ForegroundColor Yellow
    exit 0
}

Write-Host "=== ASA Server Management Setup ===" -ForegroundColor Cyan
Write-Host "Complete setup and configuration wizard" -ForegroundColor White
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ This script must be run from the asa-docker-control-api directory" -ForegroundColor Red
    Write-Host "Please navigate to the correct directory and try again." -ForegroundColor Yellow
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Step 1: Environment Setup
if (-not $SkipSetup) {
    Write-Host ""
    Write-Host "=== Step 1: Environment Configuration ===" -ForegroundColor Cyan
    
    if (Test-Path ".env") {
        Write-Host "⚠️  .env file already exists" -ForegroundColor Yellow
        $overwrite = Read-Host "Do you want to reconfigure? (y/N)"
        if ($overwrite -ne "y" -and $overwrite -ne "Y") {
            Write-Host "Using existing configuration..." -ForegroundColor Green
        } else {
            Write-Host "Running setup wizard..." -ForegroundColor Cyan
            node scripts/setup.js
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Setup failed" -ForegroundColor Red
                exit 1
            }
        }
    } else {
        Write-Host "No .env file found. Running setup wizard..." -ForegroundColor Cyan
        node scripts/setup.js
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Setup failed" -ForegroundColor Red
            exit 1
        }
    }
    
    # Step 2: Install Dependencies
    Write-Host ""
    Write-Host "=== Step 2: Installing Dependencies ===" -ForegroundColor Cyan
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
            exit 1
        }
        Write-Host "✓ Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "✓ Dependencies already installed" -ForegroundColor Green
    }
    
    # Step 3: Initialize System
    Write-Host ""
    Write-Host "=== Step 3: System Initialization ===" -ForegroundColor Cyan
    Write-Host "Creating directories and checking system..." -ForegroundColor Yellow
    
    # Run system initialization
    node -e "
    const { ServerProvisioner } = await import('./services/server-provisioner.js');
    const provisioner = new ServerProvisioner();
    try {
        await provisioner.initialize();
        console.log('✓ System initialized successfully');
    } catch (error) {
        console.log('⚠️  System initialization warning:', error.message);
        console.log('This is normal for first-time setup.');
    }
    "
    
    # Step 4: SteamCMD Setup
    Write-Host ""
    Write-Host "=== Step 4: SteamCMD Setup ===" -ForegroundColor Cyan

    # Read STEAMCMD_PATH from .env, or default to NATIVE_BASE_PATH/steamcmd
    $envLines = Get-Content ".env" -ErrorAction SilentlyContinue
    $steamCmdPath = $envLines | Where-Object { $_ -match "^STEAMCMD_PATH=" } | ForEach-Object { $_.Split("=")[1].Trim() }
    if (-not $steamCmdPath) {
        $basePath = $envLines | Where-Object { $_ -match "^NATIVE_BASE_PATH=" } | ForEach-Object { $_.Split("=")[1].Trim() }
        
        # Validate base path before using it
        if ($basePath) {
            $drive = Split-Path $basePath -Qualifier
            if (-not (Test-Path $drive)) {
                Write-Host "❌ Drive $drive does not exist. Please check your .env file." -ForegroundColor Red
                Write-Host "Current NATIVE_BASE_PATH: $basePath" -ForegroundColor Yellow
                $newPath = Read-Host "Enter a valid base path (or press Enter to skip SteamCMD setup)"
                if ($newPath) {
                    $basePath = $newPath
                    # Update .env file with new path
                    $envContent = Get-Content ".env"
                    $envContent = $envContent -replace "^NATIVE_BASE_PATH=.*", "NATIVE_BASE_PATH=$basePath"
                    $envContent | Set-Content ".env"
                    Write-Host "✓ Updated .env with new base path" -ForegroundColor Green
                } else {
                    Write-Host "Skipping SteamCMD setup..." -ForegroundColor Yellow
                    $steamCmdPath = $null
                }
            }
        }
        
        if ($basePath) {
            $steamCmdPath = Join-Path $basePath "steamcmd"
        }
    }
    
    if ($steamCmdPath) {
        $steamCmdExe = Join-Path $steamCmdPath "steamcmd.exe"
    } else {
        $steamCmdExe = $null
    }

    if ($steamCmdExe -and (Test-Path $steamCmdExe)) {
        Write-Host "✓ SteamCMD already installed at $steamCmdExe" -ForegroundColor Green
    } else {
        if (-not $steamCmdExe) {
            Write-Host "⚠️  SteamCMD path not configured due to invalid base path" -ForegroundColor Yellow
        } else {
            Write-Host "SteamCMD not found at: $steamCmdExe" -ForegroundColor Yellow
        }
        
        # Check if ASA binaries are installed
        $asaBinariesPath = Join-Path $basePath "shared-binaries"
        $asaServerExe = Join-Path $asaBinariesPath "ShooterGame\Binaries\Win64\ArkAscendedServer.exe"
        if (Test-Path $asaServerExe) {
            Write-Host "✓ ASA binaries already installed at $asaBinariesPath" -ForegroundColor Green
        } else {
            Write-Host "ASA binaries not found at: $asaServerExe" -ForegroundColor Yellow
        }
        
        $setupSteamCmd = Read-Host "Do you want to set up SteamCMD now? (Y/n)"
        if ($setupSteamCmd -ne "n" -and $setupSteamCmd -ne "N") {
            Write-Host "Launching SteamCMD setup..." -ForegroundColor Yellow
            node scripts/interactive-console.js
            # The interactive console will handle SteamCMD setup
        }
    }
    
    # Step 5: ASA Binaries
    Write-Host ""
    Write-Host "=== Step 5: ASA Server Binaries ===" -ForegroundColor Cyan
    
    $setupBinaries = Read-Host "Do you want to install ASA server binaries now? (Y/n)"
    if ($setupBinaries -ne "n" -and $setupBinaries -ne "N") {
        Write-Host "Launching ASA binaries setup..." -ForegroundColor Yellow
        node scripts/interactive-console.js
        # The interactive console will handle ASA binaries setup
    }
}

# Step 6: Start the Backend
Write-Host ""
Write-Host "=== Step 6: Starting Backend API ===" -ForegroundColor Cyan

# Determine server mode - prefer Docker if available
$serverMode = "docker"
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -ErrorAction SilentlyContinue
    $modeLine = $envContent | Where-Object { $_ -match "^SERVER_MODE=" }
    if ($modeLine) {
        $serverMode = $modeLine.Split("=")[1].Trim()
    }
}

# Check if Docker is available
try {
    docker version | Out-Null
    $dockerAvailable = $true
} catch {
    $dockerAvailable = $false
    if ($serverMode -eq "docker") {
        Write-Host "⚠️  Docker mode selected but Docker is not available, falling back to native mode" -ForegroundColor Yellow
        $serverMode = "native"
    }
}

Write-Host "Detected mode: $serverMode" -ForegroundColor Green
if ($serverMode -eq "native") {
    Write-Host "Note: Native mode means native ASA servers, API will run in Docker" -ForegroundColor Cyan
}

if ($serverMode -eq "docker") {
    Write-Host "Starting in Docker mode..." -ForegroundColor Cyan
    
    # Check if Docker is running
    try {
        docker version | Out-Null
    } catch {
        Write-Host "❌ Docker is not running or not installed" -ForegroundColor Red
        Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
        exit 1
    }
    
    # Start with Docker Compose
    docker compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backend started in Docker mode" -ForegroundColor Green
        
        # Get port from .env
        $port = "4000"
        $envContent = Get-Content ".env" -ErrorAction SilentlyContinue
        $portLine = $envContent | Where-Object { $_ -match "^PORT=" }
        if ($portLine) {
            $port = $portLine.Split("=")[1].Trim()
        }
        
        Write-Host "Backend API available at: http://localhost:$port" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Failed to start Docker containers" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Starting in native ASA server mode (API in Docker)..." -ForegroundColor Cyan
    
    # For native mode, we just start the Docker API (ASA servers run natively)
    if ($dockerAvailable) {
        docker compose up -d
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Backend API started in Docker" -ForegroundColor Green
            Write-Host "✓ ASA servers will run natively (outside Docker)" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to start Docker API" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ Docker not available for API, cannot start in native mode" -ForegroundColor Red
        exit 1
    }
    
    # Get port from .env
    $port = "4000"
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -ErrorAction SilentlyContinue
        $portLine = $envContent | Where-Object { $_ -match "^PORT=" }
        if ($portLine) {
            $port = $portLine.Split("=")[1].Trim()
        }
    }
    
    Write-Host "Backend API available at: http://localhost:$port" -ForegroundColor Cyan
}

# Step 7: Interactive Console
Write-Host ""
Write-Host "=== Step 7: Cluster Management ===" -ForegroundColor Cyan

$launchConsole = Read-Host "Do you want to launch the interactive console to create clusters? (Y/n)"
if ($launchConsole -ne "n" -and $launchConsole -ne "N") {
    Write-Host "Launching interactive console..." -ForegroundColor Cyan
    Write-Host "Use the console to:" -ForegroundColor Yellow
    Write-Host "  - Create ASA server clusters" -ForegroundColor White
    Write-Host "  - Install SteamCMD and ASA binaries" -ForegroundColor White
    Write-Host "  - Manage your servers" -ForegroundColor White
    Write-Host ""
    
    node scripts/interactive-console.js
}

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Access the web dashboard at: http://localhost:3000" -ForegroundColor White
Write-Host "2. Use the interactive console: node scripts/interactive-console.js" -ForegroundColor White
Write-Host "3. Create your first ASA server cluster" -ForegroundColor White
Write-Host ""
Write-Host "Note: If you change configuration, restart the backend API:" -ForegroundColor Yellow
Write-Host "   Docker mode: docker compose restart ark-api" -ForegroundColor White
Write-Host "   Native mode: Restart the node server.js process" -ForegroundColor White
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "- README.md - Complete documentation" -ForegroundColor White
Write-Host "- QUICK-SETUP.md - Quick reference" -ForegroundColor White
Write-Host "- INTERACTIVE-CONSOLE.md - Console guide" -ForegroundColor White 
 