# The dino orb, step by step

Version 1: one orb blueprint per dino. Simple, static, shippable. Version 2 replaces the class
variables with custom item data so one orb class serves every dino, driven by the admin panel.

Everything here is proven except the item event itself, which is the point of this exercise.

## 1. Create the item

Content browser, right-click, **Blueprint Class**, search the parent list for
`PrimalItemConsumableGeneric`, create it at:

```
/KPTweaks/Kits/BP_KPT_DinoOrb_Dodo
```

Consumable, not plain `PrimalItem`, because using it must consume it. That is the behaviour you want:
one use, one dino, orb gone.

## 2. Class Defaults

Open **Class Defaults** and set:

- `Item Name` / `Custom Item Name`: "Dodo Orb"
- `Custom Item Description`: something that says what it does
- `Max Item Quantity`: 1, so orbs do not stack
- `Base Item Weight`: 0.1
- `Prevent Upload`: true, or players will carry orbs between clusters
- Icon: `DodoEyeIcon` or any dino face

Do not set a crafting recipe yet. Spawn it with `cheat gfi` for testing.

## 3. Variables

Add three:

| name | type | default |
|---|---|---|
| `DinoClass` | Class, base `PrimalDinoCharacter` | Dodo_Character_BP |
| `DinoLevel` | Integer | 150 |
| `SaddleClass` | Class, base `PrimalItem` | empty, or a saddle for the species |

Make all three **Instance Editable** and **Expose on Spawn** if you later spawn orbs with data, though
for v1 setting the class default is enough.

## 4. The use event

Open the event graph and add `Event BPOnItemConsumed`. It comes with `Inventory` and
`Remaining Quantity` pins.

```
Event BPOnItemConsumed
  -> Switch Has Authority          (Authority pin only; everything below is server side)
  -> Inventory -> Get Owner        (the character or dino that owns the inventory)
  -> Cast to ShooterCharacter
  -> Get Controller -> Cast to ShooterPlayerController

  -> Make Dino Setup
       Dino Type               = DinoClass
       Dino Level              = DinoLevel
       Is Tamed                = checked
       Ignore Max Tame Limit   = checked
       Auto Equip Saddle       = checked if SaddleClass is set
       Saddle Type             = SaddleClass
       Skip Adding Tamed Levels = UNCHECKED   (this is what gives you the full level)

  -> Get Actor Location (from the cast character) -> add 300 on Z
  -> Get Actor Rotation (from the cast character)

  -> Spawn Custom Dino
       Dino Setup              = the setup above
       Owner Player Controller = the controller above
       Spawn Location          = the location pins
       Spawn Rotation          = the rotation pins

  -> Print String "Dino granted: <return value name>"
```

Notes that will save you a run:

- **The authority gate is mandatory.** `BPOnItemConsumed` fires on the client too, and a client
  cannot spawn.
- **No delay is needed.** Unlike the test actor, this runs when a player uses an item, so the
  controller already has a pawn. That was the only reason the test needed two seconds.
- **`Skip Adding Tamed Levels` must stay unchecked**, or the creature arrives below the requested
  level.
- **Location and rotation must be wired**, because both are by-ref pins and literals are rejected.
- **`Owner Player Controller` is mandatory with `Is Tamed`**, or the spawn is refused outright.

## 5. Test it

1. Compile and save.
2. In PIE: `cheat gfi BP_KPT_DinoOrb_Dodo 1 0 0` puts one in your inventory.
3. Use it.

Expect a level 150 dodo, tame, yours, standing next to you, and the orb gone.

If it does not appear, run the same `Select-String` on the log the last failure taught us:

```
Select-String -Path G:\ARKDevkit\Projects\ShooterGame\Saved\Logs\ShooterGame.log `
  -Pattern 'SpawnCustomDino','BPOnItemConsumed','Blueprint Runtime Error' | Select-Object -Last 10
```

The engine names the reason in plain English.

## 6. Then the second orb, to prove it is a pattern

Duplicate for a second species, change `DinoClass` and `DinoLevel`, and confirm it spawns that
species. Two working orbs mean the design is right and the panel is just a way to make these without
duplicating blueprints.

## Version 2, later

One orb class instead of many, reading its target from custom item data:

- On grant, write the spec into the item's `CustomItemData`: the dino class as a class entry, the
  level as a string or a float.
- On use, read it back with `Get Custom Item Data`, resolve, spawn.

That is the shape TC's mod used, and it is what the admin panel will write. Do not build it until two
static orbs work, because it adds parsing for no benefit while the spec is fixed.
