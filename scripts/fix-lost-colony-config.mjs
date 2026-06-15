/**
 * Fix RCON port and dynamic config URL in Lost Colony's GameUserSettings.ini.
 * Usage: node scripts/fix-lost-colony-config.mjs
 */
import fs from "fs";
import path from "path";

const configPath = "D:\\ARK\\clusters\\iLGaming\\iLGaming - Lost Colony\\ShooterGame\\Saved\\Config\\WindowsServer\\GameUserSettings.ini";

let content = fs.readFileSync(configPath, "utf8");
const original = content;

// Fix RCON port to match start.bat (30009)
content = content.replace("RCONPort=30005", "RCONPort=30009");

// Fix truncated dynamic config URL
content = content.replace("CustomDynamicConfigUrl=http:", "CustomDynamicConfigUrl=http://ilgamingarksettings.servegame.com/");

if (content !== original) {
  fs.writeFileSync(configPath, content, "utf8");
  console.log("✓ Fixed RCON port and dynamic config URL");
} else {
  console.log("No changes needed");
}

// Verify
const lines = fs.readFileSync(configPath, "utf8").split("\n").filter(l => l.includes("RCONPort") || l.includes("CustomDynamicConfigUrl"));
lines.forEach(l => console.log(`  ${l}`));
