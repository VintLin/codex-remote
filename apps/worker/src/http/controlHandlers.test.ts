import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { ApprovalDecisionInput, InterruptTurnInput, SteerTurnInput } from "@codex-remote/api-contract";
import type { ServerRequest, v2 } from "@codex-remote/codex-protocol";

import { toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import { createWorkerApprovalRegistry } from "./approvalRegistry.ts";
import {
  archiveConversation,
  decideApproval,
  interruptTurn,
  listApprovals,
  openConversation,
  renameConversation,
  steerTurn,
  unarchiveConversation,
  type WorkerControlAppServerClient,
  type WorkerControlHandlerContext,
} from "./controlHandlers.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

test("worker control handlers when interrupting, should prove conversation is allowed before app-server control", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  const accepted = await interruptTurn(context, "thread-1", "turn-1", {
    clientRequestId: "client-interrupt-1",
    expectedTurnId: "turn-1",
  });

  assert.deepEqual(client.listCalls, []);
  assert.deepEqual(client.readCalls, [{ threadId: "thread-1", includeTurns: true }]);
  assert.deepEqual(client.callOrder.slice(0, 3), ["readyz", "readThread", "interruptTurn"]);
  assert.deepEqual(client.interruptTurnCalls, [{ threadId: "thread-1", turnId: "turn-1" }]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-1");
  assert.equal(accepted.turnId, "turn-1");
});

test("worker control handlers when opening a conversation, should prove ownership before resume and return lifecycle result", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1", status: { type: "active", activeFlags: [] } })],
    loadedResponses: [{ data: ["thread-1"], nextCursor: null }],
  });
  const context = createContext(paths.allowedRoot, client);

  const result = await openConversation(context, "thread-1", { clientRequestId: "client-open-1" });

  assert.deepEqual(client.callOrder.slice(0, 4), ["readyz", "readThread", "resumeThread", "listLoadedThreads"]);
  assert.deepEqual(client.resumeThreadCalls, [{ threadId: "thread-1" }]);
  assert.equal(result.conversation.id, "thread-1");
  assert.equal(result.conversation.loaded, true);
  assert.equal(result.conversation.live, true);
  assert.equal(result.timeline.loaded, true);
  assert.equal(result.timeline.live, true);
  assert.ok(result.timeline.events);
  assert.equal(result.timeline.events.at(-1)?.kind, "thread_opened");
});

test("worker control handlers when archiving, unarchiving, or renaming, should prove ownership before app-server write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await archiveConversation(context, "thread-1", { clientRequestId: "client-archive-1" });
  await unarchiveConversation(context, "thread-1", { clientRequestId: "client-unarchive-1" });
  await renameConversation(context, "thread-1", { title: "  New title  ", clientRequestId: "client-rename-1" });

  assert.deepEqual(client.callOrder.filter((call) => call === "readThread").length, 5);
  assert.deepEqual(client.archiveThreadCalls, [{ threadId: "thread-1" }]);
  assert.deepEqual(client.unarchiveThreadCalls, [{ threadId: "thread-1" }]);
  assert.deepEqual(client.setThreadNameCalls, [{ threadId: "thread-1", name: "New title" }]);
});

test("worker control handlers when archive or rename write completes, should read fresh thread before projecting", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [
      createThread({ cwd: paths.allowedChild, id: "thread-1", name: "Old title" }),
      createThread({ cwd: paths.allowedChild, id: "thread-1", name: "Archived title from read-after-write" }),
      createThread({ cwd: paths.allowedChild, id: "thread-1", name: "Old title" }),
      createThread({ cwd: paths.allowedChild, id: "thread-1", name: "New title" }),
    ],
  });
  const context = createContext(paths.allowedRoot, client);

  const archived = await archiveConversation(context, "thread-1", { clientRequestId: "client-archive-fresh" });
  const renamed = await renameConversation(context, "thread-1", {
    title: "  New title  ",
    clientRequestId: "client-rename-fresh",
  });

  assert.deepEqual(client.callOrder, [
    "readyz",
    "readThread",
    "archiveThread",
    "readThread",
    "listLoadedThreads",
    "readyz",
    "readThread",
    "setThreadName",
    "readThread",
    "listLoadedThreads",
  ]);
  assert.equal(archived.conversation.archived, true);
  assert.equal(archived.conversation.title, "Archived title from read-after-write");
  assert.equal(renamed.conversation.title, "New title");
});

