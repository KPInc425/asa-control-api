@echo off
REM ASA Agent Service Wrapper
REM This batch file is used by the Windows service to start the ASA agent

set AGENT_DIR=C:\ASA-Agent
set CONFIG_PATH=%AGENT_DIR%\config.json
set PORT=5000
set LOG_PATH=%AGENT_DIR%\logs

REM Create directories if they don't exist
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"
if not exist "%LOG_PATH%" mkdir "%LOG_PATH%"

REM Change to agent directory
cd /d "%AGENT_DIR%"

REM Set PowerShell execution policy for this session
powershell.exe -Command "Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force"

REM Start the agent script
powershell.exe -ExecutionPolicy Bypass -File "%AGENT_DIR%\asa-agent.ps1" -ConfigPath "%CONFIG_PATH%" -Port %PORT% -LogPath "%LOG_PATH%"

REM If we get here, the script exited
echo ASA Agent service stopped at %date% %time% >> "%LOG_PATH%\asa-agent.log" 
