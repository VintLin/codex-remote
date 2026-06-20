import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { FollowUpInput, StartConversationInput } from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { WorkerHttpError, toErrorEnvelope } from "./errors.ts";
import {
  createWorkerWriteHandlerState,
  followUpConversation,
  startConversation,
  type WorkerWriteAppServerClient,
  type WorkerWriteHandlerContext,
} from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

test("worker write handlers when starting a conversation, should map public input to thread/start then turn/start", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-started", turns: [] })],
    startTurnResponse: { turn: createTurn({ id: "turn-started", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);
  const input: StartConversationInput = {
    projectId: "local-project",
    message: "Run the focused checks",
    clientRequestId: "client-start-1",
  };

  const accepted = await startConversation(context, input);

  assert.deepEqual(client.startThreadCalls, [{ cwd: paths.allowedRoot }]);
  assert.deepEqual(client.startTurnCalls, [
    {
      threadId: "thread-started",
      clientUserMessageId: "client-start-1",
      cwd: paths.allowedRoot,
      input: [{ type: "text", text: "Run the focused checks", text_elements: [] }],
    },
  ]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-started");
  assert.equal(accepted.turnId, "turn-started");
});

test("worker write handlers when starting a conversation, should initialize session before business rpc", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-started", turns: [] })],
    startTurnResponse: { turn: createTurn({ id: "turn-started", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);

  await startConversation(context, {
    projectId: "local-project",
    message: "Start after handshake",
    clientRequestId: "client-start-readyz-1",
  });

  assert.deepEqual(client.callOrder.slice(0, 3), ["readyz", "startThread", "startTurn"]);
});

test("worker write handlers when starting with project basename, should reject before app-server write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-started", turns: [] })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startConversation(context, {
      projectId: basename(paths.allowedRoot),
      message: "Do not accept basename identity",
      clientRequestId: "client-start-basename-1",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 403 && error.code === "project_forbidden",
  );
  assert.equal(client.startThreadCalls.length, 0);
  assert.equal(client.startTurnCalls.length, 0);
});

test("worker write handlers when following up, should prove conversation is allowed before turn/start", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnResponse: { turn: createTurn({ id: "turn-follow-up", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);
  const input: FollowUpInput = {
    message: "Continue with the next small slice",
    clientRequestId: "client-follow-up-1",
    expectedConversationId: "thread-1",
  };

  const accepted = await followUpConversation(context, "thread-1", input);

  assert.equal(client.startTurnCalls.length, 1);
  assert.deepEqual(client.listCalls, []);
  assert.deepEqual(client.readCalls, [{ threadId: "thread-1", includeTurns: true }]);
  assert.deepEqual(client.startTurnCalls, [
    {
      threadId: "thread-1",
      clientUserMessageId: "client-follow-up-1",
      input: [{ type: "text", text: "Continue with the next small slice", text_elements: [] }],
    },
  ]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-1");
  assert.equal(accepted.turnId, "turn-follow-up");
});

test("worker write handlers when following up, should initialize session before allowlist and business rpc", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnResponse: { turn: createTurn({ id: "turn-follow-up", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);

  await followUpConversation(context, "thread-1", {
    message: "Continue after handshake",
    clientRequestId: "client-follow-up-readyz-1",
    expectedConversationId: "thread-1",
  });

  assert.deepEqual(client.callOrder.slice(0, 3), ["readyz", "readThread", "startTurn"]);
});

test("worker write handlers when session initialization times out, should fail closed before business rpc", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    readyzError: new Error("app_server_request_timeout"),
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-started", turns: [] })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startConversation(context, {
      projectId: "local-project",
      message: "Start after handshake",
      clientRequestId: "client-start-readyz-timeout-1",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 408 && error.code === "app_server_timeout",
  );
  assert.deepEqual(client.startThreadCalls, []);
  assert.deepEqual(client.startTurnCalls, []);
  assert.deepEqual(client.callOrder, ["readyz", "close"]);
  assert.equal(client.closed, true);
});

test("worker write handlers when specific conversation is absent from aggregate list, should still allow follow-up after read proof", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-started" })],
    startTurnResponse: { turn: createTurn({ id: "turn-page-2", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);

  const accepted = await followUpConversation(context, "thread-started", {
    message: "Continue after start",
    clientRequestId: "client-page-2",
    expectedConversationId: "thread-started",
  });

  assert.equal(accepted.turnId, "turn-page-2");
  assert.deepEqual(client.listCalls, []);
  assert.deepEqual(client.readCalls, [{ threadId: "thread-started", includeTurns: true }]);
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when follow-up conversation is absent from allowlist, should not start turn", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "other-thread" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    followUpConversation(context, "missing-thread", {
      message: "Continue safely",
      clientRequestId: "client-missing-1",
      expectedConversationId: "missing-thread",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );
  assert.deepEqual(client.startTurnCalls, []);
});

test("worker write handlers when follow-up thread escapes allowed root, should not start turn", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.outside, id: "thread-escape" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    followUpConversation(context, "thread-escape", {
      message: "Continue safely",
      clientRequestId: "client-escape-1",
      expectedConversationId: "thread-escape",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );
  assert.deepEqual(client.startTurnCalls, []);
});

test("worker write handlers when input guard is invalid, should fail closed before app-server write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    followUpConversation(context, "thread-1", {
      message: "Continue",
      clientRequestId: "client-follow-up-2",
      expectedConversationId: "different-thread",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 409 && error.code === "invalid_request",
  );
  await assert.rejects(
    followUpConversation(context, "thread-1", {
      message: "Continue",
      clientRequestId: "",
    } as FollowUpInput),
    (error) => error instanceof WorkerHttpError && error.status === 400 && error.code === "invalid_request",
  );
  assert.deepEqual(client.startTurnCalls, []);
});

