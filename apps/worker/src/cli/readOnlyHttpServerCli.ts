import { serve } from "@hono/node-server";

import { openWorkerAppServerSession, type WorkerAppServerSession } from "../app-server/readOnlyAppServerSession.ts";
import { createWorkerApprovalRegistry } from "../http/approvalRegistry.ts";
import type { WorkerControlAppServerClient, WorkerControlHandlerContext } from "../http/controlHandlers.ts";
import { createWorkerHttpApp } from "../http/workerHttpApp.ts";
import { loadWorkerHttpConfig, type WorkerHttpConfig } from "../http/workerHttpConfig.ts";
import {
  createWorkerWriteHandlerState,
} from "../http/writeHandlers.ts";
import type { AppServerWorkerClient } from "../probe/appServerReadOnlyProbeClient.ts";

interface StartReadOnlyHttpServerOptions {
  env: NodeJS.ProcessEnv;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  openWorkerSession?: typeof openWorkerAppServerSession;
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
    const app = createWorkerHttpApp(createDefaultWorkerHandlerContext(config, options.openWorkerSession));
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

function createDefaultWorkerHandlerContext(
  config: WorkerHttpConfig,
  openWorkerSession = openWorkerAppServerSession,
): WorkerControlHandlerContext {
  const approvalRegistry = createWorkerApprovalRegistry();
  let sharedSession: Promise<WorkerAppServerSession> | null = null;

  return {
    config,
    now: () => new Date().toISOString(),
    approvalRegistry,
    writeState: createWorkerWriteHandlerState(),
    openClient: async () => {
      sharedSession ??= openWorkerSession({
        configuredUrl: config.appServerUrl,
        startAppServer: config.startAppServer,
        appServerTransport: config.appServerTransport,
        allowedProjectRoot: config.allowedProjectRoot,
          connectTimeoutMs: config.connectTimeoutMs,
          onServerRequest: (request) => {
            approvalRegistry.captureServerRequest(request);
          },
          onServerRequestResolved: (notification) => {
            approvalRegistry.markResolved(notification);
          },
          requestTimeoutMs: config.requestTimeoutMs,
          readyzTimeoutMs: config.requestTimeoutMs,
        }).catch((error) => {
          sharedSession = null;
          throw error;
        });
      const session = await sharedSession;

      return createSessionClient(session.client, () => {
        // ponytail: keep the Worker session open for process-local approval observers; add lifecycle management when Worker daemonization lands.
      });
    },
  };
}

function createSessionClient(
  client: AppServerWorkerClient,
  closeSession: () => void,
): WorkerControlAppServerClient {
  return {
    readyz: () => client.readyz(),
    initialize: () => client.initialize(),
    initialized: () => client.initialized(),
    getCodexVersion: () => client.getCodexVersion(),
    listThreads: (params) => client.listThreadsWithParams(params),
    readThread: (params) => client.readThread(params),
    startThread: (params) => client.startThread(params),
    startTurn: (params) => client.startTurn(params),
    interruptTurn: (params) => client.interruptTurn(params),
    steerTurn: (params) => client.steerTurn(params),
    sendApprovalResponse: (params) => client.sendApprovalResponse(params),
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
