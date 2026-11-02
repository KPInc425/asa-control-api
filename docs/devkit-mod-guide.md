# Building the item customiser: what you do in the devkit, what I do around it

The devkit has no MCP, no live coding and no C++ for mod authors. So this is a
division of labour, not a handoff. You drive the editor; everything either side of it
is mine.

## What I need from you, in order

### 1. Confirm the devkit is installed and current

Epic Games Launcher, Unreal Engine tab, the ARK: Survival Ascended Dev Kit entry. It is
large (tens of GB) and version-locked to the game build, so it must be updated whenever
ASA patches. Tell me the version it reports; I will note it against the server build so
a mismatch never surprises us mid-week.

### 2. Create the mod project

Name it something we can keep: `iLGamingCustomizer`. Inside it, the two things every
mod of this kind needs:

- A **PrimalGameData override** (`PrimalGameData_BP_...`). The ASE original had one and
  so does every mod that changes item data at load. Without it your changes are not
  applied on server boot.
- Set the mod's **Game.ini / config hooks** so it reads a config block we control. Even
  if the first version hardcodes values, the hook needs to exist or every change means
  a re-cook.

### 3. Build the item override record

The ASE mod's per-item struct had 24 fields. That is the whole feature list, and it is
the shape to copy:

```
ItemClass  RemapTo  RequiredComponents  StackSize  Weight  SpoilTimer
CraftQuantity  MaxCraftings  TimeToCraft  CraftingXP  CraftMinLevel
CraftingCooldown  RepairCostMultiplier  RepairXP  TimeToRepair
AllowRepair  DurabilityDecreaseMultiplier  MinUseInterval  TameAffinityMultiplier
CustomName  CustomDescription  DestroyBroken  PreventUpload  CheckDescription
```

Do not assume all 24 exist on ASA's `PrimalItem`. Open the ASA `PrimalItem` class in
the devkit and tick off which properties are present. That list is the real scope, and
it is the first thing to send me.

### 4. Apply at boot

The original's flow was `ModifyDefaultItems -> ModifyItem(Item, Modifier)`. In ASA the
equivalent is: on game mode init, for each entry in the config, resolve the item class,
read its default object, and set the fields. One function per item, all fields at once.

Keep it boring and deterministic. No per-tick work, no actor spawning, no timers at
boot.

### 5. Push changes to connected clients

This is the part that made the original feel magical and it is the part most people
would skip. It shipped a buff with `RequestAllData`, `RecieveAllData` and
`DiffRecieveItemData`, plus a server-side `SendItemsToAll`. That is why edits applied
without a relog.

If we skip it, every value change needs a relog, which is exactly the behaviour you
said you never had.

### 6. Admin surface

Do not build the in-game panel first. Phase 1 reads a config file and our dashboard or
a Discord command writes it. The panel is phase 3 and costs weeks.

## What I do

- **The config schema and the file itself**, generated from our API, so a weight change
  is a form on the dashboard, not a devkit session.
- **The rollout**: mod id into the shared mod list, every cluster member gets the same
  set, restart with a save first.
- **The audit**: unpack the cooked `.pak` and diff it against the previous version, so
  we know what changed before it reaches a live server.
- **The acceptance test**: start a server with the mod, read `Mod valid: <name> (<id>)`,
  watch for errors, confirm the config took effect.
- **The property checklist**: I will keep a running list of which of the 24 fields we
  have confirmed on ASA and which are still unknown, so we never build against a
  property that does not exist.

## Hazards to plan for, not discover

- **Mod set parity across the cluster.** Once this mod is on one cluster map it must be
  on all of them, or transfers break. That is a rule we already enforce for the
  existing eleven.
- **Load order.** KP Tweaks, Klinger and Vanilla with Sprinkles all touch item data.
  Our overrides must load after them, so the mod id goes last in `-mods=`.
- **Players and the mod.** Everyone who plays needs it installed. A server-side-only
  variant would be a different (and much smaller) mod.
- **Patches.** ASA updates invalidate cooked mods. Every game patch means a re-cook, so
  the mod needs a version discipline from day one.

## First deliverable from you

The ticked-off property list from step 3. Everything else can be worked around; that
list decides what the mod can actually do.
