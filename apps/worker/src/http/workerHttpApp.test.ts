import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import { createWorkerHttpApp } from "./workerHttpApp.ts";
import type { WorkerReadOnlyAppServerClient, WorkerReadOnlyHandlerContext } from "./readOnlyHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

const authHeaders = { authorization: "Bearer example-token" };

test("worker http app when auth is missing or invalid, should return ErrorEnvelope 401", async () => {
  const app = createWorkerHttpApp(await createContext());

  for (const headers of [{}, { authorization: "Bearer wrong-token" }]) {
    const response = await app.request("/v1/worker/capabilities", { headers });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.code, "unauthorized");
    assert.equal(body.message, "Missing or invalid bearer token.");
    assert.equal(typeof body.requestId, "string");
  }
});

test("worker http app when browser origin is unexpected, should return sanitized 403", async () => {
  const app = createWorkerHttpApp(await createContext());

  const response = await app.request("/v1/worker/capabilities", {
    headers: { ...authHeaders, origin: "http://evil.example", "x-request-id": "req-origin" },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "origin_forbidden");
  assert.equal(body.requestId, "req-origin");
});

test("worker http app when token is valid and origin is absent or allowlisted, should succeed", async () => {
  const app = createWorkerHttpApp(await createContext());

  const cliResponse = await app.request("/v1/worker/capabilities", { headers: authHeaders });
  const browserResponse = await app.request("/v1/worker/capabilities", {
    headers: { ...authHeaders, origin: "http://127.0.0.1:5173" },
  });

  assert.equal(cliResponse.status, 200);
  assert.equal(browserResponse.status, 200);
  assert.equal((await cliResponse.json()).canReadConversations, true);
});

test("worker http app when timeline is requested, should return ConversationTimeline", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);

  const response = await app.request("/v1/conversations/thread-123/timeline", { headers: authHeaders });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.deviceId, "device-local");
  assert.equal(body.conversationId, "thread-123");
  assert.deepEqual(body.turns, [
    {
      id: "turn-123",
      status: "completed",
      startedAt: 10,
      completedAt: 15,
      durationMs: 5000,
    },
  ]);
});

test("worker http app when route is outside stage 2 allowlist, should not implement behavior", async () => {
  const app = createWorkerHttpApp(await createContext());

  const response = await app.request("/conversations/thread-123/follow-up", {
    method: "POST",
    headers: authHeaders,
  });

  assert.equal(response.status, 404);
});

test("worker http app when handler fails, should return sanitized ErrorEnvelope", async () => {
  const leakMarkers = [
    "ws://127.0.0.1:4321",
    "example-token",
    "stack",
    "LEAK_PROMPT",
    "LEAK_COMMAND_OUTPUT",
    "LEAK_FULL_DIFF",
  ];
  const context = await createContext({
    client: new FakeClient({
      listError: new Error(leakMarkers.join(" ")),
    }),
  });
  const app = createWorkerHttpApp(context);

  const response = await app.request("/v1/conversations", {
    headers: { ...authHeaders, "x-request-id": "req-leak-check" },
  });
  const serialized = JSON.stringify(await response.json());

  assert.equal(response.status, 500);
  assert.match(serialized, /worker_internal_error/);
  assert.match(serialized, /req-leak-check/);
  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

async function createContext(options: { client?: WorkerReadOnlyAppServerClient } = {}): Promise<WorkerReadOnlyHandlerContext> {
  const allowedProjectRoot = await mkdtemp(join(tmpdir(), "worker-http-app-"));
  const project = join(allowedProjectRoot, "project");
  await mkdir(project);
  const client = options.client ?? new FakeClient({ cwd: project });
  const ticks = ["2026-06-19T10:00:00.000Z", "2026-06-19T10:00:01.000Z"];

  return {
    config: {
      allowedOrigins: ["http://127.0.0.1:5173"],
      allowedProjectRoot,
      appServerTransport: "loopbackWebSocket",
      appServerUrl: "ws://127.0.0.1:4321",
      bindHost: "127.0.0.1",
      connectTimeoutMs: 5_000,
      deviceId: "device-local",
      port: 8787,
      requestTimeoutMs: 5_000,
      startAppServer: false,
      workerToken: "example-token",
    } satisfies WorkerHttpConfig,
    now: () => ticks.shift() ?? "2026-06-19T10:00:01.000Z",
    openClient: async () => client,
  };
}

class FakeClient implements WorkerReadOnlyAppServerClient {
  private readonly cwd: string;
  private readonly listError: Error | null;

  constructor(options: { cwd?: string; listError?: Error } = {}) {
    this.cwd = options.cwd ?? "/tmp/project";
    this.listError = options.listError ?? null;
  }

  async readyz(): Promise<void> {}

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(): Promise<v2.ThreadListResponse> {
    if (this.listError) {
      throw this.listError;
    }

    return { data: [createThread({ cwd: this.cwd })], nextCursor: null, backwardsCursor: null };
  }

  async readThread(): Promise<v2.ThreadReadResponse> {
    return { thread: createThread({ cwd: this.cwd }) };
  }

  close(): void {}
}

function createThread(overrides: Partial<v2.Thread> = {}): v2.Thread {
  return {
    id: "thread-123",
    sessionId: "session-123",
    forkedFromId: null,
    parentThreadId: null,
    preview: "Thread preview",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1_718_791_200,
    updatedAt: 1_718_791_205,
    status: { type: "idle" },
    path: null,
    cwd: "/tmp/project" as v2.Thread["cwd"],
    cliVersion: "1.0.0",
    source: "cli",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [createTurn()],
    ...overrides,
  };
}

function createTurn(overrides: Partial<v2.Turn> = {}): v2.Turn {
  return {
    id: "turn-123",
    items: [],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 10,
    completedAt: 15,
    durationMs: 5_000,
    ...overrides,
  };
}
