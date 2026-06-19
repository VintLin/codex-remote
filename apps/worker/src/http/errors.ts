import type { ErrorEnvelope } from "@codex-remote/api-contract";

export type WorkerHttpErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "origin_forbidden"
  | "project_forbidden"
  | "conversation_not_found"
  | "app_server_timeout"
  | "app_server_unavailable"
  | "worker_config_invalid"
  | "worker_internal_error";

const allowedDetailKeys = new Set([
  "operation",
  "retryable",
  "diagnosticId",
  "reason",
  "field",
  "limit",
] as const);

const publicMessages: Record<WorkerHttpErrorCode, string> = {
  invalid_request: "Request validation failed.",
  unauthorized: "Missing or invalid bearer token.",
  origin_forbidden: "Origin is not allowed.",
  project_forbidden: "Requested project is outside the allowed root.",
  conversation_not_found: "Conversation was not found.",
  app_server_timeout: "App-server request timed out.",
  app_server_unavailable: "Codex app-server is unavailable.",
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

type AllowedDetailKey = keyof NonNullable<ErrorEnvelope["details"]>;
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
    message: sanitizePublicMessage(httpError.code, httpError.message),
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

function sanitizePublicMessage(code: WorkerHttpErrorCode, message: string): string {
  const fallback = publicMessages[code];

  if (!message.trim() || containsUnsafeString(message)) {
    return fallback;
  }

  return message;
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
        if (typeof value === "string" && value.trim() && !containsUnsafeString(value)) {
          sanitized.operation = value;
        }
        break;
      }
      case "diagnosticId": {
        if (typeof value === "string" && value.trim() && !containsUnsafeString(value)) {
          sanitized.diagnosticId = value;
        }
        break;
      }
      case "reason": {
        if (typeof value === "string" && value.trim() && !containsUnsafeString(value)) {
          sanitized.reason = value;
        }
        break;
      }
      case "field": {
        if (typeof value === "string" && value.trim() && !containsUnsafeString(value)) {
          sanitized.field = value;
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
