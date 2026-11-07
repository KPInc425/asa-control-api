# Item customiser: what the engine allows, and what building it costs

ASE had mods that let an admin edit item properties at runtime from an in-game panel.
Nothing on ASA does this. Before planning a rebuild, it is worth being precise about
which of those behaviours the engine exposes at all, because they are not one problem.

## What the ASE mod actually was

`ARK Customizer - Settings Evolved` (workshop 774413050, 301 KB, last updated 2018).
Downloaded from the workshop and unpacked, it ships 25 assets:

- `ArkCustomizerGameMode` and `_Child`: a GameMode override, the root every such mod
  needs.
- `ArkCustomizer_Actor`: a persistent world actor holding runtime state.
- `Structs/ACItemModifier`: the per-item record, 24 named fields, listed below.
- `Structs/ACParamPair`, `StringIndexPair`: a generic `{Name, Value}` string pair,
  used for the editable list in the UI rather than for property setting.
- `Structs/ACGlobalChanges`: world-level knobs (tribe XP share, enemy foundation
  radius, explorer note XP, mod name and description).
- `Structs/ACInventoryModifier`, `ACInventoryItemData`: inventory-level behaviour.
- `Saves/*`: six save-game objects, so settings persist inside the world save rather
  than in a config file.
- `ArkCustomizerItemAdmin_UI`, `ArkCustomizerPrimalItem_UI`: the panel from the
  screenshot.
- `ACSharedFunctions`: a BlueprintFunctionLibrary doing save/load, array work, string
  comparison, and a class remapping table (`ClassRemapping`, `FindItemRemapping`,
  `EqualEqual_ClassClass`).
- `PrimalItem_ArkCustomizer_Activator` and `CustomizerBuff`: the item and buff that
  open the panel in game.

It is Blueprint only. There is no C++, no ArkServerApi, and no custom native plugin,
which matters because it means the whole technique is reachable from the devkit.

### The 24 per-item fields it could change

Recovered from `ACItemModifier` in the shipped package, so this is the complete list
rather than a memory of the panel:

```
ItemClass  RemapTo  RequiredComponents  StackSize  Weight  SpoilTimer
CraftQuantity  MaxCraftings  TimeToCraft  CraftingXP  CraftMinLevel
CraftingCooldown  CraftingXP  RepairCostMultiplier  RepairXP  TimeToRepair
AllowRepair  DurabilityDecreaseMultiplier  MinUseInterval  TameAffinityMultiplier
CustomName  CustomDescription  DestroyBroken  PreventUpload  CheckDescription
```

That list is the real scope of the mod: 24 properties, each explicitly handled. It is
not "any stat", which is good news for a rebuild, because a bounded list is a bounded
job.

**Correction to the table above:** `CraftQuantity` is a per-item field, so "craft more
than one at a time" was implemented as an item property, not as crafting UI. Whether
ASA exposes a comparable property is not yet known.

### How it applies changes

Recovered by dumping the Blueprint bytecode, not by guessing at names. The relevant
functions in `ArkCustomizer_Actor`:

```
CollectAllItemClasses   ApplyRemappings      FindItemRemapping (shared)
BuildItemIndex          BuildInventoryIndex  DiffItems
ModifyDefaultItems  ->  ModifyItem  ->  FixItemValues(Item, ItemModifier)
ModifyAddedInventoryItems   ModifyLootCrates   ModifyEngrams   ModifyBoss
CreateItemBackup        CleanItemBackups     UnmodifyItems
RefreshInventory  RefreshAllInventories  RefreshCraftingInventory
SendItemsToAll          SendSettingsToAll
OnRep_SortedIndexList   OnRep_NewEngramOverrides
```

The loop is plain: `ModifyDefaultItems` walks the collected item classes and calls
`ModifyItem` for each, which optionally backs up the current values, then calls
`FixItemValues(Item, ItemModifier)`. The whole `ACItemModifier` record is handed over
as one argument, so one function does every field.

`FixItemValues` is a virtual call and **it is not defined in any of the 25 shipped
packages**, so it is inherited from a class outside this mod. That is the one piece
still missing, and it is the piece that contains the actual property writes.

**Why changes applied without a relog.** `CustomizerBuff` is not cosmetic, it is the
sync channel:

```
PingServer  PongClient  SetACA  BuffTickClient
RequestAllData  RecieveAllData  DiffRecieveItemData  RecieveGlobalData  CleanData
```

A buff that exists on both client and server, requesting and diffing item data, paired
with `SendItemsToAll` on the actor. That is why edits landed live: the server pushed
the changed values to connected clients rather than waiting for a reload. Any rebuild
has to do the same thing, and this is the part worth copying most closely.

On "is CDO editing dangerous": the danger is not corruption, it is divergence. Every
item mod does this at load. It goes wrong when a change lands after clients have
loaded and nothing tells them, which is exactly the problem this buff solves, or when
two mods set the same property and load order silently decides. Applying at boot with
the overrides loaded last, plus a push on change, avoids both.

## Verdict from the devkit (2026-11-07)

Read live from `PrimalItem` in the ARK devkit via Python: 422 properties, 350 functions.

**Confirmed present, name and meaning both match:**

