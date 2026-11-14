# Editor checklist: things only KP can do

## STATE, 2026-11-13: what is proven and what is next

**Proven in the devkit** (each one cost real time, none is still in doubt):

- Kit claim marker persists per character across respawn, relog and editor restart.
- Items grant through the native `Give Item To Character` node, durability intact.
- `tame_dino` from Blueprint works, provided `Override Taming Team ID` is fed the player's
  `targeting_team`; passing 0 fails silently.
- `Spawn Custom Dino` with a `Make Dino Setup` spawns a **level 150 tamed dino owned by the player**,
  every run, once the authority gate, the 2 second delay, the wired location and rotation, and the
  `Owner Player Controller` are all in place.
- `DinoSetup`'s stat arrays are FixedArray and not exposed to Blueprint, so a blueprint kit cannot
  author an allocation. Level-only is the shippable answer and matches TC's Auto Rewards.
- TC's Auto Rewards was decompiled: packs store a specification, and an item carrying custom data
  spawns the class and tames it. Nothing was ever captured or serialised.
- Blueprints cannot read files, ini or JSON. Kit configuration is therefore an in-game panel writing
  to `KPTweaksSave`, not a file the API can edit.
- Items enumerate from `PrimalGameData.master_item_list` (654 classes) at runtime.
- Emotes are reachable: `emote_anims` plus `play_emote_animation(index)`.
- Structure skins apply in place via `PrimalStructure.set_structure_skin`.
- Behemoth walls fail to snap because `structure_snap_type_flags` is 0 on three of four and 512 on
  Wood, where vanilla and S+ large walls use 8 and parent from `Base_Wall_Large_C`.

**Open, and only one is on the critical path:**

1. **The orb item** - the last piece of the dino kit. `PrimalItem` subclass carrying a soft class ref,
   level, tamed flag and saddle; on use, spawn, then destroy itself. No unknowns left in it.
2. **The kit spec and panel** - soft class reference arrays in `KPTweaksSave`, item pickers from
   `master_item_list`, dinos picked in world.
3. Behemoth walls: apply the flags and reparent on one wall, then test.
4. Template hammer: is it a Blueprint or native, which decides whether auto-build speed is even
   possible.
5. Alien Plants: grow light snapping, greenhouse coverage, and the 2024 bug list.
6. Cooked behaviour: nothing here has been tested in a cooked build or on a server.


Ordered by what unblocks the most work. Each item says what to do and what to report back.
Items 1 to 3 are PIE tests on a throwaway map; nothing touches the live cluster.

## 1. Does `tame_dino` work on a spawned dino (5 minutes)

Gates: kit dinos.

**Do not do this from Python.** Calling `tame_dino` from editor Python crashed the editor on
2026-11-13 because the MCP handler is not on the game thread. The call has to come from a
Blueprint, where the engine owns the thread.

Build one throwaway actor, `BP_KPT_TameTest`, parent **Actor**, and wire:

1. `Event BeginPlay`
2. `Delay` 3.0
3. `Execute Console Command`, command `cheat Summon Dodo_Character_BP_C`, world context self
4. `Delay` 1.5
5. `Get All Actors of Class` (`PrimalDinoCharacter`), then `Get` index 0
6. `Cast to PrimalDinoCharacter`
7. `Tame Dino` from the cast result: `for_pc` = `Get Player Controller` (index 0),
   `override_taming_team_id` = 0, `prevent_name_dialog` = true
8. `Print String` of `BP Is Tamed` from the same dino, plus `targeting_team`

Drop the actor into the throwaway map, press Play, watch the log.

Report: does the dodo come out tame, with no name dialog, and does the log show any warning?
If the editor crashes here, that is a finding too, and it would mean `tame_dino` itself is
unstable rather than the Python thread. Tick **Play Persistent Player** in World Settings now if
you want the save step in item 3 to work later.

A console-only sanity check that costs nothing: type `cheat ForceTame` in PIE with a wild dino
targeted, and see whether the resulting creature is tame and yours. That tells us what a
correctly tamed dino looks like without involving our code.

## ITEM 1: PASSED, 2026-11-13

`tame_dino` from Blueprint works. Live read after the successful run: `bp_is_tamed True`,
`targeting_team 161006563`, `taming_team_id 161006563`, `imprinter_name ''`, both dino ids set.

What made it work: feeding `Override Taming Team ID` from the **player's** `targeting_team`
(16 1006 563), not 0. The harness is retired; it was a probe, not the feature.

### The final form: a dino orb item, not a live spawn

KP wants the dino handed over as an item the player releases when they choose, like a cryopod.
The pieces line up, all verified by reflection:

- **Capture**: `get_dino_data` returns `ARKDinoData` with `dino_class` and `dino_data`, and
  `dino_data` is an **array of byte arrays**.
- **Carry it in the item**: `PrimalItem.set_custom_item_data(data)` with a `CustomItemData` whose
  `custom_data_bytes.byte_arrays` is the same array-of-byte-arrays shape, and whose
  `custom_data_classes` / `custom_data_soft_classes` hold the class. So the payload rides inside
  the item and persists with it, exactly as a cryopod does.
- **Release**: `spawn_from_dino_data(dino_data, world, location, rotation,
  for_team=<claimant tribe>, generate_new_dino_id=true, tamer_controller=<claimant>)`, then
  destroy the item.

Two delivery styles, for two jobs, and the kit should offer both:

1. **Orb**: an exact replica, same stats, colours, mutations, imprint. Needs a capture to exist.
2. **Spawn and tame**: a fresh tamed creature of a species, for level-based kits. Uses
   `tame_dino` with the claimant's team, which is now proven.

### Capture is NOT required. Two separate delivery modes.

KP's objection is correct and my earlier framing was sloppy. There are two different things:

