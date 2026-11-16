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

test("ServerAdminPassword is the final URL option", () => {
  const url = buildArkUrl(base);
  const parts = url.split("?");
  assert.equal(parts[parts.length - 1], "ServerAdminPassword=admin123");
  assert.equal(parts.filter((p) => p.startsWith("ServerAdminPassword=")).length, 1);
});

test("nothing follows the admin password, so ASA cannot fold options into it", () => {
  const url = buildArkUrl(base);
  const tail = url.slice(url.indexOf("ServerAdminPassword=") + "ServerAdminPassword=".length);
  assert.equal(tail, "admin123");
  assert.equal(tail.includes("?"), false);
  assert.equal(tail.includes("="), false);
});

test("session name, cluster and dynamic config survive the reorder", () => {
  const url = buildArkUrl(base);
  assert.ok(url.includes("SessionName=iLGaming-Ragnarok"));
  assert.equal(url.includes("ClusterId="), false);
  assert.ok(url.includes("CustomDynamicConfigUrl=http://ilgamingarksettings.servegame.com/"));
  assert.ok(url.includes("RCONPassword=admin123"));
  assert.ok(url.startsWith("Ragnarok_WP?listen?Port=30103"));
});

test("a session name containing spaces does not swallow the password option", () => {
  const url = buildArkUrl({ ...base, sessionName: "iLGaming - The Island" });
  const parts = url.split("?");
  assert.ok(parts.includes("SessionName=iLGaming - The Island"));
  assert.equal(parts[parts.length - 1], "ServerAdminPassword=admin123");
});

test("admin password is omitted when unset", () => {
  const url = buildArkUrl({ ...base, adminPassword: "" });
  assert.equal(url.includes("ServerAdminPassword="), false);
  assert.equal(url.split("?").pop(), "SessionName=iLGaming-Ragnarok");
});
