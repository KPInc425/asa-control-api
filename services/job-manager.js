// services/job-manager.js

import logger from '../utils/logger.js';
import { 
  createJob as dbCreateJob,
  getJob as dbGetJob,
  getAllJobs as dbGetAllJobs,
  updateJob as dbUpdateJob,
  deleteJob as dbDeleteJob,
  cleanupOldJobs as dbCleanupOldJobs
} from './database.js';

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

export function createJob(type, data) {
  const jobId = Math.random().toString(36).substr(2, 9);
  
  // Create job in database
  dbCreateJob(jobId, type, JSON.stringify(data));
  
  // Get the created job
  const job = dbGetJob(jobId);
  
  logger.info(`Created job ${jobId} of type ${type}`);
  return job;
}

export function updateJob(jobId, update) {
  const job = dbGetJob(jobId);
  if (job) {
    // Parse existing job data
    const jobData = {
      ...job,
      progress: JSON.parse(job.progress || '[]'),
      data: JSON.parse(job.data || '{}'),
      result: job.result ? JSON.parse(job.result) : null
    };
    
    // Apply updates
    Object.assign(jobData, update);
    
    // Update job in database
    dbUpdateJob(jobId, {
      status: jobData.status,
      progress: JSON.stringify(jobData.progress),
      result: jobData.result ? JSON.stringify(jobData.result) : null,
      error: jobData.error
    });
    
    // Get updated job
    const updatedJob = dbGetJob(jobId);
    
    // Broadcast update to Socket.IO clients
    broadcastJobUpdate(jobId, updatedJob);
    
    logger.info(`Updated job ${jobId}: ${update.status || 'progress'}`);
    
    return updatedJob;
  }
}

export function addJobProgress(jobId, message) {
  const job = dbGetJob(jobId);
  if (job) {
    // Parse existing progress
    const progress = JSON.parse(job.progress || '[]');
    
    // Add new progress entry
    progress.push({ timestamp: Date.now(), message });
    
    // Update job in database
    dbUpdateJob(jobId, {
      progress: JSON.stringify(progress)
    });
    
    // Get updated job
    const updatedJob = dbGetJob(jobId);
    
    // Broadcast update to Socket.IO clients
    broadcastJobUpdate(jobId, updatedJob);
    
    logger.info(`Job ${jobId} progress: ${message}`);
    
    return updatedJob;
  }
}

export function getJob(jobId) {
  const job = dbGetJob(jobId);
  if (job) {
    // Parse JSON fields
    return {
      ...job,
      progress: JSON.parse(job.progress || '[]'),
      data: JSON.parse(job.data || '{}'),
      result: job.result ? JSON.parse(job.result) : null
    };
  }
  return null;
}

export function getAllJobs() {
  const jobs = dbGetAllJobs();
  return jobs.map(job => ({
    ...job,
    progress: JSON.parse(job.progress || '[]'),
    data: JSON.parse(job.data || '{}'),
    result: job.result ? JSON.parse(job.result) : null
  }));
}

// Clean up old completed/failed jobs (older than 24 hours)
export async function cleanupOldJobs() {
  const result = dbCleanupOldJobs(24); // 24 hours
  logger.info(`Cleaned up ${result.changes} old jobs`);
  return result;
}

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000); 
