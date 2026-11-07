# KPTweaks build backlog

Everything we have decided to build, in the order it should be built, with what
blocks what. Tick boxes as things land.

Status note: the cluster is live (The Island running on 30100), the Discord `/ark`
command works, and the API owns the servers. All of the below is additive.

**Updated 2026-11-07.** Proven in the devkit: items grant correctly through the native
Give Item To Character node, and a marker buff gates the grant and survives spawn, respawn,
relog and an editor restart. The API side of kits is built, deployed and exercised. What
remains is making it configurable, moving it out of a test actor, and getting it onto a
server.

---

## Phase 0: answer these in the devkit before building (one session)

These are cheap to answer and expensive to get wrong. Everything after them is
mechanical.

- [ ] **Dropped item actor class.** What class are dropped bags on ASA, and is there a
      single call that moves a whole inventory rather than looping item by item?
      Blocks: sweeper.
- [ ] **Per-character persistence.** Does a custom buff survive a relog and a server
      restart reliably? If not, we need the mod-side save fallback.
      Blocks: kits claimed marker.
- [ ] **Player data field.** Can a mod write a custom field on player data without a
      custom class? Cleaner than a buff if it exists.
      Blocks: kits claimed marker (alternative).
- [ ] **How KPTweaks replicates settings today.** Screenshots pending from KP. Whatever
      the existing tweaks use to reach clients on a dedicated server is the pattern the
      admin panels copy.
      Blocks: every GUI.
- [ ] **ASA PrimalItem property coverage.** Of the 24 fields from the ASE Customizer,
      which exist on ASA's item class? This defines the customiser's real scope.
      Blocks: item customiser.

## Phase 1: KPTweaks, backend behaviour before any UI

### 1.1 Kit executor
- [x] Grant path settled: native **Give Item To Character** on the cast character.
      Construction plus Add Item Object works but ships broken durability, so it is the
      fallback only.
- [x] Claimed marker: a persistent buff, gated by `Has Buff`, survives spawn, respawn,
      full relog and an editor restart. PIE persistence needs `-ForceLoad -ForceSave` AND
      Play Persistent Player in the level's World Settings.
- [ ] **Kits by tag**: one marker buff carrying a custom tag per kit, so kits do not need
      a buff class each. Character exposes `has_buff_with_custom_tag` and
      `has_any_buff_with_tag`; check whether Static Add Buff accepts a tag pin.
- [ ] `KPTKitDefinition` struct: name, enabled, trigger, cooldown, items, creature,
      saddle.
- [ ] Read `kits.json` from the bridge directory and build the kit list from it.
- [ ] Move the logic out of the test actor into the singleton so every joining player is
      served, not just whoever stands in a test map.
- [ ] Write `results.json` back after each grant so the dashboard reports what happened.
- **Acceptance:** a fresh character receives the kit once from config; relogging does not
  grant a second; a second character receives its own; the dashboard shows the result.
- **Blocks:** 2.1, and the dashboard in 2.1.

### 1.2 Item customiser, config-driven
- [ ] Override record and an apply pass on game mode init.
- [ ] Read overrides from config we generate, not from in-editor values.
- **Acceptance:** a value changed in config appears on a live server after restart, and
  the same value survives a map reload.
- **Note:** no GUI in this phase. The dashboard is the editor.

## Phase 1.5: get it onto a server

The devkit proves logic. The server proves the feature, and this is the part nobody has
done yet in this project.

- [ ] **Cook the mod.** Unreal's cook and package step for the devkit, output to a `.pak`.
- [ ] **Upload to CurseForge** under KPTweaks, and note the published version.
- [ ] **Install on the cluster.** Every cluster member needs the same version, so this is a
      cluster-wide change, not a per-server one.
- [ ] **Verify on a live server.** Spawn a character, receive the kit, relog, receive
      nothing, and check the dashboard results.

Unknowns worth naming: cook time on this project, whether the current KPTweaks page allows
another upload without a version bump, and whether the live server needs a wipe (it should
not, but the marker buff is new).

## Phase 2: KPTweaks, player-facing content

### 2.1 Sweeper (dropped item collection)
- [ ] Placeable structure with an inventory and a radius setting.
- [ ] Timer, 5 to 10 seconds, never a tick.
- [ ] Sphere overlap, capped actors per pass, staggered so two structures never scan on
      the same frame.
- **Acceptance:** drops inside the radius are collected; the server shows no measurable
  frame cost with three placed at a busy base.

### 2.2 Feeder (trough, compost bin, crop plot)
- [ ] One structure with a mode selector rather than three placeables.
- [ ] Per-mode rules: food to troughs, thatch to compost bins, water and fertiliser to
      crop plots.
- [ ] Same timer and caps as the sweeper.
- **Acceptance:** a trough stays fed from a nearby storage without manual input.

## Phase 3: KPTweaks, the admin panels

### 3.1 Kit editor panel
- [ ] Scrollable kit list, add and remove.
- [ ] Per kit: name, enabled, trigger, cooldown.
- [ ] Item rows with a real item picker showing display names, never typed blueprint
      paths.
- [ ] Save with a visible unsaved-changes state.
- **Depends on:** 1.1.
- **Acceptance:** an edit made in game reaches a second client without a relog.

### 3.2 Customiser panel
- [ ] Per-item list of the confirmed fields from Phase 0.
- **Depends on:** 1.2.

## Phase 4: API side, work that needs no devkit

- [ ] **Kit bridge.** Generate `kits.json`, write `queue.json` for pending grants, read
      `results.json` back. Atomic writes and persisted command ids, so a restart never
      replays a queue.
      *Can be built before the mod exists; it just has nothing to consume it until 1.1
      lands.*
- [ ] **Warm-up policy for on-demand maps.** Minimum uptime, reset on first join, empty
      timer, then save and stop.
      *Docs: `docs/on-demand-cluster.md`, items 2 to 4.*
- [ ] **Ready detection.** Report "joinable" from the server log line rather than at
      process start, so `/ark cluster` stops claiming a map is ready while it loads.
- [ ] **Capacity guard.** Refuse to wake a map when free RAM is short, so paging cannot
      take the base map down.
- [ ] **Event engine, world actions only.** Scheduled broadcasts, restart warnings,
      save-then-restart, timed rate windows.
      *Inventory actions are out: console grants to other players do not work on this
      build, so the event engine does not touch items.*

## Phase 5: housekeeping, low priority

- [ ] **Retire the stale installs.** `D:\ARK\clusters\iLGaming\` still holds the 2025
      builds, roughly 57 GB, and nothing boots from them any more.
- [ ] **Normalise the admin password.** `admin123` is what I set, not what you used,
      and it is identical on the RCON field. Do it before any port is exposed outside
      the LAN.
- [ ] **Mod load order.** The kit and customiser overrides must load after KP Tweaks adjacent
      item mods, so KPTweaks stays last in `-mods=` once it starts changing item data.

---

## Standing rules for this work

- Cluster members must run an identical mod set, so a KPTweaks version bump is a
  cluster-wide change, not a per-server one.
- Apply item overrides at boot, not live, or clients disagree with the server until
  they relog.
- Every feature needs a measurable acceptance test before it is called done. "It
  seemed to work" is what cost us a night on the kits.
