# ASA Management Suite - Production Setup Guide

## 🚨 Critical Security Checklist

### 1. **JWT Secret Configuration**
```bash
# Generate a strong JWT secret (64+ characters)
openssl rand -base64 64

# Set in your production .env file
JWT_SECRET=your-generated-secret-here
```

### 2. **CORS Configuration for Production**
```bash
# Update CORS_ORIGIN in .env for your production domain
CORS_ORIGIN=https://your-dashboard-domain.com,https://your-api-domain.com
```

### 3. **Environment Variables for Production**
```bash
# Production .env file
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

# Security
JWT_SECRET=your-strong-jwt-secret-here
JWT_EXPIRES_IN=24h

# Server Configuration
SERVER_MODE=native
NATIVE_BASE_PATH=/path/to/your/ark/servers
NATIVE_CLUSTERS_PATH=/path/to/your/ark/clusters

# CORS (Production domains only)
CORS_ORIGIN=https://your-dashboard-domain.com

# Rate Limiting (Stricter for production)
RATE_LIMIT_MAX=50
RATE_LIMIT_TIME_WINDOW=900000

# Logging
LOG_LEVEL=warn
LOG_FILE_PATH=/var/log/asa-api/app.log

# Metrics
METRICS_ENABLED=true

# Disable development features
DOCKER_ENABLED=false
```

## 🔒 Security Hardening

### 1. **Firewall Configuration**
```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (for SSL redirect)
ufw allow 443/tcp   # HTTPS
ufw allow 4000/tcp  # API (if exposed directly)
ufw enable
```

### 2. **Nginx SSL Configuration**
```nginx
server {
    listen 443 ssl http2;
    server_name your-api-domain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
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
}
```

### 3. **Service Security**
```bash
# Run as dedicated user
sudo useradd -r -s /bin/false asa-api
sudo chown -R asa-api:asa-api /opt/asa-api

# Set proper file permissions
sudo chmod 600 /opt/asa-api/.env
sudo chmod 755 /opt/asa-api
```

## 🚀 Deployment Options

### Option 1: Docker Production Deployment
```bash
# Production docker-compose.yml
version: '3.8'
services:
  asa-api:
    build: .
    container_name: asa-api-prod
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN}
    volumes:
      - /path/to/ark/servers:/ark-data
      - ./logs:/app/logs
    networks:
      - asa-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  asa-network:
    driver: bridge
```

### Option 2: Systemd Service Deployment
```bash
# /etc/systemd/system/asa-api.service
[Unit]
Description=ASA Management API
After=network.target

[Service]
Type=simple
User=asa-api
WorkingDirectory=/opt/asa-api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=JWT_SECRET=your-secret-here

[Install]
WantedBy=multi-user.target
```

## 📊 Monitoring & Health Checks

### 1. **Health Check Endpoint**
```bash
# Test API health
curl https://your-api-domain.com/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### 2. **Metrics Endpoint**
```bash
# Prometheus metrics
curl https://your-api-domain.com/metrics
```

### 3. **Log Monitoring**
```bash
# Monitor application logs
tail -f /var/log/asa-api/app.log

# Monitor nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 🔧 Production Configuration Files

### 1. **Production .env Template**
```bash
# Copy and customize for production
cp env.example .env.production

# Edit with production values
nano .env.production
```

### 2. **Nginx Configuration**
```bash
# Copy production nginx config
cp nginx-ark.ilgaming.xyz.conf /etc/nginx/sites-available/your-domain.com

# Enable site
ln -s /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 3. **SSL Certificate Setup**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🛡️ Security Best Practices

### 1. **Regular Security Updates**
```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js dependencies
npm audit fix
npm update
```

### 2. **Backup Strategy**
```bash
# Backup configuration
tar -czf asa-config-backup-$(date +%Y%m%d).tar.gz .env config/

# Backup server data
tar -czf asa-servers-backup-$(date +%Y%m%d).tar.gz /path/to/ark/servers/
```

### 3. **Access Control**
```bash
# Use SSH keys only
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no

# Restrict API access by IP (if needed)
# Add to nginx config:
# allow 192.168.1.0/24;
# deny all;
```

## 🚨 Emergency Procedures

### 1. **Service Recovery**
```bash
# Restart API service
sudo systemctl restart asa-api

# Check service status
sudo systemctl status asa-api

# View recent logs
sudo journalctl -u asa-api -f
```

### 2. **Database/Config Recovery**
```bash
# Restore from backup
tar -xzf asa-config-backup-20240101.tar.gz
sudo systemctl restart asa-api
```

### 3. **Security Incident Response**
```bash
# Immediately rotate JWT secret
# Update .env file with new JWT_SECRET
# Restart service
sudo systemctl restart asa-api

# Check logs for suspicious activity
grep -i "error\|failed\|unauthorized" /var/log/asa-api/app.log
```

## 📋 Pre-Deployment Checklist

- [ ] Strong JWT secret generated and configured
- [ ] CORS origins updated for production domains
- [ ] SSL certificate installed and configured
- [ ] Firewall rules configured
- [ ] Service runs as dedicated user
- [ ] File permissions set correctly
- [ ] Monitoring and logging configured
- [ ] Backup strategy implemented
- [ ] Health checks working
- [ ] Rate limiting configured
- [ ] Development features disabled
- [ ] Error handling tested
- [ ] Performance tested under load

## 🔗 Useful Commands

```bash
# Check service status
sudo systemctl status asa-api

# View logs
sudo journalctl -u asa-api -f

# Test API
curl -H "Authorization: Bearer your-token" https://your-domain.com/api/containers

# Monitor resources
htop
df -h
free -h

# Check SSL certificate
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout
```

## 📞 Support & Troubleshooting

1. **Check service logs first**
2. **Verify configuration files**
3. **Test endpoints manually**
4. **Check system resources**
5. **Review security logs**

For additional help, check the main documentation and troubleshooting guides. 
