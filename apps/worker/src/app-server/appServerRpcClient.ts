import type {
  ClientNotification,
  ClientRequest,
  ServerNotification,
  ServerRequest,
} from "@codex-remote/codex-protocol";

import {
  assertLoopbackWebSocketUrl,
  type StdioAppServerProcessHandle,
} from "./appServerProcessService.ts";

interface RpcResponse {
  id: string | number;
  result?: unknown;
  error?: unknown;
}

interface PendingRequest {
  timeout: ReturnType<typeof setTimeout>;
  reject(error: Error): void;
  resolve(value: unknown): void;
}

interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(
    event: "message",
    handler: (event: { data: unknown }) => void,
    options?: AddEventListenerOptions,
  ): void;
  addEventListener(event: "open", handler: () => void, options?: AddEventListenerOptions): void;
  addEventListener(event: "error", handler: () => void, options?: AddEventListenerOptions): void;
  addEventListener(event: "close", handler: () => void, options?: AddEventListenerOptions): void;
}

interface StdioReadableLike {
  on(event: "data", handler: (chunk: Buffer | string) => void): void;
  on(event: "error" | "close", handler: () => void): void;
  off?(event: "data", handler: (chunk: Buffer | string) => void): void;
  off?(event: "error" | "close", handler: () => void): void;
}

interface StdioWritableLike {
  write(data: string): void;
  destroy?(): void;
}

interface StdioSocketLikeOptions {
  stdin: StdioWritableLike;
  stdout: StdioReadableLike;
  onClose?(): void;
}

type WorkerAppServerMethod =
  | "app/list"
  | "account/read"
  | "config/read"
  | "experimentalFeature/list"
  | "fuzzyFileSearch"
  | "gitDiffToRemote"
  | "getAuthStatus"
  | "hooks/list"
  | "initialize"
  | "mcpServerStatus/list"
  | "model/list"
  | "modelProvider/capabilities/read"
  | "permissionProfile/list"
  | "plugin/list"
  | "plugin/read"
  | "review/start"
  | "skills/list"
  | "thread/archive"
  | "thread/loaded/list"
  | "thread/list"
  | "thread/name/set"
  | "thread/read"
  | "thread/resume"
  | "thread/start"
  | "thread/unarchive"
  | "turn/start"
  | "turn/interrupt"
  | "turn/steer"
  | "windowsSandbox/readiness";
type RpcClientErrorKind =
  | "app_server_connection_error"
  | "app_server_connection_timeout"
  | "app_server_protocol_error"
  | "app_server_request_timeout"
  | "app_server_websocket_unavailable";

interface ConnectAppServerRpcClientOptions {
  onServerRequest?(request: ServerRequest): void;
  onServerRequestResolved?(notification: Extract<ServerNotification, { method: "serverRequest/resolved" }>["params"]): void;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface AppServerRpcClientOptions {
  onServerRequest?(request: ServerRequest): void;
  onServerRequestResolved?(notification: Extract<ServerNotification, { method: "serverRequest/resolved" }>["params"]): void;
  requestTimeoutMs?: number;
}

function createRpcClientError(kind: RpcClientErrorKind): Error {
  return new Error(kind);
}

export async function connectAppServerRpcClient(
  url: string,
  options: ConnectAppServerRpcClientOptions = {},
): Promise<AppServerRpcClient> {
  const loopbackUrl = assertLoopbackWebSocketUrl(url);
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000;

  if (typeof WebSocket !== "function") {
    throw createRpcClientError("app_server_websocket_unavailable");
  }

  const socket = new WebSocket(loopbackUrl);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      settle(() => {
        try {
          socket.close();
        } catch {
          // Ignore local close failures while timing out connection setup.
        }
        reject(createRpcClientError("app_server_connection_timeout"));
      });
    }, connectTimeoutMs);

    socket.addEventListener(
      "open",
      () => {
        settle(resolve);
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        settle(() => {
          reject(createRpcClientError("app_server_connection_error"));
        });
      },
      { once: true },
    );
    socket.addEventListener(
      "close",
      () => {
        settle(() => {
          reject(createRpcClientError("app_server_connection_error"));
        });
      },
      { once: true },
    );
  });

  return new AppServerRpcClient(
    socket,
    {
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      ...(options.onServerRequest === undefined ? {} : { onServerRequest: options.onServerRequest }),
      ...(options.onServerRequestResolved === undefined ? {} : { onServerRequestResolved: options.onServerRequestResolved }),
    },
  );
}

export async function connectStdioAppServerRpcClient(
  handle: StdioAppServerProcessHandle,
  options: ConnectAppServerRpcClientOptions = {},
): Promise<AppServerRpcClient> {
  await handle.spawned;
  return new AppServerRpcClient(
    createStdioSocketLike({
      stdin: handle.child.stdin,
      stdout: handle.child.stdout,
      onClose: () => {
        handle.child.kill("SIGTERM");
      },
    }),
    {
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      ...(options.onServerRequest === undefined ? {} : { onServerRequest: options.onServerRequest }),
      ...(options.onServerRequestResolved === undefined ? {} : { onServerRequestResolved: options.onServerRequestResolved }),
    },
  );
}