| ASE field | ASA property |
|---|---|
| Weight | `base_item_weight` |
| StackSize | `max_item_quantity` |
| SpoilTimer | `spoiling_time` |
| RequiredComponents (craft cost) | `base_crafting_resource_requirements`, `custom_resource_requirements` |
| CraftingXP | `base_crafting_xp` |
| TimeToCraft | `blueprint_time_to_craft` |
| AllowRepair | `allow_repair`, `can_repair` |
| CustomName | `custom_item_name` |
| CustomDescription | `custom_item_description` |
| DestroyBroken | `destroy_broken_item` |
| PreventUpload | `prevent_upload` |
| MinUseInterval | `bp_override_minimal_use_interval` |
| ItemClass | inherent, not a property |

**No equivalent found:** `RemapTo`, `MaxCraftings`, `CraftMinLevel`, `RepairXP`,
`TimeToRepair`, `CraftQuantity`. There is no `craft_quantity` or `stack` name on ASA's
item class at all, and crafting level lives on the engram, not the item.

**Related but not the same thing:** `CraftingCooldown` (ASA exposes use cooldowns, not a
craft cooldown), `RepairCostMultiplier` (`override_repairing_requirements` and
`last_repair_speed_multiplier` are adjacent), `DurabilityDecreaseMultiplier`
(`auto_decrease_durability_amount_per_interval` is the mechanism, not a multiplier),
`TameAffinityMultiplier`, `CheckDescription`.

So the honest scope is **13 of 24 fields directly settable**. That is still enough for
the cases that mattered: lighter items, bigger stacks, cheaper crafting, renamed items,
different craft times and XP. The ones that fall out are mostly the repair and
craft-maximum knobs, which nothing in our usage depended on.

One bonus from the same dump, which matters more than any of the above:
`PrimalInventoryComponent` exposes `add_item_object` and `add_item_object_ex`. That is
the clean grant call for player kits and for the sweeper moving loot, and it is the
thing the console command could not do. Neither of these is proven yet; each needs a
live set-and-read test on a throwaway item first.

## What you actually used it for, split by difficulty

| Behaviour | Kind of change | Available in ASA config | Difficulty to build |
|---|---|---|---|
| Bola (and similar) lighter | per-item property | No override exists | Small. Data-driven |
| Rename pearls server-wide | display string | No | Small, with a caveat |
| Craft more than one at a time | per-item `CraftQuantity` | No | Small, once the property is confirmed |
| Crafting XP per item | per-item property | Global multiplier only | Medium |
| Cheaper crafting per item | recipe cost | Documented ASE only, ASA unconfirmed | Test first |

## What stock ASA configuration can and cannot do

Checked against the wiki's server configuration reference, which marks each setting
for ASE and ASA separately:

- **`ConfigOverrideItemCraftingCosts`** overrides an item's recipe. The reference
  lists it `inASE = Yes`, `inASA = Unknown`. Nobody has confirmed it on ASA, so it
  either works and is undocumented, or it silently does nothing.
- **`ConfigOverrideItemMaxQuantity`** overrides stack size per item. Same status:
  confirmed for ASE, unknown for ASA.
- **`ItemStackSizeMultiplier`** is confirmed for ASA, and it is global, not per item,
  and it explicitly excludes items whose default stack size is 1. Bolas are a stack-1
  item, so this does not help the case you actually described.
- **No setting exists** for per-item weight, per-item craft quantity, or renaming an
  item. Not in ASE, not in ASA.

The practical conclusion: for the bolas case specifically, there is no configuration
path. Weight has no override at all, and bolas are excluded from the one stack setting
ASA does support.

## Why nobody remade it

Three of those five are properties you can set on an item. One is a display string.
But "craft more than one at a time" is not a property at all: it is the crafting UI
and its queue, and no mod can change that by editing an item. Any recreation has to
reimplement crafting, which is why the ASE mods that did it were large and why nobody
has ported one.

## Shape of a rebuild, cheapest first

**Phase 1, data-driven, no GUI.** A small mod that reads a config file and applies
item overrides at server boot: weight, stack size, crafting cost, display name. Our
API generates the file, so the dashboard and Discord become the admin panel and no
in-game UI is built at all. This is the part that reproduces what you used 90% of the
time.

**Phase 2, reload without a restart.** A chat or RCON command that re-applies the
config. Note that re-applying weight after players are holding items desyncs what the
client believes, so the honest version is "apply at boot, or force a reconnect".

**Phase 3, in-game admin panel.** A Blueprint UI listing items with editable fields.
This is the expensive part, weeks rather than days, and it buys convenience we
already have in the dashboard.

## Things that will bite

- **Item mods collide.** Klinger, Vanilla with Sprinkles and KP Tweaks all touch item
  data. The last mod in load order wins, so our overrides must load after them, which
  means being explicit about `-mods=` order rather than letting it fall where it may.
- **Renaming is cosmetic when done right.** Changing the display string leaves the
  blueprint path intact, so recipes, loot and other mods keep working. Remapping the
  item itself would break them.
- **Clients must have the mod.** Anything that changes item properties is a mod on
  the cluster, so every cluster member and every player needs it, and mod parity now
  includes this one.
- **Weight is a client-visible property.** Changing it at runtime while players are
  online is where desyncs come from.

## The cheap test that comes first

Before writing any mod, test the unconfirmed setting: put
`ConfigOverrideItemCraftingCosts` in a server's `Game.ini`, restart, and check
whether bolas cost what we told it to. That is one restart on a server we already own
and it settles whether we need the mod for recipe costs at all. Weight and renaming
need the mod regardless, so the test only decides the size of Phase 1, not whether it
happens.
