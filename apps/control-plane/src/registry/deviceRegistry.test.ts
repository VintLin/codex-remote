import assert from "node:assert/strict";
import test from "node:test";

import { createDeviceRegistry, projectDevice } from "./deviceRegistry.ts";

const device = {
  id: "device-a",
  name: "Device A",
  baseUrl: "http://127.0.0.1:8788",
  token: "example-token-a",
};

test("device registry when resolving devices, should return configured device or fail closed", () => {
  const registry = createDeviceRegistry([device]);

  assert.equal(registry.require("device-a").name, "Device A");
  assert.throws(() => registry.require("missing"), /device_not_found/);
});

test("device registry when projecting public device, should use configured identity and safe host label", () => {
  const projected = projectDevice({
    configuredDevice: device,
    checkedAt: "2026-06-20T00:00:00.000Z",
    health: {
      deviceId: "other-device",
      status: "connected",
      checkedAt: "2026-06-20T00:00:01.000Z",
      codexVersion: "fake",
      appServer: {
        transport: "loopbackWebSocket",
        readyz: true,
      },
    },
    currentProject: "project-a",
  });

  assert.equal(projected.id, "device-a");
  assert.equal(projected.status, "Connected");
  assert.equal(projected.ip, "local");
  assert.equal(projected.currentProject, "project-a");
});
