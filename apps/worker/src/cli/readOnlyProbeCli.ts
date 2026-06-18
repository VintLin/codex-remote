import {
  assertLoopbackWebSocketUrl,
  chooseLoopbackPort,
  startLoopbackAppServer,
  stopAppServer,
  toReadyzUrl,
  waitForReadyz,
  type AppServerProcessHandle,
} from "../app-server/appServerProcessService.ts";
import { connectAppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { AppServerReadOnlyProbeClient } from "../probe/appServerReadOnlyProbeClient.ts";
import { createReadOnlyProbeFailureSummary, runReadOnlyProbe } from "../probe/readOnlyProbe.ts";

async function main(): Promise<number> {
  const allowedProjectRoot = process.env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT ?? process.cwd();
  const configuredUrl = process.env.CODEX_APP_SERVER_URL;
  const shouldStartAppServer = process.env.CODEX_REMOTE_START_APP_SERVER === "1";
  let appServer: AppServerProcessHandle | null = null;

  try {
    const appServerUrl = configuredUrl
      ? assertLoopbackWebSocketUrl(configuredUrl)
      : shouldStartAppServer
        ? `ws://127.0.0.1:${await chooseLoopbackPort()}`
        : null;

    if (!appServerUrl) {
      const summary = await runReadOnlyProbe();
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 1;
    }

    if (!configuredUrl) {
      appServer = startLoopbackAppServer(Number(new URL(appServerUrl).port));
      await waitForReadyz(appServer.readyzUrl);
    }

    const readyzUrl = appServer?.readyzUrl ?? toReadyzUrl(appServerUrl);
    const rpc = await connectAppServerRpcClient(appServerUrl);
    const client = new AppServerReadOnlyProbeClient(rpc, readyzUrl, allowedProjectRoot);
    const summary = await runReadOnlyProbe({
      client,
      startedByWorker: Boolean(appServer),
    });

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.ok ? 0 : 1;
  } catch (error) {
    const summary = createReadOnlyProbeFailureSummary({
      checkName:
        error instanceof Error && error.message === "app_server_url_not_loopback"
          ? "app-server.url"
          : "app-server.connect",
      failureType:
        error instanceof Error && error.message === "app_server_url_not_loopback"
          ? "env_not_configured"
          : "assertion_failed",
      errorKind:
        error instanceof Error && error.message === "app_server_url_not_loopback"
          ? "app_server_url_not_loopback"
          : "app_server_connect_failed",
      startedByWorker: Boolean(appServer),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 1;
  } finally {
    if (appServer) {
      stopAppServer(appServer);
    }
  }
}

process.exitCode = await main();
