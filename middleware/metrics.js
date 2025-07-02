import { 
  incrementApiRequest, 
  recordApiRequestDuration 
} from '../metrics/index.js';

/**
 * Metrics middleware for tracking API requests
 */
export async function metricsMiddleware(request, reply) {
  const startTime = Date.now();
  
  // Store original send method
  const originalSend = reply.send;
  
  // Override send method to capture response
  reply.send = function(payload) {
    const duration = (Date.now() - startTime) / 1000;
    const method = request.method;
    const endpoint = request.routerPath || request.url;
    const statusCode = reply.statusCode || 200;
    
    // Record metrics
    incrementApiRequest(method, endpoint, statusCode);
    recordApiRequestDuration(method, endpoint, duration);
    
    // Call original send method
    return originalSend.call(this, payload);
  };
} 
