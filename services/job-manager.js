// services/job-manager.js

const jobs = {};

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
  return jobs[jobId];
}

export function updateJob(jobId, update) {
  if (jobs[jobId]) {
    Object.assign(jobs[jobId], update, { updated: Date.now() });
  }
}

export function addJobProgress(jobId, message) {
  if (jobs[jobId]) {
    jobs[jobId].progress.push({ timestamp: Date.now(), message });
    jobs[jobId].updated = Date.now();
  }
}

export function getJob(jobId) {
  return jobs[jobId];
}

export function getAllJobs() {
  return Object.values(jobs);
} 
