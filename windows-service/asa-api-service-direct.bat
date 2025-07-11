@echo off
REM ASA API Windows Service - Direct Node.js Wrapper
REM This starts Node.js directly without any checks to avoid timeout

cd /d "C:\ASA-API"
node.exe server.js 
