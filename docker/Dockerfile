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
# The entrypoint script handles docker group membership at runtime
RUN mkdir -p logs && chmod 777 logs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["node", "server.js"]
