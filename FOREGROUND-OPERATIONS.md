# Foreground Operations

This document describes the new foreground operations feature that allows users to watch operations happening in real-time in the terminal when they have direct access to the backend server.

## Overview

The ASA Management System now supports two execution modes:

1. **Background Mode (Default)**: Operations run silently in the background
2. **Foreground Mode**: Operations run with visible progress in the terminal

## When to Use Foreground Mode

Use foreground mode when you:
- Have direct access to the backend server terminal
- Want to monitor the progress of long-running operations
- Need to debug installation issues
- Want to see real-time SteamCMD output

## Supported Operations

The following operations support foreground mode:

### 1. SteamCMD Installation
```javascript
// Backend
await provisioner.installSteamCmd(true); // foreground = true

// Frontend API
await apiService.provisioning.installSteamCmd(true);
```

### 2. ASA Binaries Installation
```javascript
// Backend
await provisioner.installASABinaries(true); // foreground = true

// Frontend API
await apiService.provisioning.installASABinaries(true);
```

### 3. Cluster Creation
```javascript
// Backend
await provisioner.createCluster(clusterConfig, true); // foreground = true

// Frontend API
await apiService.provisioning.createCluster({
  ...clusterConfig,
  foreground: true
});
```

## Frontend Usage

In the cluster creation wizard, users can now choose between:

- **Background Mode (Recommended)**: Normal operation
- **Foreground Mode (Watch Progress)**: Visible terminal output

The option is available in the "Review Configuration" step of the cluster creation wizard.

## Backend Implementation

### New Methods

#### `execForeground(command, options)`
Executes a command with visible output in the terminal:
```javascript
await this.execForeground(`cmd /c "${batPath}"`, {
  cwd: path.dirname(batPath),
  timeout: 300000
});
```

#### Updated Methods
All installation methods now accept a `foreground` parameter:
- `installSteamCmd(foreground = false)`
- `installASABinaries(foreground = false)`
- `createCluster(clusterConfig, foreground = false)`
- `installASABinariesForServerInCluster(clusterName, serverName, foreground = false)`

## API Endpoints

### SteamCMD Installation
```
POST /api/provisioning/install-steamcmd
Body: { "foreground": true }
```

### ASA Binaries Installation
```
POST /api/provisioning/install-asa-binaries
Body: { "foreground": true }
```

### Cluster Creation
```
POST /api/provisioning/clusters
Body: { 
  ...clusterConfig,
  "foreground": true 
}
```

## Testing

Use the test script to see foreground operations in action:

```bash
node test-foreground.js
```

This script demonstrates:
1. SteamCMD installation with visible progress
2. ASA binaries installation with SteamCMD output
3. Cluster creation with server installation progress

## Benefits

1. **Transparency**: Users can see exactly what's happening during installations
2. **Debugging**: Easier to identify and troubleshoot issues
3. **Progress Monitoring**: Real-time feedback on long-running operations
4. **Confidence**: Users know the system is working and not stuck

## Considerations

1. **Terminal Access**: Foreground mode only works when you have direct access to the backend terminal
2. **Output Volume**: SteamCMD can produce a lot of output, which may be overwhelming
3. **Timeout Handling**: Foreground operations still respect timeout limits
4. **Error Visibility**: Errors are more visible and easier to diagnose

## Example Output

When running in foreground mode, you'll see output like:

```
=== Installing SteamCMD ===
Downloading SteamCMD...
=== Extracting SteamCMD ===
[PowerShell extraction output]
=== SteamCMD installed successfully ===

=== Installing ASA Server Binaries ===
This may take several minutes depending on your internet connection...
[SteamCMD download progress]
=== ASA Server Binaries installed successfully ===

=== Creating Cluster: TestCluster ===
=== Installing 2 servers ===
Servers will be installed sequentially to avoid file locks...

--- Installing Server 1/2: TestServer1 ---
Installing ASA binaries for TestServer1...
This may take several minutes depending on your internet connection...
[SteamCMD output for server 1]
--- Server TestServer1 completed ---

--- Installing Server 2/2: TestServer2 ---
Installing ASA binaries for TestServer2...
This may take several minutes depending on your internet connection...
[SteamCMD output for server 2]
--- Server TestServer2 completed ---

=== Cluster TestCluster created successfully with 2 servers ===
```

## Troubleshooting

If foreground operations fail:

1. **Check Terminal Access**: Ensure you have direct access to the backend terminal
2. **Verify Permissions**: Make sure the process has necessary permissions
3. **Check Timeouts**: Long operations may timeout; increase timeout values if needed
4. **Review Logs**: Check the application logs for additional error details

## Future Enhancements

Potential improvements for foreground operations:

1. **Progress Bars**: Add visual progress indicators
2. **Log Streaming**: Stream logs to the frontend in real-time
3. **Operation Cancellation**: Allow users to cancel long-running operations
4. **Detailed Status**: Provide more granular status updates
5. **Resource Monitoring**: Show CPU/memory usage during operations 
