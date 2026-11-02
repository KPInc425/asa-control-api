# On-demand cluster maps

Spin a map up from Discord, keep it while people are on it, let it fall asleep when
they leave. Feasible, and most of the machinery already exists. The limiting factor
is RAM, not code.

## Measured on OLDRIG (2026-11-02)

| Thing | Value |
|---|---|
| Total RAM | 47.9 GB |
| Free RAM with both servers running | 8.9 GB |
| In game servers now | 12.8 GB (10.36 + 2.43) |
| Everything else (Windows, Syncthing, TeamViewer, Ollama, V Rising, VSCode) | ~26 GB |
| Logical cores | 16 |
| D: free | 276 GB |
| C: free | 118 GB |
| Cold start, 11 mods | 106 s to "advertising for join" |
| Cold start, 1 mod | ~24 s |

Disk is not a problem, and it is less of one than it looks: ASA's `-SavedDir` lets
**one installation run several servers**, combined with `?AltSaveDirectoryName=` per
map, so a new map costs its save data rather than another 13.6 GB install.

## The constraint that decides everything

**A cluster requires the same mods on every member.** Cluster transfer moves a
character and its items between processes, and ARK expects the destination to know
every mod the source has. A vanilla map bolted onto a modded base map is not a
cluster, it is two servers.

So the per-map cost is the base map's cost, not a cheaper number. With the current
mod set that is roughly 10 GB a map:

- base map + 1 member: about 21 GB for the game, which today only fits if something
  else on the box gives up RAM (8.9 GB free, 10 GB needed).
- base map + 2 or 3 members: needs the RAM upgrade KP is already watching deals for.

That is the honest answer to "can we run this now": the software is ready, the box
supports a base map plus one member once the rest of its load is trimmed, and a real
cluster waits on RAM.

## What already exists

| Piece | Status |
|---|---|
| Start/stop a server over HTTP | Works (`POST /api/native-servers/:name/start`) |
| Idle shutdown with warnings and a save | `services/auto-shutdown.js`: `timeoutMinutes` (default 30), warnings at 15/10/5/2, save-before-shutdown. Per-server config, `enabled: false` by default |
| Save before any stop | `lifecycle.saveWorldBeforeStop()` |
| Player detection | RCON `ListPlayers` |
| Discord control surface | Controller Bot on the prod box, `commands/utility/<game>.js` + `utils/<game>Control.js` |
| Rate changes at runtime | the dynamic config, no restart |

## What is missing, in build order

1. **Cluster wiring.** Both servers need the same `-clusterid` and a shared
   `ClusterDirOverride`, with `?AltSaveDirectoryName=` per map. Today the Halloween
   server has no cluster id at all, so it is not a cluster member, just a second
   server.
2. **A warm-up policy layer.** The idle timer alone is not enough: it needs a
   minimum uptime before anything can shut down (so a spin-up does not die while it
   is still booting), a reset on the first join, and a separate "empty for N minutes"
   timer after the last player leaves. The existing service covers the empty case;
   the minimum-uptime guard does not exist.
3. **Ready detection.** The bot must not answer "join now" at `taskkill` time. The
   signal is the server log line `Server has completed startup and is now
   advertising for join`, which takes 24 s to 106 s depending on mods. The reply
   should say which.
4. **A capacity guard.** Before starting anything, sum the resident memory of running
   ASA processes plus the expected cost, and refuse with a clear message when RAM is
   short. This is what stops an on-demand map from paging the box into a crash that
   also takes down the base map.
5. **The Discord command**, for example `/cluster up <map>`: start, wait for ready,
   reply with the map name, session name and how to travel. `/cluster list` shows
   what is running and when each one will sleep.

## Behaviour worth writing down before building

- **A spin-up is not instant.** With mods it is one to two minutes, so the command
  has to acknowledge and follow up rather than imply the map is ready.
- **Transfers need the destination up first.** The player has to wait for ready, then
  transfer from the base map. That ordering belongs in the bot's reply.
- **The base map never sleeps.** It is the anchor and the thing every transfer starts
  from.
- **Shutdown must save.** Already centralised, and the reason a kicked player does
  not come back to an older position.
- **A sleeping map still costs its save data.** Backups should account for maps that
  are off most of the time.
