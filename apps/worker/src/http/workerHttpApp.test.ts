import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import { createWorkerApprovalRegistry } from "./approvalRegistry.ts";
import type { WorkerControlAppServerClient, WorkerControlHandlerContext } from "./controlHandlers.ts";
import { createWorkerHttpApp } from "./workerHttpApp.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
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
  assert.equal(browserResponse.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  assert.equal((await cliResponse.json()).canReadConversations, true);
});

test("worker http app when browser sends preflight, should allow configured origin without bearer auth", async () => {
  const app = createWorkerHttpApp(await createContext());

  const response = await app.request("/v1/worker/capabilities", {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5173",
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /Authorization/);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
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

test("worker http app when projects are requested, should return the safe local project", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);

  const response = await app.request("/v1/projects", { headers: authHeaders });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, [
    {
      id: "local-project",
      name: context.projectName,
      deviceId: "device-local",
      path: "",
      branch: "unknown",
      hasChanges: false,
      pinned: false,
      expanded: true,
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

test("worker http app when follow-up is accepted, should return CommandAccepted with 202", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);

  const response = await app.request("/v1/conversations/thread-123/follow-up", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue safely",
      clientRequestId: "client-http-follow-up-1",
      expectedConversationId: "thread-123",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.status, "accepted");
  assert.equal(body.conversationId, "thread-123");
  assert.equal(body.turnId, "turn-started");
});

test("worker http app when start is accepted, should return CommandAccepted with 202", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);

  const response = await app.request("/v1/conversations", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      projectId: context.projectId,
      message: "Start safely",
      clientRequestId: "client-http-start-1",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.status, "accepted");
  assert.equal(body.conversationId, "thread-started");
  assert.equal(body.turnId, "turn-started");
});

test("worker http app when interrupt and steer routes are accepted, should return CommandAccepted with 202", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);

  const interruptResponse = await app.request("/v1/conversations/thread-123/turns/turn-123/interrupt", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      clientRequestId: "client-http-interrupt-1",
      expectedTurnId: "turn-123",
    }),
  });
  const steerResponse = await app.request("/v1/conversations/thread-123/turns/turn-123/steer", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: "Adjust active turn",
      clientRequestId: "client-http-steer-1",
      expectedTurnId: "turn-123",
    }),
  });

  assert.equal(interruptResponse.status, 202);
  assert.equal((await interruptResponse.json()).turnId, "turn-123");
  assert.equal(steerResponse.status, 202);
  assert.equal((await steerResponse.json()).turnId, "turn-123");
});

test("worker http app when approval routes are used, should list and decide sanitized pending approvals", async () => {
  const context = await createContext();
  const app = createWorkerHttpApp(context);
  const pending = context.approvalRegistry.captureServerRequest({
    id: "jsonrpc-secret",
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-123",
      turnId: "turn-123",
      itemId: "item-command",
      startedAtMs: 1_718_791_200_000,
      command: "echo SECRET_TOKEN",
      cwd: "/Users/vint/private/project",
      reason: "needs approval",
    },
  });
  assert.ok(pending);

  const listResponse = await app.request("/v1/conversations/thread-123/approvals", { headers: authHeaders });
  const approvals = await listResponse.json();
  const serializedApprovals = JSON.stringify(approvals);

  assert.equal(listResponse.status, 200);
  assert.equal(approvals.length, 1);
  assert.doesNotMatch(serializedApprovals, /jsonrpc-secret|SECRET_TOKEN|\/Users\/vint\/private/);

  const decisionResponse = await app.request(`/v1/conversations/thread-123/approvals/${pending.id}/decision`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      decision: "accept",
      clientRequestId: "client-http-approval-1",
      expectedConversationId: "thread-123",
      expectedTurnId: "turn-123",
      expectedApprovalRequestId: pending.id,
    }),
  });
  const decisionBody = await decisionResponse.json();

  assert.equal(decisionResponse.status, 202);
  assert.equal(decisionBody.status, "accepted");
  assert.equal(decisionBody.turnId, "turn-123");
});