- **Delivery**: giving a player a dino. Requires no payload and no capture. Spawn the class, then
  `tame_dino` with the claimant's team. Proven on 2026-11-13.
- **Exactness**: reproducing a *specific* tamed creature, with its stats, colours, mutations and
  imprint. That is the only case needing `ARKDinoData`, and even then nobody has to "capture" by
  hand: the mod can spawn a dino of the class, read its data, destroy it, and keep the 698-byte
  payload. That is a build step, not an admin chore.

Measured: `ARKDinoData.dino_data` for a Dodo is a **flat array of 698 bytes**, with `dino_class`
holding the blueprint class. So the payload is real serialised object state, not something we can
author by hand, and not something we need for ordinary kits.

**So the base kit stores a class and a level, not a payload.** The orb then carries the class in
`custom_data_classes` and the level in `custom_data_ints` or `item_custom_data`, which is tiny,
survives saves with the item, and needs no capture from anyone.

### The real signatures, from the game's own usage output (2026-11-13)

KP ran the commands with no arguments and ARK printed the expected parameter lists. This settles
the capture question outright.

**`GMSummon`** works: `cheat GMSummon "Dodo_Character_BP_C" 150` produced a **perfect level 225
Dodo**. Note the number is the *base* level; the creature came out at 225 because ASA adds bonus
levels.

**`SpawnSetupDino`**

```
DinoBlueprintPath[FString] SaddleBlueprintPath[FString] SaddleQuality[float]
DinoLevel[int32] DinoStats[FString] SpawnDistance[float] YOffset[float] ZOffset[float]
```

**`SpawnExactDino`**

```
DinoBlueprintPath[FString] SaddleBlueprintPath[FString] SaddleQuality[float]
BaseLevel[int32] ExtraLevels[int32] BaseStats[FString] AddedStats[FString]
DinoName[FString] Cloned[int8] Neutered[int8] TamedOn[FString] UploadedFrom[FString]
ImprinterName[FString] ImprinterUniqueNetId[FString] ImprintQuality[float]
Colors[FString] DinoID1[int64] Exp[int64]
SpawnDistance[float] YOffset[float] ZOffset[float]
```

**Capture is not required, at all.** `SpawnExactDino` takes the level, extra levels, base and
added stats, imprint quality, colours, name, imprinter and dino id as plain parameters. It can
reconstruct a creature from numbers alone, which is precisely the "same dino out of the ball"
case without anyone putting a dino in a ball first.

**`SpawnSetupDino` is the better fit for kits**, and for KP's stated goal that every kit dino be
identical: one `DinoLevel` plus one `DinoStats` string, so every claimant gets the same creature.

Known caveat reported by KP: `SpawnExactDino` is regarded as borked in the community, with the
workaround being to cryopod the creature a couple of times to normalise it. That is consistent
with the general problem that spawned dinos can carry inconsistent state until re-serialised.

### CONFIRMED working forms, 2026-11-13

KP ran them. Results, verified from the log and the live world:

- **Full asset path fixes the class lookup.** Three dodos spawned at `absolute_base_level 150`
  from `SpawnSetupDino "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" ...`.
- **Stats are index,value pairs, confirmed by the parser itself.** `"0,2,8,2"` produced
  `Trying stat: [0] = [2]` and `Trying stat: [8] = [2]`, so health x2 and melee x2.
- **Pass an empty string for the saddle, not `None`.** `None` makes the command try to load a
  blueprints called `None` (`Failed to find object 'Blueprint None'`). It still spawns, but the
  log fills with warnings and it is not a clean signal.
- **`SpawnExactDino` stays broken** on every form tried, including named parameters:
  `Bad or missing property 'BaseLevel'`. It is the one the community calls borked. Park it. We
  do not need it, because `SpawnSetupDino` covers the identical-dino case and `GMSummon` covers
  the quick spawn.

Working command, saddle omitted cleanly:

```
cheat SpawnSetupDino "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" "" 0 150 "0,2,8,2" 500 0 0
```

**Reading stats back from Python hit class defaults**, so `base_level_max_status_values` reads all
zeros and cannot confirm the multipliers. Verify by eye instead: compare two spawned dododos in
the inventory panel, one with an empty stats string and one with `"0,2,8,2"`.

### SpawnExactDino works. The wrapper was the problem. (2026-11-13)

KP found `https://arkutils.netlify.app/tools/spawnexact`, a command generator, and its output runs
correctly. The working shape:

```
cheat SpawnExactDino "Blueprint'/Game/PrimalEarth/Dinos/Doedicurus/Doed_Character_BP.Doed_Character_BP'" "" 0 1 0 "0,0,0,0,0,0,0,0" "0,0,0,0,0,0,0,0" "Generated" 0 0 "" "" "" 0 0 "" 0 0 0 20 20
```

Three things made my attempts fail:

1. **The class path needs the `Blueprint'...'` wrapper** and the whole argument in double quotes.
   A bare path, or a short name, does not resolve.
2. **Parameters are positional**, in the order ARK prints. My named-parameter attempt produced
   `Bad or missing property 'BaseLevel'`, which was really "the third positional argument is
   missing".
3. **Both stat strings take eight values**, one per spawnable stat, matching the generator's
   Health, Stamina, Oxygen, Food, Weight, Melee, Speed plus one more.

**The known defect is real and documented on that page:** creatures spawned this way are broken
until they are cryo'd, "maybe even twice", before they show the right stats and colours. That is
not a myth, it is in the generator's own warning.

This matters for kits, because it decides which command to build on:

- `SpawnSetupDino` is proven to spawn at a chosen level with stat multipliers, and we have not
  yet seen whether it shares the cryo defect.
- `SpawnExactDino` reproduces a full creature but is documented to need cryo normalisation.

**Next test, and the only one that matters now:** spawn one dino with `SpawnSetupDino`, note its
stats in the inventory panel, cryo it, release it, and compare. If its stats were already correct
and stay correct, `SpawnSetupDino` is the kit command and we are done. If it also needs cryo
cycling, then every route needs a normalisation step and the orb must hide that from the player.

