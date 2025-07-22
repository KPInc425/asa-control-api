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

## Deployment Options

### All-in-One (1-Click) Setup (Frontend + Backend on Same Server)

If you want to run both the backend API and the dashboard on the same server (recommended for simple setups):

1. Clone the repository and enter the project root:
   ```sh
   git clone <repo-url>
   cd asa-management
   ```
2. Run the 1-click install script (proposed, see `scripts/install-all-in-one.sh`):
   ```sh
   ./scripts/install-all-in-one.sh
   ```
   This will:
   - Install dependencies for both backend and frontend
   - Copy example env files for both
   - Build the frontend and backend
   - Start both services (backend on port 4000, frontend on port 5173 or as static files)

3. Access the dashboard at `http://localhost:5173` (or the port shown in the output).

### Advanced Setup (Separate Frontend/Backend)

If you want to run the backend and frontend on different servers or containers:

#### Backend
1. Enter the backend directory:
   ```sh
   cd asa-docker-control-api
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Copy and edit the environment file:
   ```sh
   cp env.example .env
   # Edit .env as needed
   ```
4. Start the API:
   ```sh
   npm start
   ```

#### Frontend
See [../asa-servers-dashboard/README.md](../asa-servers-dashboard/README.md) for frontend setup instructions.

## Windows All-in-One Setup (PowerShell)

For Windows 10/11 users running native ARK servers, you can use the provided PowerShell script for a one-click install and launch:

1. Open PowerShell as Administrator.
2. Navigate to the backend scripts directory:
   ```powershell
   cd asa-docker-control-api/scripts
   ./install-all-in-one.ps1
   ```
   Or, from the dashboard scripts directory:
   ```powershell
   cd asa-servers-dashboard/scripts
   ./install-all-in-one.ps1
   ```
3. This will install dependencies, build the frontend, and start both backend and frontend in new windows.
4. Access the dashboard at [http://localhost:5173](http://localhost:5173) and the API at [http://localhost:4000](http://localhost:4000)

## Linux All-in-One Setup (Bash)

Linux users can use the bash script:

```bash
bash scripts/install-all-in-one.sh
```

Or use Docker Compose for containerized deployment (see `docker/` and documentation for details).

---

For more details, see the frontend README and the documentation in the `docs/` folder.

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
