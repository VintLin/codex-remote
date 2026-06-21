import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";
import type { AppServerWorkerClient } from "../probe/appServerReadOnlyProbeClient.ts";
import { localReviewConfirmationText } from "../http/localActionHandlers.ts";
import { startReadOnlyHttpServer } from "./readOnlyHttpServerCli.ts";

test("read-only http server cli when config is invalid, should fail without binding", async () => {
  const writes = createWritable();
  let served = false;

  const exitCode = await startReadOnlyHttpServer({
    env: {},
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: () => {
      served = true;
      throw new Error("should_not_bind");
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(served, false);
  assert.match(writes.stderrText(), /worker_config_invalid/);
});

test("read-only http server cli when config is valid, should bind loopback and print safe startup line", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const servedOptions: Array<{ hostname: string | undefined; port: number | undefined }> = [];
  const token = "example-token";
  const appServerUrl = "ws://127.0.0.1:4321";

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: token,
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_REMOTE_HTTP_HOST: "127.0.0.1",
      CODEX_REMOTE_HTTP_PORT: "8877",
      CODEX_APP_SERVER_URL: appServerUrl,
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: (options) => {
      servedOptions.push({ hostname: options.hostname, port: options.port });
      return undefined as never;
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(servedOptions, [{ hostname: "127.0.0.1", port: 8877 }]);
  assert.match(writes.stdoutText(), /127\.0\.0\.1:8877/);
  assert.doesNotMatch(writes.stdoutText(), new RegExp(token));
  assert.doesNotMatch(writes.stdoutText(), /ws:\/\/127\.0\.0\.1:4321/);
  assert.equal(writes.stderrText(), "");
});

test("read-only http server cli should keep one Worker session open for approval observers", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const captured: { fetch?: (request: Request) => Promise<Response> | Response } = {};
  let openCount = 0;
  let closeCount = 0;

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: "example-token",
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_APP_SERVER_URL: "ws://127.0.0.1:4321",
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    openWorkerSession: async () => {
      openCount += 1;
      return {
        client: createFakeWorkerClient(),
        startedByWorker: false,
        close: () => {
          closeCount += 1;
        },
      };
    },
    serveHttp: (options) => {
      captured.fetch = (request) => options.fetch(request, undefined as never) as Promise<Response> | Response;
      return undefined as never;
    },
  });
  assert.equal(exitCode, 0);
  if (!captured.fetch) {
    throw new Error("fetch app was not captured");
  }

  for (let i = 0; i < 2; i += 1) {
    const response: Response = await captured.fetch(new Request("http://127.0.0.1:8787/v1/worker/health", {
      headers: { authorization: "Bearer example-token" },
    }));
    assert.equal(response.status, 200);
  }

  assert.equal(openCount, 1);
  assert.equal(closeCount, 0);
});

