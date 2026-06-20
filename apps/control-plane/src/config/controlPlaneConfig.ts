export interface ConfiguredWorkerDevice {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
}

export interface ControlPlaneConfig {
  allowedOrigins: readonly string[];
  bindHost: string;
  devices: readonly ConfiguredWorkerDevice[];
  port: number;
  publicToken: string;
  requestTimeoutMs: number;
}

interface ControlPlaneConfigInput {
  allowedOrigins?: unknown;
  bindHost?: unknown;
  devices?: unknown;
  port?: unknown;
  publicToken?: unknown;
  requestTimeoutMs?: unknown;
}

export function loadControlPlaneConfig(env: NodeJS.ProcessEnv): ControlPlaneConfig {
  const rawConfig = readRawConfig(env);
  const input = parseConfigObject(rawConfig);
  const publicToken = readRequiredString(input, "publicToken");
  const devices = readDevices(input.devices);

  return {
    allowedOrigins: readAllowedOrigins(input.allowedOrigins),
    bindHost: readBindHost(input.bindHost),
    devices,
    port: readPort(input.port),
    publicToken,
    requestTimeoutMs: readPositiveInteger(input.requestTimeoutMs, 5_000),
  };
}

export function createSafeStartupSummary(config: ControlPlaneConfig): string {
  const deviceIds = config.devices.map((device) => device.id).join(",");
  return `Control Plane listening on ${config.bindHost}:${config.port}; devices=${config.devices.length}; deviceIds=${deviceIds}`;
}

function readRawConfig(env: NodeJS.ProcessEnv): string {
  const raw = env.CODEX_REMOTE_CONTROL_PLANE_CONFIG;
  if (!raw?.trim()) {
    throw new Error("control_plane_config_invalid");
  }

  return raw;
}

function parseConfigObject(rawConfig: string): ControlPlaneConfigInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error("control_plane_config_invalid");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("control_plane_config_invalid");
  }

  return parsed as ControlPlaneConfigInput;
}

function readDevices(value: unknown): readonly ConfiguredWorkerDevice[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("control_plane_config_invalid");
  }

  const devices = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("control_plane_config_invalid");
    }

    const input = entry as Record<string, unknown>;
    return {
      id: readRequiredString(input, "id"),
      name: readRequiredString(input, "name"),
      baseUrl: readLoopbackHttpUrl(readRequiredString(input, "baseUrl")),
      token: readRequiredString(input, "token"),
    };
  });

  const seen = new Set<string>();
  for (const device of devices) {
    if (seen.has(device.id)) {
      throw new Error("control_plane_config_invalid");
    }
    seen.add(device.id);
  }

  return devices;
}

function readRequiredString(input: Record<string, unknown> | ControlPlaneConfigInput, field: string): string {
  const value = input[field as keyof typeof input];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("control_plane_config_invalid");
  }

  return value.trim();
}

function readLoopbackHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("control_plane_config_invalid");
  }

  const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !isLoopback || parsed.username || parsed.password) {
    throw new Error("control_plane_config_invalid");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.origin;
}

function readAllowedOrigins(value: unknown): readonly string[] {
  if (value === undefined) {
    return ["http://127.0.0.1:5173"];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("control_plane_config_invalid");
  }

  return value.map((origin) => {
    if (typeof origin !== "string" || !origin.trim() || origin.includes("*")) {
      throw new Error("control_plane_config_invalid");
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("control_plane_config_invalid");
    }

    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
      throw new Error("control_plane_config_invalid");
    }

    return parsed.origin;
  });
}

function readBindHost(value: unknown): string {
  if (value === undefined) {
    return "127.0.0.1";
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("control_plane_config_invalid");
  }

  const host = value.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("control_plane_config_invalid");
  }

  return host;
}

function readPort(value: unknown): number {
  if (value === undefined) {
    return 8786;
  }

  return readPositiveInteger(value, 8786, 65_535);
}

function readPositiveInteger(value: unknown, fallback: number, max = 60_000): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error("control_plane_config_invalid");
  }

  return parsed;
}