test("worker control handlers when rename title is blank or overlong, should reject before app-server write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    renameConversation(context, "thread-1", { title: "   ", clientRequestId: "client-rename-blank" }),
    (error) =>
      error instanceof WorkerHttpError &&
      error.status === 400 &&
      error.code === "invalid_request" &&
      error.details?.field === "title",
  );
  await assert.rejects(
    renameConversation(context, "thread-1", { title: "x".repeat(121), clientRequestId: "client-rename-long" }),
    (error) =>
      error instanceof WorkerHttpError &&
      error.status === 400 &&
      error.code === "invalid_request" &&
      error.details?.field === "title",
  );
  assert.deepEqual(client.setThreadNameCalls, []);
});

test("worker control handlers when interrupt expected turn mismatches path turn, should fail before app-server control", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    interruptTurn(context, "thread-1", "turn-1", {
      clientRequestId: "client-interrupt-mismatch",
      expectedTurnId: "turn-other",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 409 && error.code === "invalid_request",
  );
  assert.deepEqual(client.listCalls, []);
  assert.deepEqual(client.interruptTurnCalls, []);
});

test("worker control handlers when steering, should map to turn/steer with one text input and expected turn", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  const accepted = await steerTurn(context, "thread-1", "turn-1", {
    message: "Adjust the active turn",
    clientRequestId: "client-steer-1",
    expectedTurnId: "turn-1",
  });

  assert.deepEqual(client.steerTurnCalls, [
    {
      threadId: "thread-1",
      clientUserMessageId: "client-steer-1",
      expectedTurnId: "turn-1",
      input: [{ type: "text", text: "Adjust the active turn", text_elements: [] }],
    },
  ]);
  assert.deepEqual(client.callOrder.slice(0, 3), ["readyz", "readThread", "steerTurn"]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-1");
  assert.equal(accepted.turnId, "turn-1");
});

test("worker control handlers when steer app-server call fails, should return sanitized failure with no prompt echo", async () => {
  const paths = await createTempProjectPaths();
  const privatePrompt = "LEAK_STEER_PROMPT";
  const leakMarkers = [
    privatePrompt,
    paths.allowedRoot,
    paths.allowedChild,
    "ws://127.0.0.1:4321",
    "example-token",
    "LEAK_COMMAND_OUTPUT",
    "LEAK_FULL_DIFF",
    "stack",
    "cause",
  ];
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    steerTurnError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    steerTurn(context, "thread-1", "turn-1", {
      message: privatePrompt,
      clientRequestId: "client-steer-error",
      expectedTurnId: "turn-1",
    }),
    (error) => {
      if (!(error instanceof WorkerHttpError)) {
        return false;
      }
      const serialized = JSON.stringify(toErrorEnvelope(error, "req-steer-error"));
      for (const marker of leakMarkers) {
        assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      return error.status === 500 && error.code === "worker_internal_error";
    },
  );
  assert.equal(client.steerTurnCalls.length, 1);
});

test("worker control handlers when control idempotency key is repeated, should replay the first accepted response", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const input: InterruptTurnInput = {
    clientRequestId: "client-interrupt-repeat",
    expectedTurnId: "turn-1",
  };

  const first = await interruptTurn(context, "thread-1", "turn-1", input);
  const second = await interruptTurn(context, "thread-1", "turn-1", input);

  assert.deepEqual(second, first);
  assert.equal(client.interruptTurnCalls.length, 1);
});

