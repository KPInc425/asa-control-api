# Test 4: save slot plus the real spawn hook

Supersedes Test 3. `SaveGameActor` does not serialise its variables, so nothing we put on it
survives a restart. And a placed actor only fires once at level load, which is not how
KPTweaks works: your singleton binds **On Shooter Character Spawned** and does its work
there.

This follows the Alien Plants pattern, which is the one already proven in your own mod.

## The pattern, as read from AlienPlants

`/AlienPlants/AlienPlantsSave` is a **SaveGame** child holding one struct variable per
settings group, with `f_CreateNew*` / `f_Get*` / `F Change*` helpers on the class itself.

Loading is a function that does:

```
Does Save Game Exist (slot "AlienPlants", user index 0)
  true  -> Load Game from Slot -> Cast to AlienPlantsSave -> return it
  false -> Create Save Game Object (AlienPlantsSave) -> seed defaults -> Save Game to Slot -> return it
```

Saving is the same object back through `Save Game to Slot` after the change functions run.
No SaveGameActor involvement anywhere.

## Part 1: the save class

1. Content Browser, right click, Blueprint Class, search `SaveGame`, choose it as the parent.
   Name it `KPTweaksSave`. Put it beside KPTweaks content, not in `_KPTTest`.
2. Add one variable: `GrantedKits`, type **String**, **Array** ticked.
3. In its **Details > Advanced**, tick **SaveGame**. This is not optional and it is the
   single most likely reason a slot appears to save nothing: `Save Game to Slot` serialises
   with `ArIsSaveGame` set, and in that mode only properties carrying the `SaveGame` flag are
   written. An unflagged variable is silently omitted and loads back as its default.
4. Ensure `Transient` is off. `SaveGame` includes the property, `Transient` excludes it from
   everything, so the two flags must not disagree.
5. Nothing else. This class is storage, not logic.

Entries are `<uniqueid>|<kitname>`.

## Part 2: load-or-create, on the singleton

**This function lives on `Actor_BP_KPTweaks`, not on the save class.** A SaveGame blueprint
is a data object with no reference you can fetch at runtime, so a function placed there is
awkward to reach from anywhere else. The singleton is a placed actor you already call into,
and that is where Alien Plants puts `GetAlienPlantSave` too: its save class holds the data
and the per-field helpers, the singleton holds the load.

Add `GetKPTSave` to `Actor_BP_KPTweaks`, a normal function (not static), returning
`KPTweaksSave`:

1. `Does Save Game Exist`, Slot Name `KPTweaks`, User Index 0.
2. **True**: `Load Game from Slot` with the same slot and index, then `Cast To KPTweaksSave`,
   return the cast result.
3. **False**: `Create Save Game Object` (class `KPTweaksSave`), `Save Game to Slot` with it,
   Slot `KPTweaks`, index 0, then return it.

Returning the object either way means callers never care whether it existed.

## Part 3: the two helpers

Both live on `Actor_BP_KPTweaks` as well, for the same reason, and both take the save object,
`UniqueId` (String) and `KitName` (Name).

`HasClaimedKit` returns Bool: `For Each Loop` over `GrantedKits`, build the key
`UniqueId` + `|` + `KitName`, `Equal (String)`, on a match set a local bool and `Break`,
return it.

`ClaimKit`: call `HasClaimedKit`; if false, `Add Unique` the key to `GrantedKits`, then
**`Save Game to Slot` immediately, with the same save object**, same slot, same user index.
Saving inside the claim is deliberate: a claim that only exists in memory is lost on a crash,
and the player gets a second kit.

Call `GetKPTSave` **once per spawn** and pass the object down. Calling it separately inside
`HasClaimedKit` and `ClaimKit` loads two different objects and the claim lands on one that is
never written.

## Part 4: the hook that actually matters

In `Actor_BP_KPTweaks`, on the existing **On Shooter Character Spawned** event, after the
raft buff work:

1. The event gives you the spawned character. Use it directly; do not look anyone up.
2. `Switch Has Authority`, and continue only on the authority pin.
3. `GetKPTSave`.
4. `HasClaimedKit(SaveObject, character -> Linked Player Id String, "StarterKit")`.
5. **NOT** into **Branch**. True branch:
   - `Give Item To Character` (character, kit item class, quantity).
   - `ClaimKit` with the same values.
6. Print a line on each path while testing, so you can see which happened.

This fires on every player spawn, which is what you said KPTweaks already does, and it
survives a restart because the claim is in a slot.

## Part 5: the four checks, again

1. Spawn once, kit arrives.
2. Respawn, no kit.
3. Full relog, no kit.
4. **Editor restart**, re-enter, no kit.

Check 4 is still the only one that proves persistence. With an explicit slot it should now
pass; if it does not, look for a missing `Save Game to Slot` rather than blaming the engine.

## What to report back

Which of the four passed, and whether `GetKPTSave` returned an object on the second run. A
null return means the save was never written, which points at the claim path, not the load.

## What this replaces

Test 3 and the marker buff are both retired. One buff class per kit was never the plan, and
a tag on a buff cannot survive a save. Keep the buff if you like it as a visual or a
ticking helper, but it is not the marker.
