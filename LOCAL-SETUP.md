# 🏠 Local Setup Guide

This guide shows you how to run the ASA Management Suite entirely on your local machine, with everything served from a single server.

## 🎯 Overview

The ASA Management Suite can run in several modes:

1. **Local Development**: Frontend and backend running separately (for development)
2. **Local Production**: Everything served from a single backend server
3. **Docker Deployment**: Containerized deployment
4. **Remote Hosting**: Frontend and backend on separate servers

This guide focuses on **Local Production** mode where everything runs from one server.

## 🚀 Quick Start (Local Production)

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Latest version
- **Windows**: For native server support
- **Docker**: For Docker server support (optional)

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd asa-management
```

### Step 2: Install Dependencies

```bash
# Install backend dependencies
cd asa-docker-control-api
npm install

# Install frontend dependencies
cd ../asa-servers-dashboard
npm install
```

### Step 3: Build and Setup

```bash
# Go back to backend directory
cd ../asa-docker-control-api

# Build frontend and copy to backend (one command)
npm run build-frontend
```

This command will:
1. Build the frontend React app
2. Copy the built files to the backend's public directory
3. Set up everything for local serving

### Step 4: Configure Environment

Create a `.env` file in the `asa-docker-control-api` directory:

```bash
# Server Configuration
PORT=4000
HOST=0.0.0.0
NODE_ENV=production

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Server Management Mode
SERVER_MODE=native  # or 'docker'

# Native Windows Server Configuration
NATIVE_BASE_PATH=C:\\ARK
# NATIVE_SERVER_PATH is automatically calculated as NATIVE_BASE_PATH/servers
NATIVE_CONFIG_FILE=native-servers.json

# Docker Configuration (if using Docker mode)
DOCKER_SOCKET_PATH=/var/run/docker.sock

# CORS Configuration
CORS_ORIGIN=http://localhost:4000

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log
```

### Step 5: Start the Server

```bash
npm start
```

### Step 6: Access the Dashboard

Open your browser and go to:
```
http://localhost:4000
```

That's it! Everything is now running from a single server.

## 🔧 Development Mode

If you want to develop with hot reloading:

### Option 1: Separate Frontend/Backend (Development)

```bash
# Terminal 1: Start backend
cd asa-docker-control-api
npm run dev

# Terminal 2: Start frontend
cd asa-servers-dashboard
npm run dev
```

Access:
- Backend API: `http://localhost:4000`
- Frontend: `http://localhost:5173`

### Option 2: Combined Development

```bash
# Build frontend and start backend
cd asa-docker-control-api
npm run build-frontend
npm run dev
```

Access everything at: `http://localhost:4000`

## 📁 Directory Structure

After setup, your directory structure will look like:

```
asa-management/
├── asa-docker-control-api/
│   ├── public/                    # Frontend files (copied here)
│   │   ├── index.html
│   │   ├── assets/
│   │   └── ...
│   ├── server.js                  # Main server
│   ├── services/
│   │   ├── static-server.js       # Serves frontend files
│   │   ├── server-provisioner.js  # Server provisioning
│   │   └── ...
│   ├── routes/
│   └── ...
├── asa-servers-dashboard/
│   ├── src/                       # Frontend source code
│   ├── dist/                      # Built frontend (copied to backend)
│   └── ...
└── ...
```

## 🎮 Usage

### First Time Setup

1. **Access Dashboard**: Go to `http://localhost:4000`
2. **Login**: Use default credentials (check your auth configuration)
3. **Initialize System**: Go to "Provisioning" page
4. **Install Components**: Install SteamCMD and ASA binaries
5. **Create Clusters**: Build your server infrastructure

### Daily Usage

1. **Start Server**: `npm start` in backend directory
2. **Access Dashboard**: `http://localhost:4000`
3. **Manage Servers**: Use the web interface
4. **Stop Server**: Ctrl+C in terminal

## 🔄 Updating

### Frontend Updates

When you make changes to the frontend:

```bash
# Rebuild and copy frontend
cd asa-docker-control-api
npm run build-frontend
```

### Backend Updates

```bash
# Restart the server
npm start
```

### Full Update

```bash
# Pull latest changes
git pull

# Reinstall dependencies
npm install
cd ../asa-servers-dashboard && npm install
cd ../asa-docker-control-api

# Rebuild everything
npm run build-frontend
npm start
```

