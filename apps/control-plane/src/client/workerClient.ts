import type {
  AdvancedPlatformReadinessSummary,
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
  ExtensionInventory,
  LocalWorkbenchSummary,
  McpServerSummary,
  OpenConversationResult,
  PendingApproval,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  RemoteProject,
  RenameConversationInput,
  ProjectSearchResult,
  RuntimeSettingsSummary,
  StartConversationInput,
  StartReviewInput,
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
  getLocalWorkbenchSummary(device: ConfiguredWorkerDevice, projectId: string): Promise<LocalWorkbenchSummary>;
  listProjectFiles(device: ConfiguredWorkerDevice, projectId: string, path?: string): Promise<ProjectDirectoryListing>;
  getProjectFilePreview(device: ConfiguredWorkerDevice, projectId: string, path: string): Promise<ProjectFilePreview>;
  getProjectGitSummary(device: ConfiguredWorkerDevice, projectId: string): Promise<ProjectGitSummary>;
  searchProjectFiles(
    device: ConfiguredWorkerDevice,
    projectId: string,
    input: { limit?: number; path?: string; query: string },
  ): Promise<ProjectSearchResult>;
  getMcpServerSummary(device: ConfiguredWorkerDevice, projectId: string): Promise<McpServerSummary>;
  getExtensionInventory(device: ConfiguredWorkerDevice, projectId: string): Promise<ExtensionInventory>;
  getRuntimeSettingsSummary(device: ConfiguredWorkerDevice, projectId: string): Promise<RuntimeSettingsSummary>;
  getAdvancedPlatformReadinessSummary(device: ConfiguredWorkerDevice, projectId: string): Promise<AdvancedPlatformReadinessSummary>;
  listConversations(device: ConfiguredWorkerDevice): Promise<CodexConversation[]>;
  readTimeline(device: ConfiguredWorkerDevice, conversationId: string): Promise<ConversationTimeline>;
  openConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  archiveConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  unarchiveConversation(device: ConfiguredWorkerDevice, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  renameConversation(device: ConfiguredWorkerDevice, conversationId: string, input: RenameConversationInput): Promise<OpenConversationResult>;
  listApprovals(device: ConfiguredWorkerDevice, conversationId: string): Promise<PendingApproval[]>;
  startConversation(device: ConfiguredWorkerDevice, input: StartConversationInput): Promise<CommandAccepted>;
  followUp(device: ConfiguredWorkerDevice, conversationId: string, input: FollowUpInput): Promise<CommandAccepted>;
  startReview(device: ConfiguredWorkerDevice, conversationId: string, input: StartReviewInput): Promise<CommandAccepted>;
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
    getLocalWorkbenchSummary: (device, projectId) =>
      request<LocalWorkbenchSummary>(device, `/v1/projects/${encodeURIComponent(projectId)}/local-workbench/summary`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectLocalWorkbenchSummary,
      }),
    listProjectFiles: (device, projectId, path) =>
      request<ProjectDirectoryListing>(device, withQuery(`/v1/projects/${encodeURIComponent(projectId)}/local-workbench/files`, path === undefined ? {} : { path }), {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectDirectoryListing,
      }),
    getProjectFilePreview: (device, projectId, path) =>
      request<ProjectFilePreview>(device, withQuery(`/v1/projects/${encodeURIComponent(projectId)}/local-workbench/file-preview`, { path }), {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectFilePreview,
      }),
    getProjectGitSummary: (device, projectId) =>
      request<ProjectGitSummary>(device, `/v1/projects/${encodeURIComponent(projectId)}/local-workbench/git`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectGitSummary,
      }),
    searchProjectFiles: (device, projectId, input) =>
      request<ProjectSearchResult>(
        device,
        withQuery(`/v1/projects/${encodeURIComponent(projectId)}/local-workbench/search`, {
          query: input.query,
          ...(input.path === undefined ? {} : { path: input.path }),
          ...(input.limit === undefined ? {} : { limit: String(input.limit) }),
        }),
        {
          method: "GET",
          notFoundCode: "project_not_found",
          project: projectSearchResult,
        },
      ),
    getMcpServerSummary: (device, projectId) =>
      request<McpServerSummary>(device, `/v1/projects/${encodeURIComponent(projectId)}/local-workbench/mcp`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectMcpServerSummary,
      }),
    getExtensionInventory: (device, projectId) =>
      request<ExtensionInventory>(device, `/v1/projects/${encodeURIComponent(projectId)}/local-workbench/extensions`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectExtensionInventory,
      }),
    getRuntimeSettingsSummary: (device, projectId) =>
      request<RuntimeSettingsSummary>(device, `/v1/projects/${encodeURIComponent(projectId)}/runtime-settings`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectRuntimeSettingsSummary,
      }),
    getAdvancedPlatformReadinessSummary: (device, projectId) =>
      request<AdvancedPlatformReadinessSummary>(device, `/v1/projects/${encodeURIComponent(projectId)}/advanced-platform-readiness`, {
        method: "GET",
        notFoundCode: "project_not_found",
        project: projectAdvancedPlatformReadinessSummary,
      }),
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
    startReview: (device, conversationId, input) =>
      request<CommandAccepted>(device, `/v1/conversations/${encodeURIComponent(conversationId)}/local-actions/review-start`, {
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

function projectLocalWorkbenchSummary(value: unknown): LocalWorkbenchSummary {
  const body = requireRecord(value);
  assertExactFields(body, [
    "deviceId",
    "projectId",
    "projectName",
    "fileCount",
    "directoryCount",
    "gitStatus",
    "searchResultCount",
    "mcpServerCount",
    "extensionCount",
    "previewAvailable",
  ]);
  return {
    deviceId: readString(body, "deviceId"),
    projectId: readString(body, "projectId"),
    projectName: readString(body, "projectName"),
    fileCount: readNumber(body, "fileCount"),
    directoryCount: readNumber(body, "directoryCount"),
    gitStatus: readEnum(body, "gitStatus", ["clean", "dirty", "unavailable", "unknown"]),
    searchResultCount: readNumber(body, "searchResultCount"),
    mcpServerCount: readNumber(body, "mcpServerCount"),
    extensionCount: readNumber(body, "extensionCount"),
    ...(typeof body.previewAvailable === "boolean" ? { previewAvailable: readBoolean(body, "previewAvailable") } : {}),
  };
}

function projectDirectoryListing(value: unknown): ProjectDirectoryListing {
  const body = requireRecord(value);
  assertExactFields(body, ["entries"]);
  return {
    entries: requireArray(body.entries).map(projectDirectoryEntry),
  };
}

function projectDirectoryEntry(value: unknown): ProjectDirectoryListing["entries"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["path", "name", "kind", "sizeBytes", "modifiedAt", "childCount", "truncated"]);
  return {
    path: readString(body, "path"),
    name: readString(body, "name"),
    kind: readEnum(body, "kind", ["directory", "file"]),
    ...(body.sizeBytes === undefined ? {} : { sizeBytes: readNullableNumber(body, "sizeBytes") }),
    ...(body.modifiedAt === undefined ? {} : { modifiedAt: readNullableString(body, "modifiedAt") }),
    ...(body.childCount === undefined ? {} : { childCount: readNullableNumber(body, "childCount") }),
    ...(typeof body.truncated === "boolean" ? { truncated: readBoolean(body, "truncated") } : {}),
  };
}

function projectFilePreview(value: unknown): ProjectFilePreview {
  const body = requireRecord(value);
  assertExactFields(body, ["path", "previewKind", "mimeType", "byteCount", "lineCount", "truncated", "previewText", "reason"]);
  return {
    path: readString(body, "path"),
    previewKind: readEnum(body, "previewKind", ["text", "unavailable"]),
    ...(body.mimeType === undefined ? {} : { mimeType: readNullableString(body, "mimeType") }),
    ...(body.byteCount === undefined ? {} : { byteCount: readNullableNumber(body, "byteCount") }),
    ...(body.lineCount === undefined ? {} : { lineCount: readNullableNumber(body, "lineCount") }),
    truncated: readBoolean(body, "truncated"),
    ...(body.previewText === undefined ? {} : { previewText: readNullableString(body, "previewText") }),
    ...(body.reason === undefined ? {} : { reason: readNullableString(body, "reason") }),
  };
}

function projectGitSummary(value: unknown): ProjectGitSummary {
  const body = requireRecord(value);
  assertExactFields(body, ["branch", "status", "aheadCount", "behindCount", "stagedCount", "unstagedCount", "untrackedCount", "reviewState", "changedFiles"]);
  return {
    branch: readString(body, "branch"),
    status: readEnum(body, "status", ["clean", "dirty", "detached", "unavailable", "unknown"]),
    aheadCount: readNumber(body, "aheadCount"),
    behindCount: readNumber(body, "behindCount"),
    stagedCount: readNumber(body, "stagedCount"),
    unstagedCount: readNumber(body, "unstagedCount"),
    untrackedCount: readNumber(body, "untrackedCount"),
    ...(typeof body.reviewState === "string" ? { reviewState: readEnum(body, "reviewState", ["not_requested", "in_review", "changes_requested", "approved", "unknown"]) } : {}),
    changedFiles: requireArray(body.changedFiles).map(projectChangedFile),
  };
}

function projectChangedFile(value: unknown): ProjectGitSummary["changedFiles"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["path", "status", "additions", "deletions"]);
  return {
    path: readString(body, "path"),
    status: readEnum(body, "status", ["added", "modified", "deleted", "renamed", "copied", "untracked", "ignored", "unknown"]),
    ...(body.additions === undefined ? {} : { additions: readNullableNumber(body, "additions") }),
    ...(body.deletions === undefined ? {} : { deletions: readNullableNumber(body, "deletions") }),
  };
}

