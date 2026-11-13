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

### Structure skins are items, confirmed from a shipped cosmetics mod

Inspected `Arkitect's Paradise` (installed as `Mods/83374/1062233_9416083`, 608 assets, 253 MB
ucas), 2026-11-12. Note it is the cosmetics mod, not Arkitect Structures Remastered, which is
not installed here, so the "delete mode" and no-build-twice claims still cannot be verified
locally.

What it proves, which is what KP needs:

- Structure skins are **`PrimalItemStructureSkin_*` items** built on a shared base
  (`PrimalItemStructureSkinBase_AP`), one per look: `_Chrome`, `_WhiteMarble`, `_FineWood`,
  `_CleanTiles`, `_ClearGlass`, `_GraniteTiles`, `_WeatheredPlanks`, `_ModernBricks`, and so on
  for furniture.
- The item carries its own data: material overrides and actor attachments, plus a boolean flag
  whose mangled name reads `bCosmetic...skin`, and `ExtraResources` suggesting a cost.
- There is a `StructuresSkinBase_MultiSwap_AP`, so one item can cycle several looks rather than
  one per look.
- It also ships `ArkitectsParadisePrimalStructureDB`, the same structure database pattern as
  Sprinkles and Dino Depot.

**Consequence: our cosmetics mod is data, not structures.** Each skin is a subclass of the
vanilla structure-skin item base, pointing at a target vanilla structure and carrying a material
override. No new structure classes, no variants, no duplication of anything that has a vanilla
equivalent. That is exactly the "build vanilla metal and skin it" rule, and it means skins are
cheap to author and cheap to add.

Bonus: because skins are **items**, the kit system can grant them. A cosmetic can be a kit
reward with no extra machinery.

**Probe to add:** find the vanilla `PrimalItemStructureSkin` base class in the devkit and read
its properties (target structure class, material override array, the cosmetic flag). That turns
skin authoring into filling in fields.

### Automated Ark and Cyber's Structures: the automation blueprint

Inspected both installed payloads, 2026-11-12. Asset names only, no decompilation, but these two
are the closest prior art we have for the sweeper and feeder and they answer design questions
we had left open.

**Automated Ark** (`928597`, 944 assets):

- Automated structures: `AATekTrough`, `AACompostBin`, `AutoCompostBin`, `Incubator`, `EggCrate`,
  `BP_IND_CropPlotSetter`.
- **Pulling is implemented as buffs**: `BuffCustomPulling`, plus variants per station
  (`_Benchn`, `_Chem`, `_Fab`, `_Smith`, `_AAMortarPestle`), a `Buff_AA_PullMenu_Main` for the UI,
  and `Buff_PullMultiplier_AA`. So pull behaviour is attached to an existing station by a buff
  rather than by a new class.
- Range feedback: `RangeSphereMatAA`, `SiloShowRangeAA_MAT`.
- The usual `PrimalStructureDB` / `PrimalInventoryDB` / `ShooterWeaponDB` cache assets.

**Cyber's Structures QOL+** (`940975`, 2,702 assets):

- **The nanny and gardener are structures with inventories plus buffs**: `Nanny_CS` with
  `PrimalInventory_Nanny_CS`, `Buff_NannyFeed_CS`, `Buff_NannyImprint_CS`; `Gardener_CS` and
  `Farmer_CS` with their own inventories. The automaton is a placed object that owns an
  inventory and applies effects, not a global actor that scans the world.
- **The item collector is a composed object with staged data**:
  `CS_ItemCollector_ComObject`, `CS_ItemCollectorCollectData`, `CS_ItemCollectorInvCollectData`,
  `CS_ItemCollectorDistributeData`. Collection and distribution are separate stages with their
  own payloads.
- **Wireless transfer is a request protocol**: `BPI_WirelessTransfer`, `CS_WirelessTransfer`,
  `CSTransferFunctions`, `CSTransferRequest`, `CSTransferInventoryData`, plus
  `GameComp_HatcheryTransfer` and `GameComp_IncubationTransfer`.
- **Storage is linked and ranged**: `CS_DedicatedStorage`, `CSLinkedStorage`, `GlobalWirelessRanges`,
  `MI_CSRangeIndicator`, with range widgets.
- Also `CS_CropPlotManager`, `CSAutoDoor_Data`, `AutoCrafter_CS`, `EggIncubator_CS`,
  `Cybers_EggFilter`, `Buff_CS_ItemAggregator`, `CSItemMap`, `CS_Enum_AggregatorItemType`.

