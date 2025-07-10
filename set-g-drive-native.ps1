# Set G: drive configuration for native Windows mode
Write-Host "=== Setting up G: drive configuration for native Windows mode ===" -ForegroundColor Green

# Navigate to API directory
Set-Location "asa-docker-control-api"

# Create .env file with G: drive configuration
$envContent = @"
# ASA Server Management - Native Windows Mode Configuration
# =======================================================

# Server Configuration
SERVER_MODE=native
PORT=4000
HOST=0.0.0.0
NODE_ENV=development

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Native Server Configuration - G: Drive
NATIVE_BASE_PATH=G:\\ARK
NATIVE_CLUSTERS_PATH=G:\\ARK\\clusters
NATIVE_CONFIG_FILE=native-servers.json

# SteamCMD Configuration
# Leave empty to auto-detect or install automatically
STEAMCMD_PATH=
AUTO_INSTALL_STEAMCMD=true

# ASA Server Configuration
ASA_CONFIG_SUB_PATH=Config/WindowsServer

# RCON Configuration
RCON_DEFAULT_PORT=32330
RCON_PASSWORD=admin

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=900000

# CORS Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:3000,http://localhost:4000

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log

# Metrics
METRICS_ENABLED=true

# PowerShell Helper (for native server management)
POWERSHELL_ENABLED=true

# Docker Configuration (disabled for native mode)
DOCKER_ENABLED=false
"@

# Write the configuration
Set-Content ".env" $envContent -NoNewline

Write-Host "✓ Native mode configuration created with G:\ARK base path" -ForegroundColor Green
Write-Host "✓ .env file created in asa-docker-control-api directory" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart the backend API server" -ForegroundColor White
Write-Host "2. The system status should now show disk space for G: drive" -ForegroundColor White
Write-Host "3. All ASA servers will be installed to G:\ARK" -ForegroundColor White
Write-Host ""
Write-Host "To restart the backend:" -ForegroundColor Cyan
Write-Host "  - Stop the current server (Ctrl+C)" -ForegroundColor White
Write-Host "  - Run: node server.js" -ForegroundColor White 