function projectSearchResult(value: unknown): ProjectSearchResult {
  const body = requireRecord(value);
  assertExactFields(body, ["query", "matches"]);
  return {
    query: readString(body, "query"),
    matches: requireArray(body.matches).map(projectSearchMatch),
  };
}

function projectSearchMatch(value: unknown): ProjectSearchResult["matches"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["path", "lineNumber", "columnNumber", "match", "snippet", "score"]);
  return {
    path: readString(body, "path"),
    lineNumber: readNumber(body, "lineNumber"),
    ...(body.columnNumber === undefined ? {} : { columnNumber: readNullableNumber(body, "columnNumber") }),
    match: readString(body, "match"),
    ...(body.snippet === undefined ? {} : { snippet: readNullableString(body, "snippet") }),
    ...(body.score === undefined ? {} : { score: readNullableNumber(body, "score") }),
  };
}

function projectMcpServerSummary(value: unknown): McpServerSummary {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "projectId", "servers"]);
  return {
    deviceId: readString(body, "deviceId"),
    projectId: readString(body, "projectId"),
    servers: requireArray(body.servers).map(projectMcpServer),
  };
}

function projectMcpServer(value: unknown): McpServerSummary["servers"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["name", "status", "description", "tools", "resources", "resourceTemplates", "authStatus"]);
  return {
    name: readString(body, "name"),
    status: readEnum(body, "status", ["connected", "disconnected", "initializing", "error", "unknown"]),
    ...(body.description === undefined ? {} : { description: readNullableString(body, "description") }),
    tools: readStringArray(body, "tools"),
    resources: readStringArray(body, "resources"),
    resourceTemplates: readStringArray(body, "resourceTemplates"),
    ...(typeof body.authStatus === "string" ? { authStatus: readEnum(body, "authStatus", ["ready", "needs_auth", "error", "unknown"]) } : {}),
  };
}

