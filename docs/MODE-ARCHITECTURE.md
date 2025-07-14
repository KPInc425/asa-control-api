# ASA Management Suite - Deployment Modes

## Overview

The ASA Management Suite supports three distinct deployment modes to accommodate different hosting environments and requirements. Each mode maintains backward compatibility while providing specific functionality.

## Mode 1: Docker Mode (Legacy) 🐳

**Purpose**: Traditional containerized deployment for Linux environments

**Configuration**: `SERVER_MODE=docker`

**Architecture**:
- API runs in Docker container
- ASA servers run in Docker containers
- All communication via Docker socket
- Designed for Linux hosts

**Features**:
- ✅ Full container management
- ✅ Cluster support via Docker Compose
- ✅ Automatic server provisioning
- ✅ Container health monitoring
- ✅ Log streaming from containers

**Environment Variables**:
```bash
SERVER_MODE=docker
DOCKER_SOCKET_PATH=/var/run/docker.sock  # Linux
# or
DOCKER_SOCKET_PATH=\\\\.\\pipe\\docker_engine  # Windows
```

**Use Case**: Production Linux servers, cloud deployments, containerized environments

---

## Mode 2: Native Mode (Current Focus) 🖥️

**Purpose**: Windows-native deployment with direct server management

**Configuration**: `SERVER_MODE=native`

**Architecture**:
- API runs as Windows service or standalone process
- ASA servers run natively on Windows
- Direct PowerShell management
- No Docker dependency for servers

**Features**:
- ✅ Native Windows server management
- ✅ PowerShell-based server control
- ✅ Direct file system access
- ✅ Cluster configuration support
- ✅ Manual server start/stop instructions
- ✅ Process monitoring via PowerShell

**Environment Variables**:
```bash
SERVER_MODE=native
NATIVE_BASE_PATH=C:\\ARK
NATIVE_CLUSTERS_PATH=C:\\ARK\\clusters
POWERSHELL_ENABLED=true
```

**Use Case**: Windows gaming servers, dedicated hardware, environments where Docker is not available

---

## Mode 3: Hybrid Mode (Future) 🔄

**Purpose**: API in container + native servers via agent communication

**Configuration**: `SERVER_MODE=hybrid`

**Architecture**:
- API runs in Docker container
- ASA servers run natively on Windows
- Windows Agent service for communication
- Best of both worlds

**Features**:
- ✅ Containerized API (easy deployment)
- ✅ Native server performance
- ✅ Agent-based communication
- ✅ Automatic server management
- ✅ Real-time status monitoring

**Environment Variables**:
```bash
SERVER_MODE=hybrid
AGENT_ENABLED=true
AGENT_URL=http://host.docker.internal:5000
DOCKER_SOCKET_PATH=\\\\.\\pipe\\docker_engine
```

**Use Case**: Future deployment model, mixed environments, containerized management with native performance

---

## Backward Compatibility

### Configuration Migration

**From Docker Mode to Native Mode**:
1. Set `SERVER_MODE=native`
2. Configure `NATIVE_BASE_PATH`
3. Move cluster configurations to Windows paths
4. Update any Docker-specific configurations

**From Native Mode to Hybrid Mode** (when available):
1. Set `SERVER_MODE=hybrid`
2. Enable `AGENT_ENABLED=true`
3. Install Windows Agent service
4. Configure agent communication

### API Endpoints

All modes use the same API endpoints for consistency:
- `/api/containers` - Lists servers (Docker containers or native processes)
- `/api/ark-servers` - ASA-specific server information
- `/api/native-servers` - Native server management
- `/api/provisioning/*` - Cluster management

### Frontend Compatibility

The dashboard automatically adapts to the current mode:
- **Docker Mode**: Shows container management interface
- **Native Mode**: Shows native server management interface
- **Hybrid Mode**: Shows combined interface (when implemented)

---

## Mode Selection Guide

### Choose Docker Mode When:
- Running on Linux servers
- Need container isolation
- Want automated provisioning
- Have existing Docker infrastructure

### Choose Native Mode When:
- Running on Windows servers
- Need maximum performance
- Don't want Docker dependency
- Have existing Windows server setup

### Choose Hybrid Mode When:
- Want containerized API management
- Need native server performance
- Have mixed infrastructure
- Want future-proof architecture

---

## Current Status

- ✅ **Docker Mode**: Fully implemented and stable
- ✅ **Native Mode**: Implemented, being tested and refined
- 🔄 **Hybrid Mode**: Architecture designed, implementation pending

---

## Configuration Examples

### Docker Mode (.env)
```bash
SERVER_MODE=docker
DOCKER_SOCKET_PATH=/var/run/docker.sock
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000
```

### Native Mode (.env)
```bash
SERVER_MODE=native
NATIVE_BASE_PATH=C:\\ARK
NATIVE_CLUSTERS_PATH=C:\\ARK\\clusters
POWERSHELL_ENABLED=true
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000
```

### Hybrid Mode (.env) - Future
```bash
SERVER_MODE=hybrid
AGENT_ENABLED=true
AGENT_URL=http://host.docker.internal:5000
DOCKER_SOCKET_PATH=\\\\.\\pipe\\docker_engine
NATIVE_BASE_PATH=C:\\ARK
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4000
```

---

## Troubleshooting

### Common Issues

**Docker Socket Errors**:
- Windows: Use `\\\\.\\pipe\\docker_engine`
- Linux: Use `/var/run/docker.sock`
- Ensure Docker Desktop is running

**Native Mode Path Issues**:
- Use Windows paths: `C:\\ARK\\clusters`
- Ensure directories exist
- Check PowerShell permissions

**CORS Issues**:
- Include all frontend URLs in `CORS_ORIGIN`
- Restart API after configuration changes

### Mode-Specific Debugging

**Docker Mode**:
```bash
docker ps  # Check containers
docker logs <container>  # Check logs
```

**Native Mode**:
```powershell
Get-Process -Name "ArkAscendedServer"  # Check server processes
Test-Path "C:\ARK\clusters"  # Check paths
```

**Hybrid Mode**:
```bash
# Check agent service
Get-Service "ASA-Agent"
# Check API container
docker ps | grep asa-api
``` 
