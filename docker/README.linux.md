# Backend API — Local Linux Deployment

The `asa-control-api` backend is now running locally on this host at `http://127.0.0.1:4000`. It was deployed using `docker/` files adapted for Linux.

## Running locally

The backend is deployed via Docker Compose:

```bash
cd /home/steam/apps/asa-control-api/docker
docker compose -f docker-compose.linux.yml up -d
```

**Check status:**
```bash
curl http://127.0.0.1:4000/health
# → {"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0"}
```

**View logs:**
```bash
docker logs asa-control-api --tail 50 -f
```

**Stop:**
```bash
docker compose -f docker-compose.linux.yml down
```

**Rebuild after code changes:**
```bash
docker compose -f docker-compose.linux.yml up -d --build
```

## Linux-specific adaptations

The `docker-compose.linux.yml` and `docker/Dockerfile` were modified from the original Windows-oriented files:

| Change | Reason |
|--------|--------|
| Base image `node:18-alpine` → `node:20-alpine` | better-sqlite3 requires Node 20+ |
| Added `python3`, `make`, `g++` build deps | Native module compilation for better-sqlite3 |
| `npm ci --only=production` → full install + prune | Build tools needed for native modules |
| `EXPOSE 3000` → `EXPOSE 4000` | Server runs on 4000 |
| Healthcheck port 3000 → 4000 | Match actual server port |
| Removed non-root user, runs as root | Docker socket volume permission issues |
| Removed PowerShell/Windows Agent env vars | Linux host, no Windows agent |
| Changed `ASA_CONFIG_SUB_PATH` to `Config/LinuxServer` | Linux path for ASA configs |
| Added `DB_PATH` env var | Override hardcoded `C:\ASA-API` database path |
| Changed `LOG_FILE_PATH` to `/app/logs/app.log` | Ensure writable path |

## Environment variables

Configure via `.env` file in `docker/` directory:

```env
PORT=4000
NODE_ENV=production
SERVER_MODE=hybrid
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:4010,https://ark.ilgaming.xyz
LOG_LEVEL=info
```

## Project structure notes

- `docker-compose.linux.yml` — entry point for Linux deployment
- `docker/Dockerfile` — container build file (modified for Linux)
- `docker/docker-entrypoint.sh` — copied from `scripts/` during build
- `docker/logs/` — runtime logs (mounted volume)
- `data/` — SQLite database (`asa-data.sqlite`)