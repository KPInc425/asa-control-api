# 🎮 ASA Server Configuration Structure

## 📁 Folder Structure

Your ASA servers are organized in a hierarchical structure:

```
/opt/asa/asa-server/                    # Root directory (ASA_SERVER_ROOT_PATH)
├── server1/                            # Individual server folder
│   └── Config/                         # Config subfolder (ASA_CONFIG_SUB_PATH)
│       └── WindowsServer/              # Windows server config location
│           ├── Game.ini               # Main game configuration
│           └── GameUserSettings.ini   # User settings configuration
├── server2/
│   └── Config/
│       └── WindowsServer/
│           ├── Game.ini
│           └── GameUserSettings.ini
└── server3/
    └── Config/
        └── WindowsServer/
            ├── Game.ini
            └── GameUserSettings.ini
```

## ⚙️ Environment Configuration

Update your `.env` file with these settings:

```env
# ASA Server Configuration
ASA_SERVER_ROOT_PATH=/opt/asa/asa-server
ASA_CONFIG_SUB_PATH=Config/WindowsServer
ASA_UPDATE_LOCK_PATH=/opt/asa/.update.lock

# CORS Configuration (for authentication)
CORS_ORIGIN=https://ark.ilgaming.xyz
PORT=4000
```

## 🔌 API Endpoints

### Server Management

#### List All Servers
```http
GET /api/servers
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "servers": ["server1", "server2", "server3"],
  "count": 3,
  "rootPath": "/opt/asa/asa-server"
}
```

#### Get Server Information
```http
GET /api/servers/{serverName}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "serverName": "server1",
  "serverPath": "/opt/asa/asa-server/server1",
  "configPath": "/opt/asa/asa-server/server1/Config/WindowsServer",
  "configExists": true,
  "configFiles": ["Game.ini", "GameUserSettings.ini"],
  "defaultFiles": ["Game.ini", "GameUserSettings.ini"],
  "hasGameIni": true,
  "hasGameUserSettings": true
}
```

### Configuration Management

#### Get Config File
```http
GET /api/servers/{serverName}/config?file=GameUserSettings.ini
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "content": "[ServerSettings]\nServerPassword=yourpassword\n...",
  "filePath": "/opt/asa/asa-server/server1/Config/WindowsServer/GameUserSettings.ini",
  "fileName": "GameUserSettings.ini",
  "serverName": "server1",
  "configPath": "/opt/asa/asa-server/server1/Config/WindowsServer"
}
```

#### Update Config File
```http
PUT /api/servers/{serverName}/config
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "[ServerSettings]\nServerPassword=newpassword\n...",
  "file": "GameUserSettings.ini"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Config file GameUserSettings.ini updated successfully for server server1",
  "filePath": "/opt/asa/asa-server/server1/Config/WindowsServer/GameUserSettings.ini",
  "fileName": "GameUserSettings.ini",
  "serverName": "server1",
  "configPath": "/opt/asa/asa-server/server1/Config/WindowsServer"
}
```

#### List Config Files for Server
```http
GET /api/servers/{serverName}/config/files
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "files": ["Game.ini", "GameUserSettings.ini"],
  "serverName": "server1",
  "path": "/opt/asa/asa-server/server1/Config/WindowsServer",
  "defaultFiles": ["Game.ini", "GameUserSettings.ini"]
}
```

### INI File Processing

#### Parse INI Content
```http
POST /api/parse-ini
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "[ServerSettings]\nServerPassword=password\n[GameSettings]\nMaxPlayers=70"
}
```

**Response:**
```json
{
  "success": true,
  "parsed": {
    "ServerSettings": {
      "ServerPassword": "password"
    },
    "GameSettings": {
      "MaxPlayers": "70"
    }
  }
}
```

#### Stringify INI Content
```http
POST /api/stringify-ini
Authorization: Bearer <token>
Content-Type: application/json

{
  "parsed": {
    "ServerSettings": {
      "ServerPassword": "newpassword"
    },
    "GameSettings": {
      "MaxPlayers": "70"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "content": "[ServerSettings]\nServerPassword=newpassword\n\n[GameSettings]\nMaxPlayers=70"
}
```

