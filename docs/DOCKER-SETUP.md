# 🐳 Docker Setup Guide

This guide shows you how to run the ASA Management Suite using Docker containers, making it extremely easy to set up and manage.

## 🎯 Overview

The ASA Management Suite supports multiple Docker deployment modes:

1. **Development Mode**: Separate containers for frontend and backend with hot reloading
2. **Production Mode**: Single combined container with frontend built into backend
3. **Local Mode**: No Docker, direct Node.js execution (for comparison)

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop**: Latest version installed and running
- **Windows**: For native server support
- **Git**: For cloning the repository

### Option 1: Super Easy Setup (Recommended)

Use the provided startup scripts for the easiest experience:

#### Windows
```cmd
# Show help
start-asa.bat

# Start development mode
start-asa.bat dev

# Start production mode
start-asa.bat prod

# Start local mode (no Docker)
start-asa.bat local

# Stop containers
start-asa.bat stop
```

#### Linux/Mac
```bash
# Make script executable
chmod +x start-asa.sh

# Show help
./start-asa.sh

# Start development mode
./start-asa.sh dev

# Start production mode
./start-asa.sh prod

# Start local mode (no Docker)
./start-asa.sh local

# Stop containers
./start-asa.sh stop
```

### Option 2: Manual Docker Commands

If you prefer manual control:

```bash
# Development mode (separate containers)
docker-compose -f docker-compose.local.yml --profile development up --build -d

# Production mode (single container)
docker-compose -f docker-compose.local.yml --profile production up --build -d

# Stop all containers
docker-compose -f docker-compose.local.yml down
```

## 📋 Deployment Modes

### 🛠️ Development Mode

**Best for**: Development, testing, debugging

**Features**:
- Separate containers for frontend and backend
- Hot reloading enabled
- Live code changes
- Easy debugging
- Development tools included

**Access URLs**:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

**Usage**:
```bash
# Start development mode
./start-asa.sh dev

# View logs
./start-asa.sh logs

# Stop containers
./start-asa.sh stop
```

### 🚀 Production Mode

**Best for**: Production deployment, single-server setup

**Features**:
- Single container deployment
- Frontend built into backend
- Optimized for performance
- Minimal resource usage
- Easy deployment

**Access URL**:
- Everything: `http://localhost:4000`

**Usage**:
```bash
# Start production mode
./start-asa.sh prod

# View logs
./start-asa.sh logs

# Stop containers
./start-asa.sh stop
```

### 🏠 Local Mode

**Best for**: No Docker environments, direct control

**Features**:
- No Docker required
- Direct Node.js execution
- Single server deployment
- Full control over environment

**Access URL**:
- Everything: `http://localhost:4000`

**Usage**:
```bash
# Start local mode
./start-asa.sh local

# Stop: Ctrl+C in terminal
```

## 🔧 Configuration

### Environment Variables

The containers use environment variables for configuration. You can modify them in `docker-compose.local.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=4000
  - HOST=0.0.0.0
  - JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
  - JWT_EXPIRES_IN=24h
  - SERVER_MODE=native  # or 'docker'
  - NATIVE_BASE_PATH=C:\\ARK
  - NATIVE_SERVER_PATH=C:\\ARK\\servers
  - NATIVE_CONFIG_FILE=native-servers.json
  - CORS_ORIGIN=http://localhost:4000
  - LOG_LEVEL=info
```

### Volume Mounts

The containers mount important directories:

```yaml
volumes:
  # Development: Mount source code for hot reloading
  - ./asa-docker-control-api:/app
  
  # Docker socket for container management
  - /var/run/docker.sock:/var/run/docker.sock
  
  # Windows paths for native server management
  - C:\\ARK:C:\\ARK
```

## 📁 Container Architecture

### Development Mode Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │
│   Container     │    │   Container     │
│                 │    │                 │
│ Port: 5173      │◄──►│ Port: 4000      │
│ Hot Reload      │    │ API + Static    │
│ Vite Dev Server │    │ File Server     │
└─────────────────┘    └─────────────────┘
```

### Production Mode Architecture

```
┌─────────────────────────────────┐
│        Combined Container       │
│                                 │
│ Port: 4000                      │
│ ┌─────────────┐ ┌─────────────┐ │
│ │   Backend   │ │  Frontend   │ │
│ │    API      │ │   (Built)   │ │
│ │             │ │             │ │
│ │ Static File │ │ Served by   │ │
│ │   Server    │ │  Backend    │ │
│ └─────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

## 🎮 Usage Workflow

### First Time Setup

1. **Clone Repository**:
   ```bash
   git clone <your-repo-url>
   cd asa-management
   ```

2. **Start in Development Mode**:
   ```bash
   ./start-asa.sh dev
   ```

3. **Access Dashboard**:
   - Open `http://localhost:5173` in your browser
   - Login with your credentials

4. **Initialize System**:
   - Go to "Provisioning" page
   - Install SteamCMD and ASA binaries
   - Create your first cluster