function projectExtensionInventory(value: unknown): ExtensionInventory {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "projectId", "skills", "hooks", "plugins", "marketplaceEntries", "apps"]);
  return {
    deviceId: readString(body, "deviceId"),
    projectId: readString(body, "projectId"),
    skills: requireArray(body.skills).map(projectSkillSummary),
    hooks: requireArray(body.hooks).map(projectHookSummary),
    plugins: requireArray(body.plugins).map(projectPluginSummary),
    marketplaceEntries: requireArray(body.marketplaceEntries).map(projectMarketplaceEntry),
    apps: requireArray(body.apps).map(projectAppSummary),
  };
}

function projectRuntimeSettingsSummary(value: unknown): RuntimeSettingsSummary {
  const body = requireRecord(value);
  assertExactFields(body, [
    "deviceId",
    "projectId",
    "readAt",
    "sections",
    "models",
    "providerCapabilities",
    "account",
    "config",
    "permissionProfiles",
    "experimentalFeatures",
  ]);
  return {
    deviceId: readString(body, "deviceId"),
    projectId: readString(body, "projectId"),
    readAt: readString(body, "readAt"),
    sections: requireArray(body.sections).map(projectRuntimeSettingsSectionStatus),
    models: requireArray(body.models).map(projectRuntimeModelSummary),
    providerCapabilities: projectRuntimeProviderCapabilities(body.providerCapabilities),
    account: projectRuntimeAccountSummary(body.account),
    config: projectRuntimeConfigPosture(body.config),
    permissionProfiles: requireArray(body.permissionProfiles).map(projectRuntimePermissionProfileSummary),
    experimentalFeatures: requireArray(body.experimentalFeatures).map(projectRuntimeExperimentalFeatureSummary),
  };
}

