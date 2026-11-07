# Kit executor: node-level build spec

Written against the patterns already proven in KPTweaks, so the devkit work is mechanical.
Everything here is grounded in two things read from the devkit on 2026-11-07: the member
list of `PrimalItem` and `PrimalInventoryComponent`, and the node list of
`KPT_GetNearbyInventories`.

## What to build, in one sentence

A struct describing a kit, a manager that loads them from a file, a spawn hook that
grants one per character, and a save game that remembers who already had it.

## 1. Data

### `S_KPTKitItem` (UserDefinedStruct)

- `ItemClass` (`class`) — the item blueprint to spawn.
- `Quantity` (int, default 1)
- `Quality` (float, default 0)

### `S_KPTKitCreature` (UserDefinedStruct)

- `CreatureClass` (`class`) — for the Trike.
- `SaddleClass` (`class`) — may be null.
- `Level` (int, default 150)

### `S_KPTKit` (UserDefinedStruct)

- `KitName` (Name)
- `Enabled` (bool, default true)
- `Items` (array of `S_KPTKitItem`)
- `Creature` (`S_KPTKitCreature`)
- `Trigger` (enum `E_KPTKitTrigger`: `FirstJoin`, `Cooldown`, `Manual`)
- `CooldownSeconds` (int, default 0)

### Save data, on the existing `Actor_BP_KPTweaks`

Add two arrays. This class already inherits `SaveGameActor`, so it persists without any
new mechanism.

- `GrantedKits` (array of `S_KPTKitGrant`), where `S_KPTKitGrant` is
  `PlayerId` (string, the EOS unique id from `GetUniqueNetId`) plus `KitName` (Name)
  plus `GrantedAtUtc` (DateTime).

Keying on player unique id rather than player index is deliberate: index 0 is whoever is
connected first, so an index key hands a kit to the wrong person the moment someone
disconnects.

## 2. Loading the kit definitions

The API writes `kits.json` into a directory on the game box. The mod reads it, so kits are
edited from the dashboard rather than in the editor.

- Read the file with `LoadStringFromFile` (Blueprint can, and the path comes from a config
  value so it is not hardcoded).
- Parse with `ParseIntoJsonObject` / `GetArrayField`, then map into `S_KPTKit`.
- On a parse failure: log the line number, keep the previous in-memory kit list, and do
  not clear it. A bad file must never leave the server with no kits.

## 3. The spawn hook

Hook the character spawn, not the player login: inventory does not exist at login time.

- On `ShooterCharacter` `BeginPlay` (or the game mode's post-login), get the player
  controller, then `GetUniqueNetIdString`.
- For each enabled kit whose trigger matches, check `GrantedKits` for that player and kit.
- If absent: grant, then append to `GrantedKits` and save.

## 4. The grant itself

For each `S_KPTKitItem`:

1. `LoadClass` / `StaticClass` on `ItemClass`.
2. `SpawnObjectFromClass` or the item's own `AddItemObject` path.
3. Add with `AddItemObject` or `AddItemObjectEx` on the target `PrimalInventoryComponent`
   (`GetMyInventoryComponent` on the character).
4. Set `ItemQuantity` and, where quality matters, the item quality property before adding.

`AddItemObject` and `AddItemObjectEx` are the two verified-by-name entry points on
`PrimalInventoryComponent`. If the object-spawn route fights us, fall back to the
inventory component's own add function and pass the class rather than an instance.

For the creature: spawn the class at the player's location, set the level, then set the
owner and taming team. Give the saddle the same way items are given.

## 5. The client side

Do not build a panel yet. The first version's "UI" is a chat command:

- Read chat on the server, match `!kit` and return a one line reply.
- Admin form `!kit give <playername> <kitname>` for you and Willow.

This uses the same chat path that already works over RCON, so it needs no replication.

## 6. Testing, and what counts as done

Do these in order and do not skip to the panel:

1. **Grant on a throwaway item first.** A test kit containing one Metal Pick. Spawn into
   PIE, confirm the pick is in inventory. This proves `AddItemObject` before anything
   else is built on top of it.
2. **Second spawn, same character.** No second pick. This proves the save-backed marker.
3. **A fresh character.** Gets the kit. This proves the key is the player, not the index.
4. **Server restart, then spawn.** Still no second kit. This proves persistence.
5. Only then: the full kit contents, then the creature, then chat commands.

## 7. What I need from you after each step

Just the outcome of each test, in one line. If step 1 fails, we stop and fix the grant
before building the manager, because everything downstream assumes it works.

## 8. Open, and deliberately not blocking

- Buff-based per-character state: not needed, the save game covers it.
- The admin panel: phase 3, and it copies the raft widget interfaces.
- Cooldown triggers: schema is there, logic can land later.
