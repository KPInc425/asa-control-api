import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the SQLite database file (in data directory)
// Support both development and production service environments
function getDatabasePath() {
  // Check for custom database path in environment
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  // Check if we're running in a service environment
  const currentDir = process.cwd();
  const isServiceEnvironment =
    currentDir.includes("C:\\ASA-API") ||
    process.env.NODE_ENV === "production" ||
    process.env.SERVICE_MODE === "true";

  if (isServiceEnvironment) {
    return path.join("C:\\ASA-API", "data", "asa-data.sqlite");
  } else {
    // Development environment - use relative path from project
    return path.join(__dirname, "..", "..", "data", "asa-data.sqlite");
  }
}

const dbPath = getDatabasePath();
console.log("Database path:", dbPath);

// Ensure the data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

export { db, getDatabasePath };
