#!/bin/bash

echo "🚀 ASA Control API Remote Deployment Script"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root (use sudo)"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the project directory."
    exit 1
fi

print_status "Starting deployment..."

# 1. Install dependencies
print_status "Installing dependencies..."
apt update -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    apt install nginx -y
fi

# Install Certbot if not present
if ! command -v certbot &> /dev/null; then
    print_status "Installing Certbot..."
    apt install certbot python3-certbot-nginx -y
fi

# 2. Start the API
print_status "Starting ASA Control API..."
docker-compose down
docker-compose up -d --build

# Wait for containers to start
print_status "Waiting for containers to start..."
sleep 10

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    print_status "Containers are running"
else
    print_error "Containers failed to start"
    docker-compose logs
    exit 1
fi

# 3. Test API locally
print_status "Testing API locally..."
if curl -s http://localhost:4000/health > /dev/null; then
    print_status "API is responding locally"
else
    print_error "API is not responding locally"
    exit 1
fi

# 4. Configure Nginx
print_status "Configuring Nginx..."

# Copy nginx configuration
if [ -f "nginx-ark.ilgaming.xyz.conf" ]; then
    cp nginx-ark.ilgaming.xyz.conf /etc/nginx/sites-available/ark.ilgaming.xyz
    
    # Enable the site
    ln -sf /etc/nginx/sites-available/ark.ilgaming.xyz /etc/nginx/sites-enabled/
    
    # Remove default site if it exists
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
        rm /etc/nginx/sites-enabled/default
    fi
    
    # Test nginx configuration
    if nginx -t; then
        systemctl reload nginx
        print_status "Nginx configured successfully"
    else
        print_error "Nginx configuration failed"
        exit 1
    fi
else
    print_error "nginx-ark.ilgaming.xyz.conf not found"
    exit 1
fi

# 5. Configure firewall
print_status "Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# 6. Get SSL certificate
print_status "Getting SSL certificate..."
if certbot --nginx -d ark.ilgaming.xyz --non-interactive --agree-tos --email admin@ilgaming.xyz; then
    print_status "SSL certificate obtained successfully"
else
    print_warning "SSL certificate could not be obtained automatically"
    print_warning "You may need to configure DNS first or run manually:"
    print_warning "certbot --nginx -d ark.ilgaming.xyz"
fi

# 7. Final test
print_status "Performing final tests..."

# Test DNS resolution
if nslookup ark.ilgaming.xyz > /dev/null 2>&1; then
    print_status "DNS resolution working"
else
    print_warning "DNS resolution failed - check your domain settings"
fi

# Test HTTPS access
if curl -s -o /dev/null -w "%{http_code}" https://ark.ilgaming.xyz/health | grep -q "200"; then
    print_status "HTTPS access working"
else
    print_warning "HTTPS access failed - check SSL certificate and nginx"
fi

# 8. Display status
echo ""
echo "🎉 Deployment Summary"
echo "===================="
echo "✅ Docker containers: $(docker-compose ps --format 'table {{.Name}}\t{{.Status}}' | grep -v NAME)"
echo "✅ Nginx: $(systemctl is-active nginx)"
echo "✅ Firewall: $(ufw status | head -1)"
echo "✅ Local API: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)"
echo ""

# Check SSL certificate
if [ -f "/etc/letsencrypt/live/ark.ilgaming.xyz/fullchain.pem" ]; then
    echo "✅ SSL Certificate: Installed"
    echo "   Expires: $(openssl x509 -in /etc/letsencrypt/live/ark.ilgaming.xyz/fullchain.pem -text -noout | grep 'Not After' | cut -d: -f2-)"
else
    echo "❌ SSL Certificate: Not installed"
fi

echo ""
echo "📋 Access Information:"
echo "====================="
echo "🌐 API: https://ark.ilgaming.xyz"
echo "📊 Health: https://ark.ilgaming.xyz/health"
echo "📈 Metrics: https://ark.ilgaming.xyz/metrics"
echo "📚 Docs: https://ark.ilgaming.xyz/docs"
echo ""
echo "🔧 Management Commands:"
echo "======================"
echo "View logs: docker-compose logs -f ark-api"
echo "Restart API: docker-compose restart ark-api"
echo "Update API: docker-compose up -d --build"
echo "Check status: docker-compose ps"
echo "Nginx logs: tail -f /var/log/nginx/ark.ilgaming.xyz.error.log"
echo ""
echo "🔒 Security Notes:"
echo "================="
echo "• Change default admin password in .env file"
echo "• Set a strong JWT_SECRET in .env file"
echo "• Monitor logs regularly"
echo "• Keep system updated"
echo ""
print_status "Deployment completed! 🚀" 