### Same level does not mean same stats (measured 2026-11-13)

Two Dodos at level 225, spawned by different methods, differ: Health 432 vs 392, Stamina max 84 vs
91, Food 825 vs 750, and the stat bars 37/64/32/62/39/33 against 41/37/56/42/38/32.

That is not a bug, it is how wild points work: the total is fixed by level and the **distribution
is random per spawn**. So `GMSummon <class> <level>` and any level-only route can never give
identical creatures, which rules them out for kits on their own.

**Identical dinos require the allocation to be specified**, which is what those parameter strings
do:

- `SpawnExactDino` takes `BaseStats` and `AddedStats`, each **eight values**, in fixed stat order.
- `SpawnSetupDino` takes `DinoStats` as **index,value pairs**, proven by the parser printing
  `Trying stat: [0] = [2]`.

### The command works, but the arrays are not point counts (2026-11-13)

Ran the generator's all-in-Health command. Result: **Generated (Dodo), LEVEL 1001**, with Health
1008.1, Stamina 1320, Oxygen 1980, Food 5850.1, Melee **839.7%**, Torpidity 1380.5, Weight
0.0/195.0, Imprinting 0%.

- **Level 1001 confirms the arithmetic:** `BaseLevel 501` + `ExtraLevels 500`.
- **The allocation definitely applies:** health past 1000 and melee at 839% on a Dodo is not a
  random roll.
- **But the arrays are not point counts.** 500 health points at a Dodo's roughly 8 health per level
  would be about 4000; it came out 1008. Stamina, oxygen and food are all inflated despite being
  zero in both arrays. So the numbers are consumed in some other way, possibly as multipliers, and
  a naive points model is wrong.

Also visible: Weight shows 0.0 of 195.0, which is the "broken until cryo'd" symptom the generator
warns about.

### Can we build ARKDinoData ourselves? The struct yes, the creature no. (2026-11-13)

Tested with `peek_dino_data` from editor Python:

- `ARKDinoData` built with only `dino_class` set decodes to a transient dino with **no status
  component**, and `get_dino_data` on that transient returns a payload with **zero bytes** and no
  class.
- `peek_dino_data(data, run_blueprint_construction=True)` behaves the same: still no status
  component, still an empty payload.

So `Make ARKDinoData` gives you a shell. The `Dino Data` field is the serialised creature itself
(698 bytes for a dodo), and there is no `set_dino_data`, so the bytes can only come from a real
creature via `get_dino_data`.

A November 2026 Discord thread describes the same failure in a real project: filling in dino data by
hand, plugging it into the spawn node, and nothing spawning because the data is null.

**Still worth one run: KP's `Make ARKDinoData` -> `Spawn from Dino Data` graph.** My evidence is from
a decode test, not from that function with an empty array. If a shell with a class and a name does
spawn a creature, construction works and the whole capture discussion is moot.

### `DinoSetup`: the right shape for a kit definition

Found by scanning every dino or spawn class for a function taking a `DinoSetup`:

```
dino_type, dino_blueprint_path, dino_soft_reference
dino_level
base_points_per_stat          12 slots
player_added_points_per_stat  12 slots
is_tamed, dino_name, dino_state
saddle_blueprint_path, saddle_quality, auto_equip_saddle
dino_imprinting_quality
use_fixed_spawn_level, spawn_offset, prioritize_stats
```

No native function consumes it to spawn; the only native reference is
`PrimalDinoCharacter.bp_get_custom_dino_setup()`, which reads one off an existing creature. But the
field list is exactly what a kit needs to store, and it settles the twelve-stat layout that earlier
guessing did not.

### Patching after spawn is the wrong shape. Two better routes. (2026-11-13)

KP's screenshot showed the crux: a freshly spawned Dodo at **level 16** with **base health 56**,
even though 100 health points had been written to it. Two separate facts:

1. **`Spawn Actor from Class` performs a wild spawn.** The level is rolled by the game and differs
   every run, which is why every dino came out at a different level. Nothing in the graph sets one.
2. **The point change does not show until the creature is reloaded.** There is no recalculation
   function on the status component to call; the max is recomputed when the creature is serialised
   and loaded, which is the same mechanism behind the community's cryo dance.

So the fix is not another node after the spawn. It is to **birth the creature already correct**.

**Route A, preferred: spawn a serialised creature.**
`spawn_from_dino_data(dino_data, world, loc, rot, for_team, generate_new_dino_id, tamer_controller)`
builds the animal from `ARKDinoData`, which is already-serialised state, so level and stats should
be right at birth with no reload. It also returns the actor, so there is no array hunting. The
payload is obtained once per template with `get_dino_data` on a reference creature. This makes the
kit template an admin-authored capture rather than a set of numbers, which is fine: the admin does
it once when authoring the kit, and players never see it.

**Route B, fallback: compute the max yourself.**
No recalc call exists, but the pieces do:

```
bp_get_amount_max_gained_per_level_up_value(value_type, tamed) -> float
bp_direct_set_max_status_value(value_type, new_value)
bp_direct_set_current_status_value(value_type, new_value)
```

So `new_max = current_max + points_added * increment`, set it directly, then set current to match.
Untested, and a later serialisation might recompute and overwrite, so treat it as a fallback.

**Route C, what the command already does: `SpawnSetupDino`.** It sets level and a stat allocation at
spawn, and we have watched it produce level 150 creatures. Non-deterministic in the allocation, so
it suits identical-across-players only if the allocation is specified, but it is proven to birth a
correctly levelled creature without a reload.

**Next test, and it decides the architecture:** take `get_dino_data` from a reference Dodo, then
`spawn_from_dino_data` it, and read the stats immediately without reloading anything. If that dino
arrives with the reference's level and stats, Route A is the kit, and the whole feature is a payload
plus a spawn call.

