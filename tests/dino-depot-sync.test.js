import { describe, expect, it } from "vitest";
import {
  anchorServerName,
  shouldSyncSettings,
  settingsPaths,
  DEPOT_SETTINGS_FILE,
} from "../services/config/dino-depot-sync.js";

describe("dino depot settings sync", () => {
  it("skips the anchor itself", () => {
    expect(shouldSyncSettings({ targetName: "iLGaming-The Island", targetClusterId: "iLGaming", anchor: "iLGaming-The Island" })).toBe(false);
  });

  it("syncs a cluster member that is not the anchor", () => {
    expect(shouldSyncSettings({ targetName: "iLGaming-Ragnarok", targetClusterId: "iLGaming", anchor: "iLGaming-The Island" })).toBe(true);
  });

  it("skips standalone servers with no cluster id", () => {
    expect(shouldSyncSettings({ targetName: "iLGaming - Halloween", targetClusterId: null, anchor: "iLGaming-The Island" })).toBe(false);
  });

  it("skips when the target or anchor is missing", () => {
    expect(shouldSyncSettings({ targetName: "", targetClusterId: "iLGaming", anchor: "iLGaming-The Island" })).toBe(false);
    expect(shouldSyncSettings({ targetName: "iLGaming-Ragnarok", targetClusterId: "iLGaming", anchor: "" })).toBe(false);
  });

  it("resolves the settings file inside the install's Saved\\SaveGames", () => {
    const p = settingsPaths("D:\\ARK\\servers\\iLGaming-Ragnarok");
    expect(p.dir.endsWith("Saved\\SaveGames")).toBe(true);
    expect(p.file.endsWith(DEPOT_SETTINGS_FILE)).toBe(true);
  });

  it("defaults the anchor to The Island", () => {
    const prev = process.env.DINO_DEPOT_ANCHOR;
    delete process.env.DINO_DEPOT_ANCHOR;
    expect(anchorServerName()).toBe("iLGaming-The Island");
    process.env.DINO_DEPOT_ANCHOR = "SomeOtherMap";
    expect(anchorServerName()).toBe("SomeOtherMap");
    if (prev === undefined) delete process.env.DINO_DEPOT_ANCHOR; else process.env.DINO_DEPOT_ANCHOR = prev;
  });
});
