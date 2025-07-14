# ASA Control API – Project Guidelines

## 🧠 Purpose

This Node.js backend provides a secure API for managing an ARK: Survival Ascended (ASA) Docker cluster. It is hosted on the same VM as the ASA containers and exposes endpoints for:

- Starting, stopping, and restarting containers
- Sending RCON commands to ASA servers
- Reading and writing config files (e.g., GameUserSettings.ini)
- Monitoring update lock status
- Streaming logs and server events via WebSocket
- Authenticating users and enforcing access control
- Exposing Prometheus-compatible metrics for monitoring

---

## 🧱 Architecture

- Framework: Fastify (replacing Express for performance)
- Docker control: `dockerode`
- RCON: `
rcon-client` or `child_process` to call `asa-ctrl`
- Config access: `fs/promises`
- Realtime: Socket.IO
- Auth: JWT-based login
- Logging: Pino (built-in with Fastify) + Winston (application)
- Rate limiting: `@fastify/rate-limit`
- Metrics: `prom-client` for Prometheus
- Monitoring: Prometheus + Grafana + cAdvisor via Docker Compose
---

## 📁 Project Structure

/asa-control-api
  /routes         # Express route handlers
  /services       # Docker, RCON, config, and auth logic
  /middleware     # Auth, rate limiting, logging
  /logs           # Log output (optional)
  .env            # Environment variables
  server.js       # App entry point
  package.json

---

---

## 🔌 API Endpoints

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/api/containers`                 | List ASA containers and status       |
| POST   | `/api/containers/:name/start`     | Start a container                    |
| POST   | `/api/containers/:name/stop`      | Stop a container                     |
| POST   | `/api/containers/:name/restart`   | Restart a container                  |
| POST   | `/api/containers/:name/rcon`      | Send RCON command                    |
| GET    | `/api/configs/:map`               | Get config file contents             |
| PUT    | `/api/configs/:map`               | Update config file                   |
| GET    | `/api/lock-status`                | Check `.update.lock` status          |
| GET    | `/api/logs/:container`            | WebSocket log stream                 |
| POST   | `/api/auth/login`                 | Authenticate user                    |
| GET    | `/api/auth/me`                    | Get current user info                |
| GET    | `/metrics`                        | Prometheus metrics endpoint          |

---

## 📊 Monitoring Stack (Docker Compose)

```yaml
version: '3.8'

services:
  ark-api:
    build: ./asa-control-api
    ports:
      - "4000:3000"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana-storage:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro

volumes:
  grafana-storage:
```

## 📜 prometheus.yml

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: 'ark-api'
    static_configs:
      - targets: ['ark-api:3000']
```


## 📈  Fastify Metrics Endpoint Example

```js
// /metrics/index.js
import { collectDefaultMetrics, Registry, Gauge } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

const arkServerGauge = new Gauge({
  name: 'ark_servers_running',
  help: 'Number of ARK servers currently running',
});
register.registerMetric(arkServerGauge);

export function updateArkServerCount(count) {
  arkServerGauge.set(count);
}

export async function metricsHandler(req, reply) {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
}

// server.js
import Fastify from 'fastify';
import { metricsHandler, updateArkServerCount } from './metrics/index.js';

const fastify = Fastify({ logger: true });

fastify.get('/metrics', metricsHandler);

// Simulate metric updates
setInterval(() => {
  const running = Math.floor(Math.random() * 5); // Replace with real logic
  updateArkServerCount(running);
}, 10000);

fastify.listen({ port: 3000 }, err => {
  if (err) throw err;
});
```

## 🔐 Security

- JWT-based authentication
- Rate limiting on all endpoints
- CORS configured for frontend origin
- Docker socket access restricted to backend
- HTTPS enforced via reverse proxy
- Prometheus /metrics endpoint can be protected via IP allowlist or token if needed

## 🧪 Development Notes

- Use .env to configure paths and secrets
- Backend must be hosted on the same VM as the ASA containers
- Expose port 4000 (or as configured) for frontend access
- Grafana dashboards can be embedded via iframe or accessed directly at http://localhost:3001





