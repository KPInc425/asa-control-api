# Kit panel redesign: PrimalUI, ARK assets, row widgets

Written 2026-11-17. Replaces the single-text-block prototype with a proper panel modelled on
`W_RaftOptions` and Alien Plants.

## What the first pass proved, and what to keep

Working: buff toggling, replicated read, replicated write, mouse and gamepad input, persistence across
a restart. Keep all of it.

Replace: one text block listing everything. It cannot hold a per-kit field or button, so the list
becomes rows.

Two hard requirements discovered the hard way: the widget is parented to **`PrimalUI`**, not
`UserWidget`, or clicks never arrive; and the Construct/Destruct input-mode pair from `W_RaftOptions` is
what frees the mouse.

## ARK assets to reuse

These are the ones `W_RaftOptions` already references, which is why it looks like it belongs in the game:

All four were verified to exist with `does_asset_exist`, and their classes matter more than their names:

| Asset | Class | How to place it |
| --- | --- | --- |
| `/Game/PrimalEarth/UI/UI_Final_Assets/main_card_frame` | **Texture2D** | add an **Image** widget, Brush → Texture, Draw As = **Box**, Margin ~0.15 for 9-slice. It is not in the widget palette because it is not a widget. |
| `/Game/PrimalEarth/UI/UI_Final_Assets/main_card_glow_outline` | **Texture2D** | second Image on top, subtle tint |
| `/Game/PrimalEarth/UI/UI_Final_Assets/general_popup_frame` | **Texture2D** | same trick, better fit for a popup panel |
| `/Game/ASA/UI/Widgets/ASAUIWidget_Button_Style5` | **WidgetBlueprint** | add a **User Widget** to the hierarchy and set its Widget Class to this |
| `/Game/PrimalEarth/UI/Fonts/GoBoldRegular30` | **Font** | assign on the Text block's Font property |

`ASAUIWidget_Button_Style5` also exposes a **`Set Button Label`** function, so one placed button can carry
a driven label instead of needing a widget per label.

## What the community archive says about ARK UI

From the ARK Modding Discord via Overseer, 2026-11-17:

- **"All base widgets need `PrimalUI`"**, and a widget without it can crash the devkit. This matches the
  measured finding that clicks never arrive on a plain `UserWidget`; treat `PrimalUI` as mandatory rather
  than stylistic.
- **The root element carries a `Capture Mouse Input` property in Details**, next to
  `Set Ignore Move And Look`. That is the property-level route to taking the mouse, and it is the second
  lever if the Construct/Destruct input-mode chain misbehaves.
- Common structures for a custom UI in ASA: a fully custom panel, a panel merged into the vanilla UI, or
  multi-use entries used as buttons the way the industrial grinder does. A separate buff-held panel is the
  right one here because it is admin-only and should not be reachable by a survival player.

## Layout

```
+------------------------------------------------------------------+
|  main_card_frame (9-slice, fills the panel)                      |
|  +------------------------------------------------------------+  |
|  |  KITS          (GoBoldRegular30)                           |  |
|  |  --------------------------------------------------------  |  |
|  |  +------------------------------------------------------+  |  |
|  |  | ScrollBox  SB_KitList                                 |  |  |
|  |  |  +--------------------------------------------------+ |  |  |
|  |  |  | VerticalBox  VB_Rows                             | |  |  |
|  |  |  |   [ row ] [ row ] [ row ] ...                     | |  |  |
|  |  |  +--------------------------------------------------+ |  |  |
|  |  +------------------------------------------------------+  |  |
|  |                                        [ Add Kit ] [Close ] |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

Panel size around 720x560, centred. Buttons bottom right, one row, equal height.

### Container hierarchy, and why each layer exists

```
Canvas Panel                        root; child anchored 0.5/0.5, alignment 0.5/0.5
└─ SizeBox  SB_PanelSize           Width 720, Height 560
   └─ Overlay  OV_Frame
      ├─ Image  IMG_Frame          main_card_frame, Draw As = Box, Margin 0.15, fill
      ├─ Image  IMG_Glow           main_card_glow_outline, optional tint
      └─ VerticalBox  VB_Content   Padding 24
         ├─ Text  TXT_Title        "KITS", font GoBoldRegular30
         ├─ ScrollBox  SB_KitList  Fill, Height ~380
         │  └─ VerticalBox VB_Rows
         └─ HorizontalBox HB_Footer  Justification = End
            ├─ User Widget  UW_Add    class ASAUIWidget_Button_Style5
            └─ User Widget  UW_Close  class ASAUIWidget_Button_Style5
