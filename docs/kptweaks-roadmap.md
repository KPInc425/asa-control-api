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

## Ideas backlog, no commitment, recorded so they are not lost

### Emote favourites and a faster selector

The emote list has outgrown the radial. Wanted: mark a handful of favourites, and reach them
without digging through the full wheel. Open questions: whether this is a new compact radial,
a hotkey bar, or a filtered version of the existing wheel; whether favouriting is per player
(stored, like the kit markers) or per server; and whether the game exposes the emote list to
blueprints at all, which decides whether this is feasible without a replacement UI.

### Ghost building: already in the game, do not build it

**Planning Mode shipped in ASA patch 88.3 and the client is on 94.7.** Verified against the
official patch notes, 2026-06-12:

- Hold **R** (X / Square) while placing a structure to enter Planning Mode.
- Structures place as **Hologram Structures** and consume no materials.
- Holograms are visible only to tribe members; enemy tribes cannot see them.
- New structures snap over holograms and **automatically replace them** when placed, so
  building happens directly onto the plan.
- Holograms convert into **Templates** with the Lost Colony Template Hammer, so a whole
  layout can be saved and repositioned.
- **Extended Range Mode** places holograms from further away for large-scale planning.
- **Planning Mode View** toggles hologram visibility, on the Action Wheel and bindable to a
  key (unbound by default).

So the ghost-building wish is satisfied by vanilla, and the material-sink problem is solved
in the way KP actually wanted: plan first, build over it later.

The only fragment not covered is **auto-pull**: refilling the hotbar from nearby storage so
large builds do not stall on trips. That is small, and it extends the pull mod KP already
runs rather than replacing it.

Two details still open:

- **DLC split.** Planning Mode appears in the patch notes as a plain feature with no
  expansion gate, while the **Template Hammer is Lost Colony content** (confirmed by the
  expansion announcement). So planning is probably free and only saving layouts needs the
  DLC, which KP owns anyway.
- **Does it need the piece in inventory? CONFIRMED YES**, tested 2026-11-10. You cannot enter
  Planning Mode without a structure selected from your inventory, so planning a large base
  means carrying one of every piece you intend to use. Workable, and clunky enough that KP
  called it half thought out. This is the gap worth filling.

Two routes, and the second one works today:

1. **Planning palette (proper).** Choose any engram you have unlocked and place its hologram
   without owning the item. Needs devkit work: find how a hologram is spawned and whether
   placement validation can be satisfied without the real item. Unknown feasibility.
2. **Planner kit (works now).** The kit system is proven, so a kit that grants one of each
   building piece a player has unlocked turns "carry a bag of everything" into "claim the
   planner kit, plan the base, drop it". No new mechanics, no devkit probe, and it can be
   shipped through the existing bridge. Start here.

### Walkable plans: the hologram is not solid

KP's constraint, 2026-11-10: vanilla holograms have no collision, so you cannot walk on them.
That rules out planning a multi-storey build, a platform or a bridge in one pass, because
upper floors can only be positioned relative to a walkable lower floor. The workaround is to
plan a storey, build it, plan the next, build it, which is exactly the spurts approach Planning
Mode was supposed to replace.

**The missing property is collision, not cost.** Cost and snapping are solved by vanilla; being
able to stand on the plan is not.

Three routes, cheapest first:

1. ~~**Creative shell into a Template.**~~ **REJECTED by KP, 2026-11-10.** He plays survival
   only, does not want admin powers, and creative does nothing for anyone else on the server.
   Do not propose admin or creative workarounds again for building features.
2. **Solid ghost structure (mod).** Spawn a structure actor with collision enabled and no
   material cost, walk on it, delete it when the real build replaces it. Needs a devkit probe:
   what collision the hologram class carries, and whether a spawned structure can be made
   solid while exempt from cost validation. This is the route that serves every player on the
   server, which is the requirement.
3. **Scaffold platforms (fallback).** Free walkable floors that are not building pieces, placed
   and cleared. Crude but cheap, and it makes multi-storey planning possible without touching
   building rules.

**Where it matters most: over water.** KP is currently building over water, where there is no
terrain to stand on, so every span has to be built for real before the next can be planned.
That case is the one that justifies the work, because walkable ghosts are the only way to
plan a water platform in one pass.

### Why vanilla probably has no collision

KP's own read is that free solid structures would be an exploit, and that is almost certainly
why Planning Mode holograms are non-solid: a free structure with collision is a free wall, so a
tribe could block off a base or a whole shoreline for nothing. Performance is the secondary
reason, since holograms are meant to be cheap to draw in bulk.

