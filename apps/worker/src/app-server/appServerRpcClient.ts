import type {
  ClientNotification,
  ClientRequest,
} from "@codex-remote/codex-protocol";

import { assertLoopbackWebSocketUrl } from "./appServerProcessService.ts";

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

type ReadOnlyAppServerMethod = "initialize" | "model/list" | "thread/list" | "thread/read";
type RpcClientErrorKind =
  | "app_server_connection_error"
  | "app_server_connection_timeout"
  | "app_server_protocol_error"
  | "app_server_request_timeout"
  | "app_server_websocket_unavailable";

interface ConnectAppServerRpcClientOptions {
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface AppServerRpcClientOptions {
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
    options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs },
  );
}

export class AppServerRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private readonly socket: SocketLike;

  constructor(socket: SocketLike, options: AppServerRpcClientOptions = {}) {
    this.socket = socket;
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

  async request<M extends ReadOnlyAppServerMethod>(
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