### Points work; max recalculates late and current health is not refilled (2026-11-13)

Measured in the live world after KP's points test:

```
Dodo_0  wildHP=100  max=840.07  cur=224.35
Dodo_1  wildHP=100  max=840.07  cur=133.38
Dodo_2  wildHP=100  max=56.07   cur=56.07
```

Three conclusions:

1. **The setter works.** 100 health points took max health from a base of about 40 to 840.
2. **Max recalculation is deferred.** Dodo_2 has the points recorded but still shows max 56, so a
   read immediately after setting returns a stale value. This is why the printed numbers differed
   between runs: they were sampled at different points in the recalculation.
3. **Current health is not refilled when max rises.** The two older dodos sit at 224 and 133 of
   840, which is what KP saw as dinos that look almost dead. Raising the ceiling leaves the current
   value where it was.

**The fix, and it belongs in every place we set points:**

```
BP Direct Set Current Status Value(ValueType, BP Get Max Status Value(ValueType))
```

Both exist: `bp_direct_set_current_status_value(value_type, new_value)` and
`bp_get_max_status_value(value_type)`. Apply it for Health at minimum, and for Stamina, Food and
Water if the creature should arrive full. Then delay 1.5 before reading or printing, so the
recalculation has settled.

For kits this replaces the cryo dance entirely: set the points, then set current to max.

### In Blueprint, spawn directly. Do not drive the console from a graph.

`Get All Actors of Class` returned an empty array in KP's points test, so `Get 0` had nothing to
cast. Rather than debug why the console summon did not land in that PIE session, remove the
dependency: inside a Blueprint the console was never necessary. It existed only so Python could
create actors without touching the game thread.

Correct shape for any in-game test or feature:

```
BeginPlay -> Switch Has Authority (Authority only)
          -> Spawn Actor from Class (Dodo_Character_BP, at player location + Z 300)
          -> Cast to PrimalDinoCharacter -> My Character Status Component
          -> print before, set points, Delay 0.5, print after
          -> Tame Dino (team fed in), optional saddle
```

Three advantages: no console command to be refused, no guessed delay waiting for an actor to
register, and the spawn node returns the creature so there is no array index to get wrong.

### The deterministic route exists, and it is a blueprint API (2026-11-13)

The spawn command is not deterministic: two identical `SpawnExactDino` calls produced Dodos both
at level 1001 with different stats (Health 1064.1 against 1008.1, Stamina 1350 against 1320, Oxygen
2145 against 1980, Melee 804.4% against 839.7%). Close, never equal. So the command cannot be the
foundation for identical kit dinos.

KP found the community answer in Discord, and every function it uses exists in ASA, verified by
reflection on `PrimalCharacterStatusComponent`:

```
get_level_up_points(value_type, tamed_points) -> int32
set_level_up_points(value_type, tamed_points, new_points)
get_mutation_points(value_type) -> int32
set_mutation_points(value_type, new_points)
clear_all_level_up_points()
clear_all_mutation_points()
get_base_level_from_level_up_points()
```

`PrimalCharacterStatusValue` carries all twelve stats: HEALTH, STAMINA, TORPIDITY, OXYGEN, FOOD,
WATER, TEMPERATURE, WEIGHT, MELEE_DAMAGE_MULTIPLIER, SPEED_MULTIPLIER, TEMPERATURE_FORTITUDE,
CRAFTING_SPEED_MULTIPLIER.

**So the pattern is: read the point allocation off a reference creature, spawn a fresh one of the
same class, write the allocation onto it.** That is deterministic by construction, because we are
setting the numbers rather than hoping a spawner reproduces them.

### What this means for the kit

A kit dino template becomes:

- class
- per-stat **wild** points
- per-stat **tamed** points
- per-stat **mutation** points

Grant flow: spawn the class, apply the three point sets, `tame_dino` for the claimer's team, and
optionally give the saddle. The orb carries the template in item custom data.

Note the arithmetic constraint carried over from the spawn command: the wild points must total the
level minus one, so the panel has to validate that the array sums correctly or the creature will be
inconsistent.

### The one remaining test

Apply points to a freshly spawned dino and check the tooltip. Specifically: spawn a Dodo, set every
stat's level-up points to a lopsided allocation, and see whether the creature shows those stats
**without** needing a cryo cycle. If it does, the whole dino feature is solved and the orb is just
UI plus storage.

### The test that actually matters: is it deterministic?

Everything above is secondary. A kit needs **the same creature every time**, so the only question
left is whether repeating the identical command gives identical stats.

1. Run the exact same command again.
2. Cryo both, or read both fresh, and compare health, stamina, melee and food.

- **Identical twice: kits are solved.** Store the class, the level and the two arrays, and every
  claimant gets that creature.
- **Different twice: the arrays steer the distribution but leave randomness inside it**, and we
  need another route for exact sameness.

Do not try to decode the array semantics until that is answered, because if the command is not
deterministic there is nothing to encode.

### The format is now understood. Points must sum to the level. (2026-11-13)

KP set Health to **500** on the arkutils generator with everything else at 0, and it produced:

```
cheat SpawnExactDino "Blueprint'/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP'" "" 0 501 500 "500,0,0,0,0,0,0,0" "500,0,0,0,0,0,0,0" "Generated" 0 0 "" "" "" 0 0 "" 0 0 0 20 20
```

Read the parameters:

| parameter | value | meaning |
|---|---|---|
| `BaseLevel` | **501** | 500 wild points **plus one** |
| `ExtraLevels` | 500 | the tamed allocation, same count |
| `BaseStats` | `500,0,...` | how the wild points are spent, slot order matches the UI |
| `AddedStats` | `500,0,...` | how the tamed points are spent |