**Four design lessons for our sweeper and feeder, all of which change what we had planned:**

1. **Stage collection separately from distribution.** Cyber's splits collect from distribute with
   distinct data payloads. That means a sweep can be interrupted or deferred without half-moving a
   stack, and it makes each stage testable on its own. Our plan was one loop that picked up and
   deposited; this is better.
2. **Put the automaton in a structure with an inventory, and let buffs do the effects.** The nanny
   works because it is a placed object with `PrimalInventory_Nanny_CS` and buffs for feeding and
   imprinting. That means our feeder does not need a new global actor: it can be a buff plus an
   inventory behaviour on the structures that already exist.
3. **Use buffs as capability carriers.** Automated Ark gives pull behaviour to existing stations by
   attaching `BuffCustomPulling_*`. Same pattern KPTweaks already uses for the raft. This is how we
   add behaviour to a vanilla structure without a new class.
4. **Move items by request, not by direct write.** The wireless transfer system is a request struct
   plus inventory data plus a component handler. Direct cross-inventory writes are what break under
   load and stutter; a request protocol with a queue is how a shipped mod does it.

Combined with the earlier findings, the shape for our automation is: structure or buff for the
actor, staged data payloads for the work, a request protocol for cross-inventory moves, config via
data assets, and a structure DB for caching lookups.

### Arkitect Structures Remastered: variants, comm components, skin entries, tier tags

Inspected the installed payload (`Mods/83374/931874_9555651`, 6,014 assets, 1.6 GB ucas),
2026-11-12. Asset names plus a 700 MB string scan of the payload; the scan did not cover the
whole file, so absence of a name below is not proof it is absent.

ASR is four mechanisms, and each one answers something on our list:

1. **`SkinEntries`.** A property of type array with per-entry `Guid`, seen on the structure
   assets. So a placed structure carries a list of applied skin entries and keeps them. This is
   the concrete answer to "how do I skin a structure that is already built": the structure
   stores its own skin records.
2. **Comm components.** `ASR_Comm_C`, `ASR_Comm2_C`, plus `ASR_StructureComm`, `ASR_DoorComm`,
   `ASR_LightComm` and `ASR_SingletonComm` in `/ArkitectStructures/_Interfaces/`. Structures get
   behaviour through an interface plus a component and a coordinating singleton, which is how a
   mod improves placed objects without replacing their classes. Same idea as Sprinkles'
   structure hook, taken further.
3. **Variants.** `ASR_Variants`, `ASR_Variant_Data`, `ASR_Variant_Data_Array`,
   `Widget_ASR_VariantMenu`, with content in per-tier folders like `ASR_VariantsRoofs/Base/...`.
   "No need to build twice" is mesh and material swapping on a structure that already exists.
4. **Tiers as tags.** An `ASR_Tiers` enum plus a `TierTag` string, with tier items
   (`PrimalItemStructure_ASR_Metal_Tier` and friends for Thatch through Tek). Tiers are tracked
   as tags rather than being baked into distinct structure classes, which is what would let a
   tier change happen in place rather than by demolish and rebuild.

Also present: `ArkitectStructuresPrimalStructureDB` and `ArkitectStructuresPrimalInventoryDB`,
`ASR_ServerSaveData` / `ASR_ClientSaveData`, per-material settings assets
(`StructureSettings_ASR_Metal`, `_MetalGlass`, ...), and UI for copy, dye, glass, structure
settings, user settings and server settings.

**Three takeaways for us:**

- **Skins on built structures are stored on the structure**, so our cosmetics mod needs a data
  record per structure, not a rebuild. `SkinEntries` is the shape to copy.
- **Tier by tag, not by class**, is the route around having no upgrade API. If a structure's tier
  is a tag rather than its class, an upgrade is a tag change plus a mesh/material swap, which is
  far cheaper than demolish and re-place, and avoids losing stored contents.
- **Master blueprint per piece family.** Names like `BP_ASR__Doorframe_Skinny_Quarter_Master`
  show one master parent per piece family with tier children. That is the pattern our behemoth
  walls should adopt instead of parenting from the bare `StructureBaseBP_C`: define snap points
  once on a master and inherit them.

Still unverified: no `Upgrade`, `Delete` or `Copy` identifiers appeared in the portion scanned,
so ASR's delete mode and any mass-upgrade behaviour are still not confirmed, only its widgets
named for them.

