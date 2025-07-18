@echo off
REM Production Migration Script for ASA Management API
REM This script runs the migration from the production service directory (C:\ASA-API)

echo === ASA Management API Production Migration ===
echo.

REM Check if we're in the correct directory
set CURRENT_DIR=%CD%
echo Current directory: %CURRENT_DIR%

echo %CURRENT_DIR% | findstr /C:"C:\ASA-API" >nul
if errorlevel 1 (
    echo WARNING: This script is designed to run from C:\ASA-API
    echo Current directory: %CURRENT_DIR%
    echo.
    set /p CONTINUE="Continue anyway? (y/N): "
    if /i not "%CONTINUE%"=="y" (
        echo Migration cancelled.
        pause
        exit /b 0
    )
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo Please install Node.js and try again.
    pause
    exit /b 1
)

REM Check if the migration script exists
if not exist "scripts\migrate-json-to-sqlite.js" (
    echo ERROR: Migration script not found: scripts\migrate-json-to-sqlite.js
    echo Make sure you're running this from the ASA-API directory.
    pause
    exit /b 1
)

REM Create data directory if it doesn't exist
if not exist "C:\ASA-API\data" (
    echo Creating data directory: C:\ASA-API\data
    mkdir "C:\ASA-API\data"
)

echo.
echo Migration will process:
echo   - Clusters and servers from C:\ARK\clusters
echo   - Server mods from C:\ARK\server-mods.json
echo   - Server mods from C:\ARK\server-mods\*.json
echo   - Shared mods from C:\ARK\shared-mods.json
echo.

set /p CONFIRM="Start migration? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Migration cancelled.
    pause
    exit /b 0
)

echo.
echo Starting migration...
echo Command: node scripts\migrate-json-to-sqlite.js --service-path

node scripts\migrate-json-to-sqlite.js --service-path
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% equ 0 (
    echo.
    echo ✅ Migration completed successfully!
    
    if exist "C:\ASA-API\data\asa-data.sqlite" (
        echo Database created: C:\ASA-API\data\asa-data.sqlite
    ) else (
        echo WARNING: Database file not found at expected location
    )
    
    echo.
    echo Next steps:
    echo 1. Restart the ASA-API service to use the new database
    echo 2. Verify data migration in the web dashboard
    echo 3. Backup the old JSON files if needed
) else (
    echo.
    echo ❌ Migration failed with exit code: %EXIT_CODE%
    echo Check the output above for error details.
)

echo.
pause 
