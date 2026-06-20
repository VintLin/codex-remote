import type {
  ApprovalDecisionInput,
  CommandAccepted,
  CodexConversation,
  ConversationTimeline,
  ConversationTimelineTurn,
  ConversationLifecycleInput,
  ConversationWorkbenchEvent,
  ErrorEnvelope,
  FollowUpInput,
  InterruptTurnInput,
  OpenConversationResult,
  PendingApproval,
  RemoteProject,
  RenameConversationInput,
  StartConversationInput,
  SteerTurnInput,
  WorkerCapabilities,
  WorkerHealth,
  WorkerProbeSummary,
} from "@codex-remote/api-contract";

import type { ConfiguredWorkerDevice } from "../config/controlPlaneConfig.ts";
import { ControlPlaneHttpError } from "../http/errors.ts";

export interface WorkerUpstreamClient {
  getHealth(device: ConfiguredWorkerDevice): Promise<WorkerHealth>;
  getCapabilities(device: ConfiguredWorkerDevice): Promise<WorkerCapabilities>;
  getProbeSummary(device: ConfiguredWorkerDevice): Promise<WorkerProbeSummary>;
  listProjects(device: ConfiguredWorkerDevice): Promise<RemoteProject[]>;
  listConversations(device: ConfiguredWorkerDevice): Promise<CodexConversation[]>;
  readTimeline(device: ConfiguredWorkerDevice, conversationId: string): Promise<ConversationTimeline>;
  openConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  archiveConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  unarchiveConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  renameConversation(device: ConfiguredWorkerDevice, conversationId: string, input: RenameConversationInput): Promise<OpenConversationResult>;
  listApprovals(device: ConfiguredWorkerDevice, conversationId: string): Promise<PendingApproval[]>;
  startConversation(device: ConfiguredWorkerDevice, input: StartConversationInput): Promise<CommandAccepted>;
  followUp(device: ConfiguredWorkerDevice, conversationId: string, input: FollowUpInput): Promise<CommandAccepted>;
  interrupt(device: ConfiguredWorkerDevice, conversationId: string, turnId: string, input: InterruptTurnInput): Promise<CommandAccepted>;
  steer(device: ConfiguredWorkerDevice, conversationId: string, turnId: string, input: SteerTurnInput): Promise<CommandAccepted>;
  decideApproval(
    device: ConfiguredWorkerDevice,
    conversationId: string,
    approvalRequestId: string,
    input: ApprovalDecisionInput,
  ): Promise<CommandAccepted>;
}