### Daily Usage

1. **Start the System**:
   ```bash
   # Development
   ./start-asa.sh dev
   
   # Production
   ./start-asa.sh prod
   ```

2. **Access Dashboard**:
   - Development: `http://localhost:5173`
   - Production: `http://localhost:4000`

3. **Manage Servers**:
   - Use the web interface
   - Monitor logs and performance
   - Manage configurations

4. **Stop the System**:
   ```bash
   ./start-asa.sh stop
   ```

## 🔄 Development Workflow

### Making Changes

1. **Start Development Mode**:
   ```bash
   ./start-asa.sh dev
   ```

2. **Edit Code**:
   - Frontend changes: Edit files in `asa-servers-dashboard/src/`
   - Backend changes: Edit files in `asa-docker-control-api/`
   - Changes auto-reload in development mode

3. **Test Changes**:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:4000`

4. **Build for Production**:
   ```bash
   # Stop development
   ./start-asa.sh stop
   
   # Start production mode
   ./start-asa.sh prod
   ```

### Debugging

1. **View Logs**:
   ```bash
   ./start-asa.sh logs
   ```

2. **Access Container Shell**:
   ```bash
   # Backend container
   docker exec -it asa-backend sh
   
   # Frontend container
   docker exec -it asa-frontend sh
   ```

3. **Check Container Status**:
   ```bash
   docker ps
   docker-compose -f docker-compose.local.yml ps
   ```

## 🛠️ Troubleshooting

### Common Issues

#### Docker Not Running

**Symptoms**: Script fails with Docker errors
**Solutions**:
1. Start Docker Desktop
2. Wait for Docker to fully start
3. Run `docker info` to verify

#### Port Already in Use

**Symptoms**: Container fails to start
**Solutions**:
1. Check what's using the port: `netstat -ano | findstr :4000`
2. Stop conflicting services
3. Change ports in `docker-compose.local.yml`

#### Build Failures

**Symptoms**: Container build fails
**Solutions**:
1. Check Docker logs: `docker-compose logs`
2. Clear Docker cache: `docker system prune`
3. Rebuild: `docker-compose up --build --force-recreate`

#### Permission Issues

**Symptoms**: Cannot access mounted volumes
**Solutions**:
1. Run as Administrator (Windows)
2. Check file permissions
3. Ensure Docker has access to mounted paths

### Useful Commands

```bash
# View all containers
docker ps -a

# View container logs
docker logs asa-backend
docker logs asa-frontend

# Restart containers
docker-compose -f docker-compose.local.yml restart

# Clean up everything
./start-asa.sh clean

# Check container health
docker-compose -f docker-compose.local.yml ps
```

## 🔒 Security Considerations

### Network Security

- **Default**: Only accessible from localhost
- **LAN Access**: Modify `HOST` and `CORS_ORIGIN` in environment
- **Firewall**: Configure Windows Firewall for external access

### Container Security

- **Non-root**: Containers run as non-root user
- **Read-only**: Production containers use read-only filesystem where possible
- **Secrets**: Use environment variables for sensitive data

### Data Persistence

- **Volumes**: Important data is persisted in Docker volumes
- **Backups**: Regular backups of mounted directories
- **Configuration**: Environment variables for easy configuration

## 📊 Performance

### Resource Usage

**Development Mode**:
- **Memory**: ~300-500MB total
- **CPU**: Low usage (mostly idle)
- **Disk**: ~200MB for containers

**Production Mode**:
- **Memory**: ~150-250MB total
- **CPU**: Low usage (mostly idle)
- **Disk**: ~100MB for container

### Optimization Tips

1. **Use Production Mode**: For better performance
2. **Limit Resources**: Set memory/CPU limits in docker-compose
3. **Regular Cleanup**: Run `./start-asa.sh clean` periodically
4. **Monitor Usage**: Use `docker stats` to monitor resource usage

## 🚀 Production Deployment

### Single Server Deployment

```bash
# Build and start production mode
./start-asa.sh prod

# Set up reverse proxy (optional)
# Configure SSL certificates
# Set up monitoring
```

### Multi-Server Deployment

```bash
# Use Docker Swarm or Kubernetes
# Scale containers as needed
# Set up load balancing
# Configure shared storage
```

## 📚 Additional Resources

- [Local Setup Guide](./asa-docker-control-api/LOCAL-SETUP.md)
- [Server Provisioning Guide](./asa-docker-control-api/SERVER-PROVISIONING.md)
- [Native Server Management](./asa-docker-control-api/NATIVE-SERVERS.md)
- [API Documentation](./asa-docker-control-api/API.md)

## 🆘 Support

If you encounter issues:

1. **Check logs**: `./start-asa.sh logs`
2. **Verify setup**: Ensure all prerequisites are met
3. **Test components**: Verify each mode works independently
4. **Check Docker**: Ensure Docker is running properly
5. **Review configuration**: Check environment variables and paths

The Docker setup provides a complete, containerized solution that's easy to deploy and manage! 
