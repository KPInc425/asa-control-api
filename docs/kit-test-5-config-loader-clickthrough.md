# Test 5: read kits from the file the API writes

The bridge now writes two files into `D:\ARK\bridge`:

- `kits.json` for the dashboard and the API.
- `kits.txt` for the mod, one pipe-separated record per line.

`kits.txt` exists because blueprint string splitting is reliable and whether this devkit
compiles the JSON blueprint utilities is unknown. A config loader should not depend on a
plugin being present.

## Format

```
kit|starter|firstJoin|1|0
item|starter|/Game/.../PrimalItem_WeaponMetalPick.PrimalItem_WeaponMetalPick_C|1|0
creature|starter|/Game/.../Trike_Character_BP.Trike_Character_BP_C|150|/Game/.../PrimalItemArmor_TrikeSaddle..._C
```

- `kit`: name, trigger, enabled (1/0), cooldown seconds
- `item`: kit name, item class path, quantity, quality
- `creature`: kit name, creature class, level, saddle class or empty

One kit currently produces 20 lines: 1 kit, 18 items, 1 creature.

## Step 0: prove the file is readable from a blueprint

Before building any parser, confirm the mod can read the file at all.

1. On `Actor_BP_KPTweaks`, add a function `KPT_ReadKitsFile` returning String.
2. `Load String from File`, path `D:\ARK\bridge\kits.txt`.
3. Return the string, and print its **Length** from BeginPlay.

If the length is 0 or the node does not exist in a cooked build, stop: the loader becomes a
`.ini` read or a DataTable asset instead, and that changes the whole design.

`Load String from File` is a developer-facing node. It works in editor builds; whether it
survives cooking is exactly the question this step answers.

## Step 1: the data

Structs on the KPTweaks side:

- `S_KPTKitItem`: `ItemClass` (Class), `Quantity` (Int), `Quality` (Float)
- `S_KPTKit`: `KitName` (Name), `Trigger` (Name), `Enabled` (Bool), `CooldownSeconds` (Int),
  `Items` (Array of `S_KPTKitItem`), `CreatureClass` (Class), `SaddleClass` (Class),
  `CreatureLevel` (Int)

On the singleton, a variable `LoadedKits` (Array of `S_KPTKit`).

## Step 2: parse

In `KPT_LoadKits` on the singleton:

1. `KPT_ReadKitsFile`, then **Split** on line breaks (`\n`). Trim each line.
2. `For Each Loop` over the lines. Skip empty ones.
3. **Split** each line on `|` into an array.
4. `Switch on String` using element 0:
   - `kit`: append a new `S_KPTKit` to `LoadedKits` with fields from elements 1 to 4. Set
     `Enabled` from `== "1"`.
   - `item`: find the kit whose `KitName` matches element 1, and append an `S_KPTKitItem`
     built from elements 2 to 4. Class paths arrive as strings; convert with **Class from
     String** if that node exists, otherwise **Load Class Asset**.
   - `creature`: same lookup, set the creature fields.
5. Print `Length` of `LoadedKits` at the end, so a parse failure is visible rather than
   silent.

Order matters: `kit` lines come before their items in the file, so append-then-find works
without sorting.

## Step 3: grant from the config

Replace the hardcoded item in the spawn hook with a loop over the matched kit:

1. Find the kit in `LoadedKits` by name (the only kit for now is `starter`).
2. If `Enabled` is false, skip.
3. `For Each Loop` over `Items`: `Give Item To Character` with `ItemClass` and `Quantity`.
4. If a creature class is set, spawn and give it separately.
5. Claim as before, with the kit's own name.

## Step 4: prove it end to end

1. Edit the kit in the dashboard, for example change the pick's quantity to 3.
2. Restart the server, or re-enter PIE.
3. Spawn a fresh character: three picks, not one.
4. Confirm in the dashboard that the change was the one you made, not the previous one.

That last step is the one that proves the whole loop: dashboard to file to blueprint to
inventory.

## What this unlocks

After this, adding a kit is a form on the dashboard, not a devkit session. Everything after
it, including the sweeper and the item customiser, reads its config the same way, so this
parser is the piece worth getting right.
