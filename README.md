# ASA Management API

A Node.js backend API for managing ARK: Survival Ascended servers, providing container management, RCON control, configuration editing, and log streaming capabilities.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Windows (for NSSM service installation)
- Docker (optional, for container management)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd asa-docker-control-api
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   copy env.example .env
   # Edit .env with your configuration
   ```

4. **Install as Windows Service (Recommended):**
   ```powershell
   # Option A: Double-click to install (easiest)
   install-service.bat
   
   # Option B: Run PowerShell script (auto-elevates)
   .\install-nssm-service.ps1
   ```

5. **Or run manually:**
   ```bash
   npm start
   ```

## 🔧 Service Installation

### Windows Service (NSSM)

The recommended approach is to install the API as a Windows service using NSSM (Non-Sucking Service Manager).

**Installation:**
```powershell
# Option A: Double-click to install (easiest)
install-service.bat

# Option B: Run PowerShell script (auto-elevates)
.\install-nssm-service.ps1
```

Both methods will automatically request Administrator privileges when needed.

**Service Control:**
```powershell
# Start the service
Start-Service ASA-API

# Stop the service  
Stop-Service ASA-API

# Check status
Get-Service ASA-API

# Restart
Restart-Service ASA-API
```

**NSSM Commands:**
```powershell
# Direct NSSM control
nssm.exe start ASA-API
nssm.exe stop ASA-API
nssm.exe restart ASA-API
nssm.exe remove ASA-API confirm
```

### Manual Operation

For development or testing, you can run the API manually:

```bash
# Development mode
npm run dev

# Production mode
npm start

# With custom port
PORT=4001 npm start
```

## 📡 API Endpoints

### Health Check
- `GET /health` - Service health status

### Container Management
- `GET /api/containers` - List Docker containers
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `POST /api/containers/:id/restart` - Restart container

### RCON Control
- `POST /api/rcon/:server` - Send RCON command
- `GET /api/rcon/:server/status` - Get server status

### Configuration Management
- `GET /api/configs/:map` - Get server configuration
- `PUT /api/configs/:map` - Update server configuration

### Native Server Management
- `GET /api/native-servers` - List native servers
- `POST /api/native-servers/:server/start` - Start native server
- `POST /api/native-servers/:server/stop` - Stop native server

### Logs
- `GET /api/logs/:server` - Get server logs
- `GET /api/logs/:server/stream` - Stream server logs (WebSocket)

## 🔐 Authentication

The API uses JWT-based authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 🌐 CORS Configuration

CORS is configured to allow requests from:
- `http://localhost:3000` (React dev server)
- `http://localhost:5173` (Vite dev server)
- `http://localhost:4000` (API server)
- `http://localhost:4010` (Dashboard)

## 📁 Project Structure

```
asa-docker-control-api/
├── install-nssm-service.ps1    # NSSM service installer
├── windows-service/            # Service-related files
│   └── asa-api-service-direct.bat
├── routes/                     # API route handlers
├── services/                   # Business logic
├── middleware/                 # Express middleware
├── config/                     # Configuration files
├── utils/                      # Utility functions
├── logs/                       # Application logs
├── docker-compose.unified.yml  # Unified Docker setup
├── docker-compose.env          # Docker environment
└── start-asa-suite.ps1        # Suite startup script
```

## 🐳 Docker Support

The API can run in Docker containers and manage other Docker containers:

```bash
# Build and run with Docker
docker-compose -f docker-compose.unified.yml up -d
```

## 🔍 Monitoring

The API includes built-in monitoring and metrics:

- Health check endpoint: `/health`
- Metrics endpoint: `/metrics` (Prometheus format)
- Structured logging with Winston

## 📝 Logging

Logs are written to:
- `logs/app.log` - Application logs
- `logs/nssm-out.log` - NSSM stdout (when running as service)
- `logs/nssm-err.log` - NSSM stderr (when running as service)

## 🛠️ Development

### Environment Variables

Key environment variables (see `env.example`):

```bash
PORT=4000                    # API port
JWT_SECRET=your-secret       # JWT signing secret
DOCKER_SOCKET=/var/run/docker.sock  # Docker socket path
CONFIG_BASE_PATH=/path/to/configs   # Config files path
CORS_ORIGINS=http://localhost:3000  # Allowed CORS origins
```

### Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server
npm test           # Run tests
npm run lint       # Run linting
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Service Issues

If the Windows service fails to start:

1. **Check NSSM logs:**
   ```powershell
   Get-Content "C:\ASA-API\logs\nssm-*.log"
   ```

2. **Verify Node.js installation:**
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

### API Issues

1. **Check application logs:**
   ```bash
   tail -f logs/app.log
   ```

2. **Verify environment configuration:**
   ```bash
   node -e "console.log(require('dotenv').config())"
   ```

3. **Test API endpoints:**
   ```bash
   curl http://localhost:4000/health
   ```

## 🔗 Related Projects

- [ASA Servers Dashboard](https://github.com/your-org/asa-servers-dashboard) - React frontend for ASA management