**The invariant: the numbers in a stats array must sum to `BaseLevel - 1`** (or `ExtraLevels` for
`AddedStats`). That is why my earlier test failed twice over: 20 points at `BaseLevel 1` is not a
small allocation, it is an impossible one, and the engine had nothing coherent to do with it.

There are no caps, which makes the confirmation trivially visible: a Dodo with 500 health points
should show health in the thousands, against a base of about 40.

**Confirmation step:** run the command above and read the tooltip. If health is enormous and every
other stat is baseline, the field order and the sum-to-level rule are both confirmed, and a kit dino
becomes: class, level, and an allocation whose sum equals the level minus one.

Note the eighth slot stays 0 even though the UI offers seven stats, so the trailing slot is either
unused or something we never need to touch.

### Two inconclusive tests, 2026-11-13, and why

Ran both commands. Neither answered the question, and both failures were design errors on my side.

- **`SpawnExactDino` with `BaseLevel 1` and 20 in slot 0** produced a dino at exactly base stats:
  health 40.1, stamina 100, oxygen 150, food 450, weight 50, melee 134.1%. A level 1 creature has
  no wild points to distribute, so the array had nothing to act on. The test was void by
  construction.
- **`SpawnSetupDino` level 150 with `"0,20"`** produced health 344.1, against 392 and 432 from
  earlier 150 spawns. The natural spread is roughly ±90, so a 20 point change is unmeasurable
  against it. Inconclusive in both directions.

Also learned: after cryo and release, `absolute_base_level` reads **0** on every dino, so Python
readback cannot confirm levels any more. The in-game tooltip is the reliable view.

### Stop guessing the grammar. Use the generator as the authority.

The generator at arkutils is known to emit working commands. Instead of hand-testing formats, have
it produce a deliberately extreme build and read its output:

1. On the arkutils Spawn Exact Dino page, pick Dodo, then put **all available points into Health**
   and everything else at minimum, Wild allocation.
2. Copy the exact command string it generates and paste it here before running it.
3. Run it. If the creature comes out with absurd health and nothing else, the field order in that
   array is confirmed, and we have a working template for kits.

That converts the remaining unknown from a guessing game into one observation, and it also gives us
a reference string to copy the field order from for our own admin panel.

### Stats are back on the table: `Server Force Update Max Stat Values` (2026-11-13)

KP found stat manipulation graphs using nodes that change an earlier conclusion:

- **`Server Force Update Max Stat Values`** on `PrimalCharacterStatusComponent`. This is the
  recalculation call that a reflection sweep did not surface, so the "points do not show until the
  creature reloads" finding has a workaround: set the points, force the update, then set current to
  max.
- **`Rescale Max Stat`** with `Level Up Value Type`, `Target Value` and `Is Percent Of True Value`.
- **`Shift Stat Point`** with `Dino`, `Stat In`, `Positive`, `Stat Decrease`, `Amount To Modify` and a
  `World Context`, which suggests moving points between stats.
- **`Check Dino Uses Stat`** with `Status Value`, `Ignore Torpidity` and `For Tamed Add`, returning
  `Used`. That matters because a dodo does not use Oxygen, so allocating into unused stats is waste.
- **`Set Base Level No Stat Change`**, which sets the level without re-rolling stats.

So exact stat allocation is still achievable, as a second pass over a spawned creature rather than a
spawn parameter. It is not needed for v1 of the orb.

### Stats via DinoSetup: closed. Dynamic kits: yes. (2026-11-13)

**Level 150 confirmed working** with `Skip Adding Tamed Levels` unchecked.

**The stat arrays cannot be set from Blueprint.** The debugger dump shows the struct carries
`BasePointsPerStat[0..11]` and `PlayerAddedPointsPerStat[0..11]`, but reflection reports both as
**FixedArray**, and neither appears as a pin on `Make Dino Setup`. The debugger reads every property;
Blueprint only gets what is exposed. So a blueprint kit cannot author a stat allocation through this
struct, and the only exposed stat knob is `prioritize_stats`, an ordinary Array, whose semantics are
untested.

That closes the stats question for now. Level-only is the shippable answer, which is also what TC's
Auto Rewards did.

### Dynamic kits: soft class references, no hardcoded paths

KP asked whether kit creation can be more dynamic than typing blueprint paths. Yes, and it is also
safer:

```
Kit spec (stored in KPTweaksSave)
  items:    array of soft class refs (PrimalItem) + quantity + quality
  dino:     soft class ref (PrimalDinoCharacter), level, is_tamed, neutered
            saddle soft class ref, imprint quality
```

At grant time each soft reference is resolved and used. No `/Game/...` strings anywhere, so nothing
breaks when an asset is renamed or moved, and the same spec works across maps.

**Populating the pickers:**

- **Items** come from `PrimalGameData.master_item_list` (654 classes) at runtime, which is how an admin
  menu can list and search everything without a baked table.
- **Dinos** have no master list, so pick the creature rather than the class: aim at a dino, store
  `get_class()`. That is the pattern the shipped mods use with their DinoGun tools, and it cannot be
  mistyped.

### PROVEN: the dino spawn recipe (2026-11-13, KP, works every run)

```
Event BeginPlay
  -> Switch Has Authority  (Authority pin only)
  -> Delay 2.0
  -> Get Player Controller (0)
  -> Get Controlled Pawn
  -> Get Actor Location  -> +300 on Z   (drop in beside the player, not inside them)
  -> Get Actor Rotation
  -> Spawn Custom Dino
       Dino Setup            = Make Dino Setup (Dino Type + Dino Soft Reference; Is Tamed ticked)
       Owner Player Controller = the controller above
       Spawn Location / Rotation = the wired values
```

Each element is load-bearing, and each cost a round of debugging to find:

