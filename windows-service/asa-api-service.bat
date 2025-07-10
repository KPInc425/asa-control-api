@echo off
REM ASA API Service Wrapper
REM This batch file is used by the Windows service to start the ASA API

set API_DIR=C:\ASA-API
set PORT=4000
set LOG_PATH=%API_DIR%\logs

REM Create directories if they don't exist
if not exist "%API_DIR%" mkdir "%API_DIR%"
if not exist "%LOG_PATH%" mkdir "%LOG_PATH%"

REM Change to API directory
cd /d "%API_DIR%"

REM Set PowerShell execution policy for this session
powershell.exe -Command "Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force"

REM Start the API script
powershell.exe -ExecutionPolicy Bypass -File "%API_DIR%\asa-api-service.ps1" -ApiPath "%API_DIR%" -Port %PORT% -LogPath "%LOG_PATH%"

REM If we get here, the script exited
echo ASA API service stopped at %date% %time% >> "%LOG_PATH%\asa-api-service.log" 
