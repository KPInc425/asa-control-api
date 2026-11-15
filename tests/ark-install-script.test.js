import { describe, expect, it } from "vitest";
import { arkAdapter } from "../games/ark.js";

describe("ARK SteamCMD install script", () => {
  it("selects the public branch by default", () => {
    const script = arkAdapter.buildInstallScript("D:/ARK/servers/Ragnarok");

    expect(script).toContain("app_update 2430930 -beta public validate");
  });

  it("keeps an explicitly selected branch on the app_update command", () => {
    const script = arkAdapter.buildInstallScript(
      "D:/ARK/servers/Ragnarok",
      "test-branch",
    );

    expect(script).toContain("app_update 2430930 -beta test-branch validate");
    expect(script).not.toMatch(/^\s*-beta test-branch\s*$/m);
  });
});