### Update Lock Management

#### Get Lock Status
```http
GET /api/lock-status
Authorization: Bearer <token>
```

#### Create Lock
```http
POST /api/lock-status
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Server maintenance"
}
```

#### Remove Lock
```http
DELETE /api/lock-status
Authorization: Bearer <token>
```

## 🔧 Setup Instructions

### 1. Create Directory Structure

```bash
# Create the root directory
sudo mkdir -p /opt/asa/asa-server

# Create server directories (example)
sudo mkdir -p /opt/asa/asa-server/server1/Config/WindowsServer
sudo mkdir -p /opt/asa/asa-server/server2/Config/WindowsServer
sudo mkdir -p /opt/asa/asa-server/server3/Config/WindowsServer

# Set proper permissions
sudo chown -R $USER:$USER /opt/asa/asa-server
sudo chmod -R 755 /opt/asa/asa-server
```

### 2. Copy Existing Config Files

If you have existing config files, copy them to the new structure:

```bash
# Example: Copy existing configs
sudo cp /path/to/existing/server1/Game.ini /opt/asa/asa-server/server1/Config/WindowsServer/
sudo cp /path/to/existing/server1/GameUserSettings.ini /opt/asa/asa-server/server1/Config/WindowsServer/

sudo cp /path/to/existing/server2/Game.ini /opt/asa/asa-server/server2/Config/WindowsServer/
sudo cp /path/to/existing/server2/GameUserSettings.ini /opt/asa/asa-server/server2/Config/WindowsServer/
```

### 3. Update Environment Variables

```bash
# Edit your .env file
nano .env

# Add/update these lines:
ASA_SERVER_ROOT_PATH=/opt/asa/asa-server
ASA_CONFIG_SUB_PATH=Config/WindowsServer
CORS_ORIGIN=https://ark.ilgaming.xyz
PORT=4000
```

### 4. Restart the API

```bash
# Restart the API with new configuration
docker-compose down
docker-compose up -d
```

## 🧪 Testing the Setup

### Test Server Discovery

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://ark.ilgaming.xyz/api/servers
```

### Test Config Reading

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://ark.ilgaming.xyz/api/servers/server1/config?file=GameUserSettings.ini"
```

### Test Config Writing

```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"[ServerSettings]\nServerPassword=test123","file":"GameUserSettings.ini"}' \
  https://ark.ilgaming.xyz/api/servers/server1/config
```

## 🔍 Troubleshooting

### Common Issues

1. **"Server not found" error**
   - Check that the server folder exists in `/opt/asa/asa-server/`
   - Verify folder permissions

2. **"Config file not found" error**
   - Ensure the config subfolder structure is correct
   - Check that files exist in `Config/WindowsServer/`

3. **Permission denied errors**
   - Set proper ownership: `sudo chown -R $USER:$USER /opt/asa/asa-server`
   - Set proper permissions: `sudo chmod -R 755 /opt/asa/asa-server`

### Debug Commands

```bash
# Check directory structure
ls -la /opt/asa/asa-server/

# Check specific server
ls -la /opt/asa/asa-server/server1/Config/WindowsServer/

# Check API logs
docker-compose logs ark-api

# Test file access
cat /opt/asa/asa-server/server1/Config/WindowsServer/GameUserSettings.ini
```

## 📋 Migration from Old Structure

If you're migrating from the old map-based structure:

1. **Old API calls:**
   ```
   GET /api/configs/mapname
   PUT /api/configs/mapname
   ```

2. **New API calls:**
   ```
   GET /api/servers/servername/config
   PUT /api/servers/servername/config
   ```

3. **Update your frontend code** to use the new endpoints and parameter names (`server` instead of `map`).

## 🎯 Benefits of New Structure

- **Better Organization**: Each server has its own folder
- **Scalability**: Easy to add new servers
- **Flexibility**: Configurable subfolder structure
- **Discovery**: API can automatically find all servers
- **Validation**: Checks for required config files
- **Security**: Prevents directory traversal attacks 