function projectAdvancedPlatformReadinessSummary(value: unknown): AdvancedPlatformReadinessSummary {
  const body = requireRecord(value);
  assertExactFields(body, ["deviceId", "projectId", "readAt", "platform", "readinessSections", "watchlistItems"]);
  return {
    deviceId: readString(body, "deviceId"),
    projectId: readString(body, "projectId"),
    readAt: readString(body, "readAt"),
    platform: readEnum(body, "platform", ["macos", "windows", "linux", "unknown"]),
    readinessSections: requireArray(body.readinessSections).map(projectAdvancedPlatformReadinessSection),
    watchlistItems: requireArray(body.watchlistItems).map(projectAdvancedPlatformWatchlistItem),
  };
}

function projectAdvancedPlatformReadinessSection(value: unknown): AdvancedPlatformReadinessSummary["readinessSections"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "label", "status", "summary", "details", "error"]);
  return {
    id: readString(body, "id"),
    label: readString(body, "label"),
    status: readEnum(body, "status", ["ready", "not_applicable", "degraded", "unavailable"]),
    summary: readString(body, "summary"),
    ...(body.details === undefined ? {} : { details: readNullableString(body, "details") }),
    ...(isRecord(body.error) ? { error: projectAdvancedPlatformSectionError(body.error) } : {}),
  };
}

function projectAdvancedPlatformSectionError(value: unknown): ErrorEnvelope {
  const body = requireRecord(value);
  assertExactFields(body, ["code", "message", "details", "requestId"]);
  return {
    code: isSafeUpstreamCode(readString(body, "code")) ? readString(body, "code") : "worker_internal_error",
    message: "Advanced platform section is unavailable.",
    ...(isRecord(body.details) ? { details: projectRuntimeSectionErrorDetails(body.details) } : {}),
    ...(typeof body.requestId === "string" ? { requestId: readString(body, "requestId") } : {}),
  };
}

function projectAdvancedPlatformWatchlistItem(value: unknown): AdvancedPlatformReadinessSummary["watchlistItems"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "label", "support", "reason", "nextSafeStep"]);
  return {
    id: readString(body, "id"),
    label: readString(body, "label"),
    support: readEnum(body, "support", ["not_supported", "deferred"]),
    reason: readString(body, "reason"),
    nextSafeStep: readString(body, "nextSafeStep"),
  };
}

function projectRuntimeSettingsSectionStatus(value: unknown): RuntimeSettingsSummary["sections"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["section", "status", "error"]);
  return {
    section: readEnum(body, "section", ["models", "providerCapabilities", "account", "config", "permissionProfiles", "experimentalFeatures"]),
    status: readEnum(body, "status", ["loaded", "degraded", "unavailable"]),
    ...(body.error === undefined ? {} : { error: projectErrorEnvelope(body.error) }),
  };
}

function projectRuntimeModelSummary(value: unknown): RuntimeSettingsSummary["models"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "displayName", "isDefault", "supportedReasoningEfforts", "inputModalities", "serviceTiers"]);
  return {
    id: readString(body, "id"),
    displayName: readString(body, "displayName"),
    isDefault: readBoolean(body, "isDefault"),
    supportedReasoningEfforts: readStringArray(body, "supportedReasoningEfforts"),
    inputModalities: readStringArray(body, "inputModalities"),
    serviceTiers: readStringArray(body, "serviceTiers"),
  };
}

function projectRuntimeProviderCapabilities(value: unknown): RuntimeSettingsSummary["providerCapabilities"] {
  const body = requireRecord(value);
  assertExactFields(body, ["supportsReasoning", "supportsImages", "supportsWebSearch", "supportsStructuredOutput"]);
  return {
    supportsReasoning: readBoolean(body, "supportsReasoning"),
    supportsImages: readBoolean(body, "supportsImages"),
    supportsWebSearch: readBoolean(body, "supportsWebSearch"),
    supportsStructuredOutput: readBoolean(body, "supportsStructuredOutput"),
  };
}

