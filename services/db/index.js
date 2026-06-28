// Database access layer — split into domain modules
// This index re-exports everything for backward compatibility.
// Consumers can import from "./db/index.js" or continue using "../services/database.js"

export { db } from "./connection.js";

// Schema initialization (runs as side effect on import)
import "./schema.js";

// Domain modules
export {
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  deleteUser,
} from "./users.js";

export {
  createSession,
  getSessionByToken,
  getSessionById,
  getSessionsByUserId,
  updateSessionActivity,
  deleteSession,
  deleteSessionByToken,
  cleanupExpiredSessions,
} from "./sessions.js";

export {
  createJob,
  getJob,
  getAllJobs,
  updateJob,
  deleteJob,
  cleanupOldJobs,
} from "./jobs.js";

export {
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  cleanupExpiredPasswordResetTokens,
  createEmailVerificationToken,
  getEmailVerificationToken,
  markEmailVerificationTokenUsed,
  cleanupExpiredEmailVerificationTokens,
} from "./tokens.js";

export {
  recordLoginAttempt,
  getRecentFailedLoginAttempts,
  cleanupOldLoginAttempts,
} from "./login-attempts.js";

export {
  upsertServerConfig,
  getServerConfig,
  getAllServerConfigs,
  deleteServerConfig,
} from "./server-configs.js";

export {
  upsertSharedMod,
  getSharedMod,
  getAllSharedMods,
  deleteSharedMod,
  upsertServerMod,
  getServerMods,
  deleteServerMod,
  deleteAllServerMods,
  getAllServerMods,
  upsertServerSettings,
  getServerSettings,
} from "./mods.js";

export {
  addConfigExclusion,
  getConfigExclusions,
  getConfigExclusionsForFile,
  deleteConfigExclusion,
  deleteAllConfigExclusions,
} from "./config-exclusions.js";

export {
  upsertServerUpdateConfig,
  getServerUpdateConfig,
  getAllServerUpdateConfigs,
  updateServerLastUpdate,
  deleteServerUpdateConfig,
} from "./update-configs.js";

export {
  getAutoUpdateConfig,
  setAutoUpdateConfig,
  getAutoUpdateEnabledServers,
  updateLastCheckTime,
  updateLastAppliedTime,
} from "./auto-update.js";

export {
  saveServerUpdateHistory,
  getServerUpdateHistory,
  cleanupOldUpdateHistory,
} from "./update-history.js";

export {
  upsertGameDefinition,
  getGameDefinition,
  getAllGameDefinitions,
  deleteGameDefinition,
  gameDefinitionExists,
} from "./game-definitions.js";
