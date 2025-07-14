# Environment Management Features

## Overview

This implementation adds comprehensive environment management capabilities to the ASA Control API and Dashboard, allowing you to manage environment variables and Docker Compose configurations directly from the frontend without needing to SSH into the backend server.

## 🎯 Key Features Implemented

### 1. Environment Variables Management
- **Read .env file**: View all environment variables in a structured format
- **Edit .env file**: Full-text editor with syntax highlighting
- **Update individual variables**: Change specific environment variables
- **Automatic backups**: Creates timestamped backups before any changes
- **Validation**: Ensures proper environment variable format

### 2. Docker Compose Management
- **Read docker-compose.yml**: View the complete Docker Compose configuration
- **Edit docker-compose.yml**: Full-text editor with YAML syntax highlighting
- **Reload configuration**: Restart all containers with new configuration
- **YAML validation**: Basic syntax checking to prevent errors

### 3. ARK Server Management
- **Add new servers**: Create new ARK server configurations with full setup
- **Edit existing servers**: Modify server settings, ports, passwords, etc.
- **Remove servers**: Delete server configurations from Docker Compose
- **Mod support**: Configure mods for individual servers
- **Command line arguments**: Set additional server startup arguments

### 4. Mod Management
- **Browse mods**: View available mods (placeholder for Steam Workshop integration)
- **Select mods**: Choose which mods to enable for each server
- **Mod configuration**: Set mod load order and parameters

## 🔧 Backend Implementation

### New Files Created

#### `services/environment.js`
- Core service for environment management
- Handles .env file reading/writing
- Manages Docker Compose file operations
- Extracts and manages ARK server configurations
- Implements backup system
- Provides validation and error handling

#### `routes/environment.js`
- REST API endpoints for environment management
- Role-based access control (Admin only for write operations)
- Comprehensive request/response validation
- Error handling and logging

### API Endpoints Added

```
GET    /api/environment              # Get .env file content
PUT    /api/environment              # Update .env file
PUT    /api/environment/:key         # Update specific variable
GET    /api/docker-compose           # Get Docker Compose content
PUT    /api/docker-compose           # Update Docker Compose
POST   /api/docker-compose/reload    # Reload configuration
GET    /api/ark-servers              # Get ARK server configs
POST   /api/ark-servers              # Add new ARK server
PUT    /api/ark-servers/:name        # Update ARK server
DELETE /api/ark-servers/:name        # Remove ARK server
GET    /api/mods                     # Get available mods
```

### Security Features

- **Role-based access**: Only admin users can modify environment files
- **Automatic backups**: Creates backups before any file changes
- **Input validation**: Validates environment variable and YAML syntax
- **Error handling**: Comprehensive error handling and logging
- **File permissions**: Secure file operations

## 🎨 Frontend Implementation

### New Components Created

#### `EnvironmentEditor.tsx`
- Main environment management interface
- Tabbed interface for different configuration types
- Monaco Editor integration for syntax highlighting
- Real-time change detection
- Save/reset functionality

#### `ArkServerEditor.tsx`
- Modal dialog for adding/editing ARK servers
- Form-based configuration with validation
- Mod selection interface
- Map selection dropdown
- Port and password management

### Features

- **Tabbed Interface**: Separate tabs for Environment Variables, Docker Compose, and ARK Servers
- **Syntax Highlighting**: Monaco Editor with language-specific highlighting
- **Change Detection**: Tracks unsaved changes and warns before navigation
- **Modal Dialogs**: Clean interface for server configuration
- **Form Validation**: Client-side validation for all inputs
- **Loading States**: Proper loading indicators and error handling

### API Integration

#### `services/api.ts` - New Methods Added
```typescript
// Environment Management
getEnvironmentFile(): Promise<EnvironmentFile>
updateEnvironmentFile(content: string): Promise<UpdateResult>
updateEnvironmentVariable(key: string, value: string): Promise<UpdateResult>

// Docker Compose Management
getDockerComposeFile(): Promise<DockerComposeFile>
updateDockerComposeFile(content: string): Promise<UpdateResult>
reloadDockerCompose(): Promise<ReloadResult>

// ARK Server Management
getArkServerConfigs(): Promise<ArkServerConfigs>
addArkServer(config: ServerConfig): Promise<UpdateResult>
updateArkServer(name: string, config: ServerConfig): Promise<UpdateResult>
removeArkServer(name: string): Promise<UpdateResult>

// Mods Management
getMods(): Promise<ModsResponse>
```

## 🚀 Usage Examples

### 1. Editing Environment Variables

