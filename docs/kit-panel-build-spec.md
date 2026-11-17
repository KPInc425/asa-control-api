# KPTweaks kit panel: build spec

Written 2026-11-16 against the live devkit. Everything below names assets that exist right now.

## What exists

| Asset | Path | State |
| --- | --- | --- |
| Save | `/KPTweaks/KPTweaksSave` | `GrantedKits` (String array, SaveGame flagged), `Kits` (Array of `S_KitDefinition`, SaveGame flagged) |
| Singleton | `/KPTweaks/Actor_BP_KPTweaks` | `GetKPTSave`, `HasClaimedKit`, `ClaimKit`, `GrantKit`, spawn hook `OnShooterCharacterSpawned` |
| Structs | `/KPTweaks/Kits/S_KitItem`, `S_KitCreature`, `S_KitDefinition` | done |
| Enum | `/KPTweaks/Kits/E_KitTrigger` | done |
| Buff | `/KPTweaks/Kits/PrimalBuff_KPT_KitPanel` | `Event BeginPlay`, `F8`, `Gamepad Special Left`, `Tick`, `f_TogglePanel` |
| Widget | `/KPTweaks/Kits/W_KitPanel` | blank `UserWidget`: no variables, no functions, no components |

Verified: `TogglePanel` reads `Is Valid (Player Controller)` → `Is Valid (Ref Kit Panel Widget)` → valid goes
to `Remove From Viewport`, not valid goes to `Create Widget` → set ref → `Add to Viewport`.

## The one rule that decides everything

**The save lives on the server. The widget lives on the client. They never touch each other.**

A widget runs on the owning client. `GetKPTSave` and `Save Game to Slot` are server work. If the panel
calls them directly, it reads a stale local object and writes nothing, and the failure is silent.

So the data flow is a loop through the buff, and the buff is both server and client at once because it
is replicated:

```
widget (client)  --SERV_ event-->  buff (server)  --reads/writes-->  KPTweaksSave
widget (client)  <--CLIENT_ event--  buff (server)
```

## The contract

### On `PrimalBuff_KPT_KitPanel`

| Member | Kind | Replication | Job |
| --- | --- | --- | --- |
| `TogglePanel(For PC)` | function, client | local | open/close the widget, ask for data |
| `SERV_RequestKitList()` | custom event | **Run on Server** | read save, reply with the list |
| `CLIENT_ReceivedKits(Kits)` | custom event | **Run on owning Client** | forward to the widget |
| `SERV_AddKit(Kit)` | custom event | Run on Server | append, save, reply with the list |
| `SERV_UpdateKit(Index, Kit)` | custom event | Run on Server | replace, save, reply |
| `SERV_RemoveKit(Index)` | custom event | Run on Server | remove, save, reply |
| `Ref Kit Panel Widget` | variable | not replicated | the open widget, null when closed |

Replication flags are set on the event node itself: select the custom event, Details, Replication →
Run on Server / Run on owning Client. A custom event without a flag runs locally on whoever fired it,
which is the single most common reason this architecture appears broken.

### How the buff reaches the save

The save helpers live on `Actor_BP_KPTweaks`, not on the buff, and the singleton has **`bReplicates` =
False** while the buff has **`bReplicates` = True**. That is why the network events belong on the buff:
the singleton cannot answer a client, only the buff can.

So the buff carries a reference to the singleton. Add **`Ref_Singleton`** (object reference, class
`Actor_BP_KPTweaks`) and set it once, behind authority, in `Event BeginPlay`:

```
BeginPlay → Switch Has Authority (Authority)
  → Get All Actors of Class (Actor_BP_KPTweaks) → Get (0) → Set Ref_Singleton
```

Once per buff, never per call: `Get All Actors of Class` walks the level. Then `SERV_RequestKitList` is:

```
SERV_RequestKitList (Run on Server)
  → Is Valid (Ref_Singleton)
  → Ref_Singleton → GetKPTSave → get Kits
  → CLIENT_ReceivedKits(Kits)
```

`GetKPTSave` is called on `Ref_Singleton`, not on self. When the write path grows, the tidier shape is
wrapper functions on the singleton (`Kits_Get`, `Kits_Add`, `Kits_Update`, `Kits_Save`) that the buff
calls; the reference and the network events stay exactly as above.

### On `W_KitPanel`

| Member | Kind | Job |
| --- | --- | --- |
| `Ref_Buff` | object variable, **Expose on Spawn** | the buff that created it |
| `KitRows` | `Array of S_KitDefinition` | local copy for display |
| `Populate(Kits)` | function | clear the list box, rebuild one row per kit |
| `OnClose` | button handler | `Ref_Buff.TogglePanel(Owning Player)` |

`Ref_Buff` must be ticked **Expose on Spawn**, which is what puts the pin on the Create Widget node. That
is exactly how the raft panel does it with `Ref_Buff` and `S_RaftOptions`.

## Wiring, node by node

### 1. Open and close

`TogglePanel(For PC)`, on the buff:

1. `Is Valid (For PC)`, guard
2. `Is Valid (Ref Kit Panel Widget)`
3. **Valid** → `Remove From Viewport` → **`Set Ref Kit Panel Widget` = empty**
4. **Not valid** → `Create Widget` (Class `W_KitPanel`, Owning Player `For PC`, `Ref_Buff` = self) → `Set Ref Kit Panel Widget` → `Add to Viewport` → `SERV_RequestKitList`

