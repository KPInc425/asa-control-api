FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    docker-cli \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user with valid shell and home
RUN addgroup -g 1001 -S nodejs
RUN adduser -S -u 1001 -G nodejs -h /home/nodejs -s /bin/sh nodejs

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use the entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"] 
