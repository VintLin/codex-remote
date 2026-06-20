import type { ErrorEnvelope } from "@codex-remote/api-contract";

export type WorkerHttpErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "origin_forbidden"
  | "project_forbidden"
  | "conversation_not_found"
  | "turn_not_found"
  | "approval_not_found"
  | "app_server_timeout"
  | "app_server_unavailable"
  | "control_not_supported"
  | "duplicate_request"
  | "worker_config_invalid"
  | "worker_internal_error";

type AllowedDetailKey = keyof NonNullable<ErrorEnvelope["details"]>;

const allowedDetailKeys: ReadonlySet<AllowedDetailKey> = new Set([
  "operation",
  "retryable",
  "diagnosticId",
  "reason",
  "field",
  "limit",
  "expected",
  "actualKind",
  "deviceId",
] as const);

const publicMessages: Record<WorkerHttpErrorCode, string> = {
  invalid_request: "Request validation failed.",
  unauthorized: "Missing or invalid bearer token.",
  origin_forbidden: "Origin is not allowed.",
  project_forbidden: "Requested project is outside the allowed root.",
  conversation_not_found: "Conversation was not found.",
  turn_not_found: "Turn was not found.",
  approval_not_found: "Approval request was not found.",
  app_server_timeout: "App-server request timed out.",
  app_server_unavailable: "Codex app-server is unavailable.",
  control_not_supported: "Control is not supported yet.",
  duplicate_request: "Duplicate request conflicts with the original request.",
  worker_config_invalid: "Worker HTTP configuration is invalid.",
  worker_internal_error: "Worker request failed.",
};

const unsafeStringPatterns = [
  /https?:\/\//i,
  /wss?:\/\//i,
  /\btoken\b/i,
  /\bstack\b/i,
  /\bcause\b/i,
  /\bprompt\b/i,
  /\bcommand output\b/i,
  /\bfull diff\b/i,
  /^@@ .* @@$/m,
] as const;

const safeIdentifierPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

type WorkerHttpErrorDetails = Partial<Record<AllowedDetailKey, unknown>> & Record<string, unknown>;

export class WorkerHttpError extends Error {
  readonly status: number;
  readonly code: WorkerHttpErrorCode;
  readonly details: WorkerHttpErrorDetails | undefined;

  constructor(
    status: number,
    code: WorkerHttpErrorCode,
    message: string = publicMessages[code],
    details?: WorkerHttpErrorDetails,
  ) {
    super(message);
    this.name = "WorkerHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toErrorEnvelope(error: unknown, requestId: string): ErrorEnvelope {
  const httpError = mapUnknownError(error, "unknown");
  const details = sanitizeDetails(httpError.details);

  return {
    code: httpError.code,
    message: publicMessages[httpError.code],
    ...(details ? { details } : {}),
    requestId,
  };
}

export function mapUnknownError(error: unknown, operation: string): WorkerHttpError {
  if (error instanceof WorkerHttpError) {
    return error;
  }

  if (error instanceof Error && error.message === "app_server_request_timeout") {
    return new WorkerHttpError(408, "app_server_timeout", "App-server request timed out.", {
      operation,
      retryable: true,
    });
  }

  if (
    error instanceof Error &&
    [
      "app_server_connection_error",
      "app_server_connection_timeout",
      "app_server_env_not_configured",
      "app_server_spawn_failed",
      "app_server_websocket_unavailable",
    ].includes(error.message)
  ) {
    return new WorkerHttpError(424, "app_server_unavailable", "Codex app-server is unavailable.", {
      operation,
      retryable: true,
    });
  }

  return new WorkerHttpError(500, "worker_internal_error", "Worker request failed.", {
    operation,
    retryable: false,
  });
}

function sanitizeDetails(details: WorkerHttpErrorDetails | undefined): ErrorEnvelope["details"] | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized: NonNullable<ErrorEnvelope["details"]> = {};

  for (const [key, value] of Object.entries(details)) {
    if (!allowedDetailKeys.has(key as AllowedDetailKey)) {
      continue;
    }

    switch (key as AllowedDetailKey) {
      case "operation": {
        if (isSafeIdentifier(value)) {
          sanitized.operation = value;
        }
        break;
      }
      case "diagnosticId": {
        if (isSafeIdentifier(value)) {
          sanitized.diagnosticId = value;
        }
        break;
      }
      case "reason": {
        if (isSafeIdentifier(value)) {
          sanitized.reason = value;
        }
        break;
      }
      case "field": {
        if (isSafeIdentifier(value)) {
          sanitized.field = value;
        }
        break;
      }
      case "expected": {
        if (isSafeIdentifier(value)) {
          sanitized.expected = value;
        }
        break;
      }
      case "actualKind": {
        if (isSafeIdentifier(value)) {
          sanitized.actualKind = value;
        }
        break;
      }
      case "deviceId": {
        if (isSafeIdentifier(value)) {
          sanitized.deviceId = value;
        }
        break;
      }
      case "retryable": {
        if (typeof value === "boolean") {
          sanitized.retryable = value;
        }
        break;
      }
      case "limit": {
        if (typeof value === "number" && Number.isFinite(value)) {
          sanitized.limit = value;
        }
        break;
      }
      default:
        break;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function containsUnsafeString(value: string): boolean {
  return unsafeStringPatterns.some((pattern) => pattern.test(value));
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && safeIdentifierPattern.test(value) && !containsUnsafeString(value);
}
