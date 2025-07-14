#!/bin/bash

# ASA Management Suite - Production Deployment Script
set -e

echo "🚀 ASA Management Suite - Production Deployment"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[HEADER]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Configuration variables
API_DOMAIN=""
DASHBOARD_DOMAIN=""
ARK_DATA_PATH=""
JWT_SECRET=""
DEPLOYMENT_TYPE=""

# Function to get user input
get_config() {
    print_header "Production Configuration"
    echo ""
    
    read -p "Enter your API domain (e.g., api.yourdomain.com): " API_DOMAIN
    read -p "Enter your dashboard domain (e.g., dashboard.yourdomain.com): " DASHBOARD_DOMAIN
    read -p "Enter ARK servers data path (e.g., /opt/ark): " ARK_DATA_PATH
    read -p "Deployment type (docker/systemd): " DEPLOYMENT_TYPE
    
    echo ""
    print_warning "Configuration Summary:"
    echo "  API Domain: $API_DOMAIN"
    echo "  Dashboard Domain: $DASHBOARD_DOMAIN"
    echo "  ARK Data Path: $ARK_DATA_PATH"
    echo "  Deployment Type: $DEPLOYMENT_TYPE"
    echo ""
    
    read -p "Continue with this configuration? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        print_error "Deployment cancelled."
        exit 1
    fi
}

# Function to generate JWT secret
generate_jwt_secret() {
    print_status "Generating JWT secret..."
    JWT_SECRET=$(openssl rand -base64 64)
    print_status "JWT secret generated successfully"
}

# Function to create production .env file
create_production_env() {
    print_status "Creating production .env file..."
    
    cat > .env.production << EOF
# ASA Management Suite - Production Configuration
# Generated on $(date)

# Server Configuration
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

# Security
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# Server Configuration
SERVER_MODE=native
NATIVE_BASE_PATH=$ARK_DATA_PATH
NATIVE_CLUSTERS_PATH=$ARK_DATA_PATH/clusters
NATIVE_CONFIG_FILE=native-servers.json

# SteamCMD Configuration
STEAMCMD_PATH=
AUTO_INSTALL_STEAMCMD=true

# ASA Server Configuration
ASA_CONFIG_SUB_PATH=Config/WindowsServer

# RCON Configuration
RCON_DEFAULT_PORT=32330
RCON_PASSWORD=admin

# Rate Limiting (Production settings)
RATE_LIMIT_MAX=50
RATE_LIMIT_TIME_WINDOW=900000

# CORS Configuration (Production domains only)
CORS_ORIGIN=https://$DASHBOARD_DOMAIN

# Logging
LOG_LEVEL=warn
LOG_FILE_PATH=/var/log/asa-api/app.log

# Metrics
METRICS_ENABLED=true

# PowerShell Helper
POWERSHELL_ENABLED=true

# Docker Configuration (disabled for native mode)
DOCKER_ENABLED=false
EOF

    print_status "Production .env file created: .env.production"
}

# Function to setup nginx configuration
setup_nginx() {
    print_status "Setting up nginx configuration..."
    
    # Create nginx config for API
    sudo tee /etc/nginx/sites-available/$API_DOMAIN > /dev/null << EOF
server {
    listen 80;
    server_name $API_DOMAIN;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $API_DOMAIN;
    
    # SSL Configuration (will be managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/$API_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$API_DOMAIN/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
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
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_set_header X-Forwarded-Host \$server_name;
        proxy_buffering off;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4000/health;
        access_log off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
    
    # Metrics endpoint (restricted)
    location /metrics {
        proxy_pass http://localhost:4000/metrics;
        access_log off;
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }
}
EOF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/$API_DOMAIN /etc/nginx/sites-enabled/
    
    # Test nginx configuration
    sudo nginx -t
    
    print_status "Nginx configuration created for $API_DOMAIN"
}

# Function to setup SSL certificates
setup_ssl() {
    print_status "Setting up SSL certificates..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_status "Installing Certbot..."
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    # Get SSL certificate
    print_status "Obtaining SSL certificate for $API_DOMAIN..."
    sudo certbot --nginx -d $API_DOMAIN --non-interactive --agree-tos --email admin@$API_DOMAIN
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    print_status "SSL certificate setup completed"
}

# Function to setup firewall
setup_firewall() {
    print_status "Setting up firewall..."
    
    # Check if ufw is installed
    if ! command -v ufw &> /dev/null; then
        print_status "Installing ufw..."
        sudo apt update
        sudo apt install -y ufw
    fi
    
    # Configure firewall
    sudo ufw --force reset
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow 22/tcp    # SSH
    sudo ufw allow 80/tcp    # HTTP
    sudo ufw allow 443/tcp   # HTTPS
    sudo ufw allow 4000/tcp  # API (if needed)
    sudo ufw --force enable
    
    print_status "Firewall configured"
}

