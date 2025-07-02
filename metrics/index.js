import { collectDefaultMetrics, Registry, Gauge, Counter, Histogram } from 'prom-client';
import config from '../config/index.js';

const register = new Registry();
collectDefaultMetrics({ register });

// ARK Server Metrics
const arkServerGauge = new Gauge({
  name: 'ark_servers_running',
  help: 'Number of ARK servers currently running',
  labelNames: ['map_name']
});

const arkServerStatusGauge = new Gauge({
  name: 'ark_server_status',
  help: 'Status of ARK servers (1=running, 0=stopped)',
  labelNames: ['container_name', 'map_name']
});

// RCON Command Metrics
const rconCommandCounter = new Counter({
  name: 'rcon_commands_total',
  help: 'Total number of RCON commands sent',
  labelNames: ['container_name', 'command_type']
});

const rconCommandDuration = new Histogram({
  name: 'rcon_command_duration_seconds',
  help: 'Duration of RCON commands in seconds',
  labelNames: ['container_name', 'command_type'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Container Operation Metrics
const containerOperationCounter = new Counter({
  name: 'container_operations_total',
  help: 'Total number of container operations',
  labelNames: ['operation', 'container_name', 'status']
});

const containerOperationDuration = new Histogram({
  name: 'container_operation_duration_seconds',
  help: 'Duration of container operations in seconds',
  labelNames: ['operation', 'container_name'],
  buckets: [1, 5, 10, 30, 60]
});

// API Request Metrics
const apiRequestCounter = new Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'endpoint', 'status_code']
});

const apiRequestDuration = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'Duration of API requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Register all metrics
register.registerMetric(arkServerGauge);
register.registerMetric(arkServerStatusGauge);
register.registerMetric(rconCommandCounter);
register.registerMetric(rconCommandDuration);
register.registerMetric(containerOperationCounter);
register.registerMetric(containerOperationDuration);
register.registerMetric(apiRequestCounter);
register.registerMetric(apiRequestDuration);

// Metric update functions
export function updateArkServerCount(count, mapName = 'total') {
  arkServerGauge.set({ map_name: mapName }, count);
}

export function updateArkServerStatus(containerName, mapName, isRunning) {
  arkServerStatusGauge.set({ container_name: containerName, map_name: mapName }, isRunning ? 1 : 0);
}

export function incrementRconCommand(containerName, commandType) {
  rconCommandCounter.inc({ container_name: containerName, command_type: commandType });
}

export function recordRconCommandDuration(containerName, commandType, duration) {
  rconCommandDuration.observe({ container_name: containerName, command_type: commandType }, duration);
}

export function incrementContainerOperation(operation, containerName, status) {
  containerOperationCounter.inc({ operation, container_name: containerName, status });
}

export function recordContainerOperationDuration(operation, containerName, duration) {
  containerOperationDuration.observe({ operation, container_name: containerName }, duration);
}

export function incrementApiRequest(method, endpoint, statusCode) {
  apiRequestCounter.inc({ method, endpoint, status_code: statusCode });
}

export function recordApiRequestDuration(method, endpoint, duration) {
  apiRequestDuration.observe({ method, endpoint }, duration);
}

// Metrics handler for Fastify
export async function metricsHandler(request, reply) {
  try {
    reply.header('Content-Type', register.contentType);
    return await register.metrics();
  } catch (error) {
    reply.status(500).send({ error: 'Failed to generate metrics' });
  }
}

export { register }; 
