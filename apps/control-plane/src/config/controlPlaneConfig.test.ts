import assert from "node:assert/strict";
import test from "node:test";

import { createSafeStartupSummary, loadControlPlaneConfig } from "./controlPlaneConfig.ts";

const validConfig = {
  publicToken: "example-public-token",
  devices: [
    {
      id: "device-a",
      name: "Device A",
      baseUrl: "http://127.0.0.1:8788",
      token: "example-token-a",
    },
  ],
};

test("control plane config when env json is valid, should parse configured devices", () => {
  const config = loadControlPlaneConfig({
    CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify(validConfig),
  });

  assert.equal(config.publicToken, "example-public-token");
  assert.equal(config.taskDatabasePath, ":memory:");
  assert.equal(config.devices[0]?.id, "device-a");
  assert.equal(config.devices[0]?.baseUrl, "http://127.0.0.1:8788");
  assert.deepEqual(config.allowedOrigins, ["http://127.0.0.1:5173"]);
});

test("control plane config when task database path is configured, should accept a file path", () => {
  const config = loadControlPlaneConfig({
    CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify({
      ...validConfig,
      taskDatabasePath: "example-task-store.sqlite",
    }),
  });

  assert.equal(config.taskDatabasePath, "example-task-store.sqlite");
});

test("control plane config when required fields are invalid, should fail closed", () => {
  const invalidConfigs = [
    {},
    { ...validConfig, publicToken: "" },
    { ...validConfig, devices: [] },
    { ...validConfig, devices: [{ ...validConfig.devices[0], id: "" }] },
    { ...validConfig, devices: [{ ...validConfig.devices[0], token: "" }] },
    { ...validConfig, devices: [{ ...validConfig.devices[0], baseUrl: "https://example.com" }] },
    { ...validConfig, devices: [{ ...validConfig.devices[0], baseUrl: "http://token@example.com" }] },
    { ...validConfig, devices: [validConfig.devices[0], validConfig.devices[0]] },
    { ...validConfig, allowedOrigins: ["*"] },
    { ...validConfig, bindHost: "0.0.0.0" },
  ];

  for (const config of invalidConfigs) {
    assert.throws(
      () => loadControlPlaneConfig({ CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify(config) }),
      /control_plane_config_invalid/,
    );
  }
});

test("control plane config when startup summary is created, should omit secrets and raw upstream urls", () => {
  const config = loadControlPlaneConfig({
    CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify(validConfig),
  });

  const summary = createSafeStartupSummary(config);

  assert.match(summary, /devices=1/);
  assert.match(summary, /device-a/);
  assert.doesNotMatch(summary, /example-token-a/);
  assert.doesNotMatch(summary, /example-public-token/);
  assert.doesNotMatch(summary, /127\.0\.0\.1:8788/);
  assert.doesNotMatch(summary, /baseUrl|raw|config/i);
});
