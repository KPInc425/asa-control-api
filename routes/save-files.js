import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function saveFilesRoutes(fastify) {
  // Get save files for a server
  fastify.get('/api/native-servers/:serverName/save-files', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      // Get server path from environment or config
      const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
      const serverPath = path.join(basePath, serverName, 'ShooterGame', 'Saved', 'SaveGamesServer');
      
      // Check if server directory exists
      try {
        await fs.access(serverPath);
      } catch (error) {
        return reply.status(404).send({
          success: false,
          message: `Server directory not found: ${serverPath}`
        });
      }
      
      // Read directory contents
      const files = await fs.readdir(serverPath);
      const saveFiles = [];
      
      for (const file of files) {
        if (file.endsWith('.ark') || file.endsWith('.ark.bak')) {
          const filePath = path.join(serverPath, file);
          const stats = await fs.stat(filePath);
          
          saveFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            type: file.endsWith('.ark') ? 'ark' : 'backup'
          });
        }
      }
      
      // Sort by modification date (newest first)
      saveFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
      
      return {
        success: true,
        files: saveFiles
      };
    } catch (error) {
      logger.error('Error getting save files:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get save files'
      });
    }
  });

  // Upload save file
  fastify.post('/api/native-servers/:serverName/save-files/upload', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      // Check if file was uploaded
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      // Validate file type
      const fileName = data.filename;
      if (!fileName.endsWith('.ark') && !fileName.endsWith('.ark.bak')) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid file type. Only .ark and .ark.bak files are allowed'
        });
      }
      
      // Check file size (100MB limit)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (data.file.bytesRead > maxSize) {
        return reply.status(400).send({
          success: false,
          message: 'File size exceeds 100MB limit'
        });
      }
      
      // Get server path
      const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
      const serverPath = path.join(basePath, serverName, 'ShooterGame', 'Saved', 'SaveGamesServer');
      
      // Create directory if it doesn't exist
      await fs.mkdir(serverPath, { recursive: true });
      
      // Create backup of existing file if it exists
      const targetPath = path.join(serverPath, fileName);
      try {
        const existingStats = await fs.stat(targetPath);
        if (existingStats.isFile()) {
          const backupPath = path.join(serverPath, `${fileName}.backup.${Date.now()}`);
          await fs.copyFile(targetPath, backupPath);
          logger.info(`Created backup of existing file: ${backupPath}`);
        }
      } catch (error) {
        // File doesn't exist, which is fine
      }
      
      // Save the uploaded file
      const writeStream = createWriteStream(targetPath);
      await pipeline(data.file, writeStream);
      
      logger.info(`Save file uploaded: ${targetPath}`);
      
      return {
        success: true,
        message: `Save file ${fileName} uploaded successfully`
      };
    } catch (error) {
      logger.error('Error uploading save file:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to upload save file'
      });
    }
  });

  // Download save file
  fastify.get('/api/native-servers/:serverName/save-files/download/:fileName', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' },
          fileName: { type: 'string' }
        },
        required: ['serverName', 'fileName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName, fileName } = request.params;
      
      // Validate file name
      if (!fileName.endsWith('.ark') && !fileName.endsWith('.ark.bak')) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid file type'
        });
      }
      
      // Get file path
      const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
      const filePath = path.join(basePath, serverName, 'ShooterGame', 'Saved', 'SaveGamesServer', fileName);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return reply.status(404).send({
          success: false,
          message: 'File not found'
        });
      }
      
      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Set response headers
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      reply.header('Content-Length', stats.size);
      
      // Stream the file
      const readStream = createReadStream(filePath);
      return reply.send(readStream);
    } catch (error) {
      logger.error('Error downloading save file:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to download save file'
      });
    }
  });

  // Delete save file
  fastify.delete('/api/native-servers/:serverName/save-files/:fileName', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' },
          fileName: { type: 'string' }
        },
        required: ['serverName', 'fileName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName, fileName } = request.params;
      
      // Validate file name
      if (!fileName.endsWith('.ark') && !fileName.endsWith('.ark.bak')) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid file type'
        });
      }
      
      // Get file path
      const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
      const filePath = path.join(basePath, serverName, 'ShooterGame', 'Saved', 'SaveGamesServer', fileName);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return reply.status(404).send({
          success: false,
          message: 'File not found'
        });
      }
      
      // Delete the file
      await fs.unlink(filePath);
      
      logger.info(`Save file deleted: ${filePath}`);
      
      return {
        success: true,
        message: `Save file ${fileName} deleted successfully`
      };
    } catch (error) {
      logger.error('Error deleting save file:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete save file'
      });
    }
  });

  // Backup save files
  fastify.post('/api/native-servers/:serverName/save-files/backup', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          serverName: { type: 'string' }
        },
        required: ['serverName']
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      // Get server path
      const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
      const serverPath = path.join(basePath, serverName, 'ShooterGame', 'Saved', 'SaveGamesServer');
      
      // Check if server directory exists
      try {
        await fs.access(serverPath);
      } catch (error) {
        return reply.status(404).send({
          success: false,
          message: `Server directory not found: ${serverPath}`
        });
      }
      
      // Read directory contents
      const files = await fs.readdir(serverPath);
      const arkFiles = files.filter(file => file.endsWith('.ark'));
      
      if (arkFiles.length === 0) {
        return reply.status(404).send({
          success: false,
          message: 'No .ark files found to backup'
        });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupResults = [];
      
      for (const file of arkFiles) {
        const sourcePath = path.join(serverPath, file);
        const backupPath = path.join(serverPath, `${file}.backup.${timestamp}`);
        
        try {
          await fs.copyFile(sourcePath, backupPath);
          backupResults.push({
            file,
            success: true,
            backupPath: path.basename(backupPath)
          });
          logger.info(`Backed up ${file} to ${backupPath}`);
        } catch (error) {
          backupResults.push({
            file,
            success: false,
            error: error.message
          });
          logger.error(`Failed to backup ${file}:`, error);
        }
      }
      
      const successCount = backupResults.filter(r => r.success).length;
      
      return {
        success: true,
        message: `Backed up ${successCount} of ${arkFiles.length} save files`,
        results: backupResults
      };
    } catch (error) {
      logger.error('Error backing up save files:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to backup save files'
      });
    }
  });
} 
