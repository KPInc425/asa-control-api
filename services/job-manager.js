// services/job-manager.js

import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

const JOBS_FILE = path.join(process.cwd(), 'data', 'jobs.json');
let jobs = {};

// Load jobs from file on startup
async function loadJobs() {
  try {
    const data = await fs.readFile(JOBS_FILE, 'utf8');
    jobs = JSON.parse(data);
    logger.info(`Loaded ${Object.keys(jobs).length} jobs from persistent storage`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, start with empty jobs
      jobs = {};
      logger.info('No existing jobs file found, starting with empty job store');
    } else {
      logger.error('Failed to load jobs from file:', error);
      jobs = {};
    }
  }
}

// Save jobs to file
async function saveJobs() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(JOBS_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
  } catch (error) {
    logger.error('Failed to save jobs to file:', error);
  }
}

// Broadcast job updates to Socket.IO clients
function broadcastJobUpdate(jobId, job) {
  try {
    // Get the Socket.IO instance from the global scope
    const io = global.io || global.fastify?.io;
    if (io) {
      const progressData = {
        jobId: job.id,
        status: job.status,
        progress: job.status === 'completed' ? 100 : job.status === 'failed' ? 0 : 50,
        message: job.progress && job.progress.length > 0 ? job.progress[job.progress.length - 1].message : 'Processing...',
        error: job.error,
        result: job.result
      };
      
      logger.debug(`Broadcasting job progress for ${jobId}:`, progressData);
      io.emit('job-progress', progressData);
    } else {
      logger.warn('Socket.IO instance not available for job progress broadcast');
    }
  } catch (error) {
    logger.error('Failed to broadcast job update:', error);
  }
}

// Initialize job storage
await loadJobs();

export function createJob(type, data) {
  const jobId = Math.random().toString(36).substr(2, 9);
  jobs[jobId] = {
    id: jobId,
    type,
    status: 'pending',
    progress: [],
    result: null,
    error: null,
    data,
    created: Date.now(),
    updated: Date.now(),
  };
  
  // Save to file immediately
  saveJobs();
  
  logger.info(`Created job ${jobId} of type ${type}`);
  return jobs[jobId];
}

export function updateJob(jobId, update) {
  if (jobs[jobId]) {
    Object.assign(jobs[jobId], update, { updated: Date.now() });
    
    // Save to file immediately
    saveJobs();
    
    // Broadcast update to Socket.IO clients
    broadcastJobUpdate(jobId, jobs[jobId]);
    
    logger.info(`Updated job ${jobId}: ${update.status || 'progress'}`);
  }
}

export function addJobProgress(jobId, message) {
  if (jobs[jobId]) {
    jobs[jobId].progress.push({ timestamp: Date.now(), message });
    jobs[jobId].updated = Date.now();
    
    // Save to file immediately
    saveJobs();
    
    // Broadcast update to Socket.IO clients
    broadcastJobUpdate(jobId, jobs[jobId]);
    
    logger.info(`Job ${jobId} progress: ${message}`);
  }
}

export function getJob(jobId) {
  return jobs[jobId];
}

export function getAllJobs() {
  return Object.values(jobs);
}

// Clean up old completed/failed jobs (older than 24 hours)
export async function cleanupOldJobs() {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
  const oldJobIds = Object.keys(jobs).filter(jobId => {
    const job = jobs[jobId];
    return (job.status === 'completed' || job.status === 'failed') && 
           job.updated < cutoff;
  });
  
  oldJobIds.forEach(jobId => {
    delete jobs[jobId];
    logger.info(`Cleaned up old job ${jobId}`);
  });
  
  if (oldJobIds.length > 0) {
    await saveJobs();
  }
}

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000); 