export function createStdioSocketLike(options: StdioSocketLikeOptions): SocketLike {
  const handlers: {
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
  let buffer = "";
  let closed = false;

  const emitClose = () => {
    if (closed) {
      return;
    }

    closed = true;
    for (const handler of handlers.close) {
      handler();
    }
  };
  const emitError = () => {
    for (const handler of handlers.error) {
      handler();
    }
  };
  const emitMessage = (data: string) => {
    for (const handler of handlers.message) {
      handler({ data });
    }
  };

  options.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        emitMessage(line);
      }
    }
  });
  options.stdout.on("error", emitError);
  options.stdout.on("close", emitClose);

  queueMicrotask(() => {
    for (const handler of handlers.open) {
      handler();
    }
  });

  return {
    send(data: string): void {
      options.stdin.write(`${data}\n`);
    },
    close(): void {
      options.stdin.destroy?.();
      options.onClose?.();
      emitClose();
    },
    addEventListener(
      event: "message" | "open" | "error" | "close",
      handler: ((event: { data: unknown }) => void) | (() => void),
      _options?: AddEventListenerOptions,
    ): void {
      if (event === "message") {
        handlers.message.push(handler as (event: { data: unknown }) => void);
        return;
      }

      handlers[event].push(handler as () => void);
    },
  };
}

export class AppServerRpcClient {
  private nextId = 1;
  private readonly onServerRequest: ((request: ServerRequest) => void) | undefined;
  private readonly onServerRequestResolved:
    | ((notification: Extract<ServerNotification, { method: "serverRequest/resolved" }>["params"]) => void)
    | undefined;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private readonly socket: SocketLike;

  constructor(socket: SocketLike, options: AppServerRpcClientOptions = {}) {
    this.socket = socket;
    this.onServerRequest = options.onServerRequest;
    this.onServerRequestResolved = options.onServerRequestResolved;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener("error", () => {
      this.rejectAll(createRpcClientError("app_server_connection_error"));
    });
    this.socket.addEventListener("close", () => {
      this.rejectAll(createRpcClientError("app_server_connection_error"));
    });
  }

  async request<M extends WorkerAppServerMethod>(
    method: M,
    params: Extract<ClientRequest, { method: M }>["params"],
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const request = { id, method, params } as Extract<ClientRequest, { method: M }>;
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectPending(id, createRpcClientError("app_server_request_timeout"));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.socket.send(JSON.stringify(request));
      } catch {
        this.rejectPending(id, createRpcClientError("app_server_connection_error"));
      }
    });
  }

  notify(notification: ClientNotification): void {
    try {
      this.socket.send(JSON.stringify(notification));
    } catch {
      throw createRpcClientError("app_server_connection_error");
    }
  }

  sendApprovalResponse(params: { requestId: string | number; result: unknown }): void {
    try {
      this.socket.send(JSON.stringify({ id: params.requestId, result: params.result }));
    } catch {
      throw createRpcClientError("app_server_connection_error");
    }
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(data: unknown): void {
    let message: unknown;

    try {
      message = JSON.parse(String(data)) as unknown;
    } catch {
      this.rejectAll(createRpcClientError("app_server_protocol_error"));
      return;
    }

    if (isServerRequest(message)) {
      this.onServerRequest?.(message);
      return;
    }

    if (isServerRequestResolvedNotification(message)) {
      this.onServerRequestResolved?.(message.params);
      return;
    }

    if (!isRpcResponse(message)) {
      return;
    }

    const pending = this.pending.get(Number(message.id));
    if (!pending) {
      return;
    }

    if ("error" in message && message.error) {
      this.rejectPending(Number(message.id), createRpcClientError("app_server_protocol_error"));
      return;
    }

    this.resolvePending(Number(message.id), message.result);
  }

  private rejectAll(error: Error): void {
    for (const id of this.pending.keys()) {
      this.rejectPending(id, error);
    }
  }

  private rejectPending(id: number, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.reject(error);
  }

  private resolvePending(id: number, result: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.resolve(result);
  }
}

function isRpcResponse(value: unknown): value is RpcResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  if ("method" in value) {
    return false;
  }

  return "id" in value;
}

function isServerRequest(value: unknown): value is ServerRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("id" in value) || !("method" in value) || !("params" in value)) {
    return false;
  }

  const method = (value as { method: unknown }).method;
  return typeof method === "string" && [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/tool/requestUserInput",
    "mcpServer/elicitation/request",
    "item/permissions/requestApproval",
    "item/tool/call",
    "account/chatgptAuthTokens/refresh",
    "attestation/generate",
    "applyPatchApproval",
    "execCommandApproval",
  ].includes(method);
}

function isServerRequestResolvedNotification(
  value: unknown,
): value is Extract<ServerNotification, { method: "serverRequest/resolved" }> {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("method" in value) || (value as { method: unknown }).method !== "serverRequest/resolved") {
    return false;
  }

  const params = (value as { params?: unknown }).params;
  return params !== null && typeof params === "object" && "threadId" in params && "requestId" in params;
}