**Better mitigation than fragility.** Making ghosts fragile is one answer, but the sharper
control is ownership: collision for members of the placing tribe only, pass-through for
everyone else. Combine with a lifetime that expires unused ghosts, no damage output, and a cap
on how many one player can hold in flight. That keeps the planning workflow intact while
removing the reason vanilla refused it.

### The evolved predecessor mod

KP remembers an ASE mod that the current preview resembles, which did it better and was not
partly behind a DLC. **KP confirms the author deleted it long ago**, which is why three searches
through the wiki, official forums and general web results found nothing. Do not search for it
again; it is gone, and there is no workshop page or source to study. Design from principles and
from the reference below instead.

A design reference worth reading regardless: **PlanBuild for Valheim** is open source and
implements exactly this model, plan a build then pay for it later. Different engine, same
rules problem, so its answers about ghost ownership, expiry and material accounting transfer.

### Behemoth walls: snap and ground gaps

Current KPTweaks behemoth walls are clunky, leave large gaps on uneven ground, and do not
snap to each other or to vanilla pieces. Worth fixing because they are structural, not
cosmetic.

Directions to investigate, in order of likely payoff:

1. **Snap points first.** A blueprint structure only snaps where it declares snap sockets.
   If these pieces were authored without them, or with sockets that do not match the vanilla
   wall socket layout, nothing else will fix the feel. Check the structure class for snap
   point setup and compare against a vanilla wall or gate frame.
2. **Parent from a vanilla piece.** Deriving from the vanilla behemoth gate or wall class
   rather than from a bare structure base inherits snapping, placement rules and collision
   behaviour instead of reimplementing them.
3. **Terrain gaps.** Options, cheapest first: extend the mesh downward with a buried "skirt"
   that disappears into the ground, offer short and tall variants, or require placement on a
   foundation-like base piece so the wall never meets raw terrain.
4. **Check what the existing building mods do.** Arkitect Structures Remastered advertises
   cosmetic variants without building twice and a delete mode, so it is the obvious
   comparison for how pieces are authored and snapped. Evaluate it before authoring more.

KP's own view: the glass and metal pieces predate proper custom cosmetics, so new building
pieces are more likely to be cosmetics on existing structures than new structure classes.
That reinforces the third and fourth directions.

### Shoulder pet as a backpack

Willow wants a shoulder pet that attaches like a backpack and helps with carry weight. Worth
knowing first: **vanilla shoulder pets already work this way.** The wiki states that every
shoulder pet acts as a backpack, with only half its inventory weight counting against the
survivor, and the Otter additionally carries multiple artifacts.

So the mechanic exists and costs a tame rather than a mod. What vanilla does not do is raise
the survivor's own weight capacity. If that is the actual ask, it is a stat change, and the
per-player or per-item override belongs with the customiser rather than a new mod.

### Cosmetic structure skins: separate mod, not KPTweaks

Direction confirmed by KP: stop authoring new metal and glass structure classes, and stop
duplicating anything that already has a vanilla variation. Build vanilla metal and skin it.
The behemoth walls stay in KPTweaks because vanilla has no behemoth wall to skin.

**Decision: cosmetic skins live in their own mod**, for four reasons that are all about
operational cost rather than tidiness:

1. Skins are textures and meshes, so they are the bulk of the bytes. Inside KPTweaks, every
   gameplay hotfix becomes a large download for every player, and every cluster member must
   match versions.
2. A broken cosmetic cannot break gameplay. Packaged together, a bad skin can stop the mod
   loading and take kits, tweaks and the sweeper with it.
3. Skins and gameplay logic have different update rhythms and should not drag each other.
4. Players can subscribe to the cosmetics without the tweaks, and CurseForge versions them
   independently.

**The only exception:** a skin that changes behaviour rather than appearance belongs in
KPTweaks. Cosmetic-only does not.

**Resolved 2026-11-10:** ASA's built-in cosmetics system re-skins an already-placed structure,
so nothing is rebuilt and nothing needs to be a mod-provided variant. Skins are appearance
only, applied to what is already there. That also means the separate-mod decision stands
unchanged and no variant pieces need authoring.

### Drawable surfaces: chalkboard, dry-erase, canvas

Wanted: a wall or skin you can draw on, like a chalkboard or whiteboard. KP's own instinct was
that canvas walls might get laggy, and that instinct is right for one of the three designs.

**The cost is in the update model, not the picture.**

1. **Paint once, saved.** Draw, finish, the result is stored and sent as one texture. Cheap.
   Dozens are fine. This is what the vanilla painting system already does.
2. **Live collaborative drawing.** Strokes stream to nearby clients continuously. Expensive,
   and this is the only version that lags. Render targets are per client, so the shared
   drawing has to be replicated as stroke data and replayed, which is a real project.
3. **Per-pixel streaming.** Not viable.

