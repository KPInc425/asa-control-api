@echo off
echo ASA API Service Update Script
echo =============================
echo.
echo This script will update the ASA API service files without reinstalling the service.
echo.
echo Requirements:
echo - Administrator privileges (will be requested automatically)
echo - ASA API service must be installed
echo.
pause

echo.
echo Starting update process...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0update-service-files.ps1"

echo.
echo Update process completed.
pause 