## 🔒 Security Considerations

### Local Network Access

By default, the server only accepts connections from `localhost`. To allow access from other devices on your network:

1. **Change HOST in .env**:
   ```bash
   HOST=0.0.0.0
   ```

2. **Update CORS settings**:
   ```bash
   CORS_ORIGIN=http://your-local-ip:4000
   ```

3. **Configure Firewall**: Allow port 4000 through Windows Firewall

### Authentication

- **Change JWT_SECRET**: Use a strong, unique secret
- **Set up proper users**: Configure authentication properly
- **Use HTTPS**: For production, set up SSL certificates

## 🛠️ Troubleshooting

### Common Issues

#### Frontend Not Loading

**Symptoms**: Dashboard shows blank page or errors
**Solutions**:
1. Check if frontend was built: `ls public/`
2. Rebuild frontend: `npm run build-frontend`
3. Check browser console for errors
4. Verify API endpoints are working

#### Port Already in Use

**Symptoms**: Server fails to start with port error
**Solutions**:
1. Change PORT in .env file
2. Kill process using the port: `netstat -ano | findstr :4000`
3. Use different port: `PORT=4001`

#### Build Errors

**Symptoms**: `npm run build-frontend` fails
**Solutions**:
1. Check Node.js version: `node --version`
2. Clear npm cache: `npm cache clean --force`
3. Reinstall dependencies: `rm -rf node_modules && npm install`
4. Check for TypeScript errors in frontend

#### Permission Errors

**Symptoms**: Cannot create directories or files
**Solutions**:
1. Run as Administrator (Windows)
2. Check file permissions
3. Ensure write access to directories

### Logs

Check logs for debugging:

```bash
# Backend logs
tail -f logs/app.log

# Real-time logs
npm run dev
```

## 🚀 Production Deployment

For production use on a single server:

### 1. Build Everything

```bash
cd asa-docker-control-api
npm run build-frontend
```

### 2. Set Production Environment

```bash
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
```

### 3. Use Process Manager

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name asa-management

# Save PM2 configuration
pm2 save
pm2 startup
```

### 4. Set up Reverse Proxy (Optional)

For better security and SSL:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📊 Performance

### Resource Usage

**Typical resource usage:**
- **Memory**: 100-200MB for backend
- **CPU**: Low usage (mostly idle)
- **Disk**: ~50MB for application + ASA binaries
- **Network**: Minimal (local only)

### Scaling

**For multiple users:**
- **Memory**: 512MB+ recommended
- **CPU**: 2+ cores for multiple servers
- **Storage**: 100GB+ for ASA servers
- **Network**: 1Gbps recommended

## 🎯 Benefits of Local Setup

### Advantages

1. **Single Server**: Everything runs from one machine
2. **No External Dependencies**: Works offline after initial setup
3. **Easy Management**: One process to start/stop
4. **Fast Development**: Quick iteration and testing
5. **Cost Effective**: No hosting fees
6. **Full Control**: Complete control over the system

### Use Cases

- **Home Server**: Personal ARK server management
- **Development**: Local development and testing
- **Small Communities**: Small to medium gaming communities
- **Offline Environments**: Networks without internet access
- **Testing**: Testing server configurations

## 🔄 Migration from Separate Setup

If you're currently running frontend and backend separately:

1. **Stop both servers**
2. **Run setup**: `npm run build-frontend`
3. **Start combined server**: `npm start`
4. **Update bookmarks**: Use `http://localhost:4000`
5. **Remove old processes**: Stop separate frontend/backend

## 📚 Additional Resources

- [Server Provisioning Guide](./SERVER-PROVISIONING.md)
- [Native Server Management](./NATIVE-SERVERS.md)
- [API Documentation](./API.md)
- [Configuration Guide](./CONFIGURATION.md)

## 🆘 Support

If you encounter issues:

1. **Check logs**: Look at application logs
2. **Verify setup**: Ensure all steps were completed
3. **Test components**: Verify each part works independently
4. **Check requirements**: Ensure system meets requirements
5. **Search issues**: Check existing issues and solutions

The local setup provides a complete, self-contained solution for managing your ASA servers without any external dependencies! 
