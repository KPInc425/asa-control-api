import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Static file server for serving the frontend
 */
export class StaticServer {
  constructor() {
    this.staticPath = path.join(__dirname, '..', '..', 'public');
    this.indexPath = path.join(this.staticPath, 'index.html');
    this.fallbackPath = path.join(__dirname, '..', '..', 'asa-servers-dashboard', 'dist', 'index.html');
  }

  /**
   * Check if static files exist
   */
  async hasStaticFiles() {
    try {
      await fs.access(this.indexPath);
      return true;
    } catch {
      try {
        await fs.access(this.fallbackPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Get the correct static file path
   */
  async getStaticPath() {
    try {
      await fs.access(this.indexPath);
      return this.staticPath;
    } catch {
      try {
        await fs.access(this.fallbackPath);
        return path.dirname(this.fallbackPath);
      } catch {
        return null;
      }
    }
  }

  /**
   * Serve static files
   */
  async serveStatic(request, reply) {
    try {
      const staticPath = await this.getStaticPath();
      if (!staticPath) {
        return reply.status(404).send({ error: 'Static files not found' });
      }

      let filePath = request.url;
      
      // Handle root path
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }

      // Remove leading slash
      if (filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }

      const fullPath = path.join(staticPath, filePath);

      // Security check - prevent directory traversal
      if (!fullPath.startsWith(staticPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      try {
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          // Try to serve index.html from directory
          const indexPath = path.join(fullPath, 'index.html');
          const indexStats = await fs.stat(indexPath);
          const content = await fs.readFile(indexPath);
          
          reply.type('text/html');
          return reply.send(content);
        } else {
          // Serve the file
          const content = await fs.readFile(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          
          // Set appropriate content type
          const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject'
          };
          
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          reply.type(contentType);
          return reply.send(content);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File not found, serve index.html for SPA routing
          try {
            const indexContent = await fs.readFile(path.join(staticPath, 'index.html'));
            reply.type('text/html');
            return reply.send(indexContent);
          } catch (indexError) {
            return reply.status(404).send({ error: 'File not found' });
          }
        }
        throw error;
      }
    } catch (error) {
      logger.error('Error serving static file:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }

  /**
   * Copy frontend build to public directory
   */
  async copyFrontendBuild() {
    try {
      const frontendDistPath = path.join(__dirname, '..', '..', 'asa-servers-dashboard', 'dist');
      const publicPath = path.join(__dirname, '..', '..', 'public');
      
      // Check if frontend dist exists
      try {
        await fs.access(frontendDistPath);
      } catch {
        logger.warn('Frontend dist directory not found. Run "npm run build" in asa-servers-dashboard first.');
        return false;
      }

      // Create public directory if it doesn't exist
      try {
        await fs.mkdir(publicPath, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      // Copy files recursively
      await this.copyDirectory(frontendDistPath, publicPath);
      
      logger.info('Frontend build copied to public directory');
      return true;
    } catch (error) {
      logger.error('Error copying frontend build:', error);
      return false;
    }
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export default StaticServer; 
