import assert from "node:assert/strict";
import { mkdtemp, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import { WorkerHttpError } from "./errors.ts";
import {
  getCapabilities,
  getHealth,
  listConversations,
  readConversationTimeline,
  runProbe,
  type WorkerReadOnlyAppServerClient,
  type WorkerReadOnlyHandlerContext,
} from "./readOnlyHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

test("worker read-only handlers when listing conversations, should pass explicit params and filter by realpath", async () => {
  const paths = await createTempProjectPaths();
  const allowedThread = createThread({ cwd: paths.allowedChild, id: "allowed-thread", name: "Allowed" });
  const outsideThread = createThread({ cwd: paths.outside, id: "outside-thread", name: "Outside" });
  const symlinkEscapeThread = createThread({ cwd: paths.symlinkEscape, id: "symlink-escape-thread", name: "Symlink" });
  const client = new FakeClient({
    listResponses: [{ data: [allowedThread, outsideThread, symlinkEscapeThread], nextCursor: null, backwardsCursor: null }],
  });

  const conversations = await listConversations(createContext(paths.allowedRoot, client));

  assert.deepEqual(client.listCalls, [
    {
      cwd: paths.allowedRoot,
      sourceKinds: ["cli", "vscode", "appServer"],
      archived: false,
      limit: 25,
      sortDirection: "desc",
      cursor: null,
    },
  ]);
  assert.deepEqual(
    conversations.map((conversation) => conversation.id),
    ["allowed-thread"],
  );
  assert.equal(client.closed, true);
});

test("worker read-only handlers when no allowed conversations exist, should return empty list", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listResponses: [{ data: [createThread({ cwd: paths.outside })], nextCursor: null, backwardsCursor: null }],
  });

  assert.deepEqual(await listConversations(createContext(paths.allowedRoot, client)), []);
  assert.equal(client.closed, true);
});

test("worker read-only handlers when reading timeline, should prove id before read and return metadata only", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listResponses: [
      {
        data: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
        nextCursor: null,
        backwardsCursor: null,
      },
    ],
    readResponses: {
      "thread-1": {
        thread: createThread({
          cwd: paths.allowedChild,
          id: "thread-1",
          turns: [
            createTurn({
              id: "turn-1",
              items: [{ prompt: "LEAK_PROMPT" }] as unknown as v2.Turn["items"],
            }),
          ],
        }),
      },
    },
  });
  const timeline = await readConversationTimeline(createContext(paths.allowedRoot, client), "thread-1");

  assert.deepEqual(client.readCalls, [{ threadId: "thread-1", includeTurns: true }]);
  assert.equal(timeline.conversationId, "thread-1");
  assert.equal(timeline.snapshotRevision, "thread-1:2026-06-19T10:00:01.000Z");
  assert.doesNotMatch(JSON.stringify(timeline), /LEAK_PROMPT/);
  assert.equal(client.closed, true);
});

test("worker read-only handlers when timeline id is absent from allowed list, should not read and should map not found", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listResponses: [{ data: [createThread({ cwd: paths.allowedChild, id: "other" })], nextCursor: null, backwardsCursor: null }],
  });

  await assert.rejects(
    readConversationTimeline(createContext(paths.allowedRoot, client), "missing"),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );
  assert.deepEqual(client.readCalls, []);
  assert.equal(client.closed, true);
});

test("worker read-only handlers when read result escapes root, should fail without leaking path", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listResponses: [{ data: [createThread({ cwd: paths.allowedChild, id: "thread-1" })], nextCursor: null, backwardsCursor: null }],
    readResponses: {
      "thread-1": { thread: createThread({ cwd: paths.outside, id: "thread-1" }) },
    },
  });

  await assert.rejects(
    readConversationTimeline(createContext(paths.allowedRoot, client), "thread-1"),
    (error) =>
      error instanceof WorkerHttpError &&
      error.status === 403 &&
      error.code === "project_forbidden" &&
      !JSON.stringify(error.details).includes(paths.outside),
  );
  assert.equal(client.closed, true);
});

test("worker read-only handlers when app-server fails, should map known failures and close client", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listError: new Error("app_server_request_timeout"),
  });

  await assert.rejects(
    listConversations(createContext(paths.allowedRoot, client)),
    (error) => error instanceof WorkerHttpError && error.status === 408 && error.code === "app_server_timeout",
  );
  assert.equal(client.closed, true);
});

