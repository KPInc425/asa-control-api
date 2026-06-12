import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "..", ".env") });

// Static default game metadata — populated at init from game adapters.
// This is a best-effort snapshot; the authoritative source is GET /api/games.
const staticGameConfigs = {
  ark: {
    name: "ARK: Survival Ascended",
    configSubPath: "Config/WindowsServer",
    defaultConfigFiles: ["Game.ini", "GameUserSettings.ini", "Engine.ini"],
    defaultPorts: { game: 7777, query: 27015, rcon: 32330 },
    capabilities: {
      canCluster: true,
      supportsSteamWorkshop: true,
      supportsRcon: true,
      supportsQuery: true,
    },
  },
};

const config = {
  jwt: {
    secret: process.env.JWT_SECRET || "fallback-secret-change-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  },

  docker: {
    socketPath:
      process.env.DOCKER_SOCKET_PATH ||
      (process.platform === "win32"
        ? "\\\\.\\pipe\\docker_engine"
        : "/var/run/docker.sock"),
    enabled: process.env.DOCKER_ENABLED !== "false",
  },

  server: {
    port: parseInt(process.env.PORT) || 4000,
    host: process.env.HOST || "0.0.0.0",
    nodeEnv: process.env.NODE_ENV || "development",
    mode: process.env.SERVER_MODE || "docker",
    native: {
      basePath: path.normalize(process.env.NATIVE_BASE_PATH || "C:\\ARK"),
      configFile: process.env.NATIVE_CONFIG_FILE || "native-servers.json",
      steamCmdPath: process.env.STEAMCMD_PATH || null,
      autoInstallSteamCmd: process.env.AUTO_INSTALL_STEAMCMD !== "false",
      clustersPath: path.normalize(
        process.env.NATIVE_CLUSTERS_PATH || "C:\\ARK\\clusters",
      ),
    },
    hybrid: {
      agentUrl: process.env.AGENT_URL || "http://host.docker.internal:5000",
      agentEnabled: process.env.AGENT_ENABLED === "true",
    },
  },

  // Static default game metadata (authoritative source is GET /api/games)
  games: staticGameConfigs,

  asa: {
    serverRootPath: path.normalize(
      process.env.NATIVE_BASE_PATH ||
        (process.env.SERVER_MODE === "native"
          ? "C:\\ARK"
          : "/opt/asa/asa-server"),
    ),
    configSubPath: process.env.ASA_CONFIG_SUB_PATH || "Config/WindowsServer",
    updateLockPath:
      process.env.ASA_UPDATE_LOCK_PATH ||
      (process.env.SERVER_MODE === "native"
        ? path.join(
            path.normalize(process.env.NATIVE_BASE_PATH || "C:\\ARK"),
            ".update.lock",
          )
        : "/opt/asa/.update.lock"),
    defaultConfigFiles: ["Game.ini", "GameUserSettings.ini"],
    customDynamicConfigUrl: process.env.CUSTOM_DYNAMIC_CONFIG_URL || "",
  },

  rcon: {
    defaultPort: parseInt(process.env.RCON_DEFAULT_PORT) || 32330,
    password: process.env.RCON_PASSWORD || "admin",
  },

  rateLimit: {
    max:
      parseInt(process.env.RATE_LIMIT_MAX) ||
      (process.env.NODE_ENV === "development" ? 1000 : 100),
    timeWindow:
      parseInt(process.env.RATE_LIMIT_TIME_WINDOW) ||
      (process.env.NODE_ENV === "development" ? 60000 : 900000),
  },

  cors: {
    origin:
      process.env.CORS_ORIGIN ||
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:4000,http://127.0.0.1:4000",
  },

  logging: {
    level: process.env.LOG_LEVEL || "warn",
    filePath: process.env.LOG_FILE_PATH || "./logs/app.log",
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || "10m",
    maxFiles: process.env.LOG_MAX_FILES || 5,
    enableDebug: process.env.LOG_ENABLE_DEBUG === "true" || false,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED === "true" || true,
  },

  arkLogs: {
    basePath:
      process.env.ARK_LOGS_BASE_PATH ||
      (process.env.SERVER_MODE === "native"
        ? path.normalize(process.env.NATIVE_BASE_PATH || "C:\\ARK")
        : "/home/gameserver/server-files"),
  },
};

export default config;

/**
 * Convenience: get config defaults for a specific game type.
 * @param {string} gameType
 * @returns {object}
 */
export function gameConfig(gameType) {
  return config.games[gameType] || config.games["ark"];
}
