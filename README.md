# ASA Control API

> 🔗 This is the backend API for the [ASA Dashboard UI](https://github.com/kpinc425/asa-dashboard-ui)

A secure, high-performance Node.js backend API for managing ARK: Survival Ascended (ASA) Docker clusters. Built with Fastify for optimal performance and includes comprehensive monitoring, authentication, and real-time features.

## 🚀 Features

- **Container Management**: Start, stop, restart ASA containers
- **RCON Integration**: Send commands to ASA servers via RCON
- **Config Management**: Read and write ASA configuration files
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

- **Admin**: Full access to all features
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
├── services/        # Business logic services
├── utils/           # Utility functions
├── logs/            # Application logs
├── server.js        # Main application entry point
└── docker-compose.yml
```

### Running Tests

```bash
# Install dev dependencies
yarn install

# Run tests (when implemented)
yarn test
```

### Code Style

The project follows ESLint and Prettier configurations. Run:

```bash
yarn lint
yarn format
```

## 🚨 Security Considerations

1. **Change default passwords** immediately after installation
2. **Use strong JWT secrets** in production
3. **Configure proper CORS** origins
4. **Enable HTTPS** in production
5. **Restrict Docker socket access** to necessary users
6. **Monitor API usage** for suspicious activity

## 📝 Logging

Logs are written to:
- Console (development)
- `logs/combined.log` (all levels)
- `logs/error.log` (errors only)

Log levels: `error`, `warn`, `info`, `debug`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

## 🔄 Changelog

### v1.0.0
- Initial release
- Container management
- RCON integration
- Configuration management
- Authentication system
- Monitoring integration
- WebSocket support
