# ASA Docker Control API

## Project Structure (2024)

```
asa-docker-control-api/
├── config/         # Environment, NGINX, and .asa config files
├── data/           # Persistent data (SQLite database, etc.)
├── docker/         # Dockerfile and docker-compose files
├── docs/           # Documentation
├── logs/           # Log output (gitignored)
├── metrics/        # Prometheus and monitoring configs
├── middleware/     # Express/Fastify middleware
├── routes/         # API route handlers
├── scripts/        # PowerShell, batch, and shell scripts
├── services/       # Service logic (move database.js here if desired)
├── tests/          # Test scripts
├── utils/          # Utility modules
├── server.js       # Main API entry point
├── package.json    # NPM dependencies
└── ...             # Other supporting files
```

## Persistent Data
- **Database:** The SQLite database is now stored in `data/asa-data.sqlite`.
- **Other runtime data** (sessions, user data, etc.) should also go in `data/`.
- The `data/` directory and all database files are gitignored by default.

## Scripts
- All setup, update, and utility scripts are in the `scripts/` directory.
- Example: `scripts/update-service.bat`, `scripts/deploy-production.sh`, etc.

## Docker
- All Docker-related files are in the `docker/` directory.
- Example: `docker/Dockerfile`, `docker/docker-compose.yml`, etc.

## Configuration
- All environment files, NGINX configs, and .asa files are in the `config/` directory.
- Example: `config/env.example`, `config/nginx-ark.ilgaming.xyz.conf`, etc.

## Tests
- All test scripts are in the `tests/` directory.

## .gitignore
- The `data/` directory and all SQLite/database files are ignored by default.
- Log files, test output, and environment files are also ignored.

## Recommendations
- For best organization, consider moving `database.js` to `services/database.js` or `db/database.js`.
- Keep only `server.js`, `package.json`, and essential files in the root.

---

For more details, see the documentation in the `docs/` directory. 