function projectRuntimeAccountSummary(value: unknown): RuntimeSettingsSummary["account"] {
  const body = requireRecord(value);
  assertExactFields(body, ["type", "planType", "emailDomain", "requiresOpenaiAuth"]);
  return {
    type: readString(body, "type"),
    planType: readNullableString(body, "planType"),
    emailDomain: readNullableString(body, "emailDomain"),
    requiresOpenaiAuth: readBoolean(body, "requiresOpenaiAuth"),
  };
}

function projectRuntimeConfigPosture(value: unknown): RuntimeSettingsSummary["config"] {
  const body = requireRecord(value);
  assertExactFields(body, [
    "model",
    "reviewModel",
    "modelProvider",
    "approvalPolicy",
    "approvalsReviewer",
    "sandboxMode",
    "reasoningEffort",
    "serviceTier",
    "webSearch",
    "customGuidanceOmitted",
    "developerGuidanceOmitted",
    "compactionGuidanceOmitted",
  ]);
  return {
    model: readNullableString(body, "model"),
    reviewModel: readNullableString(body, "reviewModel"),
    modelProvider: readNullableString(body, "modelProvider"),
    approvalPolicy: readNullableString(body, "approvalPolicy"),
    approvalsReviewer: readNullableString(body, "approvalsReviewer"),
    sandboxMode: readNullableString(body, "sandboxMode"),
    reasoningEffort: readNullableString(body, "reasoningEffort"),
    serviceTier: readNullableString(body, "serviceTier"),
    webSearch: readNullableBoolean(body, "webSearch"),
    customGuidanceOmitted: readBoolean(body, "customGuidanceOmitted"),
    developerGuidanceOmitted: readBoolean(body, "developerGuidanceOmitted"),
    compactionGuidanceOmitted: readBoolean(body, "compactionGuidanceOmitted"),
  };
}

function projectRuntimePermissionProfileSummary(value: unknown): RuntimeSettingsSummary["permissionProfiles"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "description"]);
  return {
    id: readString(body, "id"),
    description: readNullableString(body, "description"),
  };
}

function projectRuntimeExperimentalFeatureSummary(value: unknown): RuntimeSettingsSummary["experimentalFeatures"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["name", "stage", "displayName", "description", "enabled", "defaultEnabled"]);
  return {
    name: readString(body, "name"),
    stage: readString(body, "stage"),
    displayName: readNullableString(body, "displayName"),
    description: readNullableString(body, "description"),
    enabled: readBoolean(body, "enabled"),
    defaultEnabled: readBoolean(body, "defaultEnabled"),
  };
}

function projectErrorEnvelope(value: unknown): ErrorEnvelope {
  const body = requireRecord(value);
  assertExactFields(body, ["code", "message", "details", "requestId"]);
  return {
    code: isSafeUpstreamCode(readString(body, "code")) ? readString(body, "code") : "worker_internal_error",
    message: "Runtime settings section is unavailable.",
    ...(isRecord(body.details) ? { details: projectRuntimeSectionErrorDetails(body.details) } : {}),
    ...(typeof body.requestId === "string" ? { requestId: readString(body, "requestId") } : {}),
  };
}

function projectRuntimeSectionErrorDetails(details: Record<string, unknown>): NonNullable<ErrorEnvelope["details"]> {
  return {
    ...(typeof details.operation === "string" && isSafeDetailText(details.operation) ? { operation: details.operation } : {}),
    ...(typeof details.retryable === "boolean" ? { retryable: details.retryable } : {}),
    ...(typeof details.diagnosticId === "string" && isSafeDetailText(details.diagnosticId) ? { diagnosticId: details.diagnosticId } : {}),
    ...(typeof details.field === "string" && isSafeDetailText(details.field) ? { field: details.field } : {}),
    ...(typeof details.limit === "number" ? { limit: details.limit } : {}),
    ...(typeof details.expected === "string" && isSafeDetailText(details.expected) ? { expected: details.expected } : {}),
    ...(typeof details.actualKind === "string" && isSafeDetailText(details.actualKind) ? { actualKind: details.actualKind } : {}),
  };
}

function projectSkillSummary(value: unknown): ExtensionInventory["skills"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["name", "enabled", "description", "status"]);
  return {
    name: readString(body, "name"),
    enabled: readBoolean(body, "enabled"),
    ...(body.description === undefined ? {} : { description: readNullableString(body, "description") }),
    ...(typeof body.status === "string" ? { status: readEnum(body, "status", ["installed", "available", "unknown"]) } : {}),
  };
}