test("worker control handlers when control idempotency key has different fingerprint, should reject without another app-server control", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await steerTurn(context, "thread-1", "turn-1", {
    message: "First steer",
    clientRequestId: "client-steer-conflict",
    expectedTurnId: "turn-1",
  });
  await assert.rejects(
    steerTurn(context, "thread-1", "turn-1", {
      message: "Changed steer",
      clientRequestId: "client-steer-conflict",
      expectedTurnId: "turn-1",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 409 && error.code === "invalid_request",
  );
  assert.equal(client.steerTurnCalls.length, 1);
});

test("worker control handlers when listing approvals, should return pending approvals scoped by conversation", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  seedCommandApproval(context);

  const approvals = await listApprovals(context, "thread-1");

  assert.deepEqual(approvals.map((approval) => approval.conversationId), ["thread-1"]);
  assert.deepEqual(client.listCalls, []);
  assert.deepEqual(client.readCalls, [{ threadId: "thread-1", includeTurns: true }]);
});

test("worker control handlers when deciding approval, should send the captured approval response and return CommandAccepted", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const pending = seedCommandApproval(context);
  const input: ApprovalDecisionInput = {
    decision: "accept",
    clientRequestId: "client-approval-accept",
    expectedConversationId: "thread-1",
    expectedTurnId: "turn-1",
    expectedApprovalRequestId: pending?.id ?? "approval-1",
  };

  const accepted = await decideApproval(context, "thread-1", input.expectedApprovalRequestId, input);

  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-1");
  assert.equal(accepted.turnId, "turn-1");
  assert.deepEqual(client.callOrder.slice(0, 3), ["readyz", "readThread", "sendApprovalResponse"]);
  assert.deepEqual(client.approvalResponses, [{ requestId: "jsonrpc-1", result: { decision: "accept" } }]);
  assert.deepEqual(await listApprovals(context, "thread-1"), []);
});

test("worker control handlers when deciding approval, should retain sanitized resolved approval for projection", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const pending = seedCommandApproval(context);
  assert.ok(pending);

  await decideApproval(context, "thread-1", pending.id, {
    decision: "decline",
    clientRequestId: "client-approval-decline",
    expectedConversationId: "thread-1",
    expectedTurnId: "turn-1",
    expectedApprovalRequestId: pending.id,
  });
  const opened = await openConversation(context, "thread-1", { clientRequestId: "client-open-after-approval" });
  const events = opened.timeline.events ?? [];

  assert.deepEqual(await listApprovals(context, "thread-1"), []);
  assert.equal(events.at(0)?.kind, "approval_resolved");
  assert.equal(events.at(0)?.approvalCard?.status, "resolved");
  assert.match(events.at(0)?.approvalCard?.resolvedAt ?? "", /^2026-06-20T10:00:/);
});

test("worker control handlers when approval response send fails, should keep pending approval for retry", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    approvalResponseError: new Error("app_server_connection_error"),
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const pending = seedCommandApproval(context);
  assert.ok(pending);

  await assert.rejects(
    decideApproval(context, "thread-1", pending.id, {
      decision: "accept",
      clientRequestId: "client-approval-send-fails",
      expectedConversationId: "thread-1",
      expectedTurnId: "turn-1",
      expectedApprovalRequestId: pending.id,
    }),
    (error) => error instanceof WorkerHttpError && error.code === "app_server_unavailable",
  );

  assert.deepEqual((await listApprovals(context, "thread-1")).map((approval) => approval.id), [pending.id]);
});

test("worker control handlers when listing approvals for a forbidden conversation, should fail before exposing registry entries", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.outsideRoot, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  seedCommandApproval(context);

  await assert.rejects(
    listApprovals(context, "thread-1"),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );
  assert.deepEqual(client.readCalls, [{ threadId: "thread-1", includeTurns: true }]);
  assert.deepEqual(client.interruptTurnCalls, []);
  assert.deepEqual(client.steerTurnCalls, []);
});

