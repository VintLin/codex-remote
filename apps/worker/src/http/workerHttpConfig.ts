import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type { AppServerTransport } from "@codex-remote/api-contract";

import { assertLoopbackWebSocketUrl } from "../app-server/appServerProcessService.ts";

interface WorkerHttpConfigInput {
  appServerTransport: string | undefined;
  appServerUrl: string | undefined;
  allowedOrigins: string | undefined;
  allowedProjectRoot: string | undefined;
  calibrationApprovalMode: string | null | undefined;
  connectTimeoutMs: string | undefined;
  deviceId: string | undefined;
  host: string | undefined;
  port: string | undefined;
  requestTimeoutMs: string | undefined;
  startAppServer: string | undefined;
  workerToken: string | undefined;
}

export interface WorkerHttpConfig {
  deviceId: string;
  workerToken: string;
  allowedOrigins: readonly string[];
  allowedProjectRoot: string;
  bindHost: string;
  port: number;
  appServerUrl: string | null;
  startAppServer: boolean;
  appServerTransport: AppServerTransport;
  calibrationApprovalMode: "on-request" | null;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function parsePositiveBoundedInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!value.trim()) {
    throw new Error("worker_config_invalid");
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 60_000) {
    throw new Error("worker_config_invalid");
  }

  return parsed;
}

export async function loadWorkerHttpConfig(env: NodeJS.ProcessEnv): Promise<WorkerHttpConfig> {
  const input = parseWorkerHttpConfigInput(env);
  const workerToken = requireNonEmptyValue(input.workerToken);
  const allowedProjectRoot = await canonicalizeProjectRoot(input.allowedProjectRoot);
  const allowedOrigins = parseAllowedOrigins(input.allowedOrigins);
  const bindHost = parseBindHost(input.host);
  const port = parsePort(input.port);
  const connectTimeoutMs = parsePositiveBoundedInteger(input.connectTimeoutMs, 5_000);
  const requestTimeoutMs = parsePositiveBoundedInteger(input.requestTimeoutMs, 5_000);
  const appServerUrl = parseAppServerUrl(input.appServerUrl);
  const startAppServer = parseBooleanFlag(input.startAppServer);
  const appServerTransport = parseAppServerTransport(input.appServerTransport, appServerUrl, startAppServer);
  const calibrationApprovalMode = parseCalibrationApprovalMode(input.calibrationApprovalMode);

  return {
    deviceId: input.deviceId?.trim() || "local-device",
    workerToken,
    allowedOrigins,
    allowedProjectRoot,
    bindHost,
    port,
    appServerUrl,
    startAppServer,
    appServerTransport,
    calibrationApprovalMode,
    connectTimeoutMs,
    requestTimeoutMs,
  };
}

function parseWorkerHttpConfigInput(env: NodeJS.ProcessEnv): WorkerHttpConfigInput {
  return {
    deviceId: env.CODEX_REMOTE_DEVICE_ID,
    workerToken: env.CODEX_REMOTE_WORKER_TOKEN,
    allowedOrigins: env.CODEX_REMOTE_ALLOWED_ORIGINS,
    allowedProjectRoot: env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT,
    host: env.CODEX_REMOTE_HTTP_HOST,
    port: env.CODEX_REMOTE_HTTP_PORT,
    appServerTransport: env.CODEX_REMOTE_APP_SERVER_TRANSPORT,
    appServerUrl: env.CODEX_APP_SERVER_URL,
    startAppServer: env.CODEX_REMOTE_START_APP_SERVER,
    calibrationApprovalMode: env.CODEX_REMOTE_CALIBRATION_APPROVAL_MODE,
    connectTimeoutMs: env.CODEX_REMOTE_CONNECT_TIMEOUT_MS,
    requestTimeoutMs: env.CODEX_REMOTE_REQUEST_TIMEOUT_MS,
  };
}

function requireNonEmptyValue(value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error("worker_config_invalid");
  }

  return value.trim();
}

async function canonicalizeProjectRoot(value: string | undefined): Promise<string> {
  const projectRoot = requireNonEmptyValue(value);

  try {
    return await realpath(resolve(projectRoot));
  } catch {
    throw new Error("worker_config_invalid");
  }
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  const rawOrigins = requireNonEmptyValue(value)
    .split(",")
    .map((origin) => origin.trim());

  if (rawOrigins.length === 0 || rawOrigins.some((origin) => !origin)) {
    throw new Error("worker_config_invalid");
  }

  return rawOrigins.map((origin) => {
    if (origin === "*" || origin.includes("*")) {
      throw new Error("worker_config_invalid");
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error("worker_config_invalid");
    }

    if ((parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") || parsedOrigin.origin !== origin) {
      throw new Error("worker_config_invalid");
    }

    return parsedOrigin.origin;
  });
}

function parseBindHost(value: string | undefined): string {
  if (value === undefined) {
    return "127.0.0.1";
  }

  const host = value.trim();
  if (!host) {
    throw new Error("worker_config_invalid");
  }

  if (!isLoopbackHost(host)) {
    throw new Error("worker_config_invalid");
  }

  return host;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 8787;
  }

  if (!value.trim()) {
    throw new Error("worker_config_invalid");
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error("worker_config_invalid");
  }

  return parsed;
}

function parseAppServerUrl(value: string | undefined): string | null {
  if (!value || !value.trim()) {
    return null;
  }

  try {
    return assertLoopbackWebSocketUrl(value.trim());
  } catch {
    throw new Error("worker_config_invalid");
  }
}

function parseAppServerTransport(value: string | undefined, appServerUrl: string | null, startAppServer: boolean): AppServerTransport {
  if (!value || !value.trim()) {
    return appServerUrl ? "loopbackWebSocket" : "stdio";
  }

  const transport = value.trim();
  if (transport === "stdio") {
    if (appServerUrl) {
      throw new Error("worker_config_invalid");
    }

    return "stdio";
  }

  if (transport === "debug-websocket") {
    return "loopbackWebSocket";
  }

  throw new Error("worker_config_invalid");
}

function parseCalibrationApprovalMode(value: string | null | undefined): "on-request" | null {
  if (value === undefined || value === null) {
    return null;
  }

  const mode = value.trim();
  if (!mode) {
    throw new Error("worker_config_invalid");
  }

  if (mode === "on-request") {
    return "on-request";
  }

  throw new Error("worker_config_invalid");
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  if (!value.trim()) {
    throw new Error("worker_config_invalid");
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("worker_config_invalid");
}