**Cheapest version may already exist:** a black wall skin plus the vanilla paintbrush is a
chalkboard that persists and shows to everyone. The compromise is paint resolution.

**If more is wanted, skin the existing canvas** rather than authoring a new structure, so the
paint UI and the save path come for free. A live board is out of scope until the cheaper two
are exhausted.

### Upgrade hammer: mass upgrade with material pull

Wanted: upgrade large swathes of a base in one action, pulling the materials from nearby
storage, taking time rather than being instant. Upgrading a big base piece by piece is the
tedium KP wants gone.

**Vanilla already upgrades one piece at a time**, through the radial, provided you hold the
materials. So the gap is mass selection and material pulling, not the upgrade itself.

**Prior art: Upgrade Station**, an ASE Steam Workshop mod (v1.8i), which upgrades structures in
a radius for the material cost. Whether it has an ASA port is **unverified**: CurseForge
blocks this rig, the automation browser is down, and ASA-specific searches returned nothing.
Check the in-game mod browser by searching "upgrade station"; that queries CurseForge directly.

If there is no port, the design notes for building it:

- **Reuse the existing upgrade path.** The structure already knows how to become the next
  tier; call that rather than swapping classes by hand.
- **Cost correctness is the whole discipline.** Mass upgrade is an attractive duplication
  exploit, so charge per piece, from the same validation the manual upgrade uses, and fail the
  whole batch rather than half-charging.
- **Stagger the work.** Upgrading hundreds of structures in one tick is a server spike. Walk a
  queue a few pieces at a time, which also gives the "takes time" feel KP asked for.
- **Permissions and refunds.** Tribe-rank checks on who may start a job, and a cancel path that
  returns materials for pieces not yet touched.

### Creature drop tables

Change what a creature yields, for example prime fish meat from a Megalodon. This is **not**
available in server config. The config keys that exist cover spawn tables
(`ConfigOverrideNPCSpawnEntriesContainer`, `ConfigAddNPCSpawnEntriesContainer`), supply
crates (`ConfigOverrideSupplyCrateItems`) and harvest multipliers
(`HarvestResourceItemAmountClassMultipliers`), but nothing for a creature's own death drops.

So it belongs in the customiser, as a per-creature override alongside the per-item ones, and
it needs a devkit probe: whether the drop data is reachable on the character class or sits in
a separate cache object. Note also that Megalodons may already drop prime fish; worth
confirming in game before building anything.

## Next devkit session: take stock before building

State as of 2026-11-10, so the next session starts oriented rather than re-deriving it:

- Kits: proven end to end, marker per character, survives everything. Config loader is the
  next piece (`docs/kit-test-5-config-loader-clickthrough.md`).
- Ghost building: vanilla, but requires the piece in inventory; the planner kit is the cheap
  fix and the planning palette is the proper one.
- Emotes: recorded, feasibility unknown.
- Creature drops: recorded, needs a probe.
- Behemoth walls: recorded, snap points are the first thing to look at.

The question for that session is not "what else can we add" but **which two of these move the
mod forward**, since the kit work is the only thing currently proven.

**Answered 2026-11-12, live in the devkit (UE 5.8.3, devkit 95.14.338).**

**DECISION following the file-read result: kits are configured in an in-game admin panel, not
from files.** KP's call, and it matches the direction of the platform: in-game configuration is
now the norm rather than ini files. The panel composes kits, stores them in a SaveGame (the
mechanism already proven by the claim marker), and the dashboard becomes a readout.

Consequence worth stating plainly: the API kit bridge (`kits.json`, `queue.json`,
`results.json`) has no consumer in a blueprint-only mod. Keep the code, but do not build on it
until something proves a delivery path.

Panel design that fits the proven pieces:

- **No DataTable is needed for the selection list. CORRECTION, verified 2026-11-12.** KP's
  own unfinished admin menu listed every item without one, and the reason is `PrimalGameData`:
  `master_item_list` holds **654 item classes** and `engram_blueprint_classes` holds **909
  engrams** on the shipped game data asset. A blueprint can read those at runtime and list
  everything. DataTables are for authoring static content in the editor, not for runtime
  selection lists.
- Search is a filter over that list's display names, so it stays a UI problem.
- Creature enumeration is the one gap: `PrimalGameData` does not expose an equivalent dino
  list, so the panel either filters the engram list for dino engrams or finds a
  derived-classes helper. Unresolved.
- Admin composes a kit, saves it into `KPTweaksSave`, and the claim path already built serves
  it.

### How a customiser works without DataTables