test("worker write handlers when start idempotency key is repeated, should return the first accepted response", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-start-once", turns: [] })],
    startTurnResponse: { turn: createTurn({ id: "turn-start-once", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);
  const input: StartConversationInput = {
    projectId: "local-project",
    message: "Start once",
    clientRequestId: "client-start-repeat-1",
  };

  const first = await startConversation(context, input);
  const second = await startConversation(context, input);

  assert.deepEqual(second, first);
  assert.equal(client.startThreadCalls.length, 1);
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when start idempotency key has a different fingerprint, should reject without another write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-start-once", turns: [] })],
    startTurnResponse: { turn: createTurn({ id: "turn-start-once", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);

  await startConversation(context, {
    projectId: "local-project",
    message: "Start first",
    clientRequestId: "client-start-conflict-1",
  });
  await assert.rejects(
    startConversation(context, {
      projectId: "local-project",
      message: "Start changed",
      clientRequestId: "client-start-conflict-1",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 409 && error.code === "invalid_request",
  );
  assert.equal(client.startThreadCalls.length, 1);
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when idempotency key is repeated, should return the first accepted response", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnResponse: { turn: createTurn({ id: "turn-once", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);
  const input: FollowUpInput = {
    message: "Repeat-safe message",
    clientRequestId: "client-repeat-1",
    expectedConversationId: "thread-1",
  };

  const first = await followUpConversation(context, "thread-1", input);
  const second = await followUpConversation(context, "thread-1", input);

  assert.deepEqual(second, first);
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when idempotency key has a different fingerprint, should reject without another write", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnResponse: { turn: createTurn({ id: "turn-once", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);

  await followUpConversation(context, "thread-1", {
    message: "First message",
    clientRequestId: "client-conflict-1",
    expectedConversationId: "thread-1",
  });
  await assert.rejects(
    followUpConversation(context, "thread-1", {
      message: "Changed message",
      clientRequestId: "client-conflict-1",
      expectedConversationId: "thread-1",
    }),
    (error) => error instanceof WorkerHttpError && error.status === 409 && error.code === "invalid_request",
  );
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when idempotency cache exceeds its bound, should evict oldest accepted command", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnResponse: { turn: createTurn({ id: "turn-bounded", status: "inProgress" }) },
  });
  const context = createContext(paths.allowedRoot, client);
  context.writeState.maxAcceptedCommands = 2;

  await followUpConversation(context, "thread-1", {
    message: "First",
    clientRequestId: "client-bound-1",
    expectedConversationId: "thread-1",
  });
  await followUpConversation(context, "thread-1", {
    message: "Second",
    clientRequestId: "client-bound-2",
    expectedConversationId: "thread-1",
  });
  await followUpConversation(context, "thread-1", {
    message: "Third",
    clientRequestId: "client-bound-3",
    expectedConversationId: "thread-1",
  });
  await followUpConversation(context, "thread-1", {
    message: "First",
    clientRequestId: "client-bound-1",
    expectedConversationId: "thread-1",
  });

  assert.equal(context.writeState.acceptedCommands.size, 2);
  assert.equal(client.startTurnCalls.length, 4);
});

test("worker write handlers when app-server write fails, should map to sanitized ErrorEnvelope", async () => {
  const paths = await createTempProjectPaths();
  const privateMessage = "LEAK_USER_MESSAGE";
  const leakMarkers = [
    "ws://127.0.0.1:4321",
    "example-token",
    privateMessage,
    paths.allowedRoot,
    paths.allowedChild,
    "LEAK_PROMPT",
    "LEAK_COMMAND_OUTPUT",
    "LEAK_FULL_DIFF",
    "stack",
    "cause",
  ];
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
    startTurnError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    followUpConversation(context, "thread-1", {
      message: privateMessage,
      clientRequestId: "client-error-1",
      expectedConversationId: "thread-1",
    }),
    (error) => {
      if (!(error instanceof WorkerHttpError)) {
        return false;
      }
      const serialized = JSON.stringify(toErrorEnvelope(error, "req-write-error"));
      for (const marker of leakMarkers) {
        assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      return error.status === 500 && error.code === "worker_internal_error";
    },
  );
  assert.equal(client.startTurnCalls.length, 1);
});

test("worker write handlers when app-server start fails, should not leak message or local paths", async () => {
  const paths = await createTempProjectPaths();
  const privateMessage = "LEAK_START_MESSAGE";
  const leakMarkers = [
    privateMessage,
    paths.allowedRoot,
    "ws://127.0.0.1:4321",
    "example-token",
    "stack",
  ];
  const client = new FakeWriteClient({
    threads: [createThread({ cwd: paths.allowedRoot, id: "thread-start-fail", turns: [] })],
    startThreadError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startConversation(context, {
      projectId: "local-project",
      message: privateMessage,
      clientRequestId: "client-start-error-1",
    }),
    (error) => {
      if (!(error instanceof WorkerHttpError)) {
        return false;
      }
      const serialized = JSON.stringify(toErrorEnvelope(error, "req-start-error"));
      for (const marker of leakMarkers) {
        assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      return error.status === 500 && error.code === "worker_internal_error";
    },
  );
  assert.equal(client.startThreadCalls.length, 1);
  assert.equal(client.startTurnCalls.length, 0);
});

class FakeWriteClient implements WorkerWriteAppServerClient {
  closed = false;
  readonly callOrder: string[] = [];
  readonly listCalls: Parameters<WorkerWriteAppServerClient["listThreads"]>[0][] = [];
  readonly readCalls: Parameters<WorkerWriteAppServerClient["readThread"]>[0][] = [];
  readonly startThreadCalls: Partial<v2.ThreadStartParams>[] = [];
  readonly startTurnCalls: Partial<v2.TurnStartParams>[] = [];
  private readonly threads: v2.Thread[];
  private readonly listResponses: v2.ThreadListResponse[] | null;
  private readonly readyzError: Error | null;
  private readonly startThreadError: Error | null;
  private readonly startTurnError: Error | null;
  private readonly startTurnResponse: v2.TurnStartResponse;

  constructor(options: {
    threads?: v2.Thread[];
    listResponses?: v2.ThreadListResponse[];
    readyzError?: Error;
    startThreadError?: Error;
    startTurnError?: Error;
    startTurnResponse?: v2.TurnStartResponse;
  } = {}) {
    this.threads = options.threads ?? [];
    this.listResponses = options.listResponses ?? null;
    this.readyzError = options.readyzError ?? null;
    this.startThreadError = options.startThreadError ?? null;
    this.startTurnError = options.startTurnError ?? null;
    this.startTurnResponse = options.startTurnResponse ?? { turn: createTurn({ id: "turn-started" }) };
  }

  async readyz(): Promise<void> {
    this.callOrder.push("readyz");
    if (this.readyzError) {
      throw this.readyzError;
    }
  }

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(params: Parameters<WorkerWriteAppServerClient["listThreads"]>[0]): Promise<v2.ThreadListResponse> {
    this.callOrder.push("listThreads");
    this.listCalls.push(params);
    if (this.listResponses) {
      const response = this.listResponses[Math.min(this.listCalls.length - 1, this.listResponses.length - 1)];
      assert.ok(response);
      return response;
    }

    return { data: this.threads, nextCursor: null, backwardsCursor: null };
  }

  async readThread(params: Parameters<WorkerWriteAppServerClient["readThread"]>[0]): Promise<v2.ThreadReadResponse> {
    this.callOrder.push("readThread");
    this.readCalls.push(params);
    const thread = this.threads.find((candidate) => candidate.id === params.threadId);
    if (!thread) {
      throw new Error("missing_fake_read_response");
    }
    return { thread };
  }

  async startThread(params: v2.ThreadStartParams): Promise<v2.ThreadStartResponse> {
    this.callOrder.push("startThread");
    this.startThreadCalls.push(selectThreadStartCall(params));
    if (this.startThreadError) {
      throw this.startThreadError;
    }
    return { thread: this.threads[0] ?? createThread({ id: "thread-started", turns: [] }) } as v2.ThreadStartResponse;
  }

  async startTurn(params: v2.TurnStartParams): Promise<v2.TurnStartResponse> {
    this.callOrder.push("startTurn");
    this.startTurnCalls.push(selectTurnStartCall(params));
    if (this.startTurnError) {
      throw this.startTurnError;
    }
    return this.startTurnResponse;
  }

  close(): void {
    this.callOrder.push("close");
    this.closed = true;
  }
}

function selectThreadStartCall(params: v2.ThreadStartParams): Partial<v2.ThreadStartParams> {
  return params.cwd === undefined ? {} : { cwd: params.cwd };
}

function selectTurnStartCall(params: v2.TurnStartParams): Partial<v2.TurnStartParams> {
  return {
    threadId: params.threadId,
    ...(params.clientUserMessageId === undefined ? {} : { clientUserMessageId: params.clientUserMessageId }),
    ...(params.cwd ? { cwd: params.cwd } : {}),
    input: params.input,
  };
}

async function createTempProjectPaths(): Promise<{
  allowedRoot: string;
  allowedChild: string;
  outside: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "worker-write-handlers-"));
  const allowedRoot = join(root, "allowed");
  const allowedChild = join(allowedRoot, "child");
  const outside = join(root, "outside");
  await Promise.all([
    mkdir(allowedChild, { recursive: true }),
    mkdir(outside, { recursive: true }),
  ]);
  return { allowedRoot, allowedChild, outside };
}

function createContext(allowedProjectRoot: string, client: WorkerWriteAppServerClient): WorkerWriteHandlerContext {
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
    writeState: createWorkerWriteHandlerState(),
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