### What Dino Depot does, and the shortcut it suggests

Inspected the installed payload (`Mods/83374/942024_9416341`, 636 assets, 156 MB ucas),
2026-11-12. Same evidence limits as Sprinkles: asset names and identifiers, not decompiled
logic.

What it is:

- **`DD_CaptureComponent`** does capture and release. The dinoball is a container; the logic is
  a component. `BuffDinoDepot` and `BuffCryoConversion` sit alongside it.
- **`DinoInABallArguments`** carries the dino as data: species, current level, `MaxLevel`,
  mutations, `Tamed`, `Leveled`, `TamingEffectiveness`, imprint assignment (`AlwaysGiveToReleaser`,
  `ImprintAssignmentModes`), trait manager data, time since capture, and `RestoreSettings`.
- Structures: `Dino_Depot_Terminal_*` variants, `DinoballStorageBox`, `DepotGeneStorage`, plus a
  `DinoDepotPrimalStructureDB` and `DD_CacheStateSaveGame`.
- Behaviour is configured through **enums**, not free values: `CaptureInventoryHandlingModes`,
  `CaptureGestatingModes`, `CapturePlatformModes`, `PostReleaseBuffModes`, `ReleaseFailReasons`,
  `DeathAutoCaptureMode`.
- Save games: `ModSettingsSaveGame`, `ModCacheSaveGame`, `DD_CacheStateSaveGame`,
  `ClientPreferencesSaveGame`.

Two things to take:

1. **The pattern for a kit token is a struct of dino state plus a spawn step**, exactly as
   suspected, and this list is the field inventory to start from. Note how much state matters
   for a dino to feel right: imprint owner, taming effectiveness, mutations, traits. A minimal
   token that only carries species and level will produce a creature that is legally tamed and
   visibly wrong.
2. **`BuffCryoConversion` means vanilla cryopod data is readable and writable by a mod.**
   That raises a much cheaper option for kit dinos than the tamable-spawn composition: if a
   blueprint can build a cryopod item that already contains a dino, the kit simply grants that
   pod and vanilla does the rest. No team setting, no tamed setup, no imprint plumbing.

**Probe to add, and rank it first for the next session:** does the vanilla cryopod item class
expose functions for setting or writing the stored dino (something like a set-cryo-data or
capture path)? If yes, kit dinos become an item-grant problem, which the kit system already
solves. If no, fall back to the composition test.

Also worth copying: enums for finite modes rather than numbers, which makes an admin panel far
more usable than free-form fields.

### What Vanilla with Sprinkles does instead of remapping

KP spotted that Sprinkles claims it does not remap items to set stack size. Inspected the
installed mod payload (client `Mods/83374/1188679_9416935`, 191 assets, 211 manifest entries),
2026-11-12. This is string and asset-name evidence from the packed build, not decompiled logic,
but the architecture is unambiguous.

What it contains:

- **`ItemCDO`** as an identifier, in the same asset as item modifier code. So it caches and
  works on the item's **class default object** rather than creating variant classes.
- `SprinklesItemModifierStackConfig`, `SprinklesDinoModifierStackConfig`, `SprinklesStackConfig`,
  `SprinklesStackPresets` describing configuration.
- Per-concern **save games**: `SprinklesSaveGame`, `SprinklesStackConfigSaveGame`,
  `SprinklesGunSaveGame`, `SprinklesHotbarPresetSaveGame`, `SprinklesPushRequestSaveGame`,
  `SprinklesDevSaveGame`.
- A **`SprinklesStructureHookComponent`** (with a `VWS_StructureHook` class), a
  `SprinklesPrimalStructureDB`, and a `CachedStructureDataMap`. So structures are hooked and
  cached rather than replaced.
- Items as tools: `ItemPickupGun`, `ItemDinoGun`, `ItemVariantGun`, `ItemDevGun`,
  `SprinklesStackModifierItem`.
- A settings dialog with row widgets (`SprinklesModSettingsDialog`, `SprinklesSliderRow`,
  `SprinklesCategoryData`).

**Two conclusions that change our plan.**

1. **Do not remap for the customiser.** Sprinkles sets stack size on the CDO instead, which is
   why existing items and stack merging keep working. The earlier plan leaned on the ASE mod's
   class remapping; for ASA the CDO route is the shipped, working pattern, and it is simpler.
2. **`SprinklesStructureHookComponent` is the answer to how placed structures get modified.**
   That is the lead for applying skins to already-built structures, which was the most valuable
   open item on the hammer list. A hook component plus a cached structure DB is exactly the
   shape needed.

