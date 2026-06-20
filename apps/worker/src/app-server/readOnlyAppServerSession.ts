import {
  assertLoopbackWebSocketUrl,
  chooseLoopbackPort,
  startLoopbackAppServer,
  stopAppServer,
  toReadyzUrl,
  waitForReadyz,
  type AppServerProcessHandle,
} from "./appServerProcessService.ts";
import { connectAppServerRpcClient } from "./appServerRpcClient.ts";
import type { ServerRequest, v2 } from "@codex-remote/codex-protocol";
import {
  AppServerReadOnlyProbeClient,
  AppServerWorkerClient,
} from "../probe/appServerReadOnlyProbeClient.ts";

export interface OpenReadOnlyAppServerSessionOptions {
  configuredUrl: string | null;
  startAppServer: boolean;
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
    options?: { readyzTimeoutMs?: number },
  ) => TClient,
): Promise<{ client: TClient; startedByWorker: boolean; close(): void }> {
  const configuredUrl = options.configuredUrl?.trim() ? options.configuredUrl : null;
  let appServer: AppServerProcessHandle | null = null;
  let client: TClient | null = null;

  try {
    const appServerUrl = configuredUrl
      ? assertLoopbackWebSocketUrl(configuredUrl)
      : options.startAppServer
        ? `ws://127.0.0.1:${await chooseLoopbackPort()}`
        : null;

    if (!appServerUrl) {
      throw createReadOnlyAppServerSessionError("app_server_env_not_configured");
    }

    if (!configuredUrl) {
      appServer = startLoopbackAppServer(Number(new URL(appServerUrl).port));
      await appServer.spawned;
      await waitForReadyz(appServer.readyzUrl, options.readyzTimeoutMs);
    }

    const readyzUrl = appServer?.readyzUrl ?? toReadyzUrl(appServerUrl);
    const rpc = await connectAppServerRpcClient(appServerUrl, {
      ...(options.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: options.connectTimeoutMs }),
      ...(options.onServerRequest === undefined ? {} : { onServerRequest: options.onServerRequest }),
      ...(options.onServerRequestResolved === undefined ? {} : { onServerRequestResolved: options.onServerRequestResolved }),
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
    });

    client = new Client(rpc, readyzUrl, options.allowedProjectRoot, {
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
