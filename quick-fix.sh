#!/bin/bash

echo "🚀 ASA Control API Quick Fix Script"
echo "==================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is listening
port_listening() {
    netstat -tlnp 2>/dev/null | grep ":$1 " >/dev/null 2>&1
}

echo "1. Checking Docker containers..."
if command_exists docker-compose; then
    if [ -f "docker-compose.yml" ]; then
        echo "   Starting containers..."
        docker-compose up -d
        sleep 5
        docker-compose ps
    else
        echo "   ❌ docker-compose.yml not found in current directory"
        exit 1
    fi
else
    echo "   ❌ docker-compose not installed"
    exit 1
fi

echo ""
echo "2. Testing API locally..."
if port_listening 4000; then
    echo "   ✅ Port 4000 is listening"
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)
    if [ "$response" = "200" ]; then
        echo "   ✅ API is responding (HTTP $response)"
    else
        echo "   ❌ API returned HTTP $response"
    fi
else
    echo "   ❌ Port 4000 is not listening"
fi

echo ""
echo "3. Checking nginx configuration..."
if command_exists nginx; then
    if nginx -t >/dev/null 2>&1; then
        echo "   ✅ Nginx configuration is valid"
        systemctl reload nginx
        echo "   ✅ Nginx reloaded"
    else
        echo "   ❌ Nginx configuration has errors"
        nginx -t
    fi
else
    echo "   ⚠️  Nginx not installed"
fi

echo ""
echo "4. Testing DNS resolution..."
if command_exists nslookup; then
    if nslookup ark.ilgaming.xyz >/dev/null 2>&1; then
        echo "   ✅ DNS resolution working"
        ip=$(nslookup ark.ilgaming.xyz | grep -A1 "Name:" | tail -1 | awk '{print $2}')
        echo "   📍 Domain resolves to: $ip"
    else
        echo "   ❌ DNS resolution failed"
        echo "   💡 Check your domain DNS settings"
    fi
else
    echo "   ⚠️  nslookup not available"
fi

echo ""
echo "5. Checking firewall..."
if command_exists ufw; then
    status=$(ufw status | head -1)
    echo "   🔥 Firewall status: $status"
    if [[ $status == *"inactive"* ]]; then
        echo "   ⚠️  Firewall is inactive"
    fi
else
    echo "   ⚠️  UFW not installed"
fi

echo ""
echo "6. Testing external connectivity..."
if command_exists curl; then
    echo "   Testing https://ark.ilgaming.xyz/health..."
    response=$(curl -s -o /dev/null -w "%{http_code}" https://ark.ilgaming.xyz/health 2>/dev/null || echo "000")
    if [ "$response" = "200" ]; then
        echo "   ✅ External access working (HTTP $response)"
    elif [ "$response" = "000" ]; then
        echo "   ❌ Connection failed - check DNS and nginx"
    else
        echo "   ⚠️  External access returned HTTP $response"
    fi
else
    echo "   ⚠️  curl not available"
fi

echo ""
echo "📋 Quick Fix Summary:"
echo "====================="

# Check if API is working locally
if port_listening 4000; then
    echo "✅ API is running locally"
else
    echo "❌ API is not running - run: docker-compose up -d"
fi

# Check if nginx is configured
if [ -f "/etc/nginx/sites-enabled/ark.ilgaming.xyz" ]; then
    echo "✅ Nginx site is enabled"
else
    echo "❌ Nginx site not configured - see production-deployment.md"
fi

# Check if SSL certificate exists
if [ -f "/etc/letsencrypt/live/ark.ilgaming.xyz/fullchain.pem" ]; then
    echo "✅ SSL certificate exists"
else
    echo "❌ SSL certificate missing - run: sudo certbot --nginx -d ark.ilgaming.xyz"
fi

echo ""
echo "🔧 Next Steps:"
echo "1. If API not running: docker-compose up -d"
echo "2. If nginx not configured: Follow production-deployment.md"
echo "3. If SSL missing: sudo certbot --nginx -d ark.ilgaming.xyz"
echo "4. If DNS issues: Check domain DNS settings"
echo "5. Run full troubleshooting: ./troubleshoot-remote.sh" 