Also worth noting the shape they chose overall, because it matches what we converged on
independently: per-concern save games, config assets for authored data, a hook component for
world objects, and item-based tools for player actions.

### Template Hammer enhancements, and why they are one feature with the upgrade hammer

KP's list after using the vanilla hammer, 2026-11-12:

1. Building a template requires every structure item in inventory, and the weight limit makes
   large templates impossible. Wanted: pay in **raw resources** instead of finished pieces, and
   a weight boost while in range of a template.
2. Adjustable auto-build speed.
3. Interacting is blocked while holding the hammer, so doors and containers cannot be opened.
4. The hammer exposes a structure **tier** setting, possibly reusable.
5. Completing a template offers a skin for that build. Wanted: apply a skin to structures
   already placed, independent of templates.

**The key insight, and it changes the size of item 1.** Do not modify the hammer's build path.
Mint the structure items from resources at build time: read each piece's crafting cost, consume
those resources from inventory, and add the resulting structure item to the inventory, then let
the vanilla hammer place it exactly as it does today. `add_item_object` and
`add_item_object_ex` on `PrimalInventoryComponent` are already verified primitives, and the
crafting cost per structure item is readable from the item's own resource requirements.
That turns a hammer rewrite into an inventory trick, and it keeps vanilla placement, snapping
and template bookkeeping intact.

Item 5 is the one worth doing **first and separately**, because it does not need the hammer at
all: applying a skin to an existing structure is the same feature cosmetics needs, and it would
also satisfy the desire to re-skin a finished base.

Design notes:

- **Weight (item 1b):** a buff granted while near an active template, modifying the carry
  limit, rather than changing weight rules globally. Needs a probe for the weight multiplier
  hook on `ShooterCharacter` or `PrimalInventoryComponent`.
- **Interacting (item 3):** holding an item class that blocks interaction is a weapon-state
  behaviour, so a copy of the hammer item could re-enable it. Whether that is a property or
  hard-coded behaviour needs a probe of the item class.
- **Auto-build speed (item 2):** only adjustable if the build loop is a blueprint. If the
  hammer is native, the speed is not ours to change, and this item dies.
- **Tier (item 4):** if the hammer's tier setting maps to a structure class or quality, it may
  be reusable for the upgrade hammer's refund-and-replace step.

### Probes for the next devkit session (hammer and skins)

1. Is the template hammer a blueprint or native? If native, items 2 and 3 are off the table.
2. Does `PrimalStructure` expose anything that applies a skin to a placed structure? This is the
   most valuable single probe, since it unlocks item 5 and the cosmetics mod together.
3. What weight-multiplier hook exists on `ShooterCharacter` or `PrimalInventoryComponent`?
4. What does the hammer's tier setting actually control?

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

## Overseer: the ARK Modding Discord archive, as a searchable API

`https://www.reddwarfmods.com/overseer/` is an archivist bot over ten years of the ARK Modding
Community Discord (1.39M messages, 149k conversations), with an API that any AI tool can query.

Endpoint, verified from the API page 2026-11-12:

```
GET|POST https://reddwarfmods.com/overseer/api/search
  Authorization: Bearer ovs_<key>
  q=<query>          required
  game=ASA|ASE       optional
  limit=1..10        default 5
```

Returns JSON with `remaining_today` and a `results` array, each entry carrying `source`
(discord / wiki / youtube), `date`, `url` and `excerpt`. Limit is **100 searches per day**, the
key is personal, and the rules forbid republishing results or bulk-copying the archive.

**It is an MCP server, with two ways in.** `https://reddwarfmods.com/overseer/mcp`, Streamable
HTTP, exposing a single tool `search_ark_modding`. Apps that support MCP OAuth (Claude, Claude
Code, ChatGPT custom connectors, Cursor, VS Code) add that URL and sign in with Discord. Apps
that send headers, or cannot, use the key: `Authorization: Bearer ovs_...`, or
`?key=ovs_...` in the URL for clients with no header support. Staff approve each member once.
The key comes from `/overseer-api-key` in that Discord, and deleting the key also disconnects
every app signed in via Discord.

For this machine the **key plus the plain `/api/search` endpoint** is the route, because the
caller here is a script rather than an MCP connector app. The key belongs in `.env`, never pasted
into chat or committed, since it identifies KP.

