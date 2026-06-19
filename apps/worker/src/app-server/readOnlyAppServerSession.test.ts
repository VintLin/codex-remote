import assert from "node:assert/strict";
import test from "node:test";

import { openReadOnlyAppServerSession } from "./readOnlyAppServerSession.ts";

class FakeSocket {
  public closeCalls = 0;
  private readonly handlers: {
    close: Array<() => void>;
    error: Array<() => void>;
    message: Array<(event: { data: unknown }) => void>;
    open: Array<() => void>;
  } = {
    close: [],
    error: [],
    message: [],
    open: [],
  };

  send(data: string): void {
    const parsed = JSON.parse(data) as { id?: number; method?: string };

    if (parsed.id === 1 && parsed.method === "initialize") {
      this.receive(JSON.stringify({ id: 1, result: {} }));
    }
  }

  close(): void {
    this.closeCalls += 1;
    this.emitClose();
  }

  addEventListener(
    event: "message" | "open" | "error" | "close",
    handler: ((event: { data: unknown }) => void) | (() => void),
    _options?: AddEventListenerOptions,
  ): void {
    if (event === "message") {
      this.handlers.message.push(handler as (event: { data: unknown }) => void);
      return;
    }

    this.handlers[event].push(handler as () => void);
  }

  emitOpen(): void {
    for (const handler of this.handlers.open) {
      handler();
    }
  }

  emitClose(): void {
    for (const handler of this.handlers.close) {
      handler();
    }
  }

  receive(data: unknown): void {
    for (const handler of this.handlers.message) {
      handler({ data });
    }
  }
}

test("read-only app-server session: when configured url is not a loopback websocket root, should reject with a safe error kind", async () => {
  await assert.rejects(
    openReadOnlyAppServerSession({
      configuredUrl: "ws://localhost:4317",
      startAppServer: false,
      allowedProjectRoot: process.cwd(),
    }),
    /app_server_url_not_loopback/,
  );
});

test("read-only app-server session: when no configured url and startAppServer is false, should reject with a safe env-not-configured error", async () => {
  await assert.rejects(
    openReadOnlyAppServerSession({
      configuredUrl: null,
      startAppServer: false,
      allowedProjectRoot: process.cwd(),
    }),
    /app_server_env_not_configured/,
  );
});

test("read-only app-server session: when codex spawn fails, should map the error to app_server_spawn_failed", async () => {
  const originalPath = process.env.PATH;

  try {
    process.env.PATH = "";

    await assert.rejects(
      openReadOnlyAppServerSession({
        configuredUrl: null,
        startAppServer: true,
        allowedProjectRoot: process.cwd(),
      }),
      /app_server_spawn_failed/,
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test("read-only app-server session: when session close is called twice, should not throw and should close the socket once", async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const socket = new FakeSocket();

  class TestWebSocket extends FakeSocket {
    constructor(url: string) {
      super();
      assert.equal(url, "ws://127.0.0.1:4317/");
      queueMicrotask(() => {
        socket.emitOpen();
      });
      return socket;
    }
  }

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      assert.equal(String(input), "http://127.0.0.1:4317/readyz");
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;

    const session = await openReadOnlyAppServerSession({
      configuredUrl: "ws://127.0.0.1:4317",
      startAppServer: false,
      allowedProjectRoot: process.cwd(),
    });

    assert.equal(session.startedByWorker, false);
    session.close();
    session.close();

    assert.equal(socket.closeCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  }
});
