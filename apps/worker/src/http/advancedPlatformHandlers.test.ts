import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import {
  getAdvancedPlatformReadinessSummary,
  type WorkerAdvancedPlatformAppServerClient,
  type WorkerAdvancedPlatformHandlerContext,
} from "./advancedPlatformHandlers.ts";
import { WorkerHttpError } from "./errors.ts";
import { createWorkerHttpApp } from "./workerHttpApp.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

const authHeaders = { authorization: "Bearer example-token" };

test("advanced platform handler when project is invalid, should reject before app-server calls", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const client = new FakeAdvancedPlatformClient();
  const context = createContext(projectRoot, client);

  await assert.rejects(
    getAdvancedPlatformReadinessSummary(context, "other-project"),
    (error) => error instanceof WorkerHttpError && error.status === 403 && error.code === "project_forbidden",
  );

  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.calls, []);
});

test("advanced platform handler when project is valid, should call only Windows sandbox readiness", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const client = new FakeAdvancedPlatformClient({ readiness: { status: "ready" } });
  const context = createContext(projectRoot, client, "windows");

  const summary = await getAdvancedPlatformReadinessSummary(context, "local-project");

  assert.equal(summary.deviceId, "device-local");
  assert.equal(summary.projectId, "local-project");
  assert.equal(summary.platform, "windows");
  assert.deepEqual(summary.readinessSections.map((section) => [section.id, section.status]), [
    ["windows-sandbox", "ready"],
  ]);
  assert.deepEqual(client.calls, [["windowsSandbox/readiness", undefined]]);
  assert.equal(context.openClientCount(), 1);
  assert.equal(client.closed, true);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(escapeRegExp(projectRoot)));
});

test("advanced platform handler when platform is not Windows, should not open app-server client", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const client = new FakeAdvancedPlatformClient({
    readinessError: new Error("should_not_call_windows_sandbox_readiness"),
  });
  const context = createContext(projectRoot, client, "macos");

  const summary = await getAdvancedPlatformReadinessSummary(context, "local-project");

  assert.equal(summary.platform, "macos");
  assert.deepEqual(summary.readinessSections.map((section) => [section.id, section.status]), [
    ["windows-sandbox", "not_applicable"],
  ]);
  assert.equal(context.openClientCount(), 0);
  assert.equal(client.closed, false);
  assert.deepEqual(client.calls, []);
});

test("advanced platform handler when Windows readiness fails, should return degraded section and safe watchlist", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const leakMarkers = [
    "SECRET_TOKEN",
    "sk-provider-secret",
    projectRoot,
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
  const client = new FakeAdvancedPlatformClient({
    readinessError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(projectRoot, client, "windows");

  const summary = await getAdvancedPlatformReadinessSummary(context, "local-project");

  assert.equal(summary.platform, "windows");
  assert.equal(summary.readinessSections[0]?.status, "degraded");
  assert.equal(summary.readinessSections[0]?.error?.code, "worker_internal_error");
  assert.deepEqual(
    summary.watchlistItems.map((item) => [item.id, item.support]),
    [
      ["realtime-voice", "deferred"],
      ["feedback-upload", "deferred"],
      ["external-agent-config", "deferred"],
      ["remote-gui-computer-use", "not_supported"],
      ["automations", "deferred"],
    ],
  );
  assert.equal(client.closed, true);

  const serialized = JSON.stringify(summary);
  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
});

test("worker http app when advanced platform readiness route is requested, should return public summary", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const context = createContext(projectRoot, new FakeAdvancedPlatformClient({ readiness: { status: "notConfigured" } }), "windows");
  const app = createWorkerHttpApp(context as never);

  const response = await app.request("http://127.0.0.1:8787/v1/projects/local-project/advanced-platform-readiness", {
    headers: authHeaders,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.projectId, "local-project");
  assert.deepEqual(body.readinessSections.map((section: { id: string; status: string }) => [section.id, section.status]), [
    ["windows-sandbox", "unavailable"],
  ]);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(escapeRegExp(projectRoot)));
});

test("worker http app when advanced platform project is invalid, should reject before app-server calls", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-advanced-platform-"));
  const client = new FakeAdvancedPlatformClient();
  const context = createContext(projectRoot, client);
  const app = createWorkerHttpApp(context as never);

  const response = await app.request("http://127.0.0.1:8787/v1/projects/other-project/advanced-platform-readiness", {
    headers: authHeaders,
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "project_forbidden");
  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.calls, []);
});

class FakeAdvancedPlatformClient implements WorkerAdvancedPlatformAppServerClient {
  closed = false;
  readonly calls: Array<[string, unknown]> = [];
  private readonly readiness: v2.WindowsSandboxReadinessResponse;
  private readonly readinessError: Error | null;

  constructor(options: { readiness?: v2.WindowsSandboxReadinessResponse; readinessError?: Error } = {}) {
    this.readiness = options.readiness ?? { status: "ready" };
    this.readinessError = options.readinessError ?? null;
  }

  async readyz(): Promise<void> {}

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(): Promise<v2.ThreadListResponse> {
    return { data: [], nextCursor: null, backwardsCursor: null };
  }

  async readThread(): Promise<v2.ThreadReadResponse> {
    throw new Error("unexpected_read_thread");
  }

  async readWindowsSandboxReadiness(): Promise<v2.WindowsSandboxReadinessResponse> {
    this.calls.push(["windowsSandbox/readiness", undefined]);
    if (this.readinessError) {
      throw this.readinessError;
    }

    return this.readiness;
  }

  close(): void {
    this.closed = true;
  }
}

function createContext(
  allowedProjectRoot: string,
  client: WorkerAdvancedPlatformAppServerClient,
  platform: "macos" | "windows" | "linux" | "unknown" = "macos",
): WorkerAdvancedPlatformHandlerContext & {
  writeState: ReturnType<typeof createWorkerWriteHandlerState>;
  openClientCount(): number;
} {
  let openClientCount = 0;

  return {
    config: {
      allowedOrigins: ["http://127.0.0.1:5173"],
      allowedProjectRoot,
      appServerTransport: "loopbackWebSocket",
      appServerUrl: "ws://127.0.0.1:4321",
      bindHost: "127.0.0.1",
      calibrationApprovalMode: null,
      connectTimeoutMs: 5_000,
      deviceId: "device-local",
      port: 8787,
      requestTimeoutMs: 5_000,
      startAppServer: false,
      workerToken: "example-token",
    } satisfies WorkerHttpConfig,
    now: () => "2026-06-22T00:00:00.000Z",
    platform: () => platform,
    writeState: createWorkerWriteHandlerState(),
    openClient: async () => {
      openClientCount += 1;
      return client;
    },
    openClientCount: () => openClientCount,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