1. Navigate to **Environment** tab in the dashboard
2. Select **Environment Variables** tab
3. Edit variables in the Monaco Editor
4. Click **Save Changes** to apply

### 2. Adding a New ARK Server

1. Navigate to **Environment** tab
2. Select **ARK Servers** tab
3. Click **Add New Server**
4. Fill in server configuration:
   - Server name and container name
   - Map selection (The Island, Scorched Earth, etc.)
   - Port configuration (game port, RCON port)
   - Server settings (password, admin password, max players)
   - Mod selection (check desired mods)
   - Additional arguments
5. Click **Add Server** to save

### 3. Editing Docker Compose

1. Navigate to **Environment** tab
2. Select **Docker Compose** tab
3. Edit the YAML configuration directly
4. Click **Save Changes** to update
5. Optionally click **Reload Docker Compose** to restart containers

### 4. Managing Mods

1. In the ARK Server Editor, scroll to the **Mods** section
2. Browse available mods with descriptions
3. Check/uncheck mods to enable/disable them
4. Mods will be automatically configured in the server startup

## 🔒 Security Considerations

### Access Control
- Environment management requires **Admin** role
- Read operations available to all authenticated users
- Write operations restricted to admin users only

### Backup System
- Automatic backups created before any file changes
- Backups stored in `backups/` directory with timestamps
- Separate backups for .env and docker-compose.yml files
- Easy recovery in case of configuration errors

### Validation
- Environment variable format validation
- Basic YAML syntax checking
- Input sanitization and validation
- Error handling for malformed configurations

## 🧪 Testing

### Backend Testing
Run the test script to verify functionality:
```bash
cd asa-docker-control-api
node test-environment.js
```

### Frontend Testing
The frontend includes mock data for testing without a backend:
1. Set `VITE_FRONTEND_ONLY=true` in `.env`
2. Navigate to Environment tab
3. Test all features with mock data

## 📋 Configuration Examples

### Environment Variables
```env
# Server Configuration
PORT=4000
HOST=0.0.0.0
NODE_ENV=production

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Docker Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock

# ASA Server Configuration
ASA_SERVER_ROOT_PATH=/opt/asa/asa-server
ASA_CONFIG_SUB_PATH=Config/WindowsServer
```

### ARK Server Configuration
```yaml
ark-server-theisland:
  container_name: asa-server-theisland
  image: ark:latest
  ports:
    - "7777:7777"
    - "32330:32330"
  environment:
    - SERVER_NAME=The Island Server
    - MAP_NAME=TheIsland
    - SERVER_PASSWORD=
    - ADMIN_PASSWORD=admin123
    - MAX_PLAYERS=70
    - MODS=123456789,987654321
    - ADDITIONAL_ARGS=-servergamelog
  volumes:
    - ./ark-data/theisland:/ark
  restart: unless-stopped
  networks:
    - ark-network
```

## 🔄 Future Enhancements

### Planned Features
1. **Steam Workshop Integration**: Real mod browsing and installation
2. **Configuration Templates**: Pre-built server configurations
3. **Bulk Operations**: Manage multiple servers at once
4. **Configuration Validation**: Advanced validation rules
5. **Rollback System**: Easy rollback to previous configurations
6. **Scheduled Updates**: Automatic configuration updates
7. **Configuration Export/Import**: Backup and restore configurations

### Integration Opportunities
1. **Steam API**: Real-time mod information and updates
2. **Docker Registry**: Custom ARK server images
3. **Monitoring**: Integration with existing Prometheus/Grafana
4. **Notifications**: Alert system for configuration changes
5. **Audit Logging**: Track all configuration changes

## 🎉 Benefits

### For Server Administrators
- **No SSH Required**: Manage everything from the web interface
- **Visual Configuration**: Intuitive interface for complex configurations
- **Safe Operations**: Automatic backups and validation
- **Real-time Updates**: Immediate application of changes
- **Mod Management**: Easy mod configuration and updates

### For Development
- **Rapid Deployment**: Quick server setup and configuration
- **Consistent Environments**: Standardized configuration management
- **Version Control**: Track configuration changes over time
- **Testing**: Easy environment switching for testing

### For Operations
- **Reduced Downtime**: Quick configuration updates
- **Error Prevention**: Validation and backup systems
- **Monitoring Integration**: Full visibility into configuration state
- **Scalability**: Easy addition of new servers

## 📞 Support

For issues or questions about the environment management features:

1. Check the API documentation in the README
2. Review the test script for usage examples
3. Check the browser console for frontend errors
4. Review server logs for backend issues
5. Use the backup system to recover from configuration errors

The environment management system provides a powerful, secure, and user-friendly way to manage your ARK server infrastructure without requiring direct server access. 