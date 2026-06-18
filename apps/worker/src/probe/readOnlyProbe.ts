import type { ProbeCheckResult, WorkerProbeSummary } from "@codex-remote/api-contract";

export interface ReadOnlyProbeClient {
  readyz(): Promise<void>;
  initialize(): Promise<void>;
  initialized(): Promise<void>;
  listModels(): Promise<unknown>;
  listThreads(): Promise<unknown>;
  readFirstAllowedThread(): Promise<unknown>;
  close(): void;
}

export interface RunReadOnlyProbeOptions {
  client?: ReadOnlyProbeClient;
  startedByWorker?: boolean;
  deviceId?: string;
  checkTimeoutMs?: number;
}

export interface ProbeFailureSummaryOptions {
  checkName: string;
  failureType?: ProbeCheckResult["failureType"];
  errorKind?: string;
  startedByWorker?: boolean;
  deviceId?: string;
}

export class PreconditionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreconditionMissingError";
  }
}

const defaultCheckTimeoutMs = 5_000;

function safeErrorKind(error: unknown): string {
  if (error instanceof PreconditionMissingError) {
    return "precondition_missing";
  }
  if (
    error instanceof Error &&
    [
      "app_server_connection_error",
      "app_server_connection_timeout",
      "app_server_protocol_error",
      "app_server_request_timeout",
    ].includes(error.message)
  ) {
    return error.message;
  }

  return "probe_check_failed";
}

async function withTimeout<T>(run: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("app_server_request_timeout"));
    }, timeoutMs);

    run.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function createReadOnlyProbeFailureSummary(options: ProbeFailureSummaryOptions): WorkerProbeSummary {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    startedAt: now,
    completedAt: now,
    ok: false,
    mode: "readOnly",
    deviceId: options.deviceId ?? "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: options.startedByWorker ?? false,
      readyz: false,
    },
    checks: [
      {
        name: options.checkName,
        ok: false,
        durationMs: 0,
        failureType: options.failureType ?? "assertion_failed",
        errorKind: options.errorKind ?? "probe_check_failed",
      },
    ],
  };
}

async function runCheck(
  name: string,
  run: () => Promise<void>,
  timeoutMs: number,
): Promise<ProbeCheckResult> {
  const startedAt = Date.now();
  try {
    await withTimeout(run(), timeoutMs);
    return { name, ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof PreconditionMissingError) {
      return {
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        failureType: "precondition_missing",
        skippedReason: error.message,
      };
    }

    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      failureType: "assertion_failed",
      errorKind: safeErrorKind(error),
    };
  }
}

export async function runReadOnlyProbe(options: RunReadOnlyProbeOptions = {}): Promise<WorkerProbeSummary> {
  const startedAt = new Date().toISOString();
  const checks: ProbeCheckResult[] = [];
  const checkTimeoutMs = options.checkTimeoutMs ?? defaultCheckTimeoutMs;

  const { client } = options;
  if (!client) {
    const completedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      startedAt,
      completedAt,
      ok: false,
      mode: "readOnly",
      deviceId: options.deviceId ?? "local",
      codexVersion: null,
      appServer: {
        transport: "loopbackWebSocket",
        startedByWorker: options.startedByWorker ?? false,
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

  try {
    checks.push(await runCheck("readyz", () => client.readyz(), checkTimeoutMs));
    checks.push(await runCheck("initialize", () => client.initialize(), checkTimeoutMs));
    checks.push(await runCheck("initialized", () => client.initialized(), checkTimeoutMs));
    checks.push(await runCheck("model/list", async () => void (await client.listModels()), checkTimeoutMs));
    checks.push(await runCheck("thread/list", async () => void (await client.listThreads()), checkTimeoutMs));
    checks.push(await runCheck("thread/read", async () => void (await client.readFirstAllowedThread()), checkTimeoutMs));
    checks.push({
      name: "thread/turns/list",
      ok: false,
      durationMs: 0,
      failureType: "precondition_missing",
      skippedReason: "Current generated codex-protocol ClientRequest does not expose thread/turns/list.",
    });
  } finally {
    client.close();
  }

  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    startedAt,
    completedAt,
    ok: checks.every((check) => check.ok || check.failureType === "precondition_missing"),
    mode: "readOnly",
    deviceId: options.deviceId ?? "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: options.startedByWorker ?? false,
      readyz: checks.some((check) => check.name === "readyz" && check.ok),
    },
    checks,
  };
}
