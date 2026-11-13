# Editor checklist: things only KP can do

Ordered by what unblocks the most work. Each item says what to do and what to report back.
Items 1 to 3 are PIE tests on a throwaway map; nothing touches the live cluster.

## 1. Does `tame_dino` work on a spawned dino (2 minutes)

Gates: kit dinos.

- Open a throwaway map in PIE. Start PIE with **Play Persistent Player** ticked if you want the
  save step in item 3 to work.
- Spawn a cheap dino, for example a Dodo, with `Spawn Actor from Class`.
- Call `tame_dino` on it with:
  - `for_pc` = your player controller
  - `override_taming_team_id` = your tribe id
  - `prevent_name_dialog` = true
- Report: does it come out tame, owned by you, on the right team, with no name dialog? Any error
  in the log?

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
