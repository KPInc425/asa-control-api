# Windows Firewall Configuration for ASA API

This guide helps you configure Windows Firewall to allow external connections to the ASA API when hosting frontend and backend on separate servers.

## 🚀 Quick Setup (Automated)

Run the automated script as Administrator:

```powershell
# Run PowerShell as Administrator
.\configure-firewall.ps1
```

## 🔧 Manual Setup

If you prefer to configure firewall rules manually:

### Step 1: Open Windows Defender Firewall

1. Press `Win + R`
2. Type `wf.msc` and press Enter
3. Click "Inbound Rules" in the left panel

### Step 2: Create Port Rule

1. Click "New Rule..." in the right panel
2. Select "Port" and click "Next"
3. Select "TCP" and "Specific local ports"
4. Enter `4000` and click "Next"
5. Select "Allow the connection" and click "Next"
6. Select all profiles (Domain, Private, Public) and click "Next"
7. Name: `ASA-API-Port`, Description: `Allow ASA API on port 4000`
8. Click "Finish"

### Step 3: Create Program Rule

1. Click "New Rule..." again
2. Select "Program" and click "Next"
3. Select "This program path" and enter: `C:\Program Files\nodejs\node.exe`
4. Click "Next"
5. Select "Allow the connection" and click "Next"
6. Select all profiles and click "Next"
7. Name: `ASA-API-NodeJS`, Description: `Allow Node.js for ASA API`
8. Click "Finish"

### Step 4: Create Service Rule

1. Click "New Rule..." again
2. Select "Program" and click "Next"
3. Select "This program path" and enter: `C:\ASA-API\server.js`
4. Click "Next"
5. Select "Allow the connection" and click "Next"
6. Select all profiles and click "Next"
7. Name: `ASA-API-Service`, Description: `Allow ASA API service`
8. Click "Finish"

## 🔍 Verification

### Test Local Connection

```powershell
# Test if port is accessible locally
Test-NetConnection -ComputerName "localhost" -Port 4000

# Test if service is responding
Invoke-WebRequest -Uri "http://localhost:4000/health"
```

### Test Remote Connection

From another machine on the same network:

```powershell
# Replace BACKEND-SERVER-IP with your backend server's IP
Test-NetConnection -ComputerName "BACKEND-SERVER-IP" -Port 4000

# Test API endpoint
Invoke-WebRequest -Uri "http://BACKEND-SERVER-IP:4000/health"
```

### Check Firewall Rules

```powershell
# List all ASA API firewall rules
netsh advfirewall firewall show rule name="ASA-API*"
```

## 🛠️ Troubleshooting

### Common Issues

1. **Service not running**
   ```powershell
   # Check if ASA API service is running
   Get-Service ASA-API
   
   # Start the service if needed
   Start-Service ASA-API
   ```

2. **Wrong port**
   ```powershell
   # Check what port the service is using
   netstat -an | findstr :4000
   ```

3. **Firewall rule not applied**
   ```powershell
   # Remove and recreate rules
   netsh advfirewall firewall delete rule name="ASA-API*"
   # Then run the configure-firewall.ps1 script again
   ```

4. **Network connectivity**
   ```powershell
   # Test basic connectivity
   ping BACKEND-SERVER-IP
   
   # Test specific port
   telnet BACKEND-SERVER-IP 4000
   ```

### Advanced Configuration

If you need more specific firewall rules:

```powershell
# Allow specific IP ranges
netsh advfirewall firewall add rule name="ASA-API-Specific-IPs" dir=in action=allow protocol=TCP localport=4000 remoteip=192.168.1.0/24

# Allow specific source IP
netsh advfirewall firewall add rule name="ASA-API-Frontend-Server" dir=in action=allow protocol=TCP localport=4000 remoteip=FRONTEND-SERVER-IP
```

## 🔒 Security Considerations

1. **Only allow necessary ports** - Only open port 4000, not the entire range
2. **Use specific IP rules** - If possible, restrict to specific source IPs
3. **Monitor connections** - Enable firewall logging to monitor access
4. **Regular updates** - Keep Windows and firewall rules updated

## 📋 Checklist

- [ ] Windows Firewall is configured
- [ ] Port 4000 is open for inbound connections
- [ ] Node.js program is allowed through firewall
- [ ] ASA API service is running
- [ ] Local connection test passes
- [ ] Remote connection test passes
- [ ] Frontend can connect to backend
- [ ] No more 504 Gateway Timeout errors

## 🆘 Getting Help

If you're still having issues:

1. Check the ASA API service logs: `C:\ASA-API\logs\`
2. Check Windows Event Viewer for firewall events
3. Test with a simple HTTP server to isolate the issue
4. Verify network routing between frontend and backend servers 