test("read-only http server cli when local workbench route is requested, should forward stage 12 app-server methods", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const captured: { fetch?: (request: Request) => Promise<Response> | Response } = {};
  const methods: string[] = [];

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: "example-token",
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_APP_SERVER_URL: "ws://127.0.0.1:4321",
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    openWorkerSession: async () => ({
      client: createFakeWorkerClient({
        gitDiffToRemote: async () => {
          methods.push("gitDiffToRemote");
          return { sha: "abc123" as never, diff: "## main\n" };
        },
      }),
      startedByWorker: false,
      close: () => {},
    }),
    serveHttp: (options) => {
      captured.fetch = (request) => options.fetch(request, undefined as never) as Promise<Response> | Response;
      return undefined as never;
    },
  });

  assert.equal(exitCode, 0);
  if (!captured.fetch) {
    throw new Error("fetch app was not captured");
  }

  const response: Response = await captured.fetch(new Request("http://127.0.0.1:8787/v1/projects/local-project/local-workbench/git", {
    headers: { authorization: "Bearer example-token" },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(methods, ["gitDiffToRemote"]);
});

test("read-only http server cli when review-start route is requested, should forward fixed review-start method", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const projectChild = join(projectRoot, "child");
  await mkdir(projectChild);
  const writes = createWritable();
  const captured: { fetch?: (request: Request) => Promise<Response> | Response } = {};
  const startReviewCalls: unknown[] = [];

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: "example-token",
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_APP_SERVER_URL: "ws://127.0.0.1:4321",
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    openWorkerSession: async () => ({
      client: createFakeWorkerClient({
        readThread: async () => ({ thread: createThread({ cwd: projectChild }) }),
        startReview: async (params) => {
          startReviewCalls.push(params);
          return createReviewStartResponse();
        },
      }),
      startedByWorker: false,
      close: () => {},
    }),
    serveHttp: (options) => {
      captured.fetch = (request) => options.fetch(request, undefined as never) as Promise<Response> | Response;
      return undefined as never;
    },
  });

  assert.equal(exitCode, 0);
  if (!captured.fetch) {
    throw new Error("fetch app was not captured");
  }

  const response: Response = await captured.fetch(new Request("http://127.0.0.1:8787/v1/conversations/thread-123/local-actions/review-start", {
    method: "POST",
    headers: { authorization: "Bearer example-token", "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "local-project",
      expectedConversationId: "thread-123",
      clientRequestId: "client-review-cli-1",
      confirmationText: localReviewConfirmationText,
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.status, "accepted");
  assert.deepEqual(startReviewCalls, [
    {
      threadId: "thread-123",
      delivery: "inline",
      target: { type: "uncommittedChanges" },
    },
  ]);
});

test("read-only http server cli when server binding fails, should print sanitized internal error", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const token = "example-token";
  const appServerUrl = "ws://127.0.0.1:4321";

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: token,
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_APP_SERVER_URL: appServerUrl,
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: () => {
      throw new Error(`bind failed ${token} ${appServerUrl}`);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(writes.stderrText(), /worker_internal_error/);
  assert.doesNotMatch(writes.stderrText(), new RegExp(token));
  assert.doesNotMatch(writes.stderrText(), /ws:\/\/127\.0\.0\.1:4321/);
});


function createWritable(): {
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  stdoutText(): string;
  stderrText(): string;
} {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  return {
    stdout: {
      write(chunk: string): boolean {
        stdoutChunks.push(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk: string): boolean {
        stderrChunks.push(chunk);
        return true;
      },
    },
    stdoutText: () => stdoutChunks.join(""),
    stderrText: () => stderrChunks.join(""),
  };
}

function createFakeWorkerClient(overrides: Partial<AppServerWorkerClient> = {}): AppServerWorkerClient {
  return {
    readyz: async () => {},
    initialize: async () => {},
    initialized: async () => {},
    getCodexVersion: () => null,
    listThreads: async () => [],
    listThreadsWithParams: async () => ({ data: [], nextCursor: null, backwardsCursor: null }),
    readFirstAllowedThread: async () => ({}),
    readThread: async () => {
      throw new Error("unexpected_read_thread");
    },
    startThread: async () => {
      throw new Error("unexpected_start_thread");
    },
    startTurn: async () => {
      throw new Error("unexpected_start_turn");
    },
    interruptTurn: async () => ({}),
    steerTurn: async () => ({ turnId: "turn-1" }),
    startReview: async () => createReviewStartResponse(),
    gitDiffToRemote: async () => ({ sha: "abc123" as never, diff: "## main\n" }),
    fuzzyFileSearch: async () => ({ files: [] }),
    listMcpServerStatus: async () => ({ data: [], nextCursor: null }),
    listSkills: async () => ({ data: [] }),
    listHooks: async () => ({ data: [] }),
    listPlugins: async () => ({ marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] }),
    readPlugin: async () => {
      throw new Error("unexpected_read_plugin");
    },
    listApps: async () => ({ data: [], nextCursor: null }),
    sendApprovalResponse: async () => {},
    close: () => {},
    ...overrides,
  } as unknown as AppServerWorkerClient;
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
