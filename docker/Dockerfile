FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (docker-cli + build tools for native modules)
RUN apk add --no-cache \
    docker-cli \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (build tools already installed above for better-sqlite3 native module)
RUN npm ci --legacy-peer-deps && npm prune --omit=dev

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Run as root to avoid host volume permission issues with docker socket
# The entrypoint script drops to the nodejs user after matching the docker group GID.
# It was tracked in the repo but never copied into the image after c7c4383, which left
# the repo unable to reproduce the container prod actually runs.
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p logs && chmod 777 logs && chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server through the entrypoint (docker group GID match, then drop privileges)
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
