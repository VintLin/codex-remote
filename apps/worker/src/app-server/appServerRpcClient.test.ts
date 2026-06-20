import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLoopbackWebSocketUrl,
  toReadyzUrl,
} from "./appServerProcessService.ts";
import {
  AppServerRpcClient,
  connectAppServerRpcClient,
  createStdioSocketLike,
} from "./appServerRpcClient.ts";

class FakeSocket {
  public readonly sent: string[] = [];
  private handlers: {
    close: Array<() => void>;
    error: Array<() => void>;
    message: Array<(event: { data: unknown }) => void>;
    open: Array<() => void>;
  } = {
    close: [],
    message: [],
    open: [],
    error: [],
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

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

  emitError(): void {
    for (const handler of this.handlers.error) {
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

class CloseOnTimeoutSocket extends FakeSocket {
  public closeCalls = 0;

  override close(): void {
    this.closeCalls += 1;
    this.emitClose();
  }
}

class FakeStdioStream {
  public readonly writes: string[] = [];
  public destroyed = false;
  private readonly handlers: {
    close: Array<() => void>;
    data: Array<(chunk: Buffer | string) => void>;
    error: Array<() => void>;
  } = {
    close: [],
    data: [],
    error: [],
  };

  write(data: string): void {
    this.writes.push(data);
  }

  destroy(): void {
    this.destroyed = true;
    this.emitClose();
  }

  on(event: "close" | "data" | "error", handler: ((chunk: Buffer | string) => void) | (() => void)): this {
    if (event === "data") {
      this.handlers.data.push(handler as (chunk: Buffer | string) => void);
      return this;
    }

    this.handlers[event].push(handler as () => void);
    return this;
  }

  off(event: "close" | "data" | "error", handler: ((chunk: Buffer | string) => void) | (() => void)): this {
    if (event === "data") {
      this.handlers.data = this.handlers.data.filter((candidate) => candidate !== handler);
      return this;
    }

    this.handlers[event] = this.handlers[event].filter((candidate) => candidate !== handler);
    return this;
  }

  emitData(data: string): void {
    for (const handler of this.handlers.data) {
      handler(data);
    }
  }

  emitError(): void {
    for (const handler of this.handlers.error) {
      handler();
    }
  }

  emitClose(): void {
    for (const handler of this.handlers.close) {
      handler();
    }
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

test("when sending stage 4 write requests, should serialize generated app-server methods", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);

  const threadStart = client.request("thread/start", { cwd: "/repo/project" });
  assert.match(socket.sent[0] ?? "", /"method":"thread\/start"/);
  assert.match(socket.sent[0] ?? "", /"cwd":"\/repo\/project"/);
  socket.receive(JSON.stringify({ id: 1, result: { thread: { id: "thread-1" } } }));
  assert.deepEqual(await threadStart, { thread: { id: "thread-1" } });

  const turnStart = client.request("turn/start", {
    threadId: "thread-1",
    clientUserMessageId: "client-message-1",
    input: [{ type: "text", text: "Run tests", text_elements: [] }],
  });
  assert.match(socket.sent[1] ?? "", /"method":"turn\/start"/);
  assert.match(socket.sent[1] ?? "", /"threadId":"thread-1"/);
  socket.receive(JSON.stringify({ id: 2, result: { turn: { id: "turn-1" } } }));
  assert.deepEqual(await turnStart, { turn: { id: "turn-1" } });
});

test("when sending stage 5 control requests, should serialize generated app-server methods", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);

  const interrupt = client.request("turn/interrupt", {
    threadId: "thread-1",
    turnId: "turn-1",
  });
  assert.match(socket.sent[0] ?? "", /"method":"turn\/interrupt"/);
  assert.match(socket.sent[0] ?? "", /"threadId":"thread-1"/);
  assert.match(socket.sent[0] ?? "", /"turnId":"turn-1"/);
  socket.receive(JSON.stringify({ id: 1, result: {} }));
  assert.deepEqual(await interrupt, {});

  const steer = client.request("turn/steer", {
    threadId: "thread-1",
    clientUserMessageId: "client-message-1",
    expectedTurnId: "turn-1",
    input: [{ type: "text", text: "Adjust the active turn", text_elements: [] }],
  });
  assert.match(socket.sent[1] ?? "", /"method":"turn\/steer"/);
  assert.match(socket.sent[1] ?? "", /"expectedTurnId":"turn-1"/);
  assert.match(socket.sent[1] ?? "", /"clientUserMessageId":"client-message-1"/);
  socket.receive(JSON.stringify({ id: 2, result: { turnId: "turn-1" } }));
  assert.deepEqual(await steer, { turnId: "turn-1" });
});

test("when sending approval responses, should serialize a JSON-RPC result for the original server request id", () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);

  client.sendApprovalResponse({
    requestId: "server-request-1",
    result: { decision: "accept" },
  });

  assert.deepEqual(JSON.parse(socket.sent[0] ?? "{}"), {
    id: "server-request-1",
    result: { decision: "accept" },
  });
});

