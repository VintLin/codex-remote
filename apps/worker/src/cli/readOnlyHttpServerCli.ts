import { serve } from "@hono/node-server";

import { openReadOnlyAppServerSession } from "../app-server/readOnlyAppServerSession.ts";
import { createWorkerHttpApp } from "../http/workerHttpApp.ts";
import { loadWorkerHttpConfig, type WorkerHttpConfig } from "../http/workerHttpConfig.ts";
import type {
  WorkerReadOnlyAppServerClient,
  WorkerReadOnlyHandlerContext,
} from "../http/readOnlyHandlers.ts";
import type { AppServerReadOnlyProbeClient } from "../probe/appServerReadOnlyProbeClient.ts";

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
    const app = createWorkerHttpApp(createDefaultWorkerReadOnlyHandlerContext(config));
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

function createDefaultWorkerReadOnlyHandlerContext(config: WorkerHttpConfig): WorkerReadOnlyHandlerContext {
  return {
    config,
    now: () => new Date().toISOString(),
    openClient: async () => {
      const session = await openReadOnlyAppServerSession({
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
  client: AppServerReadOnlyProbeClient,
  closeSession: () => void,
): WorkerReadOnlyAppServerClient {
  return {
    readyz: () => client.readyz(),
    initialize: () => client.initialize(),
    initialized: () => client.initialized(),
    listThreads: (params) => client.listThreadsWithParams(params),
    readThread: (params) => client.readThread(params),
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
