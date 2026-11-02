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

The data model and persistence are clear from the package. The exact mutation call is
not visible from asset names, and the useful next step is a proper Blueprint dump of
`ACSharedFunctions` with UAssetGUI or FModel, which reads UE4 packages and exports
pseudo-code. Two details already narrow it down: there is a `ClassRemapping` table
with `FindItemRemapping`, and there is a `TempItem` object passed through
`CleanItemData`. That points at building a modified copy per item and remapping
lookups to it, rather than stomping the base game's class defaults in place, which is
the safer of the two patterns.

On "is CDO editing dangerous": the danger is not corruption, it is divergence. Every
item mod does this at load. It goes wrong when a change lands after clients have
loaded (they disagree about weight until they relog), or when two mods set the same
property and load order silently decides. Applying once at boot, before anyone
connects, with the overrides loaded last, avoids both.

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
