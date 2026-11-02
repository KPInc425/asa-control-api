# Server-side automation without a mod

What this API can do to a running ASA server without installing a mod, what it
cannot, and the shape of the event engine that would cover the difference.

## The boundary

Three things make mod-free automation possible:

1. **RCON commands.** The server already exposes a large command surface to any
   authenticated RCON client. Verified working on this suite: `ListPlayers`,
   `saveworld`, `GetChat`, `getgamelog`, `Broadcast`. Verified to exist in ASA from
   the command reference: `GiveItemToPlayer <PlayerID> <BlueprintPath> <Quantity>
   <Quality> <ForceBlueprint>`, `GiveItemNumToPlayer`, `KickPlayer`, `BanPlayer`,
   `UnbanPlayer`, `DestroyWildDinos`, `Summon`, `GMSummon`, `SpawnExactDino`,
   `MaxAscend`, `DefeatAllBosses`, `ForceUpdateDynamicConfig`, `ShowMyAdminManager`.
2. **The server log.** `ShooterGame/Saved/Logs/ShooterGame.log` records
   `PlayerName [UniqueNetId:...] joined this ARK!` and `left this ARK!`, plus saves,
   restarts and mod load results. It is the join and leave event source.
3. **Chat.** `GetChat` over RCON, already polled by `services/chat-poller.js`, is the
   player-to-server input channel.

### What that covers (no mod required)

- Starting kits, welcome packages, first-spawn loadouts
- Chat commands: `!kit`, `!event`, `!vote`, `!help`, admin-only commands
- MOTD, scheduled broadcasts, restart warnings
- Timed events: XP or harvest windows via the dynamic config, dino wipes, boss resets
- Moderation: kick, ban, whitelist
- Player and session tracking, playtime, last seen
- Scheduled maintenance: save, then stop or restart

### What it cannot cover

Anything that has to run inside the engine:

- New items, dinos, structures, engrams, skins, UI
- Reacting to gameplay events in code (on hit, on craft, on level up, on item use)
- Custom spawn logic beyond the config files
- Anything the command surface does not already expose

Those need a mod. This is not a limitation of the API, it is where the seam is: RCON
can only ask the engine to do things the engine already knows how to do.

Also worth stating plainly: C++ plugins (ArkServerApi) are a third path, and not one
worth taking. They load code into the server process, break on most game updates,
and nothing on this box uses them - `C:\ASA-API` is a stale sqlite, not an install.

## Shape of the engine

```
event sources            rules                    actions
--------------           -----------------        ---------------------
log tail (join/leave) ->  event JSON  ->  match  ->  RCON command(s)
GetChat poll (chat)   ->  rules       ->  cooldown-> broadcast
scheduler (cron)      ->  (per server)->  guards  ->  dynamic config write
                                                      start/stop/restart
                                                      webhook (Discord)
```

A rule is data, not code:

```json
{
  "id": "first-spawn-kit",
  "enabled": true,
  "server": "*",
  "on": { "event": "player.join" },
  "when": [
    { "type": "first-join", "storage": "sqlite" },
    { "type": "cooldown", "key": "kit", "seconds": 86400 }
  ],
  "then": [
    { "rcon": "GiveItemToPlayer {{playerId}} \"Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_HealSoup_C'\" 5 0 0" },
    { "rcon": "GiveItemNumToPlayer {{playerId}} 21 1 0 0" },
    { "chat": "Welcome {{playerName}}, kit delivered." }
  ]
}
```

Design rules that matter more than the features:

- **Dry run is the default.** A new rule logs what it would do until it is explicitly
  enabled, because a bad rule on a live server is worse than a missing one.
- **Every action is logged with the event that caused it**, so "why did that player
  get an item" has an answer.
- **Cooldowns and first-join tracking live in sqlite**, not memory, so a restart does
  not hand out kits twice.
- **`playerId` comes from `ListPlayers`, not from the log line.** The log gives the
  name and the UniqueNetId; the RCON commands need the in-game player id, so the
  engine resolves name to id at action time and skips with a log line if the player
  has already left.
- **No rule may stop a server without saving.** That path is already centralised in
  `saveWorldBeforeStop`.

## The mod workflow

The devkit is a stripped editor build: Blueprint and data assets, no C++, no live
coding, no MCP. Driving it from an agent is not on the table, and anyone claiming
otherwise has not tried.

So the split is by boundary, not by preference:

| Owned by the devkit | Owned by this repo and this agent |
|---|---|
| Blueprint graphs, actor placement, materials, cooking | Everything before and after the editor |
| The `.pak` | The repo, changelog, version, config schema, release notes |
| In-editor testing | Server-side proof: does it load, does it log errors, does its config apply |

Concretely, per mod:

1. **Repo per mod** holding the config schema, changelog, release notes and the
   source assets (LFS), so a mod has a history outside the editor's binary files.
2. **Pak audit before every update.** Unpack the shipped `.pak` (`repak` reads UE5
   paks), list assets, and diff against the installed version. That is how we know an
   update changed something other than what its changelog claims, and it happens
   before the files reach a server.
3. **Data authored as text.** Spawn entries, loot tables, item quantities and config
   blocks are data; those get generated as JSON/ini that the mod reads, instead of
   being hand-edited inside Blueprints.
4. **Server-side acceptance test.** Start the server with the mod, read
   `LogCFCore: Mod valid: <name> (<id>)`, watch for errors, and confirm the config
   took effect. This is already how mods are verified here.
5. **Rollout.** The API owns the servers, so a mod update is a config change plus a
   restart, with a save first.

For features that do not need a new asset, the event engine above is the cheaper
path: a starting kit is a rule, not a mod.
