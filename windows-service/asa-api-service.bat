@echo off
REM ASA API Windows Service Wrapper
REM This batch file runs the ASA API as a Windows service

set APIPATH=C:\ASA-API
set LOGPATH=C:\ASA-API\logs
set NODEEXE=node.exe

REM Create log directory if it doesn't exist
if not exist "%LOGPATH%" mkdir "%LOGPATH%"

REM Log startup
echo [%date% %time%] ASA API Service starting... >> "%LOGPATH%\service.log"

REM Change to API directory
cd /d "%APIPATH%"

REM Quick check for essential files
if not exist "server.js" (
    echo [%date% %time%] ERROR: server.js not found >> "%LOGPATH%\service.log"
    exit /b 1
)

if not exist ".env" (
    echo [%date% %time%] ERROR: .env file not found >> "%LOGPATH%\service.log"
    exit /b 1
)

REM Log that we're starting Node.js
echo [%date% %time%] Starting Node.js server... >> "%LOGPATH%\service.log"

REM Start the server - this is the main process
%NODEEXE% server.js

REM If we get here, the server has stopped
echo [%date% %time%] ASA API server stopped >> "%LOGPATH%\service.log"
exit /b 0 
