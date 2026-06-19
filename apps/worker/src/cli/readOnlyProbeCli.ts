import {
  openReadOnlyAppServerSession,
  type ReadOnlyAppServerSession,
} from "../app-server/readOnlyAppServerSession.ts";
import { createReadOnlyProbeFailureSummary, runReadOnlyProbe } from "../probe/readOnlyProbe.ts";

function classifyProbeCliFailure(error: unknown): {
  checkName: string;
  errorKind: string;
  failureType: "assertion_failed" | "env_not_configured";
} {
  if (error instanceof Error && error.message === "app_server_url_not_loopback") {
    return {
      checkName: "app-server.url",
      failureType: "env_not_configured",
      errorKind: "app_server_url_not_loopback",
    };
  }

  if (
    error instanceof Error &&
    [
      "app_server_env_not_configured",
      "app_server_connection_error",
      "app_server_connection_timeout",
      "app_server_request_timeout",
      "app_server_spawn_failed",
    ].includes(error.message)
  ) {
    return {
      checkName: "app-server.connect",
      failureType: "assertion_failed",
      errorKind: error.message,
    };
  }

  return {
    checkName: "app-server.connect",
    failureType: "assertion_failed",
    errorKind: "app_server_connect_failed",
  };
}

async function main(): Promise<number> {
  const allowedProjectRoot = process.env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT ?? process.cwd();
  const configuredUrl = process.env.CODEX_APP_SERVER_URL?.trim() || null;
  const shouldStartAppServer = process.env.CODEX_REMOTE_START_APP_SERVER === "1";
  let session: ReadOnlyAppServerSession | null = null;
  const attemptedWorkerStart = !configuredUrl && shouldStartAppServer;

  try {
    try {
      session = await openReadOnlyAppServerSession({
        configuredUrl,
        startAppServer: shouldStartAppServer,
        allowedProjectRoot,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "app_server_env_not_configured") {
        const summary = await runReadOnlyProbe();
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
        return 1;
      }

      throw error;
    }

    const summary = await runReadOnlyProbe({
      client: session.client,
      startedByWorker: session.startedByWorker,
    });

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.ok ? 0 : 1;
  } catch (error) {
    const failure = classifyProbeCliFailure(error);
    const summary = createReadOnlyProbeFailureSummary({
      checkName: failure.checkName,
      failureType: failure.failureType,
      errorKind: failure.errorKind,
      startedByWorker: session?.startedByWorker ?? attemptedWorkerStart,
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 1;
  } finally {
    session?.close();
  }
}

process.exitCode = await main();
