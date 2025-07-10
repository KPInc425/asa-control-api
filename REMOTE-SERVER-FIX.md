# 🔧 Remote Server Issues - Quick Fix Guide

## 🚨 Current Issues
1. **DNS Resolution Failed**: `Could not resolve host: ark.ilgaming.xyz`
2. **Web Server Error**: "Web server is returning an unknown error"

## 🚀 Immediate Solutions

### Step 1: Upload Files to Remote Server

First, upload these files to your remote server:
```bash
# On your local machine, upload the project
scp -r . steam@your-server-ip:/home/steam/asa-docker-control-api/
```

### Step 2: SSH into Remote Server
```bash
ssh steam@your-server-ip
cd /home/steam/asa-docker-control-api
```

### Step 3: Run Quick Fix Script
```bash
# Make scripts executable
chmod +x *.sh

# Run the quick fix script
./quick-fix.sh
```

### Step 4: If Quick Fix Doesn't Work - Full Deployment
```bash
# Run the full deployment script (as root)
sudo ./deploy-remote.sh
```

## 🔍 Manual Troubleshooting

### Check 1: DNS Resolution
```bash
# Test DNS resolution
nslookup ark.ilgaming.xyz

# If this fails, check your domain settings:
# 1. Go to your domain registrar (GoDaddy, Namecheap, etc.)
# 2. Find DNS settings for ilgaming.xyz
# 3. Add/update A record:
#    Name: ark
#    Value: YOUR_SERVER_IP
#    TTL: 300 (or default)
```

### Check 2: Docker Containers
```bash
# Check if containers are running
docker compose ps

# If not running, start them:
docker compose up -d

# Check logs if there are issues:
docker compose logs ark-api
```

### Check 3: Nginx Configuration
```bash
# Check if nginx is installed and running
systemctl status nginx

# If not installed:
sudo apt update
sudo apt install nginx -y

# Copy the nginx configuration:
sudo cp nginx-ark.ilgaming.xyz.conf /etc/nginx/sites-available/ark.ilgaming.xyz
sudo ln -s /etc/nginx/sites-available/ark.ilgaming.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Check 4: SSL Certificate
```bash
# Install certbot if not installed:
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate:
sudo certbot --nginx -d ark.ilgaming.xyz

# Check certificate status:
sudo certbot certificates
```

### Check 5: Firewall
```bash
# Check firewall status:
sudo ufw status

# If firewall is blocking, allow necessary ports:
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
```

## 🎯 Step-by-Step Fix for Your Issues

### Issue 1: DNS Resolution Failed

**Problem**: `Could not resolve host: ark.ilgaming.xyz`

**Solution**:
1. **Check your domain DNS settings**:
   ```bash
   # On your local machine, check what IP the domain resolves to:
   nslookup ark.ilgaming.xyz
   ```

2. **If it doesn't resolve, configure DNS**:
   - Log into your domain registrar (where you bought ilgaming.xyz)
   - Go to DNS management
   - Add an A record:
     - **Name**: `ark`
     - **Value**: Your server's public IP address
     - **TTL**: 300 seconds
   - Wait 5-10 minutes for DNS propagation

3. **Test DNS propagation**:
   ```bash
   # Test from multiple locations
   nslookup ark.ilgaming.xyz
   dig ark.ilgaming.xyz
   ```

### Issue 2: Web Server Unknown Error

**Problem**: "Web server is returning an unknown error"

**Solution**:
1. **Check if nginx is running**:
   ```bash
   sudo systemctl status nginx
   ```

2. **Check nginx configuration**:
   ```bash
   sudo nginx -t
   ```

3. **Check nginx error logs**:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   sudo tail -f /var/log/nginx/ark.ilgaming.xyz.error.log
   ```

4. **If nginx isn't configured, set it up**:
   ```bash
   # Copy the provided nginx config
   sudo cp nginx-ark.ilgaming.xyz.conf /etc/nginx/sites-available/ark.ilgaming.xyz
   
   # Enable the site
   sudo ln -s /etc/nginx/sites-available/ark.ilgaming.xyz /etc/nginx/sites-enabled/
   
   # Remove default site
   sudo rm -f /etc/nginx/sites-enabled/default
   
   # Test and reload
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## 🚀 Complete Fix Commands

Run these commands on your remote server in order:

```bash
# 1. Navigate to project directory
cd /home/steam/asa-docker-control-api

# 2. Make scripts executable
chmod +x *.sh

# 3. Run quick fix first
./quick-fix.sh

# 4. If issues persist, run full deployment
sudo ./deploy-remote.sh

# 5. Test the fix
curl https://ark.ilgaming.xyz/health
```

## 🔧 Manual Configuration (if scripts fail)

### 1. Environment Setup
```bash
# Create environment file
cp env.example .env

# Edit with production values
nano .env
```

### 2. Start API
```bash
# Start containers
docker compose up -d

# Check status
docker compose ps

# Test locally
curl http://localhost:4000/health
```

### 3. Configure Nginx
```bash
# Install nginx
sudo apt install nginx -y

# Copy configuration
sudo cp nginx-ark.ilgaming.xyz.conf /etc/nginx/sites-available/ark.ilgaming.xyz

# Enable site
sudo ln -s /etc/nginx/sites-available/ark.ilgaming.xyz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Get SSL Certificate
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d ark.ilgaming.xyz
```

### 5. Configure Firewall
```bash
# Allow necessary ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 🎯 Testing Your Fix

After completing the setup, test with these commands:

```bash
# Test DNS resolution
nslookup ark.ilgaming.xyz

# Test HTTP (should redirect to HTTPS)
curl -I http://ark.ilgaming.xyz/health

# Test HTTPS
curl -I https://ark.ilgaming.xyz/health

# Test API endpoints
curl https://ark.ilgaming.xyz/health
curl https://ark.ilgaming.xyz/metrics
```

## 📞 If Still Having Issues

1. **Check server logs**:
   ```bash
   docker-compose logs ark-api
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Verify server IP**:
   ```bash
   curl ifconfig.me
   hostname -I
   ```

3. **Test from server itself**:
   ```bash
   curl http://localhost:4000/health
   curl https://ark.ilgaming.xyz/health
   ```

4. **Check if ports are open**:
   ```bash
   netstat -tlnp | grep :4000
   netstat -tlnp | grep :80
   netstat -tlnp | grep :443
   ```

## 🎉 Success Indicators

You'll know it's working when:
- ✅ `nslookup ark.ilgaming.xyz` returns your server IP
- ✅ `curl https://ark.ilgaming.xyz/health` returns JSON response
- ✅ Browser shows HTTPS padlock icon
- ✅ No more "unknown error" messages 
