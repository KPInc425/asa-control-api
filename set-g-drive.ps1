# Set environment variable for G: drive base path
$env:NATIVE_BASE_PATH = "G:\ARK"

Write-Host "Set NATIVE_BASE_PATH to G:\ARK"
Write-Host "Now restart the backend to use this path"

# You can also create a .env file if needed
$envContent = @"
# ASA Control API Environment Variables

# Set the native base path to G:\ARK to match your SteamCMD installation
NATIVE_BASE_PATH=G:\\ARK

# Server Configuration
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
SERVER_MODE=native

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# CORS Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:3000,http://localhost:4000

# Logging
LOG_LEVEL=info

# Auto-install SteamCMD (true/false)
AUTO_INSTALL_STEAMCMD=true
"@

Write-Host "Environment variable set. You can now restart the backend." 
