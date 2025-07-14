# ASA API Quick Setup Guide

This guide provides a quick setup for the ASA Management API using the recommended NSSM Windows service approach.

## 🚀 Quick Installation

### Prerequisites
- Windows 10/11
- Node.js 18+ installed
- PowerShell (will request Administrator privileges automatically)

### Step 1: Clone and Setup

```powershell
# Clone the repository
git clone <repository-url>
cd asa-docker-control-api

# Install dependencies
npm install
```

### Step 2: Configure Environment

```powershell
# Copy environment template
copy env.example .env

# Edit .env with your settings
notepad .env
```

**Key settings to configure:**
```bash
PORT=4000
JWT_SECRET=your-secure-jwt-secret
CONFIG_BASE_PATH=G:\ARK
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Step 3: Install as Windows Service

**Option A: Double-click to install (Recommended)**
```powershell
# Simply double-click this file:
install-service.bat
```

**Option B: Run PowerShell script directly**
```powershell
# The script will automatically request Administrator privileges
.\install-nssm-service.ps1
```

Both methods will:
- Automatically request Administrator privileges (UAC prompt)
- Download and install NSSM
- Create the Windows service
- Configure all settings
- Test the service

### Step 4: Start the Service

```powershell
# Start the service
Start-Service ASA-API

# Verify it's running
Get-Service ASA-API
```

### Step 5: Test the API

```powershell
# Test health endpoint
curl http://localhost:4000/health

# Or use PowerShell
Invoke-WebRequest -Uri "http://localhost:4000/health"
```

## 🔧 Service Management

### Start/Stop Service
```powershell
# Start
Start-Service ASA-API

# Stop
Stop-Service ASA-API

# Restart
Restart-Service ASA-API

# Check status
Get-Service ASA-API
```

### NSSM Direct Control
```powershell
# Start
nssm.exe start ASA-API

# Stop
nssm.exe stop ASA-API

# Restart
nssm.exe restart ASA-API

# Remove service
nssm.exe remove ASA-API confirm
```

## 🐳 Docker Mode (Optional)

If you want to run with Docker:

```powershell
# Start with Docker Compose
docker-compose -f docker-compose.unified.yml up -d

# Check status
docker-compose -f docker-compose.unified.yml ps
```

## 🔍 Verification

### Check Service Status
```powershell
Get-Service ASA-API
```

### Check API Health
```powershell
Invoke-WebRequest -Uri "http://localhost:4000/health"
```

### Check Logs
```powershell
# Service logs
Get-Content "C:\ASA-API\logs\nssm-out.log" -Tail 20

# Application logs
Get-Content "C:\ASA-API\logs\app.log" -Tail 20
```

## 🛠️ Troubleshooting

### Service Won't Start

1. **Check NSSM logs:**
   ```powershell
   Get-Content "C:\ASA-API\logs\nssm-*.log"
   ```

2. **Verify Node.js:**
   ```powershell
   node --version
   ```

3. **Check service configuration:**
   ```powershell
   nssm.exe dump ASA-API
   ```

4. **Reinstall service:**
   ```powershell
   nssm.exe remove ASA-API confirm
   .\install-nssm-service.ps1
   ```

### API Not Responding

1. **Check if service is running:**
   ```powershell
   Get-Service ASA-API
   ```

2. **Check application logs:**
   ```powershell
   Get-Content "C:\ASA-API\logs\app.log" -Tail 20
   ```

3. **Test manually:**
   ```powershell
   cd C:\ASA-API
   node server.js
   ```

### Permission Issues

1. **Run PowerShell as Administrator**
2. **Check file permissions on C:\ASA-API**
3. **Verify .env file exists and is readable**

## 📁 File Locations

- **Service Directory:** `C:\ASA-API`
- **Service Logs:** `C:\ASA-API\logs\nssm-*.log`
- **Application Logs:** `C:\ASA-API\logs\app.log`
- **Configuration:** `C:\ASA-API\.env`

## 🔗 Next Steps

After successful installation:

1. **Configure your ASA servers** in the `.env` file
2. **Set up the frontend dashboard** (see dashboard documentation)
3. **Configure Docker containers** (if using Docker mode)
4. **Set up monitoring** (optional)

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs in `C:\ASA-API\logs\`
3. Verify all prerequisites are installed
4. Ensure PowerShell is run as Administrator 
 