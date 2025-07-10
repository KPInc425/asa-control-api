# ASA Server Management - Quick Setup Guide

This guide will help you get started with the ASA Server Management system quickly.

## 🚀 Quick Start

### Option 1: Interactive Console (Recommended)

1. **Start the Interactive Console**:
   ```powershell
   .\start-interactive-console.ps1
   ```

2. **Follow the Guided Setup**:
   - Choose option 6 to check system status
   - Choose option 7 to install SteamCMD
   - Choose option 8 to install ASA binaries
   - Choose option 1 to create your first cluster

### Option 2: Web Dashboard

1. **Start the Backend**:
   ```powershell
   npm start
   ```

2. **Start the Frontend** (in another terminal):
   ```powershell
   cd ../asa-servers-dashboard
   npm run dev
   ```

3. **Open the Dashboard**:
   - Navigate to `http://localhost:5173`
   - Go to "Server Provisioner"
   - Choose "Advanced Mode"

## 📋 System Requirements

- **Windows 10/11** (for native server support)
- **Node.js 16+** (already installed ✓)
- **4GB RAM minimum** (8GB recommended)
- **10GB free disk space** per server
- **Stable internet connection** for mod downloads

## 🔧 Installation Steps

### Step 1: Check System Status
```powershell
.\start-interactive-console.ps1
# Choose option 6: System Information
```

### Step 2: Configure SteamCMD
```powershell
# In the interactive console
# Choose option 7: Install SteamCMD
```

The system will offer three options:

**Option 1: Use Existing Installation**
- Automatically searches for existing SteamCMD installations
- Common locations: `C:\Steam\steamcmd\`, `C:\Program Files\Steam\steamcmd\`, etc.

**Option 2: Install Automatically**
- Downloads and installs SteamCMD to the same directory as your server root
- Default: `C:\ARK\steamcmd\` (configurable via `NATIVE_BASE_PATH`)
- Requires internet connection

**Option 3: Manual Installation**
- Provides instructions for manual installation
- Allows you to specify a custom path

**Manual Installation** (if automatic fails):
1. Download: https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip
2. Extract to any directory (e.g., `C:\Steam\steamcmd\`)
3. Verify: `steamcmd.exe` exists in the directory
4. Configure the path in the system

### Step 3: Install ASA Binaries
```powershell
# In the interactive console
# Choose option 8: Update ASA Binaries
```

This will download ~10GB of ARK server files.

### Step 4: Create Your First Cluster
```powershell
# In the interactive console
# Choose option 1: Create New Cluster
```

## 🎮 Creating Your First Cluster

### Via Interactive Console

1. **Basic Information**:
   - Cluster name: `MyFirstCluster`
   - Description: `My first ARK cluster`

2. **Map Selection**:
   - Choose maps (e.g., TheIsland, Ragnarok)
   - Set server count per map (1-5)

3. **Mod Selection**:
   - Select popular mods (Structures Plus, etc.)
   - Add custom mods by Steam Workshop ID

4. **Port Configuration**:
   - Base port: `7777` (default)
   - Query port base: `27015` (default)
   - RCON port base: `32330` (default)

5. **Game Settings**:
   - Max players: `70`
   - Difficulty: `1.0`
   - Harvest multiplier: `2.0`
   - Taming speed: `3.0`

6. **Cluster Settings**:
   - Cluster ID: `mycluster`
   - Admin password: `admin123`

### Via Web Dashboard

1. Open the dashboard
2. Navigate to "Server Provisioner"
3. Choose "Advanced Mode"
4. Configure each tab:
   - **Basic Settings**: Cluster name and description
   - **Map Selection**: Check maps and set server counts
   - **Mod Management**: Add global and per-server mods
   - **Server Configuration**: Individual server settings
   - **Port Configuration**: Port allocation
   - **Game Settings**: Game multipliers and options
   - **Cluster Settings**: Cluster metadata

## 🔧 SteamCMD Configuration

### Environment Variables

You can configure SteamCMD behavior using environment variables in your `.env` file:

```bash
# Use existing SteamCMD installation
STEAMCMD_PATH=C:\Steam\steamcmd

# Disable auto-installation
AUTO_INSTALL_STEAMCMD=false

# Custom base path for installations
NATIVE_BASE_PATH=D:\ARK
```

### Common SteamCMD Locations

The system automatically searches these locations:
- `C:\Steam\steamcmd\`
- `C:\Program Files\Steam\steamcmd\`
- `C:\Program Files (x86)\Steam\steamcmd\`
- `%USERPROFILE%\Steam\steamcmd\`
- `%LOCALAPPDATA%\Steam\steamcmd\`

### Web Dashboard Configuration

In the web dashboard, you can:
1. Click "Configure SteamCMD" button
2. Enter a custom path or leave empty for auto-detection
3. Toggle auto-installation on/off
4. Use "Find Existing SteamCMD" to search automatically
5. Save your configuration

## 🛠️ Troubleshooting

### Common Issues

1. **SteamCMD Installation Fails**:
   - Check internet connection
   - Try manual installation
   - Ensure antivirus isn't blocking downloads
   - Try using an existing SteamCMD installation

2. **ASA Binaries Installation Fails**:
   - Ensure SteamCMD is installed first
   - Check disk space (need ~10GB)
   - Verify internet connection

3. **Port Conflicts**:
   - Use port preview in web dashboard
   - Change base ports if needed
   - Check Windows Firewall settings

4. **Mods Not Loading**:
   - Verify Steam Workshop mod IDs
   - Check internet connection
   - Ensure mods are compatible with ASA

### Getting Help

- **System Information**: Use option 6 in interactive console
- **Logs**: Check `C:\ARK\clusters\[cluster-name]\logs\`
- **Configuration**: Check `C:\ARK\clusters\[cluster-name]\cluster.json`

## 📁 File Structure

After setup, your system will have:

```
C:\ARK\                    # Base directory (configurable via NATIVE_BASE_PATH)
├── steamcmd\              # SteamCMD installation (same directory as server root)
├── shared-binaries\       # ASA server files
├── servers\              # Individual server instances
└── clusters\             # Cluster configurations
    └── MyFirstCluster\
        ├── cluster.json  # Cluster configuration
        ├── MyFirstCluster-TheIsland\
        ├── MyFirstCluster-Ragnarok-1\
        └── MyFirstCluster-Ragnarok-2\
```

**Note**: If you configure a different `NATIVE_BASE_PATH` (e.g., `D:\ARK`), SteamCMD will be installed at `D:\ARK\steamcmd\` for consistency.

## 🎯 Next Steps

1. **Create Your First Cluster**: Use the interactive console or web dashboard
2. **Start the Cluster**: Use option 3 in console or dashboard controls
3. **Connect to Your Server**: Use the ARK client to connect
4. **Manage Your Cluster**: Use the dashboard for ongoing management

## 🔗 Useful Links

- **Steam Workshop**: https://steamcommunity.com/workshop/browse/?appid=2430930
- **ARK Wiki**: https://ark.fandom.com/wiki/Server_configuration
- **Popular Mods**: Check the mod management tab in the dashboard

## 📞 Support

If you encounter issues:

1. Check the system information (option 6)
2. Review the troubleshooting section above
3. Check the logs in your cluster directory
4. Verify all system requirements are met

Happy ARK hosting! 🦖 
 