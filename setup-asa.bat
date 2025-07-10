@echo off
setlocal enabledelayedexpansion

REM ASA Server Management - Complete Setup Script (Batch Version)
REM This script handles the entire setup process from start to finish

echo.
echo === ASA Server Management Setup ===
echo Complete setup and configuration wizard
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ This script must be run from the asa-docker-control-api directory
    echo Please navigate to the correct directory and try again.
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js found: !NODE_VERSION!

REM Step 1: Environment Setup
echo.
echo === Step 1: Environment Configuration ===

if exist ".env" (
    echo ⚠️  .env file already exists
    set /p OVERWRITE="Do you want to reconfigure? (y/N): "
    if /i "!OVERWRITE!"=="y" (
        echo Running setup wizard...
        node scripts/setup.js
        if errorlevel 1 (
            echo ❌ Setup failed
            pause
            exit /b 1
        )
    ) else (
        echo Using existing configuration...
    )
) else (
    echo No .env file found. Running setup wizard...
    node scripts/setup.js
    if errorlevel 1 (
        echo ❌ Setup failed
        pause
        exit /b 1
    )
)

REM Step 2: Install Dependencies
echo.
echo === Step 2: Installing Dependencies ===

if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✓ Dependencies installed
) else (
    echo ✓ Dependencies already installed
)

REM Step 3: Initialize System
echo.
echo === Step 3: System Initialization ===
echo Creating directories and checking system...

REM Run system initialization
node -e "const { ServerProvisioner } = await import('./services/server-provisioner.js'); const provisioner = new ServerProvisioner(); try { await provisioner.initialize(); console.log('✓ System initialized successfully'); } catch (error) { console.log('⚠️  System initialization warning:', error.message); console.log('This is normal for first-time setup.'); }"

REM Step 4: SteamCMD Setup
echo.
echo === Step 4: SteamCMD Setup ===

set /p SETUP_STEAMCMD="Do you want to set up SteamCMD now? (Y/n): "
if /i not "!SETUP_STEAMCMD!"=="n" (
    echo Launching SteamCMD setup...
    node scripts/interactive-console.js
    REM The interactive console will handle SteamCMD setup
)

REM Step 5: ASA Binaries
echo.
echo === Step 5: ASA Server Binaries ===

set /p SETUP_BINARIES="Do you want to install ASA server binaries now? (Y/n): "
if /i not "!SETUP_BINARIES!"=="n" (
    echo Launching ASA binaries setup...
    node scripts/interactive-console.js
    REM The interactive console will handle ASA binaries setup
)

REM Step 6: Start the Backend
echo.
echo === Step 6: Starting Backend API ===

REM Read mode from .env
set SERVER_MODE=native
if exist ".env" (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="SERVER_MODE" set SERVER_MODE=%%b
    )
)

echo Detected mode: !SERVER_MODE!

if /i "!SERVER_MODE!"=="docker" (
    echo Starting in Docker mode...
    
    REM Check if Docker is running
    docker version >nul 2>&1
    if errorlevel 1 (
        echo ❌ Docker is not running or not installed
        echo Please start Docker Desktop and try again.
        pause
        exit /b 1
    )
    
    REM Start with Docker Compose
    docker compose up -d
    if errorlevel 1 (
        echo ❌ Failed to start Docker containers
        pause
        exit /b 1
    )
    
    echo ✓ Backend started in Docker mode
    
    REM Get port from .env
    set PORT=3000
    if exist ".env" (
        for /f "tokens=1,2 delims==" %%a in (.env) do (
            if "%%a"=="PORT" set PORT=%%b
        )
    )
    
    echo API available at: http://localhost:!PORT!
) else (
    echo Starting in native mode...
    
    REM Start the backend
    start /b node server.js
    
    REM Wait a moment for startup
    timeout /t 3 /nobreak >nul
    
    REM Get port from .env
    set PORT=3000
    if exist ".env" (
        for /f "tokens=1,2 delims==" %%a in (.env) do (
            if "%%a"=="PORT" set PORT=%%b
        )
    )
    
    echo ✓ Backend started in native mode
    echo API available at: http://localhost:!PORT!
)

REM Step 7: Interactive Console
echo.
echo === Step 7: Cluster Management ===

set /p LAUNCH_CONSOLE="Do you want to launch the interactive console to create clusters? (Y/n): "
if /i not "!LAUNCH_CONSOLE!"=="n" (
    echo Launching interactive console...
    echo Use the console to:
    echo   - Create ASA server clusters
    echo   - Install SteamCMD and ASA binaries
    echo   - Manage your servers
    echo.
    
    node scripts/interactive-console.js
)

echo.
echo === Setup Complete! ===
echo.
echo Next steps:
echo 1. Access the web dashboard at: http://localhost:!PORT!
echo 2. Use the interactive console: node scripts/interactive-console.js
echo 3. Create your first ASA server cluster
echo.
echo Documentation:
echo - README.md - Complete documentation
echo - QUICK-SETUP.md - Quick reference
echo - INTERACTIVE-CONSOLE.md - Console guide
echo.
pause 
 