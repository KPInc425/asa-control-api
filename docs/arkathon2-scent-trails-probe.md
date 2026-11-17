# ARKathon 2 idea probe: scent and trails (2026-11-16)

Question: can a mod detect a wounded creature, give it a persistent identity, and show a trail,
without subclassing every species and without admin powers.

Probed live in the devkit via UnrealCopilot MCP `run_unreal_skill`. Round two crashed the editor
(connection reset, editor process gone), so the items under **Unproven** still need a run.

## Confirmed in the editor

| Class | Member | What it means |
| --- | --- | --- |
| `PrimalDinoCharacter` | `dino_id1`, `dino_id2` | two int properties, both `0` on the class default. This is the stable per-creature identity a trail registry can key on. |
| `PrimalDinoCharacter` | `bp_adjust_damage(incoming_damage, the_damage_event, event_instigator, damage_causer, is_point_damage, point_hit_info) -> float` | damage hook, but it is a **blueprint override**, so it only fires for classes we own. Not usable on vanilla creatures. |
| `PrimalDinoCharacter` | `bp_notify_dealt_damage(victim, damage_amount, damage_event, event_instigator)` | same limitation: override only, and it is the outgoing side. |
| `PrimalDinoCharacter` | `bp_add_taming_creature_tracker_for_team(team, have_poi_active_initially, notify_player)` | ARK already has a per-team creature tracker with a HUD POI. Potential free compass marker. |
| `PrimalDinoCharacter` | `bp_allow_team_to_track_taming_dino(targeting_team_id) -> bool`, `bp_should_dino_be_tracked(custom_tame_selection_type, dino_group, custom_tame_search_text)`, `bp_override_taming_team_for_tracking_taming_dino(player_requesting_team_id) -> int32` | the rest of that system. It exists for taming, and it is overridable, which suggests a mod can extend who is tracked. |
| `PrimalDinoCharacter` | `hurt_decal_data` (Struct `DecalData`) | hurt marks are a decal config on the dino, so blood decals are already a supported concept. |
| `PrimalDinoCharacter` | `get_hurt_fx`, `get_hurt_fx_new`, `get_hurt_fx_niagara`, `get_fx_blood_color` | impact effects and blood colour are readable and overridable. |
| `GameplayStatics` | `spawn_decal_at_location(world_context, decal_material, decal_size, location, rotation, life_span, ...)` | a trail marker is one node. |
| `GameplayStatics` | `spawn_emitter_at_location`, `spawn_emitter_attached`, `spawn_emitter_attached_new` | an alternative trail visual with Niagara or Cascade. |
| `PrimalCharacterStatusComponent` | `get_melee_damage_modifier`, `has_status_value_modifier_with_instigator`, `remove_status_value_modifier_by_instigator` | no damage delegate here, so status alone provides no event. |

Delegate scan result: `unreal.MulticastDelegateProperty` is **not exposed to Python**, so the scan
that returned zero delegates on `PrimalWorldSettings` and `ShooterGameMode` proves nothing. Do not
read it as "there is no global damage event"; it is an unproven question, not a negative.

## The consequence for the design

There is no blueprint-callable damage event that fires for creatures we do not own. So detection has
to be one of:

1. **Poll and compare.** A server-side manager ticks about once a second, reads health for creatures
   in range of each player, and records a trail point when health drops. `KPTweaks` already has the
   pattern: `GetDinoList_GAIR` plus `ServerOctreeOverlapActorsBitMask`, which keeps the scan local
   instead of walking every creature on the map. This is the leading candidate.
2. **Extend the taming tracker.** If `bp_should_dino_be_tracked` and
   `bp_add_taming_creature_tracker_for_team` can be aimed at any creature, the HUD marker comes free
   and only the trail record is ours.

## Unproven, needs the editor back up

- Whether `bp_add_taming_creature_tracker_for_team` works on a creature that is not being tamed, and
  what the player sees.
- Whether `dino_id1` / `dino_id2` are populated on a live creature and survive a save and reload.
- Whether `PrimalGameData` exposes any global or always-applied buff, which would be a route to a
  real damage callback on vanilla creatures.
- What `ShooterGameMode` offers around kill and death, for the journal half of the idea.
- Whether a spawned decal or emitter persists across a save, or has to be re-created on demand.

## Probe hygiene for the next run

One class per MCP call. The run that killed the editor dumped six classes in a single call,
including `PrimalDinoCharacter` (2732 members) and `PrimalGameData`. Print early and often so a
crash still leaves the earlier output behind.
