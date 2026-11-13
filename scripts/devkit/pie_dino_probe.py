# PIE probe: tame_dino and spawn_from_dino_data, run from editor Python.
# Run while PIE is playing (or let it start PIE). Safe on a throwaway map only.
# Reports a compact PASS/FAIL block; nothing is written to the mod.

import unreal

DODO = "/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP.Dodo_Character_BP_C"


def out(msg):
    unreal.log("PIEPROBE " + msg)
    print(msg)


def world():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()


def ensure_pie():
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if les.is_in_play_in_editor():
        out("PIE already running")
        return True
    out("PIE not running; requesting play")
    les.editor_request_begin_play()
    return False


def spawn(cls_path, loc, rot):
    cls = unreal.load_class(None, cls_path)
    if cls is None:
        out("FAIL cannot load class " + cls_path)
        return None
    gs = unreal.GameplayStatics
    for fn in ("begin_spawn_actor_from_class", "spawn_actor_from_class"):
        if hasattr(gs, fn):
            try:
                if fn == "begin_spawn_actor_from_class":
                    return gs.begin_spawn_actor_from_class(cls, loc, rot)
                return gs.spawn_actor_from_class(cls, loc, rot)
            except Exception as exc:
                out("spawn via %s failed: %s" % (fn, str(exc)[:120]))
    try:
        return unreal.EditorLevelLibrary.spawn_actor_from_class(cls, loc, rot)
    except Exception as exc:
        out("FAIL spawn: " + str(exc)[:160])
    return None


def run():
    w = world()
    if w is None:
        out("FAIL no game world; start PIE first")
        return
    out("world ok: " + str(w.get_name()))
    pc = unreal.GameplayStatics.get_player_controller(w, 0)
    if pc is None:
        out("FAIL no player controller; is PIE actually playing?")
        return
    pawn = pc.get_controlled_pawn() if hasattr(pc, "get_controlled_pawn") else None
    base = pawn.get_actor_location() if pawn else unreal.Vector(0, 0, 5000)
    loc = unreal.Vector(base.x + 400, base.y, base.z + 200)
    rot = unreal.Rotator(0, 0, 0)

    # --- test 1: spawn + tame_dino
    d = spawn(DODO, loc, rot)
    if d is None:
        return
    out("spawned: " + d.get_name())
    try:
        d.tame_dino(pc, False, 0, True, False, False, False)
        out("tame_dino called")
    except Exception as exc:
        out("FAIL tame_dino: " + str(exc)[:200])
    try:
        out("bp_is_tamed -> %s" % d.bp_is_tamed())
        out("targeting_team -> %s | taming_team_id -> %s" % (
            getattr(d, "targeting_team", "?"), getattr(d, "taming_team_id", "?")))
        out("imprinter_name -> %r" % getattr(d, "imprinter_name", "?"))
    except Exception as exc:
        out("read-back error: " + str(exc)[:160])

    # --- test 2: capture data, spawn two copies
    try:
        data = d.get_dino_data()
        out("get_dino_data ok; class=%s data_len=%s" % (
            getattr(data, "dino_class", "?"),
            len(getattr(data, "dino_data", []) or [])))
    except Exception as exc:
        out("FAIL get_dino_data: " + str(exc)[:200])
        return

    ids = []
    for i in (0, 1):
        loc2 = unreal.Vector(loc.x + 200 * (i + 1), loc.y, loc.z)
        c = spawn(DODO, loc2, rot)
        if c is None:
            continue
        try:
            res = c.spawn_from_dino_data(data, w, loc2, rot, 0, True, pc)
            out("spawn_from_dino_data call %d -> %s" % (i + 1, res))
            if res:
                ids.append((getattr(res, "dino_id1", None), getattr(res, "dino_id2", None),
                            res.bp_is_tamed() if hasattr(res, "bp_is_tamed") else "?"))
        except Exception as exc:
            out("FAIL spawn_from_dino_data %d: %s" % (i + 1, str(exc)[:200]))
    out("copy ids: %s" % (ids,))
    distinct = len(ids) == 2 and ids[0][:2] != ids[1][:2]
    out("RESULT tamed=%s copies=%d distinct=%s" % (
        getattr(d, "", "") and d.bp_is_tamed() if hasattr(d, "bp_is_tamed") else "?",
        len(ids), distinct))


run()