**How to use it, precisely:** as a source of leads, never as a fact. These are chat messages, and
a confident answer in 2019 about ASE may be wrong for ASA 5.8. The pattern that has been working
in this project is: Overseer or a mod payload suggests a technique, the devkit or a live test
confirms it. This session alone produced two corrections (DataTables, and the upgrade API) that
came from looking rather than asking.

**Questions worth spending the quota on**, because they are the ones chat history plausibly
answers and the devkit does not:

1. Does the vanilla cryopod item class expose a way to set the stored dino? This decides whether
   kit dinos are an item grant or a taming composition.
2. How do ASA mods read configuration now that ini files are out of favour? Our kit config
   decision rests on this, and a blueprint cannot read files.
3. Is there any way to give a planning hologram collision, and has anyone tried walkable ghosts?
4. Does `change_actor_team` plus `bp_setup_tamed` actually produce a working tame, or is there a
   missing step nobody documents?
5. How do mods enumerate dinosaur classes when `PrimalGameData` has no master dino list?

Getting a key: `/overseer-api-key` in the ARK Modding Community Discord, then staff approval.
Once KP has one, the search is a single curl and can be wired in as a tool.

## Probe status, 2026-11-12

Static devkit probing is essentially finished. Closed today, all verified live:

| Question | Answer |
|---|---|
| Can a blueprint read a file, ini or JSON? | **No.** No file API in `KismetSystemLibrary`, BlueprintFileUtils absent, both JSON libraries absent. Only `DataTableFunctionLibrary` can fill a table from a JSON path. |
| How does a menu list every item? | `PrimalGameData.master_item_list`, 654 item classes. `engram_blueprint_classes`, 909 engrams. No DataTable needed. |
| Why do behemoth walls not snap? | 21 snap points exist but `structure_snap_type_flags` is 0 on Metal, Stone and Tek (Wood is 512). Vanilla walls and the game's own S+ large wall both use **8** plus `extra_structure_snap_type_flags` (64,0,0), and parent from `Base_Wall_Large_C` rather than `StructureBaseBP_C`. |
| Are emotes reachable? | Yes. `emote_anims` is an array on `ShooterCharacter`, `play_emote_animation(emote_index: uint8, invert_gender: bool)` plays by index, and the vanilla wheel is the blueprint `/Game/PrimalEarth/UI/EmoteRadialSelectorBP` which exposes `add_unlockable_emotes`. |
| Where do creature drops live? | On the dino class: `death_inventory_templates` plus `death_inventory_chance_to_use`. So per-creature drop overrides are possible, and Megalodon prime fish is a template entry rather than a config key. |
| Can we tame a spawned dino? | By composition: `change_actor_team`, `set_owner`, `bp_setup_tamed(was_just_tamed)`, optionally `set_imprint_player` / `imprint_baby_dino`. There is **no** single set-tamed call; `force_auto_tame` is a bool property. |
| Is there a structure upgrade API? | **No.** Only demolish: `demolish`, `demolish_just_destroy`, `demolish_structure_and_depending_linked_structures`, `demolish_give_item_crafting_resource_percentage`. So an upgrade hammer is refund-then-place, not a native tier change. |

Still open, and **none of these can be answered by looking at the editor**:

1. **Dino enumeration for the panel.** `PrimalGameData` has no master dino list. Only
   `additional_allow_download_dino_classes` exists. Options: filter `engram_blueprint_classes`
   for dino engrams, or maintain a soft class list of our own.
2. **Does the taming composition actually yield a tamed creature?** Needs PIE with a cheap
   dino. This gates kit dinos entirely.
3. **Can a blueprint set item properties early enough for the customiser to matter?** Needs
   PIE: spawn or receive an item, apply an override, check it sticks.
4. **Walkable ghosts.** There is no exposed hologram structure class (`PrimalStructureHologram`
   and similar names do not exist), so Planning Mode's ghost is internal and cannot be reused.
   A walkable ghost means our own actor with collision, tested in game.
5. **Cooked behaviour.** Everything above was probed in the editor. A mod is not proven until it
   runs cooked on a server, which is the Phase 1.5 item already on the list.

## Standing rules for this work

- Cluster members must run an identical mod set, so a KPTweaks version bump is a
  cluster-wide change, not a per-server one.
- Apply item overrides at boot, not live, or clients disagree with the server until
  they relog.
- Every feature needs a measurable acceptance test before it is called done. "It
  seemed to work" is what cost us a night on the kits.
