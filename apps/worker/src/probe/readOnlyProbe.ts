import type { WorkerProbeSummary } from "@codex-remote/api-contract";

export async function runReadOnlyProbe(): Promise<WorkerProbeSummary> {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    startedAt: now,
    completedAt: now,
    ok: false,
    mode: "readOnly",
    deviceId: "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: false,
      readyz: false,
    },
    checks: [
      {
        name: "probe.client",
        ok: false,
        durationMs: 0,
        failureType: "env_not_configured",
        skippedReason: "No app-server client was provided.",
      },
    ],
  };
}
