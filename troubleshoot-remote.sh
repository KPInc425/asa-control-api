#!/bin/bash

echo "🔍 ASA Control API Remote Server Troubleshooting"
echo "================================================"

# Check if running on remote server
echo "1. Checking server environment..."
echo "   Hostname: $(hostname)"
echo "   IP Address: $(hostname -I | awk '{print $1}')"
echo "   Docker version: $(docker --version)"
echo "   Docker Compose version: $(docker-compose --version)"

# Check if containers are running
echo ""
echo "2. Checking Docker containers..."
if command -v docker-compose &> /dev/null; then
    docker-compose ps
else
    echo "   docker-compose not found, checking with docker ps..."
    docker ps --filter "name=asa-docker-control-api"
fi

# Check if ports are listening
echo ""
echo "3. Checking port availability..."
echo "   Port 4000 (API): $(netstat -tlnp 2>/dev/null | grep :4000 || echo 'Not listening')"
echo "   Port 9090 (Prometheus): $(netstat -tlnp 2>/dev/null | grep :9090 || echo 'Not listening')"
echo "   Port 3001 (Grafana): $(netstat -tlnp 2>/dev/null | grep :3001 || echo 'Not listening')"

# Check firewall status
echo ""
echo "4. Checking firewall status..."
if command -v ufw &> /dev/null; then
    echo "   UFW Status: $(ufw status)"
elif command -v firewall-cmd &> /dev/null; then
    echo "   Firewalld Status: $(firewall-cmd --state)"
else
    echo "   No common firewall detected"
fi

# Check DNS resolution
echo ""
echo "5. Checking DNS resolution..."
echo "   Testing ark.ilgaming.xyz:"
nslookup ark.ilgaming.xyz 2>/dev/null || echo "   DNS resolution failed"

# Check if nginx/apache is running
echo ""
echo "6. Checking web server..."
if pgrep nginx > /dev/null; then
    echo "   Nginx is running"
    nginx -t 2>&1 | head -5
elif pgrep apache2 > /dev/null; then
    echo "   Apache is running"
else
    echo "   No web server detected"
fi

# Check Docker logs
echo ""
echo "7. Checking Docker logs..."
if docker ps --filter "name=asa-docker-control-api" --format "{{.Names}}" | grep -q .; then
    echo "   Recent API logs:"
    docker logs --tail 10 $(docker ps --filter "name=asa-docker-control-api" --format "{{.Names}}" | head -1) 2>/dev/null || echo "   No logs available"
else
    echo "   No ASA containers found"
fi

echo ""
echo "8. Testing local connectivity..."
echo "   Testing localhost:4000..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:4000/health || echo "   Connection failed"

echo ""
echo "✅ Troubleshooting complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. If containers aren't running: docker-compose up -d"
echo "   2. If DNS fails: Check domain configuration"
echo "   3. If ports blocked: Configure firewall"
echo "   4. If web server error: Check nginx/apache configuration" 