- **`Switch Has Authority`**, because `BeginPlay` fires in both worlds and the client cannot spawn.
- **`Delay 2.0`**, because at `BeginPlay` the server has not possessed a pawn yet, so
  `Get Player Controller` gives you a controller with no pawn and `Owner Player Controller` reads as
  invalid. Two seconds is enough for possession. **In the real feature this disappears:** an item
  being used implies a live player, so the spawn can run immediately.
- **`Owner Player Controller` is mandatory whenever `Is Tamed` is ticked**, else the spawn is
  refused with `bIsTamed is enabled but no valid OwnerPlayerController was specified`.
- **Location and rotation must be wired**, because both are by-ref parameters and literals are
  rejected at compile time.
- **`Dino Type` plus `Dino Soft Reference`** resolved the class without fighting a path string.

### What the orb does differently

Same node, different trigger and no delay:

```
Item used (player exists, server side)
  -> Spawn Custom Dino with a Dino Setup built from the kit spec
       class, level, Is Tamed, saddle, imprint quality
       Owner Player Controller = the using player's controller
  -> optionally tame_dino for team certainty
  -> destroy the orb item
```

### Why `Spawn Custom Dino` refused to spawn, from the log

```
LogShooter: Error: SpawnCustomDino: Failed spawning dino -
bIsTamed is enabled but no valid OwnerPlayerController was specified.
```

and two compile errors on the same node:

```
The current value (0, 0, 0) of the 'Spawn Location' pin is invalid
  ('by ref' params expect a valid input to operate on)
The current value (0, 0, 0) of the 'Spawn Rotation' pin is invalid
```

So three requirements, all cheap:

1. **`Owner Player Controller` is mandatory when `Is Tamed` is checked.** The spawn is refused
   outright without it. Wire `Get Player Controller` index 0.
2. **`Spawn Location` must be wired**, because it is a by-ref parameter and a literal zero is
   rejected. `Get Player Character` -> `Get Actor Location` -> `Break Vector` -> X, Y, Z.
3. **`Spawn Rotation` must be wired** the same way, via `Get Actor Rotation` -> `Break Rotator`.

`base_points_per_stat` is a secondary question: get a spawn at level 150 first, then look for the
pin. If the struct genuinely does not expose it to Blueprint, that settles the stats question by
itself.

### `Spawn Custom Dino` takes a DinoSetup. This supersedes the console commands. (2026-11-13)

KP found two blueprint spawn nodes. The important one:

**`Spawn Custom Dino`**

```
World Context Object, Spawn Location, Spawn Rotation
Dino Setup            <- the DinoSetup struct
Owner Player Controller
Debug Draw Duration, Apply Rotation to Spawn Offset, Use Exact Spawn Location
Skip Adding Tamed Levels, Suppress Taming Notifications
Mission, Color Set, Gender Override, Spawned from Dino
-> Return Value (the spawned dino)
```

**`Spawn Dino`** takes a Dino Class directly with `Level Multiplier`, `Extra Level Offset`,
`Override Base NPCLevel`, `Base Level Override Value`, `NPC Absolute Base Level`, `Should Gender`,
`Make Female` and an escort class.

This is the missing piece. `DinoSetup` carries exactly what a kit needs:

```
dino_type / dino_blueprint_path / dino_soft_reference
dino_level
base_points_per_stat          12 ints
player_added_points_per_stat  12 ints
is_tamed
saddle_blueprint_path, saddle_quality, auto_equip_saddle
dino_imprinting_quality
spawn_offset, use_fixed_spawn_level, prioritize_stats
```

Everything the console commands fumbled is a struct field here, and because it is a proper spawn path
rather than a patch afterwards, the deferred-recalculation problem should not apply.

**The decisive test:**

1. `Make DinoSetup`.
2. `dino_blueprint_path` = `/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP` (or set
   `dino_soft_reference` / `dino_type`), `dino_level` = 150, `is_tamed` = true.
3. `base_points_per_stat` = twelve ints summing to **149**, lopsided on purpose, for example 149 into
   health and zero elsewhere.
4. `Spawn Custom Dino` with that setup, spawn location beside the player, `Owner Player Controller` =
   the player controller.
5. Look at the tooltip. Big health and level 150 means exact stat control works at spawn, and the
   orb becomes a struct plus one node.

If health comes out ordinary at level 150, then the allocation is being ignored here too and the
level-only route stands as the shippable answer.

### `SpawnSetupDino`'s stat pairs do not land. Measured. (2026-11-13)

`cheat SpawnSetupDino ... 0 150 "0,200" 500 0 0` produced a level 225 Dodo with **Health 288.1**,
Stamina 520, Oxygen 705, Food 2610.1, Melee 322.2%.

Other level-225 dodos from the same command measured 344, 392 and 432 health. 288 is below all of
them, where 200 health points would have made it the highest by a wide margin. So the pairs are
parsed (the log shows `Trying stat: [0] = [2]`) but they **do not steer the result**.

**Conclusion: level-only spawning is what works.** That is also all TC's Auto Rewards ever did, so it
is not a regression, it is parity.

### If stats must matter, `SpawnExactDino` does steer them

The generator's all-in-Health command produced health **1064.1** and **1008.1** on two identical runs,
against a base of about 40. Both are enormous, so that path *does* apply an allocation. The two runs
differed by roughly 5%, which is the catch: steered but not identical.

So the trade is:

| route | level | stats | identical across players |
|---|---|---|---|
| `SpawnSetupDino` | yes | no, random | level yes, stats no |
| `SpawnExactDino` | yes | **steered** | within about 5% |
| spawn + set points | yes | points recorded | no, and needs a reload to show |

**Recommendation: build the orb on level-only now**, which matches TC exactly and is a shippable
feature. Add `SpawnExactDino` later if a 5% stat spread is acceptable for fairness. Do not spend more
time on the pairs grammar; it parses and does nothing.

### ARK's stat enumeration, from KP (ASE, 2026-11-13)

