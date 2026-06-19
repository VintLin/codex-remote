import { serve } from "@hono/node-server";

import { openWorkerAppServerSession } from "../app-server/readOnlyAppServerSession.ts";
import { createWorkerHttpApp } from "../http/workerHttpApp.ts";
import { loadWorkerHttpConfig, type WorkerHttpConfig } from "../http/workerHttpConfig.ts";
import {
  createWorkerWriteHandlerState,
  type WorkerWriteAppServerClient,
  type WorkerWriteHandlerContext,
} from "../http/writeHandlers.ts";
import type { AppServerWorkerClient } from "../probe/appServerReadOnlyProbeClient.ts";

interface StartReadOnlyHttpServerOptions {
  env: NodeJS.ProcessEnv;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  serveHttp?: typeof serve;
}

export async function startReadOnlyHttpServer(options: StartReadOnlyHttpServerOptions): Promise<number> {
  let config: WorkerHttpConfig;

  try {
    config = await loadWorkerHttpConfig(options.env);
  } catch {
    options.stderr.write("codex-remote worker http failed to start: worker_config_invalid\n");
    return 1;
  }

  try {
    const app = createWorkerHttpApp(createDefaultWorkerHandlerContext(config));
    const serveHttp = options.serveHttp ?? serve;
    serveHttp({
      fetch: app.fetch,
      hostname: config.bindHost,
      port: config.port,
    });

    options.stdout.write(`codex-remote worker http listening on ${config.bindHost}:${config.port}\n`);
    return 0;
  } catch {
    options.stderr.write("codex-remote worker http failed to start: worker_internal_error\n");
    return 1;
  }
}

function createDefaultWorkerHandlerContext(config: WorkerHttpConfig): WorkerWriteHandlerContext {
  return {
    config,
    now: () => new Date().toISOString(),
    writeState: createWorkerWriteHandlerState(),
    openClient: async () => {
      const session = await openWorkerAppServerSession({
        configuredUrl: config.appServerUrl,
        startAppServer: config.startAppServer,
        allowedProjectRoot: config.allowedProjectRoot,
        connectTimeoutMs: config.connectTimeoutMs,
        requestTimeoutMs: config.requestTimeoutMs,
        readyzTimeoutMs: config.requestTimeoutMs,
      });

      return createSessionClient(session.client, session.close);
    },
  };
}

function createSessionClient(
  client: AppServerWorkerClient,
  closeSession: () => void,
): WorkerWriteAppServerClient {
  return {
    readyz: () => client.readyz(),
    initialize: () => client.initialize(),
    initialized: () => client.initialized(),
    listThreads: (params) => client.listThreadsWithParams(params),
    readThread: (params) => client.readThread(params),
    startThread: (params) => client.startThread(params),
    startTurn: (params) => client.startTurn(params),
    close: () => closeSession(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await startReadOnlyHttpServer({
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
