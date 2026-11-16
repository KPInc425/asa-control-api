/**
 * Canonical ARK: Survival Ascended launch line builder.
 *
 * Single source of truth for the start.bat that both the standalone and the
 * cluster script generators write. Every option that ASA actually reads lives
 * in the map URL ("<Map>?listen?SessionName=...?Port=..."); mods, logging and
 * cluster overrides are command-line flags.
 *
 * Why this is centralised: the previous inline templates emitted
 * "<map>_WP" for every map (which silently breaks every CurseForge mod map),
 * used "?WinLivePlayers=" (not an ASA option, so max players never applied),
 * and put the ports only on "-Port=" flags with no "?listen". A server started
 * that way does not accept connections on the configured ports.
 */

// Base-game ASA maps that need the "_WP" suffix. Anything NOT in this list is
// treated as a mod map and passed through exactly as configured (mod maps such
// as ASurviveTheNight do not use the _WP suffix).
const BASE_GAME_MAPS = new Set([
  "TheIsland",
  "TheCenter",
  "ScorchedEarth",
  "Aberration",
  "Extinction",
  "Ragnarok",
  "Valguero",
  "CrystalIsles",
  "Astraeos",
  "Svartalfheim",
  "LostColony",
]);

export function resolveMapName(map) {
  if (!map) return "TheIsland_WP";
  if (/_WP$/.test(map)) return map;
  if (/_P$/.test(map)) return map;
  return BASE_GAME_MAPS.has(map) ? `${map}_WP` : map;
}

function quoteIfSet(value) {
  return value !== undefined && value !== null && String(value).length > 0;
}

/**
 * Build the URL argument for the ARK server binary.
 * @param {object} cfg server configuration (DB config_data shape)
 * @returns {string}
 */
export function buildArkUrl(cfg = {}) {
  const map = resolveMapName(cfg.map || cfg.mapName);
  const parts = [
    map,
    "listen",
    `Port=${cfg.gamePort || 7777}`,
    `QueryPort=${cfg.queryPort || 27015}`,
    `RCONPort=${cfg.rconPort || 32330}`,
    "RCONEnabled=True",
    `MaxPlayers=${cfg.maxPlayers || 70}`,
  ];

  if (quoteIfSet(cfg.serverPassword)) parts.push(`ServerPassword=${cfg.serverPassword}`);
  // ASA's RCON authenticates with the RCON password when supplied; keep it in
  // the URL so the API's RCON client can actually log in.
  if (quoteIfSet(cfg.rconPassword)) parts.push(`RCONPassword=${cfg.rconPassword}`);

  const dynamicUrl = cfg.customDynamicConfigUrl || cfg.dynamicConfigUrl || "";
  if (dynamicUrl && String(dynamicUrl).trim() !== "") {
    // No inner quotes: a nested double quote terminates the URL token for the
    // command-line and for utils/parse-start-bat.js, which then loses every
    // option after it (SessionName especially). A URL has no spaces, so it does
    // not need quoting.
    // Canonical spelling. UE's option parser is case-insensitive, but the working
    // hand-written servers on this box all use this form, so match what is proven
    // rather than rely on a parser quirk.
    parts.push(`CustomDynamicConfigUrl=${dynamicUrl}`);
  }

  // Cluster id is NOT put in the URL. ASA reads an option's value as everything
  // from "key=" to the end of the URL string, so "?ClusterId=iLGaming?SessionName=..."
  // produced a cluster mutex called "ASAClusterMutex_iLGaming?SessionName=...".
  // That is a different identity from the anchor map's "ASAClusterMutex_iLGaming",
  // so the map advertised but never joined the cluster and never showed up as a
  // transfer destination. The "-clusterid=<id>" flag is what ASA honours; leave it
  // as the only carrier.

  // SessionName goes last on purpose: it is the only value that can contain
  // spaces, so it must never sit in front of an option that matters.
  parts.push(`SessionName=${cfg.sessionName || cfg.name || "ASA Server"}`);

  // ServerAdminPassword MUST be the final URL option. ASA writes this value
  // into GameUserSettings.ini by taking everything from the value to the end of
  // the URL string, so any option placed after it is serialised into the admin
  // password (the value ends up quoted and hundreds of characters long). The
  // server then authenticates RCON against that corrupted string and every
  // login fails with "Authentication failed". Putting it last makes the
  // captured remainder exactly the password.
  if (quoteIfSet(cfg.adminPassword)) parts.push(`ServerAdminPassword=${cfg.adminPassword}`);

  return parts.join("?");
}

/**
 * Build command-line flags (everything after the quoted URL).
 * @param {object} cfg
 * @param {string[]} mods final mod id list
 * @param {object} [opts] { clusterDataPath, clusterId }
 */
export function buildArkFlags(cfg = {}, mods = [], opts = {}) {
  // VERIFIED on ASA build 26334129 (2026-10-31): "?Port="/"?QueryPort=" in the
  // map URL are accepted but NOT applied - the server still binds the defaults
  // 7777/27015. The "-Port="/"-QueryPort=" command-line flags are what actually
  // bind. "?RCONPort=" in the URL does work, so it is kept in both places.
  const flags = [
    "-server",
    "-log",
    "-servergamelog",
    "-NotifyAdminCommandsInChat",
    `-Port=${cfg.gamePort || 7777}`,
    `-QueryPort=${cfg.queryPort || 27015}`,
    `-RCONPort=${cfg.rconPort || 32330}`,
  ];

  if (Array.isArray(mods) && mods.length > 0) {
    flags.push(`-mods=${mods.join(",")}`);
  }
  if (cfg.disableBattleEye) flags.push("-NoBattleEye");

  const dynamicUrl = cfg.customDynamicConfigUrl || cfg.dynamicConfigUrl || "";
  if (dynamicUrl && String(dynamicUrl).trim() !== "") flags.push("-UseDynamicConfig");

  if (opts.clusterId) {
    flags.push(`-clusterid=${opts.clusterId}`);
    if (opts.clusterDataPath) {
      // Windows accepts forward slashes, but this path is handed to a Win32 binary
      // and is also read back by parse-start-bat, so normalise it.
      const clusterDir =
        process.platform === "win32"
          ? String(opts.clusterDataPath).replace(/\//g, "\\")
          : opts.clusterDataPath;
      flags.push(`-ClusterDirOverride="${clusterDir}"`);
    }
    // Only meaningful alongside a cluster dir; without one, transfers stay filtered.
    flags.push("-NoTransferFromFiltering");
  }
  return flags;
}

/**
 * Render the whole start.bat.
 * @param {object} args
 * @param {string} args.exePath absolute path to ArkAscendedServer.exe
 * @param {object} args.cfg server config
 * @param {string[]} [args.mods]
 * @param {object} [args.cluster] { clusterId, clusterDataPath }
 * @returns {string}
 */
export function buildArkStartBat({ exePath, cfg = {}, mods = [], cluster = null }) {
  const url = buildArkUrl(cfg);
  const flags = buildArkFlags(cfg, mods, cluster || {});
  const name = cfg.name || cfg.sessionName || "ASA Server";
  const lines = [
    "@echo off",
    `REM ${name} - generated by asa-control-api. Do not hand-edit: the API rewrites this file on every start.`,
    `REM Map/ports/session options live in the URL; mods and logging are flags.`,
    `"${exePath}" "${url}" ${flags.join(" ")}`,
    `echo Server ${name} exited at %DATE% %TIME%`,
  ];
  return lines.join("\r\n") + "\r\n";
}
