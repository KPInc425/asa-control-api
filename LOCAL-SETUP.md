# ASA API Local Setup Guide

This guide covers setting up the ASA Management API for local development and production use.

## 🏗️ Architecture Overview

The ASA API supports multiple deployment modes:

1. **Windows Service (NSSM)** - Recommended for production
2. **Manual Operation** - For development and testing
3. **Docker Container** - For containerized environments

## 🚀 Windows Service Setup (Recommended)

### Prerequisites
- Windows 10/11
- Node.js 18+
- PowerShell (Administrator access)

### Installation Steps

1. **Clone and prepare:**
   ```powershell
   git clone <repository-url>
   cd asa-docker-control-api
   npm install
   ```

2. **Configure environment:**
   ```powershell
   copy env.example .env
   # Edit .env with your configuration
   ```

3. **Install as Windows service:**
   ```powershell
   # Run as Administrator
   .\install-nssm-service.ps1
   ```

4. **Start the service:**
   ```powershell
   Start-Service ASA-API
   ```

### Service Management

```powershell
# Standard Windows service commands
Start-Service ASA-API
Stop-Service ASA-API
Restart-Service ASA-API
Get-Service ASA-API

# NSSM direct commands
nssm.exe start ASA-API
nssm.exe stop ASA-API
nssm.exe restart ASA-API
nssm.exe remove ASA-API confirm
```

### Service Configuration

The NSSM service is configured with:
- **Working Directory:** `C:\ASA-API`
- **Executable:** `node.exe`
- **Arguments:** `server.js`
- **Startup Type:** Automatic
- **Log Files:** `C:\ASA-API\logs\nssm-*.log`

## 🔧 Manual Operation

### Development Mode

```bash
# Install dependencies
npm install

# Set up environment
copy env.example .env
# Edit .env

# Start development server
npm run dev
```

### Production Mode

```bash
# Install dependencies
npm install

# Set up environment
copy env.example .env
# Edit .env

# Start production server
npm start

# Or with custom port
PORT=4001 npm start
```

## 🐳 Docker Setup

### Using Docker Compose

```bash
# Start with unified compose
docker-compose -f docker-compose.unified.yml up -d

# Check status
docker-compose -f docker-compose.unified.yml ps

# View logs
docker-compose -f docker-compose.unified.yml logs -f
```

### Manual Docker Build

```bash
# Build image
docker build -t asa-api .

# Run container
docker run -d \
  --name asa-api \
  -p 4000:4000 \
  -v /path/to/configs:/app/configs \
  --env-file .env \
  asa-api
```

## ⚙️ Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Server Configuration
PORT=4000
NODE_ENV=production

# Security
JWT_SECRET=your-secure-jwt-secret

# File Paths
CONFIG_BASE_PATH=G:\ARK
LOCK_FILE_PATH=/app/.update.lock

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:4000

# Docker (if using)
DOCKER_SOCKET=/var/run/docker.sock

# Logging
LOG_LEVEL=info
```

### ASA Server Configuration

Configure your ASA servers in the environment:

```bash
# Example ASA server paths
ASA_SERVER_1_PATH=G:\ARK\TheIsland
ASA_SERVER_2_PATH=G:\ARK\Ragnarok
ASA_SERVER_3_PATH=G:\ARK\ClubARK
```

## 🔍 Monitoring and Logs

### Log Locations

- **Service Logs:** `C:\ASA-API\logs\nssm-*.log`
- **Application Logs:** `C:\ASA-API\logs\app.log`
- **Error Logs:** `C:\ASA-API\logs\error.log`

### Health Checks

```bash
# API Health
curl http://localhost:4000/health

# Service Status
Get-Service ASA-API

# Process Check
Get-Process node -ErrorAction SilentlyContinue
```

### Metrics

The API provides Prometheus-compatible metrics at `/metrics`.

## 🛠️ Troubleshooting

### Service Issues

**Service won't start:**
```powershell
# Check NSSM logs
Get-Content "C:\ASA-API\logs\nssm-*.log"

# Verify Node.js
node --version

# Check service config
nssm.exe dump ASA-API

# Reinstall if needed
nssm.exe remove ASA-API confirm
.\install-nssm-service.ps1
```

**Service stops unexpectedly:**
```powershell
# Check application logs
Get-Content "C:\ASA-API\logs\app.log" -Tail 50

# Check for errors
Get-Content "C:\ASA-API\logs\error.log" -Tail 50
```

### API Issues

**API not responding:**
```bash
# Check if running
curl http://localhost:4000/health

# Check logs
tail -f logs/app.log

# Test manually
node server.js
```

**Permission issues:**
```powershell
# Run as Administrator
# Check file permissions
Get-Acl "C:\ASA-API"
```

### Docker Issues

**Container won't start:**
```bash
# Check logs
docker logs asa-api

# Check environment
docker exec asa-api env

# Restart container
docker restart asa-api
```

## 🔄 Development Workflow

### Making Changes

1. **Stop the service:**
   ```powershell
   Stop-Service ASA-API
   ```

2. **Make your changes**

3. **Restart the service:**
   ```powershell
   Start-Service ASA-API
   ```

### Testing Changes

```bash
# Run tests
npm test

# Lint code
npm run lint

# Manual testing
curl http://localhost:4000/health
```

## 📁 Project Structure

```
asa-docker-control-api/
├── install-nssm-service.ps1    # NSSM service installer
├── windows-service/            # Service files
├── routes/                     # API routes
├── services/                   # Business logic
├── middleware/                 # Express middleware
├── config/                     # Configuration
├── utils/                      # Utilities
├── logs/                       # Log files
├── docker-compose.unified.yml  # Docker setup
└── .env                        # Environment config
```

## 🔗 Integration

### Frontend Dashboard

The API is designed to work with the ASA Servers Dashboard:

```bash
# Start dashboard (in separate project)
cd ../asa-servers-dashboard
npm start
```

### External Tools

The API can be integrated with:
- Monitoring tools (Prometheus, Grafana)
- CI/CD pipelines
- Backup systems
- Log aggregation

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs in `C:\ASA-API\logs\`
3. Verify configuration in `.env`
4. Ensure all prerequisites are met 
