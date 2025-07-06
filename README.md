# ASA Control API

> 🔗 This is the backend API for the [ASA Dashboard UI](https://github.com/kpinc425/asa-dashboard-ui)

A secure, high-performance Node.js backend API for managing ARK: Survival Ascended (ASA) Docker clusters. Built with Fastify for optimal performance and includes comprehensive monitoring, authentication, and real-time features.

## 🚀 Features

- **Container Management**: Start, stop, restart ASA containers
- **RCON Integration**: Send commands to ASA servers via RCON
- **Config Management**: Read and write ASA configuration files
- **Environment Management**: Edit .env variables and Docker Compose configuration from the frontend
- **ARK Server Management**: Add, edit, and remove ARK servers with mod support
- **Real-time Monitoring**: WebSocket streams for logs and events
- **Authentication**: JWT-based user authentication with role-based access
- **Metrics**: Prometheus-compatible metrics for monitoring
- **Rate Limiting**: Built-in rate limiting for API protection
- **Update Lock Management**: Prevent updates during critical operations

## 📋 Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- Access to Docker socket
- ASA containers running on the same host

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd asa-docker-control-api
```

### 2. Install dependencies
```bash
yarn install
```

### 3. Configure environment
```bash
cp env.example .env
# Edit .env with your configuration
```

### 4. Start the application

#### Development mode:
```bash
yarn dev
```

#### Production mode:
```bash
yarn start
```

#### Using Docker Compose (recommended):
```bash
docker-compose up -d
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | JWT signing secret | `fallback-secret` |
| `DOCKER_SOCKET_PATH` | Docker socket path | `/var/run/docker.sock` |
| `ASA_CONFIG_PATH` | ASA configs directory | `/opt/asa/configs` |
| `RCON_DEFAULT_PORT` | Default RCON port | `32330` |
| `RCON_PASSWORD` | Default RCON password | `admin` |

### Default Users

The system comes with three default users:

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `admin` | `admin123` | Admin | read, write, admin |
| `operator` | `operator123` | Operator | read, write |
| `viewer` | `viewer123` | Viewer | read |

**⚠️ Change these passwords in production!**

## 🔌 API Endpoints

### Authentication

#### POST `/api/auth/login`
Authenticate user and get JWT token.

```json
{
  "username": "admin",
  "password": "admin123"
}
```

#### GET `/api/auth/me`
Get current user information (requires authentication).

### Container Management

#### GET `/api/containers`
List all ASA containers and their status.

#### POST `/api/containers/:name/start`
Start a container.

#### POST `/api/containers/:name/stop`
Stop a container.

#### POST `/api/containers/:name/restart`
Restart a container.

#### GET `/api/containers/:name/logs`
Get container logs (supports WebSocket streaming).

#### GET `/api/containers/:name/stats`
Get container resource usage statistics.

### RCON Commands

#### POST `/api/containers/:name/rcon`
Send RCON command to ASA server.

```json
{
  "command": "SaveWorld",
  "host": "localhost",
  "port": 32330,
  "password": "admin"
}
```

#### GET `/api/containers/:name/server-info`
Get server information via RCON.

#### GET `/api/containers/:name/players`
Get player list via RCON.

#### POST `/api/containers/:name/save-world`
Save the world via RCON.

#### POST `/api/containers/:name/broadcast`
Broadcast message to players.

```json
{
  "message": "Server restarting in 5 minutes!"
}
```

### Configuration Management

#### GET `/api/configs/:map`
Get configuration file contents.

#### PUT `/api/configs/:map`
Update configuration file.

```json
{
  "content": "[ServerSettings]\nServerPassword=MyPassword",
  "file": "GameUserSettings.ini"
}
```

#### GET `/api/lock-status`
Check update lock status.

#### POST `/api/lock-status`
Create update lock.

```json
{
  "reason": "Scheduled maintenance"
}
```

#### DELETE `/api/lock-status`
Remove update lock.

### Environment Management

#### GET `/api/environment`
Get .env file content and parsed variables.

#### PUT `/api/environment`
Update .env file content.

```json
{
  "content": "PORT=4000\nHOST=0.0.0.0\nNODE_ENV=production"
}
```

#### PUT `/api/environment/:key`
Update specific environment variable.

```json
{
  "value": "new-value"
}
```

#### GET `/api/docker-compose`
Get Docker Compose file content.

#### PUT `/api/docker-compose`
Update Docker Compose file content.

#### POST `/api/docker-compose/reload`
Reload Docker Compose configuration (restarts containers).

### ARK Server Management

#### GET `/api/ark-servers`
Get ARK server configurations from Docker Compose.

#### POST `/api/ark-servers`
Add new ARK server to Docker Compose.

```json
{
  "name": "ark-server-theisland",
  "containerName": "asa-server-theisland",
  "image": "ark:latest",
  "gamePort": "7777",
  "rconPort": "32330",
  "serverName": "The Island Server",
  "mapName": "TheIsland",
  "serverPassword": "",
  "adminPassword": "admin123",
  "maxPlayers": "70",
  "mods": ["123456789", "987654321"],
  "additionalArgs": "-servergamelog",
  "dataPath": "./ark-data"
}
```

#### PUT `/api/ark-servers/:name`
Update ARK server configuration.

#### DELETE `/api/ark-servers/:name`
Remove ARK server from Docker Compose.

### Mods Management

#### GET `/api/mods`
Get available mods (placeholder for Steam Workshop integration).

### Real-time Features

#### WebSocket `/api/logs/:container`
Stream container logs in real-time.

#### WebSocket `/api/events`
Stream Docker container events in real-time.

### Monitoring

#### GET `/metrics`
Prometheus-compatible metrics endpoint.

#### GET `/health`
Health check endpoint.

## 🔐 Authentication

All API endpoints (except login) require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Role-based Access Control

- **Admin**: Full access to all features including environment management
- **Operator**: Can manage containers and send RCON commands
- **Viewer**: Read-only access to containers and configs

## 📊 Monitoring

The application includes comprehensive monitoring with Prometheus and Grafana:

### Metrics Available

- Container operations (start, stop, restart)
- RCON command statistics
- API request metrics
- ARK server status
- Resource usage

### Accessing Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **cAdvisor**: http://localhost:8080

## 🐳 Docker Deployment

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f ark-api

# Stop services
docker-compose down
```

### Manual Docker Build

```bash
# Build image
docker build -t asa-control-api .

# Run container
docker run -d \
  --name asa-control-api \
  -p 4000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./logs:/app/logs \
  -v ./asa-configs:/opt/asa/configs \
  asa-control-api
```

## 🔧 Development

### Project Structure

```
asa-docker-control-api/
├── config/          # Configuration management
├── middleware/      # Authentication and metrics middleware
├── metrics/         # Prometheus metrics
├── routes/          # API route handlers
│   ├── auth.js      # Authentication routes
│   ├── containers.js # Container management
│   ├── configs.js   # Configuration management
│   ├── environment.js # Environment management
│   ├── logs.js      # Log streaming
│   └── rcon.js      # RCON commands
├── services/        # Business logic
│   ├── auth.js      # Authentication service
│   ├── config.js    # Configuration service
│   ├── docker.js    # Docker operations
│   ├── environment.js # Environment management
│   ├── rcon.js      # RCON service
│   └── ark-logs.js  # ARK log management
├── utils/           # Utility functions
├── server.js        # Main application entry point
└── docker-compose.yml # Docker Compose configuration
```

### Environment Management Features

The API now includes comprehensive environment management capabilities:

#### .env File Management
- Read and edit .env file content
- Update individual environment variables
- Automatic backup creation before changes
- Validation of environment variable format

#### Docker Compose Management
- Read and edit docker-compose.yml
- Add, edit, and remove ARK server configurations
- Reload Docker Compose configuration
- YAML validation and syntax checking

#### ARK Server Configuration
- Add new ARK servers with full configuration
- Edit existing server settings
- Configure mods for each server
- Set command line arguments
- Manage server ports and passwords

#### Mod Management
- Browse available mods (placeholder for Steam Workshop integration)
- Select mods for individual servers
- Configure mod load order

### Security Features

- Automatic backup creation before file changes
- Role-based access control for environment management
- Input validation and sanitization
- Secure file operations with proper error handling

### Backup System

The environment management system automatically creates backups before making changes:

- Backups are stored in the `backups/` directory
- Timestamped backup files for easy recovery
- Separate backups for .env and docker-compose.yml files

## 🚀 Quick Start

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd asa-docker-control-api
   cp env.example .env
   # Edit .env with your settings
   ```

2. **Start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

3. **Access the API:**
   - API: http://localhost:4000
   - Health check: http://localhost:4000/health
   - Metrics: http://localhost:4000/metrics

4. **Connect frontend:**
   - Update frontend API URL to point to your backend
   - Login with admin/admin123

## 🔒 Security Notes

- Change default passwords in production
- Set a strong JWT_SECRET
- Configure proper CORS origins
- Use HTTPS in production
- Regularly update dependencies
- Monitor logs for suspicious activity

## 📝 License

MIT License - see LICENSE file for details.
