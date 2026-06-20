import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { AppServerReadOnlyProbeClient } from "./appServerReadOnlyProbeClient.ts";

test("when readyz hangs, should abort with a safe timeout error", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("This operation was aborted", "AbortError"));
          },
          { once: true },
        );
      })) as typeof fetch;

    const client = new AppServerReadOnlyProbeClient(
      {
        close() {},
        notify() {},
        request: async () => {
          throw new Error("unexpected request");
        },
      } as never,
      "http://127.0.0.1:4317/readyz",
      "/repo/project",
      { readyzTimeoutMs: 10 },
    );

    await assert.rejects(client.readyz(), /app_server_request_timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("when readyz uses rpc mode, should initialize with generated client info and expose sanitized version", async () => {
  const requests: Array<{ method: string; params: unknown }> = [];
  const notifications: unknown[] = [];
  const client = new AppServerReadOnlyProbeClient(
    {
      close() {},
      notify(notification: unknown) {
        notifications.push(notification);
      },
      request: async (method: string, params: unknown) => {
        requests.push({ method, params });
        return {
          userAgent: "Codex/0.0.0 test",
          codexHome: "/private/path/that/must/not/be/projected",
          platformFamily: "unix",
          platformOs: "macos",
        };
      },
    } as never,
    "",
    "/repo/project",
    { readyzMode: "rpc" },
  );

  await client.readyz();
  await client.initialize();
  await client.initialized();

  assert.deepEqual(requests, [
    {
      method: "initialize",
      params: {
        clientInfo: {
          name: "codex-remote-worker",
          title: "Codex Remote Worker",
          version: "0.0.0",
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      },
    },
  ]);
  assert.deepEqual(notifications, [{ method: "initialized" }]);
  assert.equal(client.getCodexVersion(), "Codex/0.0.0 test");
});

test("when probing thread list, should follow cursors until completion and report sanitized evidence", async () => {
  const allowedRoot = await mkdtemp(join(tmpdir(), "codex-remote-probe-"));
  const requests: Array<{ method: string; params: { cursor?: string | null } }> = [];
  const client = new AppServerReadOnlyProbeClient(
    {
      close() {},
      notify() {},
      request: async (method: string, params: unknown) => {
        requests.push({ method, params: params as { cursor?: string | null } });
        return requests.length === 1
          ? {
              data: [{ id: "thread-1", cwd: allowedRoot }],
              nextCursor: "cursor-2",
              backwardsCursor: null,
            }
          : {
              data: [],
              nextCursor: null,
              backwardsCursor: null,
            };
      },
    } as never,
    "",
    allowedRoot,
  );

  assert.deepEqual(await client.listThreads(), {
    exactCwdListProven: true,
    completedUntilNextCursorNull: true,
    pageCount: 2,
    cursorCount: 1,
    count: 1,
  });
  assert.deepEqual(requests.map((request) => ({ method: request.method, cursor: request.params.cursor })), [
    { method: "thread/list", cursor: null },
    { method: "thread/list", cursor: "cursor-2" },
  ]);
});
