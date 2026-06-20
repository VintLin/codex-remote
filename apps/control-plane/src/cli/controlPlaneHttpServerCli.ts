import { serve } from "@hono/node-server";

import { createWorkerUpstreamClient } from "../client/workerClient.ts";
import { createSafeStartupSummary, loadControlPlaneConfig } from "../config/controlPlaneConfig.ts";
import { createControlPlaneHttpApp } from "../http/controlPlaneHttpApp.ts";

export function startControlPlaneHttpServer(env: NodeJS.ProcessEnv = process.env): void {
  try {
    const config = loadControlPlaneConfig(env);
    const app = createControlPlaneHttpApp({
      config,
      now: () => new Date().toISOString(),
      workerClient: createWorkerUpstreamClient({ timeoutMs: config.requestTimeoutMs }),
    });

    serve({
      fetch: app.fetch,
      hostname: config.bindHost,
      port: config.port,
    });
    console.log(createSafeStartupSummary(config));
  } catch {
    console.error("Control Plane failed to start: invalid_config");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startControlPlaneHttpServer();
}
