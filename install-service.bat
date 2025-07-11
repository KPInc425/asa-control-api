@echo off
echo Installing ASA API Service...
echo.
echo This will request Administrator privileges to install the Windows service.
echo.
pause

powershell.exe -ExecutionPolicy Bypass -File "%~dp0install-nssm-service.ps1"

echo.
echo Installation complete!
pause 
