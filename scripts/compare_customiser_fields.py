"""Compare the ASE Customiser's 24 per-item fields against ASA's PrimalItem surface.

Reads G:/ARKDevkit/kpt_api_dump.json (written by dump_api.py inside the devkit) and
reports, per field, whether ASA exposes something that plausibly corresponds.

Matching is deliberately loose: UE Python exposes UPROPERTYs as snake_case, so
'StackSize' appears as 'stack_size'. A loose match is a candidate, not a guarantee,
and the report says so per line.
"""

import json
import os

DUMP = r"G:\ARKDevkit\kpt_api_dump.json"

# The 24 fields recovered from ACItemModifier in the ASE mod.
ASE_FIELDS = [
    "ItemClass", "RemapTo", "RequiredComponents", "StackSize", "Weight", "SpoilTimer",
    "CraftQuantity", "MaxCraftings", "TimeToCraft", "CraftingXP", "CraftMinLevel",
    "CraftingCooldown", "RepairCostMultiplier", "RepairXP", "TimeToRepair",
    "AllowRepair", "DurabilityDecreaseMultiplier", "MinUseInterval",
    "TameAffinityMultiplier", "CustomName", "CustomDescription", "DestroyBroken",
    "PreventUpload", "CheckDescription",
]

# Direct hints per field: substrings we would expect in an ASA property name.
HINTS = {
    "ItemClass": ["item_class", "class"],
    "RemapTo": ["remap"],
    "RequiredComponents": ["required_comp", "resource_require", "crafting_cost", "require"],
    "StackSize": ["max_item_quantity", "stack", "quantity"],
    "Weight": ["weight"],
    "SpoilTimer": ["spoil"],
    "CraftQuantity": ["craft_quantity", "crafting_quantity", "quantity"],
    "MaxCraftings": ["max_craft", "crafting_max"],
    "TimeToCraft": ["craft_time", "time_to_craft", "crafting_time", "craft_duration"],
    "CraftingXP": ["craft_xp", "crafting_xp", "xp"],
    "CraftMinLevel": ["min_level", "craft_level", "required_level"],
    "CraftingCooldown": ["craft_cooldown", "crafting_cooldown", "cooldown"],
    "RepairCostMultiplier": ["repair_cost", "repair"],
    "RepairXP": ["repair_xp"],
    "TimeToRepair": ["repair_time", "time_to_repair"],
    "AllowRepair": ["allow_repair", "can_repair", "repairable", "allow_repairing"],
    "DurabilityDecreaseMultiplier": ["durability", "durab"],
    "MinUseInterval": ["use_interval", "min_use", "use_cooldown"],
    "TameAffinityMultiplier": ["affinity", "tame"],
    "CustomName": ["item_name", "custom_name", "display_name", "name"],
    "CustomDescription": ["description", "custom_desc"],
    "DestroyBroken": ["destroy", "broken"],
    "PreventUpload": ["prevent_upload", "upload", "transferable"],
    "CheckDescription": ["check_desc", "description"],
}


def main():
    if not os.path.exists(DUMP):
        raise SystemExit("dump not found at %s - run dump_api.py in the devkit first" % DUMP)

    with open(DUMP, encoding="utf-8") as fh:
        data = json.load(fh)

    item = data.get("PrimalItem") or {}
    props = [p.lower() for p in item.get("properties", [])]
    funcs = [f.lower() for f in item.get("functions", [])]
    pool = props + funcs

    print("PrimalItem: %d properties, %d functions read from the devkit\n"
          % (item.get("property_count", 0), item.get("function_count", 0)))

    covered, missing = [], []
    for field in ASE_FIELDS:
        hits = []
        for hint in HINTS.get(field, [field.lower()]):
            hits += [n for n in pool if hint in n and n not in hits]
        if hits:
            covered.append(field)
            label = "property" if any(h in props for h in hits) else "function"
            print("  %-30s CANDIDATE (%s): %s" % (field, label, ", ".join(hits[:4])))
        else:
            missing.append(field)
            print("  %-30s no candidate" % field)

    print("\n%d of %d fields have a candidate, %d have none"
          % (len(covered), len(ASE_FIELDS), len(missing)))
    if missing:
        print("no candidate: " + ", ".join(missing))
    print("\nCandidates are name matches, not proofs. Each one still needs a live")
    print("set-and-read test on a throwaway item before we build against it.")

    inv = data.get("PrimalInventoryComponent") or {}
    if inv.get("functions"):
        grant = [f for f in inv["functions"]
                 if any(k in f.lower() for k in ("add_item", "give", "additem", "grant"))]
        print("\nPrimalInventoryComponent grant candidates: " + (", ".join(grant[:8]) or "none found"))


if __name__ == "__main__":
    main()