```
0  Health
1  Stamina
2  Torpidity
3  Oxygen
4  Food
5  Water
6  Temperature
7  Weight
8  MeleeDamageMultiplier
9  SpeedMultiplier
10 TemperatureFortitude
11 CraftingSpeedMultiplier
```

This is the canonical list, and it matches what the `SpawnSetupDino` parser logged verbatim
(`Trying stat: [0] = [2]`, `[8] = [2]`). So the **pairs grammar uses these indices directly**, and
`"0,20,8,10"` means 20 points of health and 10 of melee.

**Discrepancy to resolve:** `SpawnExactDino`'s `BaseStats` and `AddedStats` are each **eight**
values, against these **twelve** stats. The arkutils UI offers seven (Health, Stamina, Oxygen,
Food, Weight, Melee, Speed), so the eighth slot is unaccounted for and the order is unproven.

Two tests settle it, one per grammar:

**Pairs grammar** (already half proven):

```
cheat SpawnSetupDino "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" "" 0 150 "0,20" 500 0 0
```

If the dodo's health jumps well above the other 150 spawns, index 0 is Health and the list above
is correct.

**Eight-value grammar:**

```
cheat SpawnExactDino "Blueprint'/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP'" "" 0 1 0 "20,0,0,0,0,0,0,0" "0,0,0,0,0,0,0,0" "Test" 0 0 "" "" "" 0 0 "" 0 0 0 20 20
```

If position 0 is Health, this lands 20 health points. If it turns out to be something else, we have
learned which stat sits in slot 0 and can shift accordingly.

### The last unknown: which index is which stat

Both grammars are positional, so the mapping has to be nailed down once, and then it is ours
forever. The cheap way is to ask the generator for an unmistakable build.

1. On arkutils, set **all points into Health** and every other stat to its minimum, with Wild
   allocation. Copy the command it produces.
2. Run it, then look at the resulting dino. Whichever stat is absurdly high is index 0 in that
   grammar, or the first pair in `SpawnSetupDino`'s form.
3. Repeat once with everything in Melee. Two runs give us both ends of the mapping and confirm the
   order is the obvious one.

After that, a kit dino is a fixed eight-value (or pair) allocation, and every claimant gets exactly
the same creature: same level, same points, same stats.

### The kit answer, now settled

A kit dino is: **class path, level, and a stats string**. `SpawnSetupDino` with those three fixed
is exactly KP's requirement that every claimant receive an identical creature. No capture, no
payload, no ARKDinoData. The orb item carries the class, the level and the stats string in item
custom data, and on use calls the same spawn the command does.

### Why the first attempts failed, and the corrected forms (2026-11-13)

Read from the editor log rather than guessed.

**`SpawnSetupDino` needs a full asset path, not a short name.** With `"Dodo_Character_BP_C"` the
log says `Failed to find object 'Blueprint Dodo_Character_BP_C'`. `GMSummon` accepts short names
because it resolves them its own way; this command does not.

**The stats string grammar is index,value pairs.** With `"1,1,1,1,1,1,1"` the log printed
`LogShooter: Warning: Trying stat: [1] = [1]` three times, so it consumed pairs and ignored the
leftover seventh number. That means the form is `<statIndex>,<multiplier>,<statIndex>,<multiplier>`
and so on, for example `"0,2,8,2"` for health x2 and melee x2.

**`SpawnExactDino` complains in property names**, `Bad or missing property 'BaseLevel'`, so its
parameters are expected as named arguments rather than positionally.

Corrected forms to try:

```
cheat SpawnSetupDino "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" None 0 150 "" 500 0 0
```

```
cheat SpawnSetupDino "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" None 0 150 "0,2,8,2" 500 0 0
```

```
cheat SpawnExactDino DinoBlueprintPath="/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP" SaddleBlueprintPath=None SaddleQuality=0 BaseLevel=150 ExtraLevels=0 BaseStats="" AddedStats="" SpawnDistance=500 YOffset=0 ZOffset=0
```

Compare the stat results between the empty-string and `"0,2,8,2"` spawns. Read stats with
`absolute_base_level` and the stat properties, never `get_level`.

### Still unknown: the stats string format

`DinoStats`, `BaseStats` and `AddedStats` are `FString`s and their grammar is not printed. To be
determined empirically, cheapest first:

1. `cheat SpawnSetupDino "Dodo_Character_BP_C" "" 0 150 "" 500 0 0` with an empty stats string.
   If it spawns, the string is optional and defaults are fine.
2. `cheat SpawnSetupDino "Dodo_Character_BP_C" "" 0 150 "1,1,1,1,1,1,1" 500 0 0` and compare
   stats against the empty-string dodo.
3. If the list is rejected, try semicolons, and try absolute values against multipliers.

Compare using `absolute_base_level` and the stat properties, not `get_level`, which returns the
Actor's world level and misled us once already.

### Three tests that settle the no-capture path

All in Blueprint, server side, on a throwaway map.

1. **Can a spawned dino be levelled before taming?** Spawn a Dodo, set its level properties, call
   `tame_dino`, then read the level back. If we can set the level, "a level 150 rex" works with no
   payload. Report which property actually changed the level, since several exist (`base_level` is
   not readable from Python and may not be the right one).
2. **Does `spawn_from_dino_data` accept an empty payload?** Make an `ARKDinoData` with
   `dino_class` set and `dino_data` empty, then call `spawn_from_dino_data`. If it spawns a default
   creature of that class, the orb can skip payloads entirely and the exact-clone mode becomes an
   optional extra.
3. **Does the class survive in item custom data?** Put the dino class into a `CustomItemData` via
   `custom_data_classes`, `set_custom_item_data` on an item, read it back with
   `get_custom_item_data`, and spawn from it. That is the orb's whole mechanism, minus the blob.

### Next test (item 2, reframed for the orb)