Step 3's `Set` to empty is not optional. `Remove From Viewport` hides the widget but leaves the object
valid, so without it the next press takes the "valid" branch again and the panel never reopens.

### 2. Read path

`SERV_RequestKitList` (server):

1. `GetKPTSave` → save
2. read `Kits`
3. `CLIENT_ReceivedKits(Kits)` with that array

`CLIENT_ReceivedKits(Kits)` (owning client):

1. `Is Valid (Ref Kit Panel Widget)`
2. call `Populate(Kits)` on it

`Populate(Kits)` (widget):

1. `Clear Children` on the vertical box
2. `For Each Loop` over `Kits`
3. `Create Widget` a row, or for v1 simply `Add Child` a Text block: `kit_name`, then `len(items)`,
   `len(creatures)`, and `enabled`

### 3. Write path (v1.1)

Every mutation is the same three steps: **server event → mutate the save → save → reply with the list**.
The widget never assumes its edit succeeded; it waits for `CLIENT_ReceivedKits` and repaints from that.
Optimistic local edits are how a panel ends up showing a kit that was never written.

`SERV_AddKit(Kit)`:

1. `GetKPTSave` → save
2. `Add` to `Kits`
3. `Save Game to Slot` on that same object, slot `KPTweaks`, index 0
4. `CLIENT_ReceivedKits(Kits)`

### 4. Getting the buff onto the player

In the existing spawn hook, after `GetKPTSave`:

1. compare `Shooter Char Ref` → `Linked Player IDString` against `AdminPlayerIds` on the save
2. on a match, `StaticAddBuff` with class `PrimalBuff_KPT_KitPanel` on the character

`AdminPlayerIds` is a new String array on `KPTweaksSave`, SaveGame flagged, containing your player id.
Copy the `SERV_AddBuff` / `MULTI_AddBuff` pattern already in the actor for the raft buff.

For v1 the server events trust the caller, since the buff is only applied to admins. That is a real
weakness and it is acceptable only while the gate is a saved id list you control. Write it in a comment
on the event so a later session does not quietly hand the buff to everyone.

## Build order

Each step is independently testable. Do not start the next one until the acceptance passes.

**Step 1: buff applies and the empty panel toggles.** Acceptance: in PIE, press F8, an empty panel
appears; press F8 again, it goes; press `Gamepad Special Left` with a controller, same. Then respawn and
confirm F8 still works, which proves the buff is applied by the spawn event and not once at level load.

**Step 2: read path.** Acceptance: panel shows one row reading `test`, 2 items, 1 creature, 1 enabled.

**Step 3: close button.** Acceptance: the button closes the panel and F8 reopens it, and the log shows no
`Accessed None`.

**Step 4: write path, one field.** Rename the kit from the panel. Acceptance: rename to `starter`,
restart PIE, name still `starter`, and a **new** character receives the renamed kit. That last one proves
the panel wrote the save rather than a local copy.

**Step 5: item picker**, its own session. Iterate `PrimalGameData.master_item_list`, filter by display
name, and add the chosen class as an `S_KitItem`.

## Audit of the buff as built, 2026-11-17

Pulled from the live graph: 21 nodes, 18 connections. Structure correct, five gaps.

1. **No `EnableInput`.** `BeginPlay` goes straight into `Switch Has Authority`, so the `F8` and
   `Gamepad Special Left` nodes can never fire. Chain must be
   `BeginPlay -> EnableInput (Player Controller = Get OwnerController) -> Switch Has Authority`.
2. **`GetAllActorsOfClass` has an empty `Actor Class` pin.** It returns an empty array, `RefSingleton`
   stays null, and the request stops at `Is Valid` with no error.
3. **The chain stops at the third `Is Valid`.** Its `Is Valid` output goes nowhere, so the widget is
   never told anything. It must call `Populate(Kits)` on `RefKitPanelWidget`, fed by the `Kits` pin on
   the `RecievedKits` event.
4. **Replication flags unverified.** `Server_RequestKitList` must be Run on Server and `RecievedKits`
   Run on owning Client, set on the event nodes in Details. Unflagged events run locally.
5. **`TogglePanel` removes the widget but does not null the reference**, so the panel opens once.

`W_KitPanel` is still a blank `UserWidget`: no variables, no functions, no components. It needs
`Ref_Buff` (Expose on Spawn), a Scroll Box containing `VB_Kits`, a close button, and `Populate`.

Test in two passes: an empty panel that opens and closes on both inputs first, then a row reading
`test`. A key press that does nothing is `EnableInput`; a panel that opens empty is the class pin, a
replication flag, or the missing `Populate` call, in that order.

## Traps, all of them already paid for

- `Is Valid` is not "is open". Null the reference when removing.
- A custom event without a replication flag runs locally and looks like a server call.
- `GetKPTSave` twice returns two objects; mutate and save the same one.
- `Save Game to Slot` slot name and user index must match the ones the claim path reads: `KPTweaks`, 0.
- Struct members have no default value, so a newly added kit arrives as zeros and null references.
  Defaults belong in the add logic and again in `GrantKit`.
- Widget `Construct` must survive `Ref_Buff` being null, which is what happens in the designer preview.
- Any UI opened from an item runs server-side and needs an RPC; the buff route exists so you do not have
  to build one.
- `Create Widget` needs `Owning Player` set, or input mode and focus behave strangely.
