import {
  assertLoopbackWebSocketUrl,
  chooseLoopbackPort,
  startStdioAppServer,
  startLoopbackAppServer,
  stopAppServer,
  toReadyzUrl,
  waitForReadyz,
  type AppServerProcessHandle,
  type StdioAppServerProcessHandle,
} from "./appServerProcessService.ts";
import {
  connectAppServerRpcClient,
  connectStdioAppServerRpcClient,
} from "./appServerRpcClient.ts";
import type { AppServerTransport } from "@codex-remote/api-contract";
import type { ServerRequest, v2 } from "@codex-remote/codex-protocol";
import {
  AppServerReadOnlyProbeClient,
  AppServerWorkerClient,
} from "../probe/appServerReadOnlyProbeClient.ts";

export interface OpenReadOnlyAppServerSessionOptions {
  configuredUrl: string | null;
  startAppServer: boolean;
  appServerTransport?: AppServerTransport;
  allowedProjectRoot: string;
  connectTimeoutMs?: number;
  onServerRequest?(request: ServerRequest): void;
  onServerRequestResolved?(notification: v2.ServerRequestResolvedNotification): void;
  requestTimeoutMs?: number;
  readyzTimeoutMs?: number;
}

export interface ReadOnlyAppServerSession {
  client: AppServerReadOnlyProbeClient;
  startedByWorker: boolean;
  close(): void;
}

export interface WorkerAppServerSession {
  client: AppServerWorkerClient;
  startedByWorker: boolean;
  close(): void;
}

class SessionAppServerReadOnlyProbeClient extends AppServerReadOnlyProbeClient {
  private closed = false;

  override close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    super.close();
  }
}

class SessionAppServerWorkerClient extends AppServerWorkerClient {
  private closed = false;

  override close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    super.close();
  }
}

function createReadOnlyAppServerSessionError(kind: "app_server_env_not_configured"): Error {
  return new Error(kind);
}

export async function openReadOnlyAppServerSession(
  options: OpenReadOnlyAppServerSessionOptions,
): Promise<ReadOnlyAppServerSession> {
  return await openAppServerSession(options, SessionAppServerReadOnlyProbeClient);
}

export async function openWorkerAppServerSession(
  options: OpenReadOnlyAppServerSessionOptions,
): Promise<WorkerAppServerSession> {
  return await openAppServerSession(options, SessionAppServerWorkerClient);
}

async function openAppServerSession<TClient extends AppServerReadOnlyProbeClient>(
  options: OpenReadOnlyAppServerSessionOptions,
  Client: new (
    rpc: Awaited<ReturnType<typeof connectAppServerRpcClient>>,
    readyzUrl: string,
    allowedProjectRoot: string,
    options?: { readyzMode?: "http" | "rpc"; readyzTimeoutMs?: number },
  ) => TClient,
): Promise<{ client: TClient; startedByWorker: boolean; close(): void }> {
  const configuredUrl = options.configuredUrl?.trim() ? options.configuredUrl : null;
  let appServer: AppServerProcessHandle | null = null;
  let client: TClient | null = null;

  try {
    const appServerTransport = options.appServerTransport ?? (configuredUrl ? "loopbackWebSocket" : "stdio");
    const session = await openRpcSession({
      configuredUrl,
      startAppServer: options.startAppServer,
      appServerTransport,
      ...(options.readyzTimeoutMs === undefined ? {} : { readyzTimeoutMs: options.readyzTimeoutMs }),
    });
    appServer = session.appServer;

    const rpc = session.transport === "stdio"
      ? await connectStdioAppServerRpcClient(session.appServer, {
          ...(options.onServerRequest === undefined ? {} : { onServerRequest: options.onServerRequest }),
          ...(options.onServerRequestResolved === undefined ? {} : { onServerRequestResolved: options.onServerRequestResolved }),
          ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
        })
      : await connectAppServerRpcClient(session.appServerUrl, {
      ...(options.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: options.connectTimeoutMs }),
      ...(options.onServerRequest === undefined ? {} : { onServerRequest: options.onServerRequest }),
      ...(options.onServerRequestResolved === undefined ? {} : { onServerRequestResolved: options.onServerRequestResolved }),
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
        });

    client = new Client(rpc, session.readyzUrl, options.allowedProjectRoot, {
      readyzMode: session.transport === "stdio" ? "rpc" : "http",
      ...(options.readyzTimeoutMs === undefined ? {} : { readyzTimeoutMs: options.readyzTimeoutMs }),
    });

    let closed = false;

    return {
      client,
      startedByWorker: Boolean(appServer),
      close(): void {
        if (closed) {
          return;
        }

        closed = true;
        client?.close();
        if (appServer) {
          stopAppServer(appServer);
        }
      },
    };
  } catch (error) {
    client?.close();
    if (appServer) {
      stopAppServer(appServer);
    }

    throw error;
  }
}

type RpcSession =
  | {
      appServer: AppServerProcessHandle | null;
      appServerUrl: string;
      readyzUrl: string;
      transport: "loopbackWebSocket";
    }
  | {
      appServer: StdioAppServerProcessHandle;
      readyzUrl: "";
      transport: "stdio";
    };

async function openRpcSession(options: {
  configuredUrl: string | null;
  startAppServer: boolean;
  appServerTransport: AppServerTransport;
  readyzTimeoutMs?: number;
}): Promise<RpcSession> {
  if (options.configuredUrl) {
    const appServerUrl = assertLoopbackWebSocketUrl(options.configuredUrl);
    return {
      appServer: null,
      appServerUrl,
      readyzUrl: toReadyzUrl(appServerUrl),
      transport: "loopbackWebSocket",
    };
  }

  if (!options.startAppServer) {
    throw createReadOnlyAppServerSessionError("app_server_env_not_configured");
  }

  if (options.appServerTransport === "stdio") {
    const appServer = startStdioAppServer();
    await appServer.spawned;
    return {
      appServer,
      readyzUrl: "",
      transport: "stdio",
    };
  }

  const appServerUrl = `ws://127.0.0.1:${await chooseLoopbackPort()}`;
  const appServer = startLoopbackAppServer(Number(new URL(appServerUrl).port));
  await appServer.spawned;
  await waitForReadyz(appServer.readyzUrl, options.readyzTimeoutMs);
  return {
    appServer,
    appServerUrl,
    readyzUrl: appServer.readyzUrl,
    transport: "loopbackWebSocket",
  };
}
