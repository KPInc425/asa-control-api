# ASA Server Management - Setup Flow

## 🎯 **Simple User Journey**

### **For New Users (Recommended)**

```
1. Clone Repository
   ↓
2. Run Setup Script
   PowerShell: .\setup-asa.ps1
   CMD: setup-asa.bat
   ↓
3. Answer Questions
   - Base path (e.g., G:\ARK)
   - Server mode (native/docker)
   - SteamCMD setup
   ↓
4. System Configures Everything
   - Creates .env file
   - Installs dependencies
   - Sets up directories
   - Installs SteamCMD
   - Downloads ASA binaries
   - Starts backend API
   ↓
5. Launch Interactive Console
   - Create ASA server clusters
   - Configure maps and mods
   - Start/stop servers
   ↓
6. Access Web Dashboard
   - Manage servers via web UI
   - Monitor performance
   - Edit configurations
```

### **For Advanced Users**

```
1. Manual Configuration
   cp env.example .env
   # Edit .env manually
   ↓
2. Install Dependencies
   npm install
   ↓
3. Start Backend
   npm start
   ↓
4. Use Interactive Console
   node scripts/interactive-console.js
```

## 📋 **What Each Component Does**

### **setup-asa.ps1** (PowerShell Setup Script)
- **Purpose**: Complete setup wizard for new users (PowerShell version)
- **What it does**:
  - Configures environment variables
  - Installs npm dependencies
  - Creates directory structure
  - Sets up SteamCMD
  - Downloads ASA binaries
  - Starts the backend API
  - Launches interactive console

### **setup-asa.bat** (Batch Setup Script)
- **Purpose**: Complete setup wizard for new users (Command Prompt version)
- **What it does**:
  - Same functionality as PowerShell version
  - Compatible with older Windows systems
  - Works without PowerShell execution policy restrictions

### **interactive-console.js** (Management Console)
- **Purpose**: Command-line interface for server management
- **What it does**:
  - Create ASA server clusters
  - Install SteamCMD and ASA binaries
  - Start/stop/delete clusters
  - View system information
  - Configure environment settings

### **server.js** (Backend API)
- **Purpose**: REST API for web dashboard and automation
- **What it does**:
  - Container management (Docker mode)
  - Native server management
  - RCON communication
  - Configuration file editing
  - Log streaming
  - Authentication

### **Web Dashboard** (Frontend)
- **Purpose**: User-friendly web interface
- **What it does**:
  - Visual server management
  - Real-time monitoring
  - Configuration editing
  - Log viewing
  - Cluster creation

## 🔧 **Environment Modes**

### **Native Mode** (Recommended for Windows)
- Runs ASA servers directly on Windows
- Better performance and direct file access
- Easier debugging and troubleshooting
- No Docker required

### **Docker Mode** (Advanced)
- Runs ASA servers in Docker containers
- Isolated environment
- Consistent deployment
- Requires Docker Desktop

## 🚀 **Quick Start Commands**

| Task | Command | Description |
|------|---------|-------------|
| **Complete Setup (PowerShell)** | `.\setup-asa.ps1` | Full setup for new users |
| **Complete Setup (CMD)** | `setup-asa.bat` | Full setup for new users (CMD) |
| **Start Backend** | `npm start` | Start API server |
| **Interactive Console** | `node scripts/interactive-console.js` | Command-line management |
| **Docker Mode** | `docker compose up -d` | Start with Docker |
| **Development** | `npm run dev` | Start with hot reload |
| **Help (PowerShell)** | `.\setup-asa.ps1 -Help` | Show setup options |

## 📁 **Directory Structure After Setup**

```
G:\ARK\ (or your chosen path)
├── steamcmd\           # SteamCMD installation
├── binaries\           # ASA server files
├── servers\            # Individual server instances
├── clusters\           # Server cluster configurations
├── logs\               # Server and application logs
└── backups\            # Configuration backups
```

## ⚙️ **Configuration Files**

### **.env** (Main Configuration)
```bash
# Server Configuration
SERVER_MODE=native
NATIVE_BASE_PATH=G:\ARK
PORT=3000

# SteamCMD Configuration
STEAMCMD_PATH=
AUTO_INSTALL_STEAMCMD=true

# Authentication
JWT_SECRET=your-secret-key
```

### **docker-compose.yml** (Docker Configuration)
- Maps environment variables to containers
- Sets up monitoring stack (Prometheus, Grafana)
- Configures volume mounts

## 🎮 **Creating Your First Cluster**

1. **Run Setup**: `.\setup-asa.ps1`
2. **Launch Console**: Choose "Y" when prompted
3. **Create Cluster**: Select option 1 in console
4. **Configure**:
   - Choose maps (TheIsland, ScorchedEarth, etc.)
   - Set server settings (players, difficulty, etc.)
   - Add mods (optional)
   - Configure ports
5. **Start Cluster**: Choose to start immediately
6. **Access Server**: Connect via ARK client

## 🔍 **Troubleshooting**

### **Common Issues**
- **Node.js not found**: Install Node.js 18+ from https://nodejs.org/
- **Permission errors**: Run PowerShell as Administrator
- **Port conflicts**: Change PORT in .env file
- **Docker not running**: Start Docker Desktop

### **Getting Help**
- **Documentation**: README.md, QUICK-SETUP.md
- **Interactive Console**: Built-in help and system info
- **Logs**: Check logs/ directory for error details

---

**Result**: A simple, clear setup process that gets users from zero to running ASA servers in minutes! 
 