import type { ErrorEnvelope } from "@codex-remote/api-contract";

export class ControlPlaneHttpError extends Error {
  readonly code: string;
  readonly details: ErrorEnvelope["details"];
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ErrorEnvelope["details"] = {},
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export function toErrorEnvelope(error: unknown, requestId: string): ErrorEnvelope {
  if (error instanceof ControlPlaneHttpError) {
    const details = sanitizeDetails({
      ...error.details,
      diagnosticId: requestId,
    });
    return {
      code: error.code,
      message: getSafeMessage(error.code),
      ...(details === undefined ? {} : { details }),
    };
  }

  return {
    code: "control_plane_unavailable",
    message: getSafeMessage("control_plane_unavailable"),
    details: {
      diagnosticId: requestId,
      retryable: true,
    },
  };
}

export function mapUnknownError(error: unknown, operation: string, deviceId?: string): ControlPlaneHttpError {
  if (error instanceof ControlPlaneHttpError) {
    return error;
  }

  if (error instanceof Error && error.message === "device_not_found") {
    return new ControlPlaneHttpError(404, "device_not_found", "Device was not found.", safeDetails({
      operation,
      retryable: false,
    }, deviceId));
  }

  return new ControlPlaneHttpError(424, "device_unavailable", "Device is unavailable.", safeDetails({
    operation,
    retryable: true,
  }, deviceId));
}

export function mapTaskError(error: unknown, operation: string): ControlPlaneHttpError {
  if (error instanceof ControlPlaneHttpError) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("task_not_found:")) {
    return new ControlPlaneHttpError(404, "task_not_found", "Task was not found.", {
      operation,
      retryable: false,
    });
  }

  return new ControlPlaneHttpError(500, "control_plane_unavailable", "Control Plane request failed.", {
    operation,
    retryable: true,
  });
}

export function mapMissingTaskLink(operation: string): ControlPlaneHttpError {
  return new ControlPlaneHttpError(500, "control_plane_unavailable", "Control Plane request failed.", {
    operation,
    retryable: true,
  });
}

function safeDetails(details: NonNullable<ErrorEnvelope["details"]>, deviceId: string | undefined): NonNullable<ErrorEnvelope["details"]> {
  return {
    ...details,
    ...(deviceId === undefined ? {} : { deviceId }),
  };
}

function getSafeMessage(code: string): string {
  switch (code) {
    case "device_not_found":
      return "Device was not found.";
    case "device_unavailable":
      return "Device is unavailable.";
    case "invalid_request":
      return "Request validation failed.";
    case "origin_forbidden":
      return "Origin is not allowed.";
    case "project_forbidden":
      return "Requested project is outside the allowed root.";
    case "conversation_not_found":
      return "Conversation was not found.";
    case "turn_not_found":
      return "Turn was not found.";
    case "task_not_found":
      return "Task was not found.";
    case "approval_not_found":
      return "Approval request was not found.";
    case "app_server_timeout":
      return "App-server request timed out.";
    case "app_server_unavailable":
      return "Codex app-server is unavailable.";
    case "control_not_supported":
      return "Control is not supported yet.";
    case "duplicate_request":
      return "Duplicate request conflicts with the original request.";
    case "worker_config_invalid":
      return "Worker HTTP configuration is invalid.";
    case "worker_internal_error":
      return "Worker request failed.";
    case "unauthorized":
      return "Missing or invalid bearer token.";
    default:
      return "Control Plane request failed.";
  }
}

function sanitizeDetails(details: ErrorEnvelope["details"]): ErrorEnvelope["details"] {
  if (!details) {
    return undefined;
  }

  return {
    ...(isSafeIdentifier(details.operation) ? { operation: details.operation } : {}),
    ...(typeof details.retryable === "boolean" ? { retryable: details.retryable } : {}),
    ...(isSafeIdentifier(details.diagnosticId) ? { diagnosticId: details.diagnosticId } : {}),
    ...(isSafeIdentifier(details.reason) ? { reason: details.reason } : {}),
    ...(isSafeIdentifier(details.field) ? { field: details.field } : {}),
    ...(typeof details.limit === "number" ? { limit: details.limit } : {}),
    ...(isSafeIdentifier(details.expected) ? { expected: details.expected } : {}),
    ...(isSafeIdentifier(details.actualKind) ? { actualKind: details.actualKind } : {}),
    ...(isSafeIdentifier(details.deviceId) ? { deviceId: details.deviceId } : {}),
  };
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}
