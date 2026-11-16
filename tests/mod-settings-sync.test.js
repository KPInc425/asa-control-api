import { describe, expect, it } from "vitest";
import {
  anchorServerName,
  shouldSyncSettings,
  saveGamesDir,
  SYNC_FILES,
  NEVER_SYNC,
} from "../services/config/mod-settings-sync.js";

const anchor = "iLGaming-The Island";

describe("mod settings sync", () => {
  it("skips the anchor itself", () => {
    expect(shouldSyncSettings({ targetName: anchor, targetClusterId: "iLGaming", anchor })).toBe(false);
  });

  it("syncs a cluster member that is not the anchor", () => {
    expect(shouldSyncSettings({ targetName: "iLGaming-Ragnarok", targetClusterId: "iLGaming", anchor })).toBe(true);
  });

  it("skips standalone servers with no cluster id", () => {
    expect(shouldSyncSettings({ targetName: "iLGaming - Halloween", targetClusterId: null, anchor })).toBe(false);
  });

  it("skips when the target or anchor is blank", () => {
    expect(shouldSyncSettings({ targetName: "", targetClusterId: "iLGaming", anchor })).toBe(false);
    expect(shouldSyncSettings({ targetName: "iLGaming-Ragnarok", targetClusterId: "iLGaming", anchor: "" })).toBe(false);
  });

  it("resolves the SaveGames directory inside the install", () => {
    expect(saveGamesDir("D:\\ARK\\servers\\iLGaming-Ragnarok").endsWith("Saved\\SaveGames")).toBe(true);
  });

  it("syncs settings files only, never caches or state", () => {
    const listed = SYNC_FILES.map((f) => f.join("/"));
    expect(listed).toContain("DinoDepotModSettings.sav");
    expect(listed).toContain("VwS_StackingConfig.sav");
    expect(listed).toContain("AlienPlants.sav");
    expect(listed).toContain("CS/CyberStructures_Settings.sav");
    for (const banned of NEVER_SYNC) {
      expect(listed).not.toContain(banned);
    }
  });

  it("defaults the anchor to The Island and honours the env override", () => {
    const prev = process.env.MOD_SETTINGS_ANCHOR;
    const prevLegacy = process.env.DINO_DEPOT_ANCHOR;
    delete process.env.MOD_SETTINGS_ANCHOR;
    delete process.env.DINO_DEPOT_ANCHOR;
    expect(anchorServerName()).toBe(anchor);
    process.env.MOD_SETTINGS_ANCHOR = "SomeOtherMap";
    expect(anchorServerName()).toBe("SomeOtherMap");
    if (prev === undefined) delete process.env.MOD_SETTINGS_ANCHOR; else process.env.MOD_SETTINGS_ANCHOR = prev;
    if (prevLegacy === undefined) delete process.env.DINO_DEPOT_ANCHOR; else process.env.DINO_DEPOT_ANCHOR = prevLegacy;
  });
});
