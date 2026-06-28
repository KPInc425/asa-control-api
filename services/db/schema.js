import { db } from "./connection.js";

// Create users table with expanded schema
db.prepare(
  `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',
  permissions TEXT DEFAULT '[]',
  profile TEXT DEFAULT '{}',
  security TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create sessions table
db.prepare(
  `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`,
).run();

// Create jobs table
db.prepare(
  `CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress TEXT DEFAULT '[]',
  result TEXT,
  error TEXT,
  data TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create password reset tokens table
db.prepare(
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`,
).run();

// Create email verification tokens table
db.prepare(
  `CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
)`,
).run();

// Create login attempts table
db.prepare(
  `CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN DEFAULT FALSE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Add game_type column to server_configs for existing databases (game adapter migration)
try {
  db.prepare(
    "ALTER TABLE server_configs ADD COLUMN game_type TEXT DEFAULT 'ark'",
  ).run();
  console.log("Added column game_type to server_configs");
} catch (error) {
  // Column already exists, ignore error
}

// Add game_type column to server_update_configs for existing databases
try {
  db.prepare(
    "ALTER TABLE server_update_configs ADD COLUMN game_type TEXT DEFAULT 'ark'",
  ).run();
  console.log("Added column game_type to server_update_configs");
} catch (error) {
  // Column already exists, ignore error
}

// Create server configurations table
db.prepare(
  `CREATE TABLE IF NOT EXISTS server_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  game_type TEXT DEFAULT 'ark',
  config_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create shared mods table
db.prepare(
  `CREATE TABLE IF NOT EXISTS shared_mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id TEXT UNIQUE NOT NULL,
  mod_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create server mods table
db.prepare(
  `CREATE TABLE IF NOT EXISTS server_mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  mod_id TEXT,
  mod_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  excludeSharedMods BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, mod_id)
)`,
).run();

// Add excludeSharedMods column if it doesn't exist (for existing databases)
try {
  db.prepare(
    "ALTER TABLE server_mods ADD COLUMN excludeSharedMods BOOLEAN DEFAULT FALSE",
  ).run();
} catch (error) {
  // Column already exists, ignore error
}

// Update mod_id to allow NULL (for storing server settings)
try {
  db.prepare(
    "CREATE TABLE server_mods_new (id INTEGER PRIMARY KEY AUTOINCREMENT, server_name TEXT NOT NULL, mod_id TEXT, mod_name TEXT, enabled BOOLEAN DEFAULT TRUE, excludeSharedMods BOOLEAN DEFAULT FALSE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(server_name, mod_id))",
  ).run();
  db.prepare("INSERT INTO server_mods_new SELECT * FROM server_mods").run();
  db.prepare("DROP TABLE server_mods").run();
  db.prepare("ALTER TABLE server_mods_new RENAME TO server_mods").run();
} catch (error) {
  // Table already updated, ignore error
}

// Create configuration exclusions table
db.prepare(
  `CREATE TABLE IF NOT EXISTS config_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  config_file TEXT NOT NULL,
  exclusion_pattern TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, config_file, exclusion_pattern)
)`,
).run();

// Create server update configurations table
db.prepare(
  `CREATE TABLE IF NOT EXISTS server_update_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT UNIQUE NOT NULL,
  cluster_name TEXT,
  update_on_start BOOLEAN DEFAULT TRUE,
  last_update DATETIME,
  update_enabled BOOLEAN DEFAULT TRUE,
  auto_update BOOLEAN DEFAULT FALSE,
  update_interval INTEGER DEFAULT 24,
  update_schedule TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create game_definitions table for dynamic game types
db.prepare(
  `CREATE TABLE IF NOT EXISTS game_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_type TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  binary_name TEXT NOT NULL,
  process_names TEXT NOT NULL,
  steam_app_id TEXT,
  config_files TEXT NOT NULL,
  config_sub_path TEXT DEFAULT '',
  default_game_port INTEGER DEFAULT 7777,
  default_query_port INTEGER DEFAULT 27015,
  default_rcon_port INTEGER DEFAULT 25575,
  can_cluster BOOLEAN DEFAULT FALSE,
  supports_steam_workshop BOOLEAN DEFAULT FALSE,
  supports_rcon BOOLEAN DEFAULT TRUE,
  supports_query BOOLEAN DEFAULT FALSE,
  binary_exe_relative_path TEXT,
  install_script_template TEXT,
  start_script_template TEXT,
  stop_script_template TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// --- Auto-Update Notification Fields Migration ---
const autoUpdateColumns = [
  { name: "notify_rcon", definition: "BOOLEAN DEFAULT 1" },
  { name: "notify_discord", definition: "BOOLEAN DEFAULT 1" },
  { name: "notify_socket", definition: "BOOLEAN DEFAULT 1" },
  { name: "warning_minutes", definition: "TEXT DEFAULT '[30,10,5,1]'" },
  { name: "notification_templates", definition: "TEXT DEFAULT NULL" },
  { name: "auto_restart", definition: "BOOLEAN DEFAULT 1" },
  { name: "auto_update_enabled", definition: "BOOLEAN DEFAULT 0" },
  { name: "auto_update_check_interval", definition: "INTEGER DEFAULT 60" },
  { name: "auto_update_if_empty", definition: "BOOLEAN DEFAULT 1" },
  { name: "last_update_check", definition: "DATETIME DEFAULT NULL" },
  { name: "last_update_applied", definition: "DATETIME DEFAULT NULL" },
];

for (const column of autoUpdateColumns) {
  try {
    db.prepare(
      `ALTER TABLE server_update_configs ADD COLUMN ${column.name} ${column.definition}`,
    ).run();
    console.log(`Added column ${column.name} to server_update_configs`);
  } catch (error) {
    // Column already exists, ignore error
  }
}

// Create server update history table
db.prepare(
  `CREATE TABLE IF NOT EXISTS server_update_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  old_version TEXT,
  new_version TEXT,
  message TEXT,
  details TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
).run();

// Create index on server_name for faster queries
try {
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_update_history_server ON server_update_history(server_name)`,
  ).run();
} catch (error) {
  // Index already exists, ignore
}