test("worker control handlers when deciding approval for a forbidden conversation, should fail before sending response", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeControlClient({
    threads: [createThread({ cwd: paths.outsideRoot, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const pending = seedCommandApproval(context);
  assert.ok(pending);

  await assert.rejects(
    decideApproval(context, "thread-1", pending.id, {
      decision: "accept",
      clientRequestId: "client-approval-forbidden",
      expectedConversationId: "thread-1",
      expectedTurnId: "turn-1",
      expectedApprovalRequestId: pending.id,
    }),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );
  assert.deepEqual(client.approvalResponses, []);
  assert.deepEqual(context.approvalRegistry.listPendingApprovals("thread-1").map((approval) => approval.id), [pending.id]);
});

class FakeControlClient implements WorkerControlAppServerClient {
  closed = false;
  readonly callOrder: string[] = [];
  readonly listCalls: Parameters<WorkerControlAppServerClient["listThreads"]>[0][] = [];
  readonly readCalls: Parameters<WorkerControlAppServerClient["readThread"]>[0][] = [];
  readonly interruptTurnCalls: v2.TurnInterruptParams[] = [];
  readonly steerTurnCalls: v2.TurnSteerParams[] = [];
  readonly resumeThreadCalls: v2.ThreadResumeParams[] = [];
  readonly archiveThreadCalls: v2.ThreadArchiveParams[] = [];
  readonly unarchiveThreadCalls: v2.ThreadUnarchiveParams[] = [];
  readonly setThreadNameCalls: v2.ThreadSetNameParams[] = [];
  readonly listLoadedThreadCalls: v2.ThreadLoadedListParams[] = [];
  readonly approvalResponses: Array<{ requestId: string | number; result: unknown }> = [];
  private readonly threads: v2.Thread[];
  private readonly loadedResponses: v2.ThreadLoadedListResponse[];
  private readonly interruptTurnError: Error | null;
  private readonly steerTurnError: Error | null;
  private readonly approvalResponseError: Error | null;

  constructor(options: {
    threads?: v2.Thread[];
    loadedResponses?: v2.ThreadLoadedListResponse[];
    approvalResponseError?: Error;
    interruptTurnError?: Error;
    steerTurnError?: Error;
  } = {}) {
    this.threads = options.threads ?? [];
    this.loadedResponses = options.loadedResponses ?? [{ data: [], nextCursor: null }];
    this.approvalResponseError = options.approvalResponseError ?? null;
    this.interruptTurnError = options.interruptTurnError ?? null;
    this.steerTurnError = options.steerTurnError ?? null;
  }

  async readyz(): Promise<void> {
    this.callOrder.push("readyz");
  }

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(params: Parameters<WorkerControlAppServerClient["listThreads"]>[0]): Promise<v2.ThreadListResponse> {
    this.callOrder.push("listThreads");
    this.listCalls.push(params);
    return { data: this.threads, nextCursor: null, backwardsCursor: null };
  }

  async readThread(params: Parameters<WorkerControlAppServerClient["readThread"]>[0]): Promise<v2.ThreadReadResponse> {
    this.callOrder.push("readThread");
    this.readCalls.push(params);
    const thread = this.threads[Math.min(this.readCalls.length - 1, this.threads.length - 1)];
    if (!thread) {
      throw new Error("missing_fake_read_response");
    }
    return { thread };
  }

  async startThread(): Promise<v2.ThreadStartResponse> {
    throw new Error("unexpected_start_thread");
  }

  async startTurn(): Promise<v2.TurnStartResponse> {
    throw new Error("unexpected_start_turn");
  }

  async resumeThread(params: v2.ThreadResumeParams): Promise<v2.ThreadResumeResponse> {
    this.callOrder.push("resumeThread");
    this.resumeThreadCalls.push(params);
    const thread = this.threads.find((candidate) => candidate.id === params.threadId) ?? this.threads[0];
    assert.ok(thread);
    return {
      thread,
      model: "gpt-5",
      modelProvider: "openai",
      serviceTier: null,
      cwd: thread.cwd,
      instructionSources: [],
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: { mode: "read-only" },
      reasoningEffort: null,
    } as unknown as v2.ThreadResumeResponse;
  }

  async archiveThread(params: v2.ThreadArchiveParams): Promise<v2.ThreadArchiveResponse> {
    this.callOrder.push("archiveThread");
    this.archiveThreadCalls.push(params);
    return {};
  }

  async unarchiveThread(params: v2.ThreadUnarchiveParams): Promise<v2.ThreadUnarchiveResponse> {
    this.callOrder.push("unarchiveThread");
    this.unarchiveThreadCalls.push(params);
    const thread = this.threads.find((candidate) => candidate.id === params.threadId) ?? this.threads[0];
    assert.ok(thread);
    return { thread };
  }

  async setThreadName(params: v2.ThreadSetNameParams): Promise<v2.ThreadSetNameResponse> {
    this.callOrder.push("setThreadName");
    this.setThreadNameCalls.push(params);
    return {};
  }

  async listLoadedThreads(params: v2.ThreadLoadedListParams): Promise<v2.ThreadLoadedListResponse> {
    this.callOrder.push("listLoadedThreads");
    this.listLoadedThreadCalls.push(params);
    return this.loadedResponses[Math.min(this.listLoadedThreadCalls.length - 1, this.loadedResponses.length - 1)] ?? {
      data: [],
      nextCursor: null,
    };
  }

  async interruptTurn(params: v2.TurnInterruptParams): Promise<unknown> {
    this.callOrder.push("interruptTurn");
    this.interruptTurnCalls.push(params);
    if (this.interruptTurnError) {
      throw this.interruptTurnError;
    }
    return {};
  }

  async steerTurn(params: v2.TurnSteerParams): Promise<unknown> {
    this.callOrder.push("steerTurn");
    this.steerTurnCalls.push(params);
    if (this.steerTurnError) {
      throw this.steerTurnError;
    }
    return { turnId: params.expectedTurnId };
  }

  async sendApprovalResponse(params: { requestId: string | number; result: unknown }): Promise<void> {
    this.callOrder.push("sendApprovalResponse");
    if (this.approvalResponseError) {
      throw this.approvalResponseError;
    }
    this.approvalResponses.push(params);
  }

  close(): void {
    this.closed = true;
  }
}

async function createTempProjectPaths(): Promise<{
  allowedRoot: string;
  allowedChild: string;
  outsideRoot: string;
}> {
  const allowedRoot = await mkdtemp(join(tmpdir(), "worker-control-handlers-"));
  const allowedChild = join(allowedRoot, "child");
  const outsideRoot = await mkdtemp(join(tmpdir(), "worker-control-outside-"));
  await mkdir(allowedChild, { recursive: true });
  return { allowedRoot, allowedChild, outsideRoot };
}

function createContext(allowedProjectRoot: string, client: WorkerControlAppServerClient): WorkerControlHandlerContext {
  const ticks = ["2026-06-20T10:00:00.000Z", "2026-06-20T10:00:01.000Z"];
  const now = () => ticks.shift() ?? "2026-06-20T10:00:01.000Z";

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
    approvalRegistry: createWorkerApprovalRegistry({ now }),
    now,
    openClient: async () => client,
    writeState: createWorkerWriteHandlerState(),
  };
}

function seedCommandApproval(context: WorkerControlHandlerContext) {
  return context.approvalRegistry.captureServerRequest(createCommandExecutionRequest("jsonrpc-1"));
}

function createCommandExecutionRequest(id: string): ServerRequest {
  return {
    id,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-command",
      startedAtMs: 1_718_791_200_000,
      command: "echo SECRET_TOKEN",
      cwd: "/Users/vint/private/project",
      reason: "needs approval",
    },
  };
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
    id: "turn-1",
    items: [],
    itemsView: "full",
    status: "inProgress",
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
    ...overrides,
  };
}
