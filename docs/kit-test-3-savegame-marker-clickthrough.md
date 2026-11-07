# Test 3: the claimed marker in the save game

Tags on a buff work inside a session and vanish on reload, because ARK serialises a buff's
class but not the instance properties you set on it. Proven on 2026-11-07: `Has Buff With
Custom Tag` true immediately after the set, false again after a reload.

So the marker moves to `Actor_BP_KPTweaks`, which inherits the native `SaveGameActor`. Its
variables are saved with the world, and an array of strings can name any number of kits
without a blueprint class per kit.

## Part 1: the storage

On `Actor_BP_KPTweaks`:

1. Add a variable `GrantedKits`, type **String**, tick the **Array** checkbox.
2. In its details, **`Transient` must be OFF**. A transient variable is deliberately not
   serialised and would look exactly like the bug we just left behind.
3. Leave the default empty.

One string per claimed kit, in the form `<uniqueid>|<kitname>`.

## Part 2: two small functions on the same actor

**`HasClaimedKit`** (returns Bool), inputs `UniqueId` (String), `KitName` (Name):

1. `For Each Loop` over `GrantedKits`.
2. Build the key: `UniqueId` + `|` + `KitName`. Use `Append` twice or a single `Format Text`.
3. `Equal (String)` against the loop element.
4. Branch on the result, and on a match set a local `Found` bool true and use **Break**.
5. Return `Found`.

**`ClaimKit`**, inputs the same two:

1. `HasClaimedKit`, and if false, `Add Unique` to `GrantedKits` with the same key.

Keeping both in functions means the grant graph stays short and the key format lives in one
place. If the format ever changes, it changes in two functions rather than everywhere.

## Part 3: wire the grant to it

In the test actor, replacing the buff check:

1. **Get All Actors Of Class**, class `Actor_BP_KPTweaks`, then `Get (0)`. If the singleton is
   not spawned in this level, this returns nothing and you will see it immediately.
2. On the character, get **Linked Player Id String**. That is the stable unique id; do not
   use the player index, which is whoever connected first.
3. Call `HasClaimedKit(LinkedPlayerId, "StarterKit")`.
4. **NOT** into the **Branch** condition, exactly as the buff check was.
5. True branch: `Give Item To Character`, then `ClaimKit` with the same two values.

Order stays: check, grant, claim. Never claim first.

## Part 4: the same four checks

1. Spawn once, kit arrives.
2. Respawn, no kit.
3. Full relog, no kit.
4. **Restart the editor**, re-enter, no kit.

The fourth is still the only one that proves anything, and it is the one that just failed
for the buff.

If check 4 fails here too, then `SaveGameActor` does not serialise variables the way its
name suggests, and the next move is an explicit `SaveGameToSlot` in a slot we name, which is
more code but entirely under our control.

## Why this is the right home, not a workaround

Kit names become data when the JSON loader lands. An array of strings accepts any name the
config produces, with no devkit edit per kit. A buff class per kit would need a new class
every time someone adds a kit on the dashboard, which defeats the point of the dashboard.

## Reporting back

Tell me which of the four passed, and whether `Get All Actors Of Class` found the singleton.
If it did not, the test actor and the singleton are in different levels and we need the
singleton spawned in the test map.
