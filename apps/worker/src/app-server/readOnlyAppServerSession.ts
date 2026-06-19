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
import { AppServerReadOnlyProbeClient } from "../probe/appServerReadOnlyProbeClient.ts";

export interface OpenReadOnlyAppServerSessionOptions {
  configuredUrl: string | null;
  startAppServer: boolean;
  allowedProjectRoot: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  readyzTimeoutMs?: number;
}

export interface ReadOnlyAppServerSession {
  client: AppServerReadOnlyProbeClient;
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

function createReadOnlyAppServerSessionError(kind: "app_server_env_not_configured"): Error {
  return new Error(kind);
}

export async function openReadOnlyAppServerSession(
  options: OpenReadOnlyAppServerSessionOptions,
): Promise<ReadOnlyAppServerSession> {
  const configuredUrl = options.configuredUrl?.trim() ? options.configuredUrl : null;
  let appServer: AppServerProcessHandle | null = null;
  let client: SessionAppServerReadOnlyProbeClient | null = null;

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
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
    });

    client = new SessionAppServerReadOnlyProbeClient(rpc, readyzUrl, options.allowedProjectRoot, {
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
