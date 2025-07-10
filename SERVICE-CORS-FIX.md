# ASA API Windows Service - CORS and Configuration Fix

## Problem Analysis

The ASA API Windows service was experiencing CORS issues and missing configuration because it wasn't properly set up to match the working version. Here are the key issues identified:

### 1. **CORS Configuration Issues**
- **Service was setting**: `CORS_ORIGIN = "http://localhost:4010"`
- **Missing origins**: The service was missing several important CORS origins that the working version includes
- **Frontend access**: The frontend running on `http://localhost:4010` couldn't access the API due to incomplete CORS configuration

### 2. **Missing Environment Variables**
The service script was missing several critical environment variables:
- `HOST` (defaults to '0.0.0.0')
- `JWT_EXPIRES_IN` 
- `DOCKER_ENABLED`
- `RATE_LIMIT_MAX` and `RATE_LIMIT_TIME_WINDOW`
- `LOG_LEVEL` and `LOG_FILE_PATH`
- `METRICS_ENABLED`
- `RCON_DEFAULT_PORT` and `RCON_PASSWORD`
- `ASA_CONFIG_SUB_PATH`
- `AUTO_INSTALL_STEAMCMD`

### 3. **Incomplete File Copying**
The service installer was only copying specific directories but missing:
- `.env` file (if it exists)
- `env.example` (for reference)
- `.asa-run-mode` and `.asa-root-path` files

### 4. **Working Directory Issues**
The service runs from `C:\ASA-API` but needs all the configuration files that the working version has in the project directory.

## Solutions Implemented

### 1. **Updated Service Installer** (`windows-service/install-api-service.ps1`)
- **Enhanced file copying**: Now copies all necessary files including `env.example`, `.asa-run-mode`, and `.asa-root-path`
- **Comprehensive environment variables**: Sets all required environment variables in the service script
- **Proper CORS configuration**: Includes all necessary CORS origins:
  ```
  CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010
  ```

### 2. **Updated Service Script** (`windows-service/asa-api-service.ps1`)
- **Complete environment setup**: Sets all environment variables that the working version uses
- **Proper CORS origins**: Includes all frontend origins
- **Native mode configuration**: Properly configured for native server mode

### 3. **Comprehensive Environment File**
The service now creates a complete `.env` file with all necessary variables:
```env
# Server Configuration
PORT=4000
HOST=0.0.0.0
NODE_ENV=production

# JWT Authentication
JWT_SECRET=fallback-secret-change-in-production
JWT_EXPIRES_IN=24h

# Native Server Configuration
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK
NATIVE_CONFIG_FILE=native-servers.json

# CORS Configuration - Include all possible frontend origins
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010

# And many more...
```

## How to Fix Your Service

### Option 1: Reinstall the Service (Recommended)
```powershell
# Run as Administrator
.\reinstall-api-service.ps1
```

### Option 2: Check Current Configuration
```powershell
# Run as Administrator
.\check-service-config.ps1
```

### Option 3: Manual Fix
If you prefer to fix manually:

1. **Stop the service**:
   ```powershell
   Stop-Service "ASA-API"
   ```

2. **Update the service script**:
   - Edit `C:\ASA-API\asa-api-service.ps1`
   - Update environment variables to match the working version
   - Ensure CORS_ORIGIN includes all necessary origins

3. **Create/update the .env file**:
   - Create `C:\ASA-API\.env` with all necessary variables
   - Include the comprehensive CORS configuration

4. **Restart the service**:
   ```powershell
   Start-Service "ASA-API"
   ```

## Key Environment Variables for Working Service

```env
# Essential for CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000,http://localhost:4010

# Essential for native mode
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK

# Essential for authentication
JWT_SECRET=fallback-secret-change-in-production
JWT_EXPIRES_IN=24h

# Essential for server configuration
PORT=4000
HOST=0.0.0.0
NODE_ENV=production

# Essential for functionality
DOCKER_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=900000
LOG_LEVEL=info
METRICS_ENABLED=true
```

## Verification Steps

After fixing the service:

1. **Check service status**:
   ```powershell
   Get-Service "ASA-API"
   ```

2. **Test API health**:
   ```powershell
   curl http://localhost:4000/health
   ```

3. **Check CORS headers**:
   ```powershell
   curl -H "Origin: http://localhost:4010" -H "Access-Control-Request-Method: GET" -X OPTIONS http://localhost:4000/health
   ```

4. **Check service logs**:
   ```powershell
   Get-Content "C:\ASA-API\logs\asa-api-service.log" -Tail 20
   ```

## Troubleshooting

### Service Won't Start
- Check Node.js is installed and in PATH
- Check service logs: `C:\ASA-API\logs\asa-api-service.log`
- Ensure all files were copied to `C:\ASA-API`

### CORS Still Not Working
- Verify CORS_ORIGIN includes your frontend URL
- Check that the service is running on the correct port
- Ensure frontend is making requests to the correct API URL

### Missing Configuration
- Run the reinstall script to ensure all files are copied
- Check that the `.env` file exists in `C:\ASA-API`
- Verify environment variables are set in the service script

## Files Modified

1. `windows-service/install-api-service.ps1` - Updated installer with comprehensive configuration
2. `windows-service/asa-api-service.ps1` - Updated service script with all environment variables
3. `reinstall-api-service.ps1` - New script to reinstall with updated configuration
4. `check-service-config.ps1` - New script to diagnose service issues

## Next Steps

1. Run `.\reinstall-api-service.ps1` as Administrator
2. Test the API from your frontend
3. Verify CORS is working by checking browser network tab
4. Monitor service logs for any remaining issues

The updated service should now work exactly like your current working version, with proper CORS support and all necessary configuration. 
