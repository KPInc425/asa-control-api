# ASA API Setup Flow

This document outlines the recommended setup flow for the ASA Management API.

## 🎯 Setup Options

### Option 1: Windows Service (NSSM) - Recommended
- **Best for:** Production environments
- **Pros:** Automatic startup, reliable, easy management
- **Cons:** Windows-only

### Option 2: Manual Operation
- **Best for:** Development, testing, Linux
- **Pros:** Cross-platform, simple
- **Cons:** Manual startup, no automatic restart

### Option 3: Docker Container
- **Best for:** Containerized environments
- **Pros:** Isolated, portable, scalable
- **Cons:** Additional complexity

## 🚀 Recommended Setup Flow

### Phase 1: Prerequisites

1. **Install Node.js 18+**
   ```bash
   # Download from https://nodejs.org/
   # Or use nvm-windows
   nvm install 18.17.0
   nvm use 18.17.0
   ```

2. **Verify installation**
   ```bash
   node --version
   npm --version
   ```

3. **Clone repository**
   ```bash
   git clone <repository-url>
   cd asa-docker-control-api
   ```

### Phase 2: Configuration

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   copy env.example .env
   ```

3. **Configure .env file**
   ```bash
   # Essential settings
   PORT=4000
   JWT_SECRET=your-secure-jwt-secret
   CONFIG_BASE_PATH=G:\ARK
   CORS_ORIGINS=http://localhost:3000,http://localhost:5173
   
   # Optional settings
   NODE_ENV=production
   LOG_LEVEL=info
   DOCKER_SOCKET=/var/run/docker.sock
   ```

### Phase 3: Service Installation (Recommended)

1. **Run NSSM installer**
   ```powershell
   # Run PowerShell as Administrator
   .\install-nssm-service.ps1
   ```

2. **Verify installation**
   ```powershell
   Get-Service ASA-API
   ```

3. **Start service**
   ```powershell
   Start-Service ASA-API
   ```

4. **Test API**
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:4000/health"
   ```

### Phase 4: Verification

1. **Check service status**
   ```powershell
   Get-Service ASA-API
   ```

2. **Check API health**
   ```powershell
   curl http://localhost:4000/health
   ```

3. **Check logs**
   ```powershell
   Get-Content "C:\ASA-API\logs\nssm-out.log" -Tail 10
   Get-Content "C:\ASA-API\logs\app.log" -Tail 10
   ```

## 🔄 Alternative Setup Flows

### Manual Operation Flow

```bash
# Install dependencies
npm install

# Configure environment
copy env.example .env
# Edit .env

# Start manually
npm start

# Or for development
npm run dev
```

### Docker Flow

```bash
# Build and run with Docker Compose
docker-compose -f docker-compose.unified.yml up -d

# Check status
docker-compose -f docker-compose.unified.yml ps

# View logs
docker-compose -f docker-compose.unified.yml logs -f
```

## 🔧 Post-Setup Configuration

### ASA Server Configuration

1. **Set server paths in .env**
   ```bash
   ASA_SERVER_1_PATH=G:\ARK\TheIsland
   ASA_SERVER_2_PATH=G:\ARK\Ragnarok
   ASA_SERVER_3_PATH=G:\ARK\ClubARK
   ```

2. **Verify server configurations**
   ```bash
   # Check if servers are accessible
   dir G:\ARK\TheIsland
   dir G:\ARK\Ragnarok
   ```

### Frontend Integration

1. **Start the dashboard**
   ```bash
   cd ../asa-servers-dashboard
   npm start
   ```

2. **Verify connection**
   - Dashboard should connect to API at `http://localhost:4000`
   - Check browser console for connection errors

### Monitoring Setup

1. **Enable metrics endpoint**
   ```bash
   # Already enabled by default
   curl http://localhost:4000/metrics
   ```

2. **Configure log rotation**
   ```bash
   # Logs are in C:\ASA-API\logs\
   # Consider setting up log rotation
   ```

## 🛠️ Troubleshooting Flow

### Service Won't Start

1. **Check NSSM logs**
   ```powershell
   Get-Content "C:\ASA-API\logs\nssm-*.log"
   ```

2. **Verify Node.js**
   ```powershell
   node --version
   ```

3. **Check service configuration**
   ```powershell
   nssm.exe dump ASA-API
   ```

4. **Reinstall if needed**
   ```powershell
   nssm.exe remove ASA-API confirm
   .\install-nssm-service.ps1
   ```

### API Not Responding

1. **Check service status**
   ```powershell
   Get-Service ASA-API
   ```

2. **Check application logs**
   ```powershell
   Get-Content "C:\ASA-API\logs\app.log" -Tail 20
   ```

3. **Test manually**
   ```powershell
   cd C:\ASA-API
   node server.js
   ```

### Configuration Issues

1. **Verify .env file**
   ```powershell
   Get-Content "C:\ASA-API\.env"
   ```

2. **Check file permissions**
   ```powershell
   Get-Acl "C:\ASA-API"
   ```

3. **Test configuration**
   ```powershell
   node -e "console.log(require('dotenv').config())"
   ```

## 📋 Setup Checklist

### Prerequisites
- [ ] Node.js 18+ installed
- [ ] PowerShell Administrator access
- [ ] Repository cloned
- [ ] Dependencies installed

### Configuration
- [ ] Environment file created (.env)
- [ ] JWT secret configured
- [ ] Server paths configured
- [ ] CORS origins set

### Service Installation
- [ ] NSSM service installed
- [ ] Service starts successfully
- [ ] API responds to health check
- [ ] Logs are being written

### Integration
- [ ] Frontend dashboard connects
- [ ] ASA servers accessible
- [ ] RCON commands work
- [ ] Configuration editing works

## 🔄 Maintenance Flow

### Regular Maintenance

1. **Check service status**
   ```powershell
   Get-Service ASA-API
   ```

2. **Review logs**
   ```powershell
   Get-Content "C:\ASA-API\logs\app.log" -Tail 50
   ```

3. **Update if needed**
   ```powershell
   Stop-Service ASA-API
   # Update code
   Start-Service ASA-API
   ```

### Backup and Recovery

1. **Backup configuration**
   ```powershell
   copy "C:\ASA-API\.env" "C:\ASA-API\.env.backup"
   ```

2. **Backup logs**
   ```powershell
   copy "C:\ASA-API\logs" "C:\ASA-API\logs.backup" -Recurse
   ```

3. **Restore if needed**
   ```powershell
   copy "C:\ASA-API\.env.backup" "C:\ASA-API\.env"
   Restart-Service ASA-API
   ```

## 📞 Support

If you encounter issues during setup:

1. Check the troubleshooting section above
2. Review logs in `C:\ASA-API\logs\`
3. Verify all prerequisites are met
4. Ensure PowerShell is run as Administrator
5. Check the main README for additional details 
 