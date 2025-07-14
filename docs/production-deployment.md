# ASA Control API - Production Deployment Guide

## 🚀 Remote Server Setup

### 1. Prerequisites
- Ubuntu/Debian server with Docker and Docker Compose
- Domain name pointing to your server (ark.ilgaming.xyz)
- SSL certificate (Let's Encrypt recommended)

### 2. Server Setup Commands

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker (if not already installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

### 3. Deploy the API

```bash
# Clone or upload the project to your server
cd /opt
sudo git clone <your-repo> asa-docker-control-api
cd asa-docker-control-api

# Create environment file
cp env.example .env
nano .env  # Edit with production values

# Start the services
sudo docker-compose up -d
```

### 4. Nginx Configuration

Create `/etc/nginx/sites-available/ark.ilgaming.xyz`:

```nginx
server {
    listen 80;
    server_name ark.ilgaming.xyz;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ark.ilgaming.xyz;
    
    # SSL Configuration (will be managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/ark.ilgaming.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ark.ilgaming.xyz/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # API Proxy
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4000/health;
        access_log off;
    }
    
    # Metrics endpoint (optional - for monitoring)
    location /metrics {
        proxy_pass http://localhost:4000/metrics;
        access_log off;
    }
}
```

### 5. Enable Nginx Site

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/ark.ilgaming.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d ark.ilgaming.xyz

# Test SSL
curl -I https://ark.ilgaming.xyz/health
```

### 6. Firewall Configuration

```bash
# Allow necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 4000/tcp  # API (if needed externally)
sudo ufw enable
```

### 7. Environment Configuration

Edit `.env` file with production values:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-here
JWT_EXPIRES_IN=24h

# Docker Configuration
DOCKER_SOCKET=/var/run/docker.sock

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS (if needed)
CORS_ORIGIN=https://your-frontend-domain.com
```

### 8. Monitoring Setup

```bash
# Access Grafana
# Open https://ark.ilgaming.xyz:3001 in browser
# Default credentials: admin/admin

# Access Prometheus
# Open https://ark.ilgaming.xyz:9090 in browser
```

### 9. Troubleshooting Commands

```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs -f ark-api

# Test API locally
curl http://localhost:4000/health

# Check nginx status
sudo systemctl status nginx

# Check SSL certificate
sudo certbot certificates

# Test DNS resolution
nslookup ark.ilgaming.xyz

# Check firewall status
sudo ufw status
```

### 10. Common Issues & Solutions

#### DNS Resolution Failed
- Verify domain DNS A record points to your server IP
- Check with: `nslookup ark.ilgaming.xyz`

#### Web Server Unknown Error
- Check nginx configuration: `sudo nginx -t`
- Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Verify SSL certificate: `sudo certbot certificates`

#### API Not Responding
- Check if containers are running: `docker-compose ps`
- Check API logs: `docker-compose logs ark-api`
- Test local connectivity: `curl http://localhost:4000/health`

#### Port Blocked
- Check firewall: `sudo ufw status`
- Verify ports are open: `netstat -tlnp | grep :4000`

### 11. Maintenance

```bash
# Update the application
cd /opt/asa-docker-control-api
git pull
docker-compose down
docker-compose up -d --build

# Renew SSL certificate
sudo certbot renew

# Backup configuration
sudo cp /etc/nginx/sites-available/ark.ilgaming.xyz /backup/
sudo cp .env /backup/
```

### 12. Security Checklist

- [ ] SSL certificate installed and working
- [ ] Firewall configured and enabled
- [ ] Strong JWT secret in .env
- [ ] Admin password changed from default
- [ ] Regular security updates
- [ ] Log monitoring enabled
- [ ] Backup strategy in place 