test("when receiving server requests and resolved notifications, should notify typed observers without resolving client requests", () => {
  const socket = new FakeSocket();
  const serverRequests: unknown[] = [];
  const resolvedNotifications: unknown[] = [];
  new AppServerRpcClient(socket, {
    onServerRequest: (request) => {
      serverRequests.push(request);
    },
    onServerRequestResolved: (notification) => {
      resolvedNotifications.push(notification);
    },
  });

  socket.receive(JSON.stringify({
    id: "server-request-1",
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-command",
      startedAtMs: 1_718_791_200_000,
    },
  }));
  socket.receive(JSON.stringify({
    method: "serverRequest/resolved",
    params: {
      threadId: "thread-1",
      requestId: "server-request-1",
    },
  }));

  assert.deepEqual(serverRequests, [
    {
      id: "server-request-1",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command",
        startedAtMs: 1_718_791_200_000,
      },
    },
  ]);
  assert.deepEqual(resolvedNotifications, [
    {
      threadId: "thread-1",
      requestId: "server-request-1",
    },
  ]);
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

test("when request stays pending past timeout, should reject with safe timeout kind", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket, { requestTimeoutMs: 10 });

  const response = client.request("model/list", {});

  await assert.rejects(response, /app_server_request_timeout/);
  assert.equal((client as unknown as { pending: Map<number, unknown> }).pending.size, 0);
});

test("when socket closes after open, should reject pending requests with a safe local error", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket, { requestTimeoutMs: 1_000 });
  const response = client.request("model/list", {});

  socket.emitClose();

  await assert.rejects(response, /app_server_connection_error/);
  assert.equal((client as unknown as { pending: Map<number, unknown> }).pending.size, 0);
});

test("when socket errors after open, should reject pending requests with a safe local error", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket, { requestTimeoutMs: 1_000 });
  const response = client.request("model/list", {});

  socket.emitError();

  await assert.rejects(response, /app_server_connection_error/);
  assert.equal((client as unknown as { pending: Map<number, unknown> }).pending.size, 0);
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

test("when stdio transport sends requests, should newline-delimit JSON frames", async () => {
  const stdin = new FakeStdioStream();
  const stdout = new FakeStdioStream();
  const socket = createStdioSocketLike({ stdin, stdout });
  const client = new AppServerRpcClient(socket);

  const response = client.request("model/list", {});

  assert.match(stdin.writes[0] ?? "", /"method":"model\/list"/);
  assert.equal(stdin.writes[0]?.endsWith("\n"), true);

  stdout.emitData(`${JSON.stringify({ id: 1, result: { data: [], nextCursor: null } })}\n`);

  assert.deepEqual(await response, { data: [], nextCursor: null });
});

test("when stdio transport receives split and multiple lines, should emit complete messages only", async () => {
  const stdin = new FakeStdioStream();
  const stdout = new FakeStdioStream();
  const socket = createStdioSocketLike({ stdin, stdout });
  const client = new AppServerRpcClient(socket);

  const first = client.request("model/list", {});
  const second = client.request("thread/list", {
    cwd: "/repo",
    sourceKinds: ["cli", "vscode", "appServer"],
    archived: false,
    limit: 25,
    sortDirection: "desc",
    cursor: null,
  });

  stdout.emitData('{"id":1,"result":{"data":["first"],');
  stdout.emitData('"nextCursor":null}}\n{"id":2,"result":{"data":[],"nextCursor":null,"backwardsCursor":null}}\n');

  assert.deepEqual(await first, { data: ["first"], nextCursor: null });
  assert.deepEqual(await second, { data: [], nextCursor: null, backwardsCursor: null });
});

test("when stdio transport receives invalid JSON, should reject pending requests safely", async () => {
  const stdin = new FakeStdioStream();
  const stdout = new FakeStdioStream();
  const socket = createStdioSocketLike({ stdin, stdout });
  const client = new AppServerRpcClient(socket, { requestTimeoutMs: 1_000 });

  const response = client.request("model/list", {});

  stdout.emitData("not-json\n");

  await assert.rejects(response, /app_server_protocol_error/);
});

test("when stdio transport closes, should reject pending requests safely", async () => {
  const stdin = new FakeStdioStream();
  const stdout = new FakeStdioStream();
  const socket = createStdioSocketLike({ stdin, stdout });
  const client = new AppServerRpcClient(socket, { requestTimeoutMs: 1_000 });

  const response = client.request("model/list", {});

  stdout.emitClose();

  await assert.rejects(response, /app_server_connection_error/);
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

test("when websocket connection never opens, should time out with a safe local error", async () => {
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

    await assert.rejects(connectAppServerRpcClient("ws://127.0.0.1:4319", { connectTimeoutMs: 10 }), /app_server_connection_timeout/);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});

test("when connect timeout closes the socket synchronously, should still report timeout", async () => {
  const originalWebSocket = globalThis.WebSocket;
  const socket = new CloseOnTimeoutSocket();

  class TestWebSocket extends FakeSocket {
    constructor() {
      super();
      return socket;
    }
  }

  try {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;

    await assert.rejects(
      connectAppServerRpcClient("ws://127.0.0.1:4320", { connectTimeoutMs: 10 }),
      /app_server_connection_timeout/,
    );
    assert.equal(socket.closeCalls, 1);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});
