import { test } from "vitest";
import assert from "node:assert/strict";
import { buildArkUrl } from "../services/provisioning/script-generator/ark-launch.js";

const base = {
  map: "Ragnarok",
  gamePort: 30103,
  queryPort: 30104,
  rconPort: 30105,
  maxPlayers: 70,
  adminPassword: "admin123",
  rconPassword: "admin123",
  customDynamicConfigUrl: "http://ilgamingarksettings.servegame.com/",
  clusterId: "iLGaming",
  sessionName: "iLGaming-Ragnarok",
};

// ASA reads an option value as everything from "key=" to the next space or
// quote. The session name is the terminator, so it must sit last AND contain a
// space. Without the space, ClusterId and ServerAdminPassword swallow the rest
// of the URL, which produced a different cluster mutex name and a 146-character
// ini admin password.

test("session name is the final URL option", () => {
  const parts = buildArkUrl(base).split("?");
  assert.ok(parts[parts.length - 1].startsWith("SessionName="));
});

test("an unspaced session name gets a space inserted", () => {
  const parts = buildArkUrl(base).split("?");
  assert.equal(parts[parts.length - 1], "SessionName=iLGaming - Ragnarok");
});

test("a session name that already has a space is left alone", () => {
  const parts = buildArkUrl({ ...base, sessionName: "iLGaming - The Island" }).split("?");
  assert.equal(parts[parts.length - 1], "SessionName=iLGaming - The Island");
});

test("cluster id is carried in the URL", () => {
  assert.ok(buildArkUrl(base).includes("ClusterId=iLGaming"));
});

test("admin password sits before the session name and appears once", () => {
  const parts = buildArkUrl(base).split("?");
  assert.equal(parts.filter((p) => p.startsWith("ServerAdminPassword=")).length, 1);
  const idx = parts.findIndex((p) => p.startsWith("ServerAdminPassword="));
  assert.ok(idx > 0 && idx < parts.length - 1);
});

test("map, ports and dynamic config survive", () => {
  const url = buildArkUrl(base);
  assert.ok(url.startsWith("Ragnarok_WP?listen?Port=30103"));
  assert.ok(url.includes("QueryPort=30104"));
  assert.ok(url.includes("RCONPort=30105"));
  assert.ok(url.includes("CustomDynamicConfigUrl=http://ilgamingarksettings.servegame.com/"));
  assert.ok(url.includes("RCONPassword=admin123"));
});

test("admin password is omitted when unset", () => {
  const url = buildArkUrl({ ...base, adminPassword: "" });
  assert.equal(url.includes("ServerAdminPassword="), false);
});
