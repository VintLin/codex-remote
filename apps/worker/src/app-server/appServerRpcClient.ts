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
}

function createRpcClientError(
  kind:
    | "app_server_connection_error"
    | "app_server_protocol_error"
    | "app_server_websocket_unavailable",
): Error {
  return new Error(kind);
}

export async function connectAppServerRpcClient(url: string): Promise<AppServerRpcClient> {
  const loopbackUrl = assertLoopbackWebSocketUrl(url);

  if (typeof WebSocket !== "function") {
    throw createRpcClientError("app_server_websocket_unavailable");
  }

  const socket = new WebSocket(loopbackUrl);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener(
      "open",
      () => {
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        reject(createRpcClientError("app_server_connection_error"));
      },
      { once: true },
    );
  });

  return new AppServerRpcClient(socket);
}

export class AppServerRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly socket: SocketLike;

  constructor(socket: SocketLike) {
    this.socket = socket;
    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
  }

  async request<M extends ClientRequest["method"]>(
    method: M,
    params: Extract<ClientRequest, { method: M }>["params"],
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const request = { id, method, params } as Extract<ClientRequest, { method: M }>;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(request));
    });
  }

  notify(notification: ClientNotification): void {
    this.socket.send(JSON.stringify(notification));
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

    this.pending.delete(Number(message.id));
    if ("error" in message && message.error) {
      pending.reject(createRpcClientError("app_server_protocol_error"));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.reject(error);
    }
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
