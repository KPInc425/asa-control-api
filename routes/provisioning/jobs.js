import { requirePermission } from '../../middleware/auth.js';
import { getJob, getAllJobs } from '../../services/job-manager.js';

export default async function jobRoutes(fastify) {
  // List all jobs
  fastify.get('/api/provisioning/jobs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const jobs = getAllJobs();
      reply.send({ success: true, jobs });
    } catch (error) {
      reply.status(500).send({ success: false, message: 'Failed to get jobs' });
    }
  });

  // Job status endpoint
  fastify.get('/api/provisioning/jobs/:jobId', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const job = getJob(request.params.jobId);
      if (!job) return reply.status(404).send({ success: false, message: 'Job not found' });
      reply.send({ success: true, job });
    } catch (error) {
      reply.status(500).send({ success: false, message: 'Failed to get job status' });
    }
  });
} 