Asked by KP, and the answer is the same as for kits: **SaveGames plus per-item overrides**, not
DataTables. The ASE mod we reverse-engineered (ARK Customizer: Settings Evolved, workshop
774413050) is blueprint only and stores its settings in **six save-game objects** in the world
save. Its per-item struct `ACItemModifier` is a struct with 24 fields, held in arrays, applied
through a shared function library that remaps classes and cleans item data before the item is
created.

So the pattern for ASA is:

1. A **struct** describing one override, held in an array on a save game.
2. A **UI** that edits that array, listing candidates from `PrimalGameData.master_item_list`.
3. An **apply step** when an item is created or spawned, which reads the override for its class
   and adjusts the instance or remaps the class.

Only step 3 is genuinely engine-specific and it is the same unknown the customiser already
carries: which of the 24 ASE fields exist on ASA `PrimalItem` (13 do, per the earlier survey)
and whether a blueprint can set them early enough to matter.

### Delivering dinos with a kit

KP's reference: an old ASE vault mod that handed over a purchased dino inside a one-time-use
orb, like a cryopod you release. That is the right shape, and it avoids trying to add a tame
to an inventory as if it were an item.

What the devkit gives us on `PrimalDinoCharacter` (probed 2026-11-12):

- `change_actor_team(new_team)` to put it on the player's tribe.
- `set_owner(actor)` for ownership replication.
- `bp_setup_tamed(was_just_tamed)` to run the tamed setup path.
- `set_imprint_player(char)` and `imprint_baby_dino(player_controller, skip_naming)` if the kit
  should hand over an imprinted creature.
- Cryo lifecycle hooks exist (`bp_can_cryo`, `on_cryo`, `on_uncryo`) but are not needed: a
  kit token is simpler than cryo storage.
- **There is no single "set tamed" function.** `force_auto_tame` is a bool property, not a
  call, so taming a spawned creature is a composition of the four calls above.

Design: the kit grants a **kit token item**, a PrimalItem subclass that on use spawns the
creature, applies team, owner and optional imprint, then destroys itself. One use, one dino, no
inventory slot for a live creature.

**Unverified and the first thing to test:** whether that composition yields a properly tamed
creature, in particular the team plus tamed-setup pair. Test on a throwaway map with a cheap
dino before it goes near a real kit.

1. **Can a blueprint read a file? NO.** `KismetSystemLibrary` (310 names) exposes no file read
   or write, only directory getters (`get_project_directory`, `get_project_saved_directory`).
   The BlueprintFileUtils plugin is not present, and neither JSON library exists
   (`BlueprintFileUtilsBPLibrary`, `JsonUtilities.*` both missing). The only file-ish API in
   the engine is `DataTableFunctionLibrary.fill_data_table_from_json_file` /
   `_from_json_string`, which fills a DataTable from a path and needs a DataTable asset.
   **The dashboard-writes-kits.json-and-the-mod-reads-it design does not work in a
   blueprint-only mod.** Options: bake a DataTable into the mod at cook time (config then
   needs a mod rebuild, so the dashboard becomes read-only reporting), define kits in the
   graph and manage them with the in-game panel, or test whether the DataTable JSON fill
   survives cooking (unverified, and it would still need an in-memory DataTable).
2. **Behemoth walls: the snap flags are zero.** All four declare 21 snap points, so sockets
   were authored, but three of the four report `structure_snap_type_flags = 0` (Metal, Stone,
   Tek) and Wood reports `512`. Compare: vanilla `Wall_Metal` has 32 snaps, flags **8**, and
   `extra_structure_snap_type_flags` of IntVector(64,0,0); the game's own S+
   `BP_LargeWall_Metal` has 74 snaps, flags **8**, same extra flags, and parents from
   **`Base_Wall_Large_C`**. The behemoth walls parent from the bare `StructureBaseBP_C`.
   Fix, in order of preference: reparent to `Base_Wall_Large_C` so they inherit the large-wall
   snap set and placement rules; then set `structure_snap_type_flags = 8` and
   `extra_structure_snap_type_flags = (64,0,0)` on all four so they match each other. Do the
   reparent on one piece first and test snapping before touching the other three.
3. **Emote list: reachable, confirmed.** `ShooterCharacter` exposes `emote_anims` and
   `emote_anims_gender_override` plus `play_emote_animation`, `on_emote_finished` and
   `net_force_call_emote_finished`, and `PrimalBuff` can intercept another player's emote via
   `intercept_instigator_player_emote_anim`. Emote favourites is a stored list plus a trigger,
   not a replacement UI.

Everything else on this page can wait.

## Standing rules for this work

- Cluster members must run an identical mod set, so a KPTweaks version bump is a
  cluster-wide change, not a per-server one.
- Apply item overrides at boot, not live, or clients disagree with the server until
  they relog.
- Every feature needs a measurable acceptance test before it is called done. "It
  seemed to work" is what cost us a night on the kits.