export function createWorkerUpstreamClient(options: {
  fetch?: typeof fetch;
  timeoutMs: number;
}): WorkerUpstreamClient {
  const fetcher = options.fetch ?? fetch;

  async function request<T>(
    device: ConfiguredWorkerDevice,
    path: string,
    init: { body?: unknown; method: "GET" | "PATCH" | "POST"; notFoundCode?: string; project: (value: unknown) => T },
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetcher(`${device.baseUrl}${path}`, {
        method: init.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${device.token}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const upstreamError = await readUpstreamError(response);
        throw new ControlPlaneHttpError(mapUpstreamStatus(response.status), mapUpstreamCode(response.status, upstreamError?.code, init.notFoundCode), "Device request failed.", {
          deviceId: device.id,
          operation: "worker_request",
          retryable: response.status === 408 || response.status >= 500,
        });
      }

      return init.project(await response.json());
    } catch (error) {
      if (error instanceof ControlPlaneHttpError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ControlPlaneHttpError(408, "app_server_timeout", "Device request timed out.", {
          deviceId: device.id,
          operation: "worker_request",
          retryable: true,
        });
      }
      throw new ControlPlaneHttpError(424, "device_unavailable", "Device is unavailable.", {
        deviceId: device.id,
        operation: "worker_request",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getHealth: (device) => request<WorkerHealth>(device, "/v1/worker/health", { method: "GET", project: projectWorkerHealth }),
    getCapabilities: (device) => request<WorkerCapabilities>(device, "/v1/worker/capabilities", { method: "GET", project: projectWorkerCapabilities }),
    getProbeSummary: (device) => request<WorkerProbeSummary>(device, "/v1/worker/probe", { method: "GET", project: projectWorkerProbeSummary }),
    listProjects: (device) => request<RemoteProject[]>(device, "/v1/projects", { method: "GET", project: projectProjectList }),
    listConversations: (device) => request<CodexConversation[]>(device, "/v1/conversations", { method: "GET", project: projectConversationList }),
    readTimeline: (device, conversationId) =>
      request<ConversationTimeline>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/timeline`, {
        method: "GET",
        notFoundCode: "conversation_not_found",
        project: projectConversationTimeline,
      }),
    listApprovals: (device, conversationId) =>
      request<PendingApproval[]>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/approvals`, {
        method: "GET",
        notFoundCode: "conversation_not_found",
        project: projectPendingApprovals,
      }),
    openConversation: (device, conversationId, input) =>
      request<OpenConversationResult>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/open`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectOpenConversationResult,
      }),
    archiveConversation: (device, conversationId, input) =>
      request<OpenConversationResult>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/archive`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectOpenConversationResult,
      }),
    unarchiveConversation: (device, conversationId, input) =>
      request<OpenConversationResult>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/unarchive`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectOpenConversationResult,
      }),
    renameConversation: (device, conversationId, input) =>
      request<OpenConversationResult>(device, `/v1/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectOpenConversationResult,
      }),
    startConversation: (device, input) => request<CommandAccepted>(device, "/v1/conversations", { method: "POST", body: input, project: projectCommandAccepted }),
    followUp: (device, conversationId, input) =>
      request<CommandAccepted>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/follow-up`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectCommandAccepted,
      }),
    interrupt: (device, conversationId, turnId, input) =>
      request<CommandAccepted>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/interrupt`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectCommandAccepted,
      }),
    steer: (device, conversationId, turnId, input) =>
      request<CommandAccepted>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/steer`, {
        method: "POST",
        body: input,
        notFoundCode: "conversation_not_found",
        project: projectCommandAccepted,
      }),
    decideApproval: (device, conversationId, approvalRequestId, input) =>
      request<CommandAccepted>(
        device,
        `/v1/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(approvalRequestId)}/decision`,
        { method: "POST", body: input, notFoundCode: "approval_not_found", project: projectCommandAccepted },
      ),
  };
}

async function readUpstreamError(response: Response): Promise<ErrorEnvelope | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const body = await response.json();
    if (!isRecord(body) || typeof body.code !== "string" || typeof body.message !== "string") {
      return null;
    }
    return {
      code: body.code,
      message: body.message,
      ...(isRecord(body.details) ? { details: projectErrorDetails(body.details) } : {}),
      ...(typeof body.requestId === "string" ? { requestId: body.requestId } : {}),
    };
  } catch {
    return null;
  }
}

function mapUpstreamStatus(status: number): number {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 408:
    case 409:
    case 424:
    case 500:
      return status;
    default:
      return 424;
  }
}

function mapUpstreamCode(status: number, code: string | undefined, notFoundCode: string | undefined): string {
  if (code && isSafeUpstreamCode(code)) {
    return code;
  }

  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "unauthorized";
    case 403:
      return "origin_forbidden";
    case 404:
      return notFoundCode ?? "device_unavailable";
    case 408:
      return "app_server_timeout";
    case 409:
      return "duplicate_request";
    case 424:
      return "app_server_unavailable";
    case 500:
      return "worker_internal_error";
    default:
      return "device_unavailable";
  }
}

function projectWorkerHealth(value: unknown): WorkerHealth {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "status", "checkedAt", "codexVersion", "appServer"]);
  const appServer = requireRecord(body.appServer);
  assertExactFields(appServer, ["transport", "readyz"]);
  return {
    deviceId: readString(body, "deviceId"),
    status: readEnum(body, "status", ["connected", "disconnected", "degraded", "unknown"]),
    checkedAt: readString(body, "checkedAt"),
    codexVersion: readNullableString(body, "codexVersion"),
    appServer: {
      transport: readEnum(appServer, "transport", ["loopbackWebSocket", "stdio", "unixSocket"]),
      readyz: readBoolean(appServer, "readyz"),
    },
  };
}

function projectWorkerCapabilities(value: unknown): WorkerCapabilities {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "canReadProjects", "canReadConversations", "canReadTimeline", "canRunReadOnlyProbe", "appServerTransport", "supportedSourceKinds"]);
  return {
    deviceId: readString(body, "deviceId"),
    canReadProjects: readBoolean(body, "canReadProjects"),
    canReadConversations: readBoolean(body, "canReadConversations"),
    canReadTimeline: readBoolean(body, "canReadTimeline"),
    canRunReadOnlyProbe: readBoolean(body, "canRunReadOnlyProbe"),
    appServerTransport: readEnum(body, "appServerTransport", ["loopbackWebSocket", "stdio", "unixSocket"]),
    supportedSourceKinds: readStringArray(body, "supportedSourceKinds"),
  };
}

function projectWorkerProbeSummary(value: unknown): WorkerProbeSummary {
  const body = requireRecord(value);
  assertExactFields(body, ["schemaVersion", "startedAt", "completedAt", "ok", "mode", "deviceId", "codexVersion", "appServer", "checks"]);
  const appServer = requireRecord(body.appServer);
  assertExactFields(appServer, ["transport", "startedByWorker", "readyz"]);

  return {
    schemaVersion: readNumber(body, "schemaVersion"),
    startedAt: readString(body, "startedAt"),
    completedAt: readString(body, "completedAt"),
    ok: readBoolean(body, "ok"),
    mode: readEnum(body, "mode", ["readOnly"]),
    deviceId: readString(body, "deviceId"),
    codexVersion: readNullableString(body, "codexVersion"),
    appServer: {
      transport: readEnum(appServer, "transport", ["loopbackWebSocket", "stdio", "unixSocket"]),
      startedByWorker: readBoolean(appServer, "startedByWorker"),
      readyz: readBoolean(appServer, "readyz"),
    },
    checks: requireArray(body.checks).map(projectProbeCheckResult),
  };
}

function projectProbeCheckResult(value: unknown): WorkerProbeSummary["checks"][number] {
  const body = requireRecord(value);
  assertExactFields(body, [
    "name",
    "ok",
    "durationMs",
    "failureType",
    "errorKind",
    "diagnosticId",
    "skippedReason",
    "exactCwdListProven",
    "completedUntilNextCursorNull",
    "pageCount",
    "cursorCount",
    "count",
    "reasonCode",
  ]);

  return {
    name: readString(body, "name"),
    ok: readBoolean(body, "ok"),
    durationMs: readNumber(body, "durationMs"),
    ...(typeof body.failureType === "string" ? { failureType: readEnum(body, "failureType", ["env_not_configured", "precondition_missing", "assertion_failed"]) } : {}),
    ...(typeof body.errorKind === "string" ? { errorKind: readString(body, "errorKind") } : {}),
    ...(typeof body.diagnosticId === "string" ? { diagnosticId: readString(body, "diagnosticId") } : {}),
    ...(typeof body.skippedReason === "string" ? { skippedReason: readString(body, "skippedReason") } : {}),
    ...(typeof body.exactCwdListProven === "boolean" ? { exactCwdListProven: readBoolean(body, "exactCwdListProven") } : {}),
    ...(typeof body.completedUntilNextCursorNull === "boolean" ? { completedUntilNextCursorNull: readBoolean(body, "completedUntilNextCursorNull") } : {}),
    ...(typeof body.pageCount === "number" ? { pageCount: readNumber(body, "pageCount") } : {}),
    ...(typeof body.cursorCount === "number" ? { cursorCount: readNumber(body, "cursorCount") } : {}),
    ...(typeof body.count === "number" ? { count: readNumber(body, "count") } : {}),
    ...(typeof body.reasonCode === "string" ? { reasonCode: readString(body, "reasonCode") } : {}),
  };
}

function projectConversationList(value: unknown): CodexConversation[] {
  return requireArray(value).map(projectConversation);
}

function projectProjectList(value: unknown): RemoteProject[] {
  return requireArray(value).map(projectRemoteProject);
}

function projectRemoteProject(value: unknown): RemoteProject {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "name", "deviceId", "path", "branch", "hasChanges", "pinned", "expanded"]);
  return {
    id: readString(body, "id"),
    name: readString(body, "name"),
    deviceId: readString(body, "deviceId"),
    path: readString(body, "path"),
    branch: readString(body, "branch"),
    hasChanges: readBoolean(body, "hasChanges"),
    pinned: readBoolean(body, "pinned"),
    expanded: readBoolean(body, "expanded"),
  };
}

function projectConversation(value: unknown): CodexConversation {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "title", "deviceId", "projectId", "projectName", "status", "updatedAt", "summary", "sandbox", "approval", "archived", "loaded", "live", "pinned"]);
  return {
    id: readString(body, "id"),
    title: readString(body, "title"),
    deviceId: readString(body, "deviceId"),
    ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
    projectName: readString(body, "projectName"),
    status: readEnum(body, "status", ["running", "waiting", "done", "failed", "unknown"]),
    updatedAt: readString(body, "updatedAt"),
    summary: readString(body, "summary"),
    sandbox: readString(body, "sandbox"),
    approval: readString(body, "approval"),
    ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
    ...(typeof body.loaded === "boolean" ? { loaded: body.loaded } : {}),
    ...(typeof body.live === "boolean" ? { live: body.live } : {}),
    ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
  };
}

function projectConversationTimeline(value: unknown): ConversationTimeline {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "conversationId", "projectId", "readStartedAt", "readCompletedAt", "snapshotRevision", "runtimeStatus", "latestTurnStatus", "loaded", "live", "archived", "turns", "events"]);
  return {
    deviceId: readString(body, "deviceId"),
    conversationId: readString(body, "conversationId"),
    ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
    readStartedAt: readString(body, "readStartedAt"),
    readCompletedAt: readString(body, "readCompletedAt"),
    snapshotRevision: readString(body, "snapshotRevision"),
    runtimeStatus: readEnum(body, "runtimeStatus", ["not_loaded", "idle", "running", "waiting_approval", "waiting_input", "unknown"]),
    latestTurnStatus: readEnum(body, "latestTurnStatus", ["completed", "interrupted", "failed", "unknown"]),
    ...(typeof body.loaded === "boolean" ? { loaded: body.loaded } : {}),
    ...(typeof body.live === "boolean" ? { live: body.live } : {}),
    ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
    turns: requireArray(body.turns).map(projectTimelineTurn),
    ...(Array.isArray(body.events) ? { events: body.events.map(projectWorkbenchEvent) } : {}),
  };
}

function projectOpenConversationResult(value: unknown): OpenConversationResult {
  const body = requireRecord(value);
  assertExactFields(body, ["conversation", "timeline"]);
  return {
    conversation: projectConversation(body.conversation),
    timeline: projectConversationTimeline(body.timeline),
  };
}

function projectWorkbenchEvent(value: unknown): ConversationWorkbenchEvent {
  const body = requireRecord(value);
  assertExactFields(body, ["eventId", "seq", "deviceId", "conversationId", "kind", "createdAt", "source", "gap", "approvalCard"]);
  return {
    eventId: readString(body, "eventId"),
    seq: readNumber(body, "seq"),
    deviceId: readString(body, "deviceId"),
    conversationId: readString(body, "conversationId"),
    kind: readEnum(body, "kind", ["thread_opened", "thread_archived", "thread_unarchived", "thread_renamed", "approval_pending", "approval_resolved", "snapshot_reset", "turn_state"]),
    createdAt: readString(body, "createdAt"),
    source: readEnum(body, "source", ["snapshot", "live"]),
    ...(typeof body.gap === "boolean" ? { gap: body.gap } : {}),
    ...(isRecord(body.approvalCard) ? { approvalCard: projectApprovalCard(body.approvalCard) } : {}),
  };
}

function projectApprovalCard(value: unknown): NonNullable<ConversationWorkbenchEvent["approvalCard"]> {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "conversationId", "turnId", "itemId", "kind", "status", "title", "summary", "risk", "createdAt", "resolvedAt"]);
  return {
    id: readString(body, "id"),
    conversationId: readString(body, "conversationId"),
    turnId: readString(body, "turnId"),
    itemId: readString(body, "itemId"),
    kind: readEnum(body, "kind", ["command_execution", "file_change", "legacy_exec", "legacy_apply_patch"]),
    status: readEnum(body, "status", ["pending", "resolved"]),
    title: readString(body, "title"),
    summary: readString(body, "summary"),
    risk: readEnum(body, "risk", ["low", "medium", "high", "unknown"]),
    createdAt: readString(body, "createdAt"),
    ...(typeof body.resolvedAt === "string" ? { resolvedAt: body.resolvedAt } : {}),
  };
}

function projectTimelineTurn(value: unknown): ConversationTimelineTurn {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "status", "startedAt", "completedAt", "durationMs"]);
  return {
    id: readString(body, "id"),
    status: readEnum(body, "status", ["in_progress", "completed", "interrupted", "failed", "unknown"]),
    startedAt: readNullableNumber(body, "startedAt"),
    completedAt: readNullableNumber(body, "completedAt"),
    durationMs: readNullableNumber(body, "durationMs"),
  };
}

function projectPendingApprovals(value: unknown): PendingApproval[] {
  return requireArray(value).map((approval) => {
    const body = requireRecord(approval);
    assertExactFields(body, ["id", "conversationId", "turnId", "itemId", "kind", "status", "startedAt", "summary", "risk"]);
    return {
      id: readString(body, "id"),
      conversationId: readString(body, "conversationId"),
      turnId: readString(body, "turnId"),
      itemId: readString(body, "itemId"),
      kind: readEnum(body, "kind", ["command_execution", "file_change", "legacy_exec", "legacy_apply_patch"]),
      status: readEnum(body, "status", ["pending"]),
      startedAt: readString(body, "startedAt"),
      summary: readString(body, "summary"),
      risk: readEnum(body, "risk", ["low", "medium", "high", "unknown"]),
    };
  });
}

function projectCommandAccepted(value: unknown): CommandAccepted {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "status", "conversationId", "turnId", "acceptedAt"]);
  return {
    id: readString(body, "id"),
    status: readEnum(body, "status", ["accepted"]),
    conversationId: readString(body, "conversationId"),
    turnId: readNullableString(body, "turnId"),
    acceptedAt: readString(body, "acceptedAt"),
  };
}

function projectErrorDetails(details: Record<string, unknown>): NonNullable<ErrorEnvelope["details"]> {
  return {
    ...(typeof details.operation === "string" ? { operation: details.operation } : {}),
    ...(typeof details.retryable === "boolean" ? { retryable: details.retryable } : {}),
    ...(typeof details.diagnosticId === "string" ? { diagnosticId: details.diagnosticId } : {}),
    ...(typeof details.reason === "string" ? { reason: details.reason } : {}),
    ...(typeof details.field === "string" ? { field: details.field } : {}),
    ...(typeof details.limit === "number" ? { limit: details.limit } : {}),
    ...(typeof details.expected === "string" ? { expected: details.expected } : {}),
    ...(typeof details.actualKind === "string" ? { actualKind: details.actualKind } : {}),
    ...(typeof details.deviceId === "string" ? { deviceId: details.deviceId } : {}),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { operation: "worker_response", retryable: false });
  }
  return value;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { operation: "worker_response", retryable: false });
  }
  return value;
}

function assertExactFields(body: Record<string, unknown>, fields: readonly string[]): void {
  const allowed = new Set(fields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { operation: "worker_response", retryable: false });
  }
}

function readString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
  }
  return value;
}

function readNullableString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === null || typeof value === "string") {
    return value;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
}

function readBoolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
  }
  return value;
}

function readNullableNumber(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  if (value === null || typeof value === "number") {
    return value;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
}

function readNumber(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value === "number") {
    return value;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
}

function readStringArray(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
}

function readEnum<const TValue extends string>(body: Record<string, unknown>, field: string, allowed: readonly TValue[]): TValue {
  const value = body[field];
  if (typeof value === "string" && allowed.includes(value as TValue)) {
    return value as TValue;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSafeUpstreamCode(code: string): boolean {
  return [
    "invalid_request",
    "unauthorized",
    "origin_forbidden",
    "project_forbidden",
    "conversation_not_found",
    "turn_not_found",
    "approval_not_found",
    "app_server_timeout",
    "app_server_unavailable",
    "control_not_supported",
    "duplicate_request",
    "worker_config_invalid",
    "worker_internal_error",
  ].includes(code);
}
