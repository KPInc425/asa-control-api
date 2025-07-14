# ARK Dashboard Production Nginx Configuration

# Path-based routing for all services under ark.ilgaming.xyz

server {
listen 443 ssl http2;
server_name ark.ilgaming.xyz;

    if ($host != ark.ilgaming.xyz) {
        return 444;
    }

    ssl_certificate /etc/nginx/ssl/ilgaming.xyz-crt.pem;
    ssl_certificate_key /etc/nginx/ssl/ilgaming.xyz-key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Frontend app - matches your working pattern
    location / {
        proxy_pass http://localhost:4010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        # Add WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ASA Control API - Main API endpoints
    location /api/ {
        proxy_pass http://192.168.0.204:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Authorization $http_authorization;

        # CORS headers for authentication
        add_header Access-Control-Allow-Origin "https://ark.ilgaming.xyz" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
        add_header Access-Control-Allow-Credentials "true" always;

        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "https://ark.ilgaming.xyz" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        # Handle large request bodies (for config file uploads)
        client_max_body_size 10M;

        # Timeout settings for long-running operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

		# ASA Control API - Socket.IO WebSocket connections
		location /socket.io/ {
				proxy_pass http://192.168.0.204:4000/socket.io/;
				proxy_http_version 1.1;
				proxy_set_header Upgrade $http_upgrade;
				proxy_set_header Connection "upgrade";
				proxy_set_header Host $host;
				proxy_set_header X-Real-IP $remote_addr;
				proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
				proxy_set_header X-Forwarded-Proto https;
				proxy_set_header X-Forwarded-Host $host;

				# WebSocket specific settings
				proxy_buffering off;
				proxy_cache off;
				proxy_read_timeout 86400s;
				proxy_send_timeout 86400s;
		}

    # ASA Control API - Health check endpoint
    location /health {
        proxy_pass http://192.168.0.204:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    # ASA Control API - Metrics endpoint (optional, for monitoring)
    location /metrics {
        proxy_pass http://192.168.0.204:4000/metrics;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    # ASA Control API - Real-time log streaming WebSocket
    location /api/logs/ {
        proxy_pass http://192.168.0.204:4000/api/logs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket specific settings
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ASA Control API - Real-time container events WebSocket
    location /api/events {
        proxy_pass http://192.168.0.204:4000/api/events;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket specific settings
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Grafana Dashboard - Path-based routing
    location /grafana/ {
        proxy_pass http://192.168.0.204:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Grafana specific settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Handle Grafana's base path
        proxy_redirect off;
        sub_filter_once off;
        sub_filter 'href="/' 'href="/grafana/';
        sub_filter 'src="/' 'src="/grafana/';
        sub_filter 'url("/' 'url("/grafana/';
    }

    # Prometheus Metrics - Path-based routing
    location /prometheus/ {
        proxy_pass http://192.168.0.204:9090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Prometheus specific settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Handle Prometheus's base path
        proxy_redirect off;
        sub_filter_once off;
        sub_filter 'href="/' 'href="/prometheus/';
        sub_filter 'src="/' 'src="/prometheus/';
        sub_filter 'url("/' 'url("/prometheus/';
    }

    # cAdvisor Container Metrics - Path-based routing
    location /cadvisor/ {
        proxy_pass http://192.168.0.204:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # cAdvisor specific settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Handle cAdvisor's base path
        proxy_redirect off;
        sub_filter_once off;
        sub_filter 'href="/' 'href="/cadvisor/';
        sub_filter 'src="/' 'src="/cadvisor/';
        sub_filter 'url("/' 'url("/cadvisor/';
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }

}