# Function to setup logging
setup_logging() {
    print_status "Setting up logging..."
    
    # Create log directory
    sudo mkdir -p /var/log/asa-api
    sudo chown $USER:$USER /var/log/asa-api
    
    # Create logrotate configuration
    sudo tee /etc/logrotate.d/asa-api > /dev/null << EOF
/var/log/asa-api/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        systemctl reload asa-api 2>/dev/null || true
    endscript
}
EOF
    
    print_status "Logging setup completed"
}

# Function to deploy with Docker
deploy_docker() {
    print_status "Deploying with Docker..."
    
    # Create production docker-compose file
    cat > docker-compose.production.yml << EOF
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
      - JWT_SECRET=$JWT_SECRET
      - CORS_ORIGIN=https://$DASHBOARD_DOMAIN
      - NATIVE_BASE_PATH=$ARK_DATA_PATH
      - SERVER_MODE=native
    volumes:
      - $ARK_DATA_PATH:/ark-data
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
EOF
    
    # Build and start
    docker-compose -f docker-compose.production.yml up -d --build
    
    print_status "Docker deployment completed"
}

# Function to deploy with systemd
deploy_systemd() {
    print_status "Deploying with systemd..."
    
    # Create service user
    sudo useradd -r -s /bin/false asa-api 2>/dev/null || true
    
    # Create service directory
    sudo mkdir -p /opt/asa-api
    sudo chown asa-api:asa-api /opt/asa-api
    
    # Copy files
    sudo cp -r . /opt/asa-api/
    sudo cp .env.production /opt/asa-api/.env
    sudo chown -R asa-api:asa-api /opt/asa-api
    sudo chmod 600 /opt/asa-api/.env
    
    # Create systemd service
    sudo tee /etc/systemd/system/asa-api.service > /dev/null << EOF
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
Environment=JWT_SECRET=$JWT_SECRET

[Install]
WantedBy=multi-user.target
EOF
    
    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable asa-api
    sudo systemctl start asa-api
    
    print_status "Systemd deployment completed"
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Wait for service to start
    sleep 10
    
    # Test health endpoint
    if curl -f -s https://$API_DOMAIN/health > /dev/null; then
        print_status "✅ Health check passed"
    else
        print_error "❌ Health check failed"
        return 1
    fi
    
    # Test API endpoint
    if curl -f -s https://$API_DOMAIN/api/containers > /dev/null; then
        print_status "✅ API endpoint accessible"
    else
        print_warning "⚠️  API endpoint not accessible (may require authentication)"
    fi
    
    print_status "Deployment verification completed"
}

# Function to display final information
display_final_info() {
    echo ""
    print_header "🎉 Deployment Completed Successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "====================="
    echo "✅ API Domain: https://$API_DOMAIN"
    echo "✅ Dashboard Domain: https://$DASHBOARD_DOMAIN"
    echo "✅ ARK Data Path: $ARK_DATA_PATH"
    echo "✅ Deployment Type: $DEPLOYMENT_TYPE"
    echo "✅ SSL Certificate: Installed"
    echo "✅ Firewall: Configured"
    echo "✅ Logging: Setup"
    echo ""
    echo "🔧 Management Commands:"
    echo "======================"
    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        echo "View logs: docker-compose -f docker-compose.production.yml logs -f"
        echo "Restart: docker-compose -f docker-compose.production.yml restart"
        echo "Stop: docker-compose -f docker-compose.production.yml down"
    else
        echo "View logs: sudo journalctl -u asa-api -f"
        echo "Restart: sudo systemctl restart asa-api"
        echo "Status: sudo systemctl status asa-api"
    fi
    echo "Nginx logs: sudo tail -f /var/log/nginx/error.log"
    echo ""
    echo "🔒 Security Notes:"
    echo "================="
    echo "• JWT secret has been generated and configured"
    echo "• SSL certificate is installed and auto-renewing"
    echo "• Firewall is configured with minimal open ports"
    echo "• Service is running with restricted permissions"
    echo ""
    echo "📞 Next Steps:"
    echo "============="
    echo "1. Configure your dashboard to connect to https://$API_DOMAIN"
    echo "2. Set up monitoring and alerting"
    echo "3. Configure backup strategy"
    echo "4. Test all functionality"
    echo ""
    print_status "Production deployment completed! 🚀"
}

# Main deployment flow
main() {
    print_header "Starting production deployment..."
    
    # Get configuration
    get_config
    
    # Generate JWT secret
    generate_jwt_secret
    
    # Create production environment file
    create_production_env
    
    # Setup nginx
    setup_nginx
    
    # Setup SSL certificates
    setup_ssl
    
    # Setup firewall
    setup_firewall
    
    # Setup logging
    setup_logging
    
    # Deploy based on type
    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        deploy_docker
    else
        deploy_systemd
    fi
    
    # Verify deployment
    verify_deployment
    
    # Display final information
    display_final_info
}

# Run main function
main "$@" 