function projectHookSummary(value: unknown): ExtensionInventory["hooks"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["name", "enabled", "description", "event"]);
  return {
    name: readString(body, "name"),
    enabled: readBoolean(body, "enabled"),
    ...(body.description === undefined ? { description: null } : { description: readNullableString(body, "description") }),
    ...(body.event === undefined ? { event: null } : { event: readNullableString(body, "event") }),
  };
}

function projectPluginSummary(value: unknown): ExtensionInventory["plugins"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "name", "enabled", "description", "skillCount", "appCount", "mcpServerCount"]);
  return {
    id: readString(body, "id"),
    name: readString(body, "name"),
    enabled: readBoolean(body, "enabled"),
    ...(body.description === undefined ? { description: null } : { description: readNullableString(body, "description") }),
    ...(body.skillCount === undefined ? { skillCount: null } : { skillCount: readNullableNumber(body, "skillCount") }),
    ...(body.appCount === undefined ? { appCount: null } : { appCount: readNullableNumber(body, "appCount") }),
    ...(body.mcpServerCount === undefined ? { mcpServerCount: null } : { mcpServerCount: readNullableNumber(body, "mcpServerCount") }),
  };
}

function projectMarketplaceEntry(value: unknown): ExtensionInventory["marketplaceEntries"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["name", "installStatus", "description"]);
  return {
    name: readString(body, "name"),
    installStatus: readEnum(body, "installStatus", ["installed", "not_installed", "unknown"]),
    ...(body.description === undefined ? { description: null } : { description: readNullableString(body, "description") }),
  };
}

function projectAppSummary(value: unknown): ExtensionInventory["apps"][number] {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "name", "enabled", "description"]);
  return {
    id: readString(body, "id"),
    name: readString(body, "name"),
    enabled: readBoolean(body, "enabled"),
    ...(body.description === undefined ? { description: null } : { description: readNullableString(body, "description") }),
  };
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
  assertExactFields(body, ["id", "status", "startedAt", "completedAt", "durationMs", "itemsView", "nodes"]);
  return {
    id: readString(body, "id"),
    status: readEnum(body, "status", ["in_progress", "completed", "interrupted", "failed", "unknown"]),
    startedAt: readNullableNumber(body, "startedAt"),
    completedAt: readNullableNumber(body, "completedAt"),
    durationMs: readNullableNumber(body, "durationMs"),
    itemsView: readEnum(body, "itemsView", ["full", "partial", "unknown"]),
    nodes: requireArray(body.nodes).map(projectTimelineNode),
  };
}

function projectTimelineNode(value: unknown): ConversationTimelineTurn["nodes"][number] {
  const body = requireRecord(value);
  const type = readEnum(body, "type", ["text", "context", "tool"]);
  if (type === "text") {
    assertExactFields(body, ["id", "type", "role", "text"]);
    return {
      id: readString(body, "id"),
      type,
      role: readEnum(body, "role", ["assistant", "user", "unknown"]),
      text: readString(body, "text"),
    };
  }
  if (type === "tool") {
    assertExactFields(body, ["id", "type", "kind", "status", "label"]);
    return {
      id: readString(body, "id"),
      type,
      kind: readEnum(body, "kind", ["command", "file_change", "mcp", "web_search", "image", "neutral", "other"]),
      status: readEnum(body, "status", ["completed", "failed", "running", "unknown"]),
      label: readString(body, "label"),
    };
  }
  assertExactFields(body, ["id", "type", "text"]);
  return {
    id: readString(body, "id"),
    type,
    text: readString(body, "text"),
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

function readNullableBoolean(body: Record<string, unknown>, field: string): boolean | null {
  const value = body[field];
  if (value === null || typeof value === "boolean") {
    return value;
  }
  throw new ControlPlaneHttpError(424, "device_unavailable", "Device response was invalid.", { field, operation: "worker_response", retryable: false });
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

function isSafeDetailText(value: string): boolean {
  return /^[A-Za-z0-9_./:-]{1,120}$/.test(value) && !/https?:|token|secret|stack|cause|jsonrpc|\/Users\//i.test(value);
}

function isSafeUpstreamCode(code: string): boolean {
  return [
    "invalid_request",
    "unauthorized",
    "origin_forbidden",
    "project_forbidden",
    "project_not_found",
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

function withQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    search.set(key, value);
  }
  const serialized = search.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}
