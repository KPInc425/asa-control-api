# KPTweaks: player kits with an in-game admin GUI

Why this cannot be done from the API, what to build in the devkit, and where the
uncertain parts are. Written after a night of failed console grants, so the constraints
are evidence, not preference.

## Why it has to be a mod

Measured on the live server, tonight:

| Action | Over RCON | In game as admin |
|---|---|---|
| Broadcast, chat to a player, save, player list | works | works |
| Grant an item to yourself (`gfi`) | not tested | **works** |
| Grant an item to another player (`GiveItemToPlayer`) | fails | **fails** |

`GiveItemToPlayer` was tried with four syntaxes, two player IDs, and blueprint paths
read out of the game's own asset manifest. Every attempt returned the same canned
acknowledgement and delivered nothing, while `gfi` on the same server, same session,
same item path delivered immediately.

So the blocker is specifically the targeted grant, not RCON, not cheats, not paths. A
mod does not use that command at all, which is why it is the way through.

## What the feature actually is

1. A **kit definition**: a named list of item + quantity + quality, optionally one
   creature and its saddle.
2. A **rule**: give it on first join, or on a cooldown, or on a command.
3. A **record**: this character has already had kit X.
4. A **GUI**: edit kits in game, no recompile, no config file hand-editing.

## The three hard parts, in order of risk

### 1. The grant itself (low risk)

Do not shell out to a console command. Use the inventory API: resolve the item class,
create the item, add it to the player's inventory component. This is what every kit
mod does and it sidesteps console parsing entirely, which is the thing that failed us.

For the creature: spawn and tame rather than summon-by-console, then give it to the
player as owner. Saddle goes in the creature's saddle slot.

### 2. Remembering who already had it (medium risk, the real design question)

This must persist **per character**, not per server and not per player ID, or a relog
hands out a second kit and a wipe resets everyone.

Three options, none confirmed on ASA yet:

- A hidden **buff** on the character carrying a tag per kit. Cheapest, and it travels
  with the character, which is what we want.
- A **custom field on the player data**. Cleanest if ASA exposes one to mods.
- A **mod-side save file** keyed by player unique ID. Works regardless, but is the
  only one that breaks if a character is deleted and recreated with the same ID.

Start with the buff. If ASA will not persist a custom buff reliably, fall back to the
mod save.

### 3. The GUI (highest cost, most visible)

The ASE original solved this with a Blueprint widget pair and a buff that pushed
settings to clients. That pattern is the one to copy, and it is why the original felt
instant: the server changed a value and the client was told, no relog.

Minimum viable panel:

- A scrollable list of kits, add and remove.
- Per kit: a name, an enabled toggle, a trigger selector (first join / cooldown /
  command), a cooldown value.
- Per kit: a list of item rows, each a searchable item picker plus quantity.
- A save button, and a visible "unsaved changes" state.

Do not build item editing by typing blueprint paths. The picker should resolve from
the game's item registry and show the display name, which is the mistake the console
route forces on you.

## What I would build first, and what I would not

**Build first:** the grant plus the claimed marker, with kits defined in a config we
write. No GUI. That gets Willow a kit tonight-ish, and it proves the two risky pieces
before any pixels exist.

**Build second:** the admin panel over the top of that. The panel is only a view once
the data model exists.

**Do not build:** an in-game player-facing kit menu. Nothing in your usage needs it,
and it multiplies the UI work.

## How our API still drives it

The obvious idea is to extend RCON from inside the mod, so the dashboard and bot can
keep issuing commands. That is not possible: registering console commands requires
`IConsoleManager::RegisterConsoleCommand`, which is C++, and ASA mods cannot ship C++.
The same wall as before, one level lower.

What does work is a **command file bridge**, because the API already owns the
filesystem:

1. The API writes `kits.json` (definitions) and `queue.json` (pending actions) into the
   server's `Saved` directory.
2. The mod polls on a timer, applies each pending action through the inventory API, and
   records which command ids it has already processed.
3. The mod writes `results.json`, which the API reads to confirm what actually happened.

That keeps the dashboard and Discord as the control surface with no C++ and no console
commands, and it removes the engine command layer from the path entirely, which is the
layer that failed tonight.

Two implementation rules: write to a temp file and rename, so the mod never reads a
half-written file; and persist processed ids, so a server restart does not replay the
queue and hand out a second kit.

Because the mod can also read chat, player-facing `!kit` and `!kit give <player> <kit>`
come almost free once the executor exists.

## Devkit steps

1. In the KPTweaks project, add a `KPTKitDefinition` struct: name, enabled, trigger
   enum, cooldown seconds, array of item entries (class + quantity + quality), optional
   creature class and saddle class.
2. Add a `KPTKitManager` actor or component, spawned by the existing game mode, which
   holds the loaded kit list.
3. Hook player spawn. Grant any kit whose rule matches and whose marker is absent, then
   set the marker.
4. Add the buff (or chosen mechanism) that carries the per-character claimed tags.
5. Add the admin panel last, with a replication path so an edit takes effect without a
   relog.

## What I do around it

- Define the config schema and generate kit definitions from it, so a new kit is a
  dashboard form, not a devkit session.
- Audit the cooked `.pak` on each update before it reaches a live server.
- Run the acceptance test: boot with the mod, confirm `Mod valid`, spawn a test
  character, verify one kit arrives and a second does not.
- Keep the mod set in step across the cluster, since a kit mod on one map and not
  another is a transfer trap.

## Open questions to answer in the devkit, not by guessing

1. Does ASA let a mod persist a custom buff across sessions reliably?
2. Is there a player-data field a mod can write without a custom class?
3. Does the mod's admin panel need its own replication component, or can it ride the
   existing game mode replication?

Answer those three and the design is settled. Everything else here is mechanical.
