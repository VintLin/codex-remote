import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { StartReviewInput } from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import {
  localReviewConfirmationText,
  startLocalReview,
  type WorkerLocalActionAppServerClient,
  type WorkerLocalActionHandlerContext,
} from "./localActionHandlers.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

test("worker local action handlers when confirmation is missing or wrong, should reject before app-server calls", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  for (const confirmationText of ["", "review", ` ${localReviewConfirmationText} `]) {
    await assert.rejects(
      startLocalReview(context, "thread-1", createInput({ confirmationText })),
      (error) =>
        error instanceof WorkerHttpError &&
        error.status === 400 &&
        error.code === "invalid_request" &&
        error.details?.field === "confirmationText",
    );
  }

  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.startReviewCalls, []);
});

test("worker local action handlers when expected conversation mismatches path, should reject before app-server calls", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient();
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startLocalReview(context, "thread-1", createInput({ expectedConversationId: "thread-other" })),
    (error) =>
      error instanceof WorkerHttpError &&
      error.status === 409 &&
      error.code === "invalid_request" &&
      error.details?.field === "expectedConversationId",
  );

  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.startReviewCalls, []);
});

test("worker local action handlers when project mismatches local project, should reject before app-server calls", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient();
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startLocalReview(context, "thread-1", createInput({ projectId: "project-other" })),
    (error) => error instanceof WorkerHttpError && error.status === 403 && error.code === "project_forbidden",
  );

  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.startReviewCalls, []);
});

test("worker local action handlers when conversation is forbidden, should reject before app-server review start", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient({
    threads: [createThread({ cwd: paths.outsideRoot, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startLocalReview(context, "thread-1", createInput()),
    (error) => error instanceof WorkerHttpError && error.status === 404 && error.code === "conversation_not_found",
  );

  assert.deepEqual(client.callOrder, ["readyz", "readThread"]);
  assert.deepEqual(client.startReviewCalls, []);
});

test("worker local action handlers when review starts, should call fixed uncommitted changes review target", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const input = {
    ...createInput(),
    target: { type: "baseBranch", baseBranch: "main" },
    baseBranch: "main",
    commit: "abc123",
    custom: "review this prompt",
  } as StartReviewInput;

  const accepted = await startLocalReview(context, "thread-1", input);

  assert.deepEqual(client.callOrder, ["readyz", "readThread", "startReview"]);
  assert.deepEqual(client.startReviewCalls, [
    {
      threadId: "thread-1",
      delivery: "inline",
      target: { type: "uncommittedChanges" },
    },
  ]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.conversationId, "thread-1");
  assert.equal(accepted.turnId, null);
});

test("worker local action handlers when called twice with same request, should not expose shell or command methods", async () => {
  const paths = await createTempProjectPaths();
  const client = new FakeLocalActionClient({
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);
  const input = createInput();

  const first = await startLocalReview(context, "thread-1", input);
  const second = await startLocalReview(context, "thread-1", input);

  assert.deepEqual(second, first);
  assert.equal(client.startReviewCalls.length, 1);
  assert.deepEqual(client.forbiddenMethodCalls, []);
});

test("worker local action handlers when upstream review start fails, should sanitize error envelope", async () => {
  const paths = await createTempProjectPaths();
  const leakMarkers = [
    "echo SECRET_COMMAND",
    "https://example.invalid/upstream",
    "ws://127.0.0.1:4321",
    "stack",
    "cause",
    paths.allowedRoot,
    paths.allowedChild,
    "@@ -1,1 +1,1 @@",
  ];
  const client = new FakeLocalActionClient({
    reviewStartError: new Error(leakMarkers.join(" ")),
    threads: [createThread({ cwd: paths.allowedChild, id: "thread-1" })],
  });
  const context = createContext(paths.allowedRoot, client);

  await assert.rejects(
    startLocalReview(context, "thread-1", createInput()),
    (error) => {
      if (!(error instanceof WorkerHttpError)) {
        return false;
      }

      const serialized = JSON.stringify(toErrorEnvelope(error, "req-review-start-error"));
      for (const marker of leakMarkers) {
        assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
      }
      return error.status === 500 && error.code === "worker_internal_error";
    },
  );
  assert.equal(client.startReviewCalls.length, 1);
});

class FakeLocalActionClient implements WorkerLocalActionAppServerClient {
  closed = false;
  readonly callOrder: string[] = [];
  readonly forbiddenMethodCalls: string[] = [];
  readonly readCalls: Parameters<WorkerLocalActionAppServerClient["readThread"]>[0][] = [];
  readonly startReviewCalls: v2.ReviewStartParams[] = [];
  private readonly reviewStartError: Error | null;
  private readonly threads: v2.Thread[];

  constructor(options: { reviewStartError?: Error; threads?: v2.Thread[] } = {}) {
    this.reviewStartError = options.reviewStartError ?? null;
    this.threads = options.threads ?? [];
  }

  async readyz(): Promise<void> {
    this.callOrder.push("readyz");
  }

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(): Promise<v2.ThreadListResponse> {
    this.forbiddenMethodCalls.push("thread/list");
    return { data: [], nextCursor: null, backwardsCursor: null };
  }

  async listLoadedThreads(): Promise<v2.ThreadLoadedListResponse> {
    this.forbiddenMethodCalls.push("thread/loaded/list");
    return { data: [], nextCursor: null };
  }

  async readThread(
    params: Parameters<WorkerLocalActionAppServerClient["readThread"]>[0],
  ): Promise<v2.ThreadReadResponse> {
    this.callOrder.push("readThread");
    this.readCalls.push(params);
    const thread = this.threads[Math.min(this.readCalls.length - 1, this.threads.length - 1)];
    if (!thread) {
      throw new Error("missing_fake_read_response");
    }
    return { thread };
  }

  async startReview(params: v2.ReviewStartParams): Promise<v2.ReviewStartResponse> {
    this.callOrder.push("startReview");
    this.startReviewCalls.push(params);
    if (this.reviewStartError) {
      throw this.reviewStartError;
    }
    return createReviewStartResponse();
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
  const allowedRoot = await mkdtemp(join(tmpdir(), "worker-local-actions-"));
  const allowedChild = join(allowedRoot, "child");
  const outsideRoot = await mkdtemp(join(tmpdir(), "worker-local-actions-outside-"));
  await mkdir(allowedChild, { recursive: true });
  return { allowedRoot, allowedChild, outsideRoot };
}

function createContext(
  allowedProjectRoot: string,
  client: WorkerLocalActionAppServerClient,
): WorkerLocalActionHandlerContext & { openClientCount(): number } {
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
    now: () => "2026-06-22T10:00:00.000Z",
    openClient: async () => {
      openClientCount += 1;
      return client;
    },
    openClientCount: () => openClientCount,
    writeState: createWorkerWriteHandlerState(),
  };
}

function createInput(overrides: Partial<StartReviewInput> = {}): StartReviewInput {
  return {
    projectId: "local-project",
    expectedConversationId: "thread-1",
    clientRequestId: "client-review-1",
    confirmationText: localReviewConfirmationText,
    ...overrides,
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
    turns: [],
    ...overrides,
  };
}

function createReviewStartResponse(): v2.ReviewStartResponse {
  return {
    reviewThreadId: "thread-123",
    turn: {
      id: "turn-review-1",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1_718_791_210,
      completedAt: null,
      durationMs: null,
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