```

- **Canvas Panel** positions by anchor rather than pixels, so the panel stays centred across resolutions
  and UI scales. Use it as the root, not as a layout container.
- **SizeBox** pins the panel to one size so the 9-slice frame keeps its proportions.
- **Overlay** stacks the frame, the accent and the content in the same rect without nesting boxes.
- **ScrollBox needs a bounded height.** Inside an Auto-sized VerticalBox it grows to fit its content and
  then never scrolls, because it always believes everything is visible. Give it Fill under a constrained
  parent, or wrap it in its own SizeBox.
- One SizeBox per panel; nesting two makes them fight and shows up as a panel that will not resize.
- Optional full-screen dim: a Border or Image at roughly 40% black as the Canvas's first child, with the
  SizeBox above it.

## Row widget: `W_KitRow`

Parent `PrimalUI`. Height about 48.

```
[ ED_Name (Editable Text, 260) ] [ CHK_Enabled ] [ TXT_Counts ] [ BTN_Edit ] [ BTN_Delete ]
```

**Expose on Spawn** variables, so the panel can create a fully formed row in one node:

- `Ref_Buff` (PrimalBuff_KPT_KitPanel)
- `Kit_Index` (int)
- `Kit_Name` (string)
- `Kit_Enabled` (bool)
- `Item_Count` (int)
- `Creature_Count` (int)

**Functions and handlers:**

| Handler | Calls |
| --- | --- |
| `ED_Name` OnTextCommitted | `Ref_Buff` → `SERV_RenameKit(Kit_Index, NewText)` |
| `CHK_Enabled` OnCheckStateChanged | `Ref_Buff` → `SERV_SetEnabled(Kit_Index, bChecked)` |
| `BTN_Delete` OnClicked | `Ref_Buff` → `SERV_DeleteKit(Kit_Index)` |
| `BTN_Edit` OnClicked | the panel's editor view, later |

Rows do not own data. They display what the panel hands them and report what the player did. After any
mutation the panel rebuilds every row from the server's reply, which keeps one source of truth.

## Server events on the buff

All **Run on Server**, each one: guard index, mutate, save, re-read, reply.

| Event | Signature |
| --- | --- |
| `SERV_AddKit` | (exists) |
| `SERV_RenameKit` | `(Kit_Index: int, New_Name: string)` |
| `SERV_SetEnabled` | `(Kit_Index: int, Enabled: bool)` |
| `SERV_DeleteKit` | `(Kit_Index: int)` |

```
SERV_X -> Is Valid (Ref_Singleton) -> Ref_Singleton.GetKPTSave
  -> get Kits -> mutate (Add / Set / Remove Index)
  -> Set Kits back on the save
  -> Save Game to Slot (same object, "KPTweaks", 0)
  -> get Kits again -> CLIENT ReceivedKits(Kits)
```

Re-reading after the save is what makes the client render what was written. Skipping it is why the first
prototype added a kit and drew no line.

**Index safety:** an index is only valid for the list the client was looking at. With one admin that is
fine. If two admins ever edit at once, match on `kit_name` instead of position, or send the old name
alongside the index and reject a mismatch.

## Build order

**1. Reparent and re-verify.** Set `W_KitPanel` parent to `PrimalUI`, keep the existing content and
logic, confirm it still opens and the buttons still work. Cheap, and it isolates the parent change from
everything else.

**2. Card and chrome.** Add `main_card_frame`, the title, `SB_KitList`, `VB_Rows`, and the two footer
buttons. No logic. The panel should open looking right with an empty list.

**3. `W_KitRow`.** Build it standalone with the five display fields and `Ref_Buff` exposed. Place one
hardcoded row in `VB_Rows` in the designer to see it.

**4. Rewire `Populate`.** `Clear Children` on `VB_Rows`, then for each kit `Create Widget` (`W_KitRow`,
all expose pins filled) and `Add Child`. Delete `TXT_Kits` and the string building entirely; leaving both
means two displays and one of them stale.

**5. Server events.** Add the three new ones, wire the row handlers, and re-check that every one is Run
on Server and that `ReceivedKits` is still Run on owning Client.

## Acceptance

For each of these, the change must survive a PIE restart, which is what proves it reached the save and
not just a screen:

1. Add a kit, it appears without reopening the panel
2. Rename it, the row updates, and the new name is there after restart
3. Toggle enabled, the checkbox matches after restart, and a disabled NewCharacter kit is not granted
4. Delete it, the row disappears and does not return
5. Open with a gamepad, drive the cursor with the left stick, rename a kit with the on-screen keyboard

Item five is the one that catches input-mode regressions, and it is the one nobody tests.

## Not in this pass

The item and creature editor. That is its own widget pushed over the list, with `PrimalGameData.master_item_list`
behind a search box. Building it now would double the surface area of a pass whose real job is proving
rows, events and repaint.