test("worker http app when write body is invalid, should return 400 without app-server write", async () => {
  const client = new FakeClient();
  const context = await createContext({ client });
  const app = createWorkerHttpApp(context);

  const invalidJsonResponse = await app.request("/v1/conversations", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: "{",
  });
  const missingFieldResponse = await app.request("/v1/conversations/thread-123/follow-up", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "Continue" }),
  });
  const extraFieldResponse = await app.request("/v1/conversations/thread-123/follow-up", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue",
      clientRequestId: "client-http-follow-up-extra",
      expectedConversationId: "thread-123",
      rawJsonRpc: "{}",
    }),
  });
  const overlongIdResponse = await app.request("/v1/conversations/thread-123/follow-up", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue",
      clientRequestId: "x".repeat(129),
      expectedConversationId: "thread-123",
    }),
  });
  const startExtraFieldResponse = await app.request("/v1/conversations", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      projectId: context.projectId,
      message: "Start",
      clientRequestId: "client-http-start-extra",
      rawJsonRpc: "{}",
    }),
  });

  assert.equal(invalidJsonResponse.status, 400);
  assert.equal((await invalidJsonResponse.json()).code, "invalid_request");
  assert.equal(missingFieldResponse.status, 400);
  assert.equal((await missingFieldResponse.json()).code, "invalid_request");
  assert.equal(extraFieldResponse.status, 400);
  assert.equal((await extraFieldResponse.json()).code, "invalid_request");
  assert.equal(overlongIdResponse.status, 400);
  assert.equal((await overlongIdResponse.json()).code, "invalid_request");
  assert.equal(startExtraFieldResponse.status, 400);
  assert.equal((await startExtraFieldResponse.json()).code, "invalid_request");
  assert.equal(client.startThreadCalls, 0);
  assert.equal(client.startTurnCalls, 0);
});

test("worker http app when control body is invalid, should return 400 without app-server control", async () => {
  const client = new FakeClient();
  const context = await createContext({ client });
  const app = createWorkerHttpApp(context);

  const extraFieldResponse = await app.request("/v1/conversations/thread-123/turns/turn-123/interrupt", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      clientRequestId: "client-http-interrupt-extra",
      expectedTurnId: "turn-123",
      rawJsonRpc: "{}",
    }),
  });
  const overlongIdResponse = await app.request("/v1/conversations/thread-123/turns/turn-123/steer", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: "Adjust",
      clientRequestId: "x".repeat(129),
      expectedTurnId: "turn-123",
    }),
  });
  const approvalExtraFieldResponse = await app.request("/v1/conversations/thread-123/approvals/approval-1/decision", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      decision: "accept",
      clientRequestId: "client-http-approval-extra",
      expectedConversationId: "thread-123",
      expectedTurnId: "turn-123",
      expectedApprovalRequestId: "approval-1",
      rawJsonRpc: "{}",
    }),
  });

  assert.equal(extraFieldResponse.status, 400);
  assert.equal((await extraFieldResponse.json()).code, "invalid_request");
  assert.equal(overlongIdResponse.status, 400);
  assert.equal((await overlongIdResponse.json()).code, "invalid_request");
  assert.equal(approvalExtraFieldResponse.status, 400);
  assert.equal((await approvalExtraFieldResponse.json()).code, "invalid_request");
  assert.equal(client.interruptTurnCalls, 0);
  assert.equal(client.steerTurnCalls, 0);
  assert.equal(client.approvalResponses.length, 0);
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

async function createContext(options: { client?: WorkerControlAppServerClient } = {}): Promise<WorkerControlHandlerContext & { projectId: string; projectName: string }> {
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
      calibrationApprovalMode: null,
      connectTimeoutMs: 5_000,
      deviceId: "device-local",
      port: 8787,
      requestTimeoutMs: 5_000,
      startAppServer: false,
      workerToken: "example-token",
    } satisfies WorkerHttpConfig,
    now: () => ticks.shift() ?? "2026-06-19T10:00:01.000Z",
    openClient: async () => client,
    approvalRegistry: createWorkerApprovalRegistry(),
    writeState: createWorkerWriteHandlerState(),
    projectId: "local-project",
    projectName: allowedProjectRoot.split("/").at(-1) ?? "project",
  };
}

class FakeClient implements WorkerControlAppServerClient {
  startThreadCalls = 0;
  startTurnCalls = 0;
  interruptTurnCalls = 0;
  steerTurnCalls = 0;
  approvalResponses: Array<{ requestId: string | number; result: unknown }> = [];
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

  async startThread(): Promise<v2.ThreadStartResponse> {
    this.startThreadCalls += 1;
    return { thread: createThread({ cwd: this.cwd, id: "thread-started", turns: [] }) } as v2.ThreadStartResponse;
  }

  async startTurn(): Promise<v2.TurnStartResponse> {
    this.startTurnCalls += 1;
    return { turn: createTurn({ id: "turn-started", status: "inProgress" }) };
  }

  async interruptTurn(): Promise<v2.TurnInterruptResponse> {
    this.interruptTurnCalls += 1;
    return {};
  }

  async steerTurn(): Promise<v2.TurnSteerResponse> {
    this.steerTurnCalls += 1;
    return { turnId: "turn-123" };
  }

  async sendApprovalResponse(params: { requestId: string | number; result: unknown }): Promise<void> {
    this.approvalResponses.push(params);
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