test("worker read-only handlers when health and capabilities are requested, should return contract-shaped payloads", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient();
  const context = createContext(paths.allowedRoot, client);

  assert.equal((await getHealth(context)).status, "connected");
  assert.equal(getCapabilities(context).canReadTimeline, true);
  assert.equal(getCapabilities(context).appServerTransport, "loopbackWebSocket");
  assert.equal(client.closed, true);
});

test("worker read-only handlers when probe runs, should close client through probe lifecycle", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeClient({
    listResponses: [{ data: [createThread({ cwd: paths.allowedChild })], nextCursor: null, backwardsCursor: null }],
    readResponses: { "thread-123": { thread: createThread({ cwd: paths.allowedChild }) } },
  });

  const summary = await runProbe(createContext(paths.allowedRoot, client));

  assert.equal(summary.deviceId, "device-local");
  assert.equal(summary.appServer.transport, "loopbackWebSocket");
  assert.equal(summary.checks.find((check) => check.name === "model/list")?.failureType, "precondition_missing");
  assert.equal(client.closed, true);
});

test("worker read-only handlers when opening client fails, should map unavailable error", async () => {
  const paths = await createTempProjectPaths();
  const context = {
    ...createContext(paths.allowedRoot, new FakeClient()),
    openClient: async () => {
      throw new Error("app_server_connection_error");
    },
  };

  await assert.rejects(
    listConversations(context),
    (error) => error instanceof WorkerHttpError && error.status === 424 && error.code === "app_server_unavailable",
  );
  await assert.rejects(
    getHealth(context),
    (error) => error instanceof WorkerHttpError && error.status === 424 && error.code === "app_server_unavailable",
  );
});

class FakeClient implements WorkerReadOnlyAppServerClient {
  closed = false;
  readonly listCalls: Parameters<WorkerReadOnlyAppServerClient["listThreads"]>[0][] = [];
  readonly readCalls: Parameters<WorkerReadOnlyAppServerClient["readThread"]>[0][] = [];
  private readonly listResponses: v2.ThreadListResponse[];
  private readonly readResponses: Record<string, v2.ThreadReadResponse>;
  private readonly listError: Error | null;

  constructor(options: {
    listResponses?: v2.ThreadListResponse[];
    readResponses?: Record<string, v2.ThreadReadResponse>;
    listError?: Error;
  } = {}) {
    this.listResponses = options.listResponses ?? [{ data: [], nextCursor: null, backwardsCursor: null }];
    this.readResponses = options.readResponses ?? {};
    this.listError = options.listError ?? null;
  }

  async readyz(): Promise<void> {}

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(params: Parameters<WorkerReadOnlyAppServerClient["listThreads"]>[0]): Promise<v2.ThreadListResponse> {
    this.listCalls.push(params);
    if (this.listError) {
      throw this.listError;
    }

    const response = this.listResponses[Math.min(this.listCalls.length - 1, this.listResponses.length - 1)];
    assert.ok(response);
    return response;
  }

  async readThread(params: Parameters<WorkerReadOnlyAppServerClient["readThread"]>[0]): Promise<v2.ThreadReadResponse> {
    this.readCalls.push(params);
    const response = this.readResponses[params.threadId];
    if (!response) {
      throw new Error("missing_fake_read_response");
    }

    return response;
  }

  close(): void {
    this.closed = true;
  }
}

async function createTempProjectPaths(): Promise<{
  allowedRoot: string;
  allowedChild: string;
  outside: string;
  symlinkEscape: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "worker-handlers-"));
  const allowedRoot = join(root, "allowed");
  const allowedChild = join(allowedRoot, "child");
  const outside = join(root, "outside");

  await import("node:fs/promises").then(({ mkdir }) => Promise.all([mkdir(allowedChild, { recursive: true }), mkdir(outside)]));
  const symlinkEscape = join(allowedRoot, "escape");
  await symlink(outside, symlinkEscape);

  return { allowedRoot, allowedChild, outside, symlinkEscape };
}

function createContext(allowedProjectRoot: string, client: WorkerReadOnlyAppServerClient): WorkerReadOnlyHandlerContext {
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
