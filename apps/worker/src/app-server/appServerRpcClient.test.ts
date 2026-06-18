import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLoopbackWebSocketUrl,
  toReadyzUrl,
} from "./appServerProcessService.ts";
import {
  AppServerRpcClient,
  connectAppServerRpcClient,
} from "./appServerRpcClient.ts";

class FakeSocket {
  public readonly sent: string[] = [];
  private readonly handlers: {
    error: Array<() => void>;
    message: Array<(event: { data: unknown }) => void>;
    open: Array<() => void>;
  } = {
    message: [],
    open: [],
    error: [],
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  addEventListener(
    event: "message" | "open" | "error",
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

  emitError(): void {
    for (const handler of this.handlers.error) {
      handler();
    }
  }

  receive(data: unknown): void {
    for (const handler of this.handlers.message) {
      handler({ data });
    }
  }
}

class SyncResponseSocket extends FakeSocket {
  override send(data: string): void {
    super.send(data);
    this.receive(JSON.stringify({ id: 1, result: { data: ["sync"], nextCursor: null } }));
  }
}

class ThrowingSocket extends FakeSocket {
  override send(_data: string): void {
    throw new Error("raw socket failure");
  }
}

test("when sending a request, should resolve matching response id", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);
  const response = client.request("model/list", {});

  assert.match(socket.sent[0] ?? "", /"method":"model\/list"/);
  socket.receive(JSON.stringify({ id: 1, result: { data: [], nextCursor: null } }));

  assert.deepEqual(await response, { data: [], nextCursor: null });
});

test("when socket responds synchronously during send, should still resolve the request", async () => {
  const socket = new SyncResponseSocket();
  const client = new AppServerRpcClient(socket);
  const unresolved = Symbol("unresolved");
  const response = client.request("model/list", {});

  const result = await Promise.race([
    response,
    new Promise((resolve) => {
      setImmediate(() => {
        resolve(unresolved);
      });
    }),
  ]);

  assert.deepEqual(result, { data: ["sync"], nextCursor: null });
});

test("when response contains an upstream error, should reject with safe error kind", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);
  const response = client.request("model/list", {});

  socket.receive(
    JSON.stringify({
      id: 1,
      error: {
        code: 123,
        message: "sensitive upstream details",
      },
    }),
  );

  await assert.rejects(response, /app_server_protocol_error/);
});

test("when request send throws, should reject with safe error kind and clear pending entry", async () => {
  const socket = new ThrowingSocket();
  const client = new AppServerRpcClient(socket);

  const response = client.request("model/list", {});

  await assert.rejects(response, /app_server_connection_error/);
  assert.equal((client as unknown as { pending: Map<number, unknown> }).pending.size, 0);
});

test("when notify send throws, should throw a safe local error", () => {
  const socket = new ThrowingSocket();
  const client = new AppServerRpcClient(socket);

  assert.throws(
    () => {
      client.notify({ method: "initialized" });
    },
    /app_server_connection_error/,
  );
});

test("when url is not loopback websocket root, should reject it", () => {
  assert.equal(assertLoopbackWebSocketUrl("ws://127.0.0.1:4321"), "ws://127.0.0.1:4321/");
  assert.equal(toReadyzUrl("ws://127.0.0.1:4321"), "http://127.0.0.1:4321/readyz");

  assert.throws(() => assertLoopbackWebSocketUrl("ws://localhost:4321"), /app_server_url_not_loopback/);
  assert.throws(() => assertLoopbackWebSocketUrl("wss://127.0.0.1:4321"), /app_server_url_not_loopback/);
  assert.throws(() => assertLoopbackWebSocketUrl("ws://127.0.0.1:4321/path"), /app_server_url_not_loopback/);
  assert.throws(() => assertLoopbackWebSocketUrl("ws://127.0.0.1:4321?token=secret"), /app_server_url_not_loopback/);
  assert.throws(() => assertLoopbackWebSocketUrl("ws://user:pass@127.0.0.1:4321"), /app_server_url_not_loopback/);
});

test("when websocket connection opens, should return a client", async () => {
  const originalWebSocket = globalThis.WebSocket;
  const socket = new FakeSocket();

  class TestWebSocket extends FakeSocket {
    constructor(url: string) {
      super();
      assert.equal(url, "ws://127.0.0.1:4317/");
      return socket;
    }
  }

  try {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;

    const clientPromise = connectAppServerRpcClient("ws://127.0.0.1:4317");
    socket.emitOpen();
    const client = await clientPromise;

    assert.ok(client instanceof AppServerRpcClient);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});

test("when websocket connection fails, should reject with safe error kind", async () => {
  const originalWebSocket = globalThis.WebSocket;
  const socket = new FakeSocket();

  class TestWebSocket extends FakeSocket {
    constructor() {
      super();
      return socket;
    }
  }

  try {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;

    const clientPromise = connectAppServerRpcClient("ws://127.0.0.1:4318");
    socket.emitError();

    await assert.rejects(clientPromise, /app_server_connection_error/);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});