In Blueprint, on the server: tame a dodo, `get_dino_data` it, write `dino_class` plus `dino_data`
into a `CustomItemData`, `set_custom_item_data` on an item, read it back with
`get_custom_item_data`, rebuild an `ARKDinoData` from it, then `spawn_from_dino_data` twice with
`generate_new_dino_id` true. Confirm both spawns are tame, on the right team, distinct dinos, and
match the original's stats and colours.

### Reference state, measured 2026-11-13 from a console `cheat ForceTame`

Read back from the PIE world after KP tamed the spawned Dodo with the vanilla console command.
This is the target our own call has to reproduce:

| field | value |
|---|---|
| `bp_is_tamed` | **True** |
| `targeting_team` | 161006563 |
| `taming_team_id` | 161006563 |
| player `targeting_team` | 161006563 |
| `imprinter_name` | empty string, expected for an adult |
| `dino_id1` / `dino_id2` | 139938077 / 42225625 |
| `get_owner` | its own AI controller, normal for a dino |

**The assertion is simple: after our call, `taming_team_id` must equal the player's
`targeting_team`, and `bp_is_tamed` must be true.**

Note the player's team is **161006563**, not 0. So in the harness either pass
`override_taming_team_id` = the player's `targeting_team`, or pass 0 and check whether it means
"use the tamer's team". If the dino ends up on team 0, that answers it.

Read-only checks from Python are safe and were used to gather the table above. Do not call
`tame_dino` from Python.

### First harness run, 2026-11-13: three graph bugs, API is fine

Result: two wild dodos, both `targeting_team 1`, `taming_team_id 0`, while the player was team
161006563. An earlier run of the same graph printed `Server: Targeting Team: 161,006,563`,
`Is Tamed: true`, so **`tame_dino` works**. The failures were the graph.

1. **`BeginPlay` runs in both worlds.** The chain executed on server and client, summoning two
   dodos and printing twice (the paired Client/Server lines on screen). Gate everything behind
   `Switch Has Authority` and use the Authority pin only.
2. **`Specific Player` was unconnected on `Execute Console Command`.** A `cheat` command with no
   player context runs as the server, so the spawned dino lands on wild team 1.
3. **`Get(0)` is ambiguous with more than one dino.** Clear the field first: `Get All Actors of
   Class` -> `For Each Loop` -> `Destroy Actor`, then summon, then index 0 is the only dino.

Revised order: `BeginPlay` -> `Switch Has Authority` (Authority) -> clear all
`PrimalDinoCharacter` -> `Delay` 0.5 -> `Execute Console Command` with `Specific Player` =
player controller 0 -> `Delay` 1.5 -> `Get All Actors of Class` -> `Get` 0 -> `Tame Dino`
(`for_pc` = player controller 0, `override_taming_team_id` = 0, `prevent_name_dialog` = true) ->
print `BP Is Tamed` and `Targeting Team` on the server.

## 2. Does `spawn_from_dino_data` reproduce a dino (5 minutes)

Gates: exact-replica kits, and the choice between the two delivery routes.

- Tame a dino in PIE, then call `get_dino_data` on it and keep the `ARKDinoData` in a variable.
- Call `spawn_from_dino_data` twice from that payload, with `for_team` = your tribe,
  `generate_new_dino_id` = true, and a `tamer_controller` of your own.
- Report: are both spawns tame and yours? Are they distinct dinos or duplicates fighting over an
  id? Do their stats and colours match the original?

## 3. Does `ARKDinoData` survive a save (5 minutes)

Gates: kits that persist a payload between sessions.

- Store the payload from item 2 in a variable on the KPTweaks singleton, and save it into
  `KPTweaksSave`.
- Stop PIE, start it again, read it back, and spawn from it.
- Report: does the payload still spawn a valid dino after a restart?

## 4. Behemoth walls: reparent and flags (15 minutes)

Gates: the whole wall fix.

- Pick **one** wall, for example `BP_Wall_Behemoth_Metal`. Change its parent class to
  `Base_Wall_Large_C`, the parent the game's own S+ large wall uses.
- Set `structure_snap_type_flags` to **8** on all four walls (Metal, Stone, Tek, Wood; Wood is
  currently 512).
- Set `extra_structure_snap_type_flags` to **(64, 0, 0)** on all four.
- Report: does it snap to sibling behemoth walls, to vanilla walls, and to itself at corners? Any
  gaps on uneven ground, and are they better or worse than before?

Do not do all four before testing one. Reparenting can reset properties.

## 5. Is the template hammer a blueprint (2 minutes)

Gates: auto-build speed and the interaction fix. If it is native, both are dead.

- Search the content browser for the template hammer item (a Lost Colony item; try "Hammer").
- Report: is it a Blueprint or a native class? If a Blueprint, list any functions or variables
  containing `build`, `tier` or `speed`.

## 6. Alien Plants: grow light snap data and greenhouse coverage (10 minutes)

Gates: the two Alien Plants fixes.

- Open the grow light blueprint. Report its **parent class**, its `snap_points` count, and its
  `structure_snap_type_flags`, so we can compare against a vanilla piece family the way we did
  for the walls.
- Open the crop plot blueprint. Search its properties and functions for `greenhouse`. Report how
  coverage is decided, and whether anything suggests it can be granted from a nearby actor
  rather than requiring an enclosing structure.

## 7. Optional, low cost, useful later

- **Emote list**: open `/Game/PrimalEarth/UI/EmoteRadialSelectorBP` and report what feeds
  `add_unlockable_emotes`, and whether the list is per character.
- **Item overrides**: spawn any item in PIE, set `max_item_quantity` on that **instance**, and
  report whether it stacks beyond the default. That decides whether the customiser can act on
  instances or must reach the class default.

## What not to do

Nothing here needs the live cluster, and nothing needs a cooked build. Cooked behaviour comes
after these, once a feature is worth shipping.
