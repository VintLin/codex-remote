import assert from "node:assert/strict";
import test from "node:test";

import type { ErrorEnvelope } from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import {
  createAdvancedPlatformWatchlistItems,
  projectWindowsSandboxReadinessSection,
  projectWindowsSandboxReadinessUnavailableSection,
} from "./advancedPlatformProjections.ts";

test("advanced platform projections when Windows readiness is ready, should expose ready Windows sandbox section", () => {
  const section = projectWindowsSandboxReadinessSection("windows", { status: "ready" });

  assert.deepEqual(section, {
    id: "windows-sandbox",
    label: "Windows sandbox",
    status: "ready",
    summary: "Windows sandbox is ready.",
    details: "Codex can use the Windows sandbox on this device.",
  });
});

test("advanced platform projections when Windows readiness requires setup, should expose unavailable section without setup action", () => {
  const notConfigured = projectWindowsSandboxReadinessSection("windows", { status: "notConfigured" });
  const updateRequired = projectWindowsSandboxReadinessSection("windows", { status: "updateRequired" });

  assert.equal(notConfigured.status, "unavailable");
  assert.equal(notConfigured.summary, "Windows sandbox is not configured.");
  assert.equal(updateRequired.status, "unavailable");
  assert.equal(updateRequired.summary, "Windows sandbox requires an update.");

  const serialized = JSON.stringify([notConfigured, updateRequired]);
  assert.doesNotMatch(serialized, /setupStart|setup|action|input/i);
});

test("advanced platform projections when platform is not Windows, should prefer not applicable for Windows sandbox", () => {
  const section = projectWindowsSandboxReadinessSection("macos", { status: "ready" });

  assert.deepEqual(section, {
    id: "windows-sandbox",
    label: "Windows sandbox",
    status: "not_applicable",
    summary: "Windows sandbox is not applicable on this platform.",
    details: "This device is not running Windows.",
  });
});

test("advanced platform projections when readiness transport fails, should expose degraded section", () => {
  const error: ErrorEnvelope = {
    code: "app_server_unavailable",
    message: "Codex app-server is unavailable.",
    requestId: "advanced-platform-section",
    details: { operation: "advanced_platform.windows_sandbox", retryable: true },
  };

  const section = projectWindowsSandboxReadinessUnavailableSection(error);

  assert.equal(section.status, "degraded");
  assert.equal(section.error, error);
});

test("advanced platform projections should expose static watchlist support matrix without actions or inputs", () => {
  const items = createAdvancedPlatformWatchlistItems();

  assert.deepEqual(
    items.map((item) => [item.id, item.support]),
    [
      ["realtime-voice", "deferred"],
      ["feedback-upload", "deferred"],
      ["external-agent-config", "deferred"],
      ["remote-gui-computer-use", "not_supported"],
      ["automations", "deferred"],
    ],
  );

  for (const item of items) {
    assert.equal("action" in item, false);
    assert.equal("input" in item, false);
    assert.notEqual(item.support, "ready");
  }
});

test("advanced platform projections should not leak unsafe readiness or watchlist values", () => {
  const leakMarkers = [
    "SECRET_TOKEN",
    "sk-provider-secret",
    "/private/tmp/project",
    "/Users/Vint/private",
    "HOSTNAME=Vints-MacBook-Pro.local",
    "USER=vint",
    "process.env.CODEX_TOKEN",
    '{"jsonrpc":"2.0","method":"windowsSandbox/readiness"}',
    "developer prompt",
    "debug log line",
    "command output",
    "diff --git a/file b/file",
    "@@ -1,1 +1,1 @@",
    "migrationItems",
    "extra.log",
    "stack",
    "cause",
  ];
  const response = { status: "ready", diagnostics: leakMarkers.join(" ") } as unknown as v2.WindowsSandboxReadinessResponse;

  const serialized = JSON.stringify([
    projectWindowsSandboxReadinessSection("windows", response),
    projectWindowsSandboxReadinessUnavailableSection({
      code: "worker_internal_error",
      message: leakMarkers.join(" "),
      requestId: "advanced-platform-section",
      details: { operation: "advanced_platform.windows_sandbox", retryable: false },
    }),
    createAdvancedPlatformWatchlistItems(),
  ]);

  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
