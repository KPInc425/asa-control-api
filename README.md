# ASA Docker Control API

## Overview

This is the backend API for the ASA Management Suite. It provides secure orchestration, configuration, and monitoring for ARK: Survival Ascended servers (both Docker and native Windows).

- **Framework:** Node.js, Fastify
- **Features:**
  - REST API for server management
  - RCON command support
  - Config file management
  - Real-time log streaming (Socket.IO)
  - JWT authentication
  - Prometheus metrics
  - Modular route and service structure

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy and edit the environment file:
   ```sh
   cp env.example .env
   # Edit .env as needed
   ```
3. Start the API:
   ```sh
   npm start
   ```

## API Endpoints

- `/api/containers` — Docker container management
- `/api/rcon` — Send RCON commands
- `/api/configs/:map` — Read/write config files
- `/api/native-servers/:name/debug-rcon` — Debug server config and RCON
- `/metrics` — Prometheus metrics

See [API_INTERACTION_GUIDE.md](../docs/API_INTERACTION_GUIDE.md) for full details.

## Documentation Map

- [RCON Authentication](./docs/RCON_AUTH.md)
- [Password Migration Guide](../docs/PASSWORD_MIGRATION_GUIDE.md)
- [Development Journey](../development-journey/README.md)
- [Other Backend Docs](./docs/)

## Security Notes
- All sensitive data (e.g., RCON/admin passwords) is stored in `GameUserSettings.ini`.
- All routes are protected by JWT authentication and permission checks.
- Input is validated and sanitized at every endpoint.

---

For migration stories and debugging adventures, see the [Development Journey](../development-journey/README.md). 
