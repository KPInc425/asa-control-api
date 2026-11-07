# Test 1: prove the item grant, click by click

The one thing everything else depends on. Do not build the kit manager, the structs or
the UI until this passes.

The question this answers: does adding an item through the inventory API work, on this
build, from a mod blueprint? Console commands already failed us; this is the replacement.

## Where to work

A throwaway folder, never shipped content: `/Game/_KPTTest/`. If this goes wrong it must
be deletable without touching KPTweaks.

## Build the test actor

1. Content Browser, right click, Blueprint Class, **Actor**. Name it `BP_KPT_GrantTest`.
   Path `/Game/_KPTTest/`.
2. Open it. In the Components panel it has a DefaultSceneRoot. Leave it alone.
3. In **Class Defaults** or the Details panel, add a variable:
   - Name `ItemToGrant`
   - Type: **Class**, then pick **PrimalItem** as the parent filter, so the pin accepts an
     item class rather than an arbitrary object.
   - Instance Editable: on
   - Expose on Spawn: off
4. Set its default in the Details panel to **PrimalItem_WeaponMetalPick**. If the class
   picker will not offer it, that is itself a finding, note it and stop.

## The grant logic, in the EventGraph

You want roughly this chain on `Event BeginPlay`:

1. **Get Player Character** (Player Index 0), then wire its blue `Return Value` into the
   **Object** pin of `Cast To ShooterCharacter`. This wiring is easy to miss: the cast
   node sits with an empty Object pin and silently never succeeds.
   On a failed cast, print a string saying no character and stop. Never continue past a
   failed cast.
   Server-side alternative, and the one the real executor uses: `Get Game Mode` ->
   `Get Player Controller` (0) -> `Get Controlled Pawn`, into the same Object pin.
2. From the character, **Get My Inventory Component** (this is the name that already
   exists on the item and character classes; if the node is not offered, use
   `Get Inventory Component` on the character).
3. **Construct Object from Class** (Kismet System Library). This is the UE5 name; older
   tutorials call it Spawn Object from Class, which is why it cannot be found by that
   search term.
   - Class: the `ItemToGrant` variable
   - Outer: leave the default
   - The palette hides it unless **Context Sensitive is unticked**, because it filters to
     nodes compatible with the pin you dragged from.
4. **Add Item Object** on the inventory component output from step 2, with the spawned
   object as the item, quantity 1.
5. **Print String** with the result, so PIE tells you it ran.

If `Add Item Object` is not in the list, the fallback is the inventory component's add
function that takes a class directly rather than an instance. Try that before trying
anything cleverer.

## Wiring it into a test

You cannot spawn an actor and have it run against a player in a normal map without help.
Simplest reliable route:

1. Open `TestMapArea_KPTweaks` or any single player test map in the devkit.
2. Drag `BP_KPT_GrantTest` into the level.
3. Play In Editor.
4. Walk to the actor if needed, or set BeginPlay to run on the placed actor, which it does.

## What to report back

Three possible outcomes, and each tells us something different:

- **Pick appears in inventory.** The grant works. We build the manager next.
- **Node runs, print fires, no item.** The call reached the inventory and was refused.
  Tell me the exact node names you used and I will check the signature against the dump.
- **A node is missing from the list.** Tell me which one. That single fact decides whether
  this design survives or we need a different grant path.

## Do not do yet

- No structs. No save game. No spawn hook. No chat commands.
- Do not touch anything under `/KPTweaks/` until the test passes.
- Do not save over an existing KPTweaks asset under any circumstances.

## If it fails

We stop and I re-plan the grant. That is a real possibility, and finding it here costs one
afternoon rather than a week of building on a false assumption.
