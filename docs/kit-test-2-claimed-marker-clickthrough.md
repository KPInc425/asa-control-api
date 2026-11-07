# Test 2: the claimed marker, click by click

Test 1 proved we can grant an item. This test proves we only grant it once per character.

The question: can a buff act as a permanent per-character marker? The devkit says yes in
principle. `PrimalBuff` exposes `is_buff_persistent`, `persistent_buff_survives_level_up`,
`loaded_from_save_game` and `save_player_data_on_save_world`. This test finds out whether
they mean what they look like.

## Part 0: make PIE persist at all

Without this, the marker test cannot conclude anything, because every PIE run starts from
an empty world.

1. Open the test level (`TestMapArea_KPTweaks` or your own).
2. **Window, World Settings**, and tick **Play Persistent Player**.
3. Launch the editor with `-ForceLoad -ForceSave` on the command line. The Copilot launcher
   already passes both; verify with the `extra args` line or by checking the process
   command line.

Source: Zarthan on the ARK modding Discord, who states both are required. The flags exist
in this build as UTF-16 strings in `ShooterGameEditor-ShooterGame.dll`, alongside
`PlayPersistentPlayer`.

Sanity check before the real test: place a plain actor in the level, play, exit, play again.
If it is still there, persistence is working and the marker test below is meaningful. If it
is gone, world settings did not take and nothing else in this document will prove anything.

## Part 1: the marker buff

1. Content Browser, right click, Blueprint Class, search `PrimalBuff`, choose it as the
   parent. Name it `PrimalBuff_KPT_KitStarter`. Put it in `/Game/_KPTTest/`.
2. Open its **Class Defaults** and set:
   - `Is Buff Persistent` = true. This is the important one.
   - `Persistent Buff Survives Level Up` = true if it exists.
   - `Hide Timer From HUD` = true, so it does not clutter the screen.
3. Do not give it any visual effects. It is a marker, not a gameplay buff.

If `Is Buff Persistent` does not exist in the defaults, stop and tell me. That single fact
decides whether buffs work as a marker or whether we move to the save game.

## Part 2: gate the grant

**This logic belongs in the placed actor (`BP_KPT_GrantTest`), never inside the buff.**
A buff's BeginPlay only fires once something applies the buff, so a graph inside the buff
cannot run the check that decides whether to apply it. It is chicken and egg, and it fails
silently: nothing prints, nothing errors, the nodes simply never execute.

The buff stays empty apart from its persistence flags. It is a marker, not a worker.


You already have the working chain from test 1:

```
Switch Has Authority -> Get Player Controller (0) -> Get Controlled Pawn
  -> Cast To ShooterCharacter -> Give Item To Character -> Print
```

Change it to:

1. After `Cast To ShooterCharacter`, insert **Has Buff**.
   - Target: the `As Shooter Character` pin.
   - Buff Class: `PrimalBuff_KPT_KitStarter`.
2. From `Has Buff`, take the **Boolean** return through a **NOT** node.
3. Wire the NOT into a **Branch**. True goes on to `Give Item To Character`.
4. Immediately after `Give Item To Character`, add **Add Buff**. It is a static node
   (`static_add_buff` on PrimalBuff), so place it from the palette with Context Sensitive
   unticked rather than dragging off the character. Pins:
   - Character: the `As Shooter Character` pin.
   - Buff Class: `PrimalBuff_KPT_KitStarter`.
   - Instigator: the same character. An empty instigator can make the call a silent no-op.
5. Order matters: no marker, then grant, then set the marker. Never set the marker first, or
   a failed grant leaves the player permanently marked as served.

**Do not route this through the singleton.** The singleton exists to maintain standing
state for everyone, such as the raft tweaks. A kit marker has to be written by the same
branch that grants the kit, or the two can diverge: a kit with no marker hands out infinite
kits, a marker with no kit serves nobody. When the executor moves into the singleton, the
grant and the marker move together and stay atomic.

So the logic reads: has the marker, if not, give the kit and set the marker.

## Part 3: the test that matters

Four checks, in this order. Do not skip to the last one.

1. **Spawn once.** Kit arrives. Print should say it granted.
2. **Respawn, same character** (kill yourself in PIE, or exit and re-enter PIE while the
   world save persists). Kit must NOT arrive again. If it does, the buff is not persisting
   and we go to the save game.
3. **Relog** (exit PIE entirely, re-enter). Still no kit.
4. **Restart the editor, re-enter PIE.** Still no kit. This is the one that proves it
   survives a real reload rather than an in-memory session.

Also worth testing, because it decides the long-term design:
5. **Die and respawn.** If ARK clears buffs on death, the marker disappears and the kit
   re-grants. That is not fatal, but it means the save-game array is the correct home for
   this data and the buff is only a shortcut.

## What to report back

- Which of the four checks passed.
- Whether `Is Buff Persistent` was available.
- What death did to the marker.

## Known limitation, before you find it

One buff class per kit. That is fine for the starter kit and it is the simplest thing that
can work. If we end up with ten kits, the alternatives are a single marker buff carrying a
custom tag per kit (`Has Buff With Custom Tag` exists on the character), or the save-game
array. Decide that when there is a second kit, not now.
