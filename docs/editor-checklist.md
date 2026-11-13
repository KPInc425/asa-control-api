# Editor checklist: things only KP can do

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
