import type {
  AdvancedPlatformReadinessSummary,
  CodexConversation,
  BoardTask,
  CommandAccepted,
  ConversationQueuedMessage,
  ConversationTimeline,
  CreateTaskInput,
  Device,
  ErrorEnvelope,
  ExtensionInventory,
  FollowUpInput,
  ApprovalDecisionInput,
  ConversationLifecycleInput,
  InterruptTurnInput,
  LinkTaskConversationInput,
  LocalWorkbenchSummary,
  McpServerSummary,
  OpenConversationResult,
  PendingApproval,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  ProjectSearchResult,
  QueueConversationMessageInput,
  RemoteProject,
  RenameConversationInput,
  RuntimeSettingsSummary,
  SendQueuedConversationMessageInput,
  StartConversationInput,
  StartReviewInput,
  SteerTurnInput,
  TaskConversationLink,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

export interface WorkerApiClientConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export interface WorkerApiClientLike {
  getHealth(deviceId: string): Promise<WorkerHealth>;
  getCapabilities(deviceId: string): Promise<WorkerCapabilities>;
  listDevices(): Promise<Device[]>;
  listProjects(): Promise<RemoteProject[]>;
  listConversations(): Promise<CodexConversation[]>;
  listTasks(): Promise<BoardTask[]>;
  createTask(input: CreateTaskInput): Promise<BoardTask>;
  linkTaskConversation(taskId: string, input: LinkTaskConversationInput): Promise<TaskConversationLink>;
  unlinkTaskConversation(taskId: string, deviceId: string, conversationId: string): Promise<void>;
  getTimeline(deviceId: string, conversationId: string): Promise<ConversationTimeline>;
  openConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  archiveConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  unarchiveConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult>;
  renameConversation(deviceId: string, conversationId: string, input: RenameConversationInput): Promise<OpenConversationResult>;
  startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted>;
  startReview(deviceId: string, conversationId: string, input: StartReviewInput): Promise<CommandAccepted>;
  followUpConversation(deviceId: string, conversationId: string, input: FollowUpInput): Promise<CommandAccepted>;
  listQueuedMessages(deviceId: string, conversationId: string): Promise<ConversationQueuedMessage[]>;
  queueConversationMessage(deviceId: string, conversationId: string, input: QueueConversationMessageInput): Promise<ConversationQueuedMessage>;
  cancelQueuedMessage(deviceId: string, conversationId: string, queuedMessageId: string): Promise<void>;
  sendQueuedMessage(deviceId: string, conversationId: string, queuedMessageId: string, input: SendQueuedConversationMessageInput): Promise<CommandAccepted>;
  interruptTurn(deviceId: string, conversationId: string, turnId: string, input: InterruptTurnInput): Promise<CommandAccepted>;
  steerTurn(deviceId: string, conversationId: string, turnId: string, input: SteerTurnInput): Promise<CommandAccepted>;
  listApprovals(deviceId: string, conversationId: string): Promise<PendingApproval[]>;
  decideApproval(deviceId: string, conversationId: string, approvalRequestId: string, input: ApprovalDecisionInput): Promise<CommandAccepted>;
  getLocalWorkbenchSummary(deviceId: string, projectId: string): Promise<LocalWorkbenchSummary>;
  listLocalWorkbenchFiles(deviceId: string, projectId: string, path?: string): Promise<ProjectDirectoryListing>;
  getLocalWorkbenchFilePreview(deviceId: string, projectId: string, path: string): Promise<ProjectFilePreview>;
  getLocalWorkbenchGitSummary(deviceId: string, projectId: string): Promise<ProjectGitSummary>;
  searchLocalWorkbenchFiles(
    deviceId: string,
    projectId: string,
    options: { limit?: number; path?: string; query: string },
  ): Promise<ProjectSearchResult>;
  getLocalWorkbenchMcpSummary(deviceId: string, projectId: string): Promise<McpServerSummary>;
  getLocalWorkbenchExtensionInventory(deviceId: string, projectId: string): Promise<ExtensionInventory>;
  getRuntimeSettingsSummary(deviceId: string, projectId: string): Promise<RuntimeSettingsSummary>;
  getAdvancedPlatformReadinessSummary(deviceId: string, projectId: string): Promise<AdvancedPlatformReadinessSummary>;
}

type RequestOptions = {
  body?: unknown;
  method?: string;
};

type JsonValue = unknown;
type SanitizedErrorEnvelope = {
  code: string;
  message: string;
  details?: ErrorEnvelope["details"];
  requestId?: string;
};

const errorDetailKeys = new Set(["operation", "retryable", "diagnosticId", "reason", "field", "limit", "expected", "actualKind", "deviceId"]);
const fallbackErrorMessage = "Worker request failed.";
const defaultRequestTimeoutMs = 10_000;

export interface WorkerApiErrorEnvelope extends Error {
  status: number;
  envelope: SanitizedErrorEnvelope;
}

export class WorkerApiRequestError extends Error implements WorkerApiErrorEnvelope {
  public readonly status: number;
  public readonly envelope: SanitizedErrorEnvelope;

  public constructor(
    status: number,
    envelope: SanitizedErrorEnvelope,
  ) {
    super(envelope.message);
    this.name = "WorkerApiRequestError";
    this.status = status;
    this.envelope = envelope;
  }
}

export class WorkerApiClient implements WorkerApiClientLike {
  private readonly fetchImpl: typeof fetch;
  private readonly config: WorkerApiClientConfig;

  public constructor(config: WorkerApiClientConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public async getHealth(deviceId: string): Promise<WorkerHealth> {
    const response = await this.request<WorkerHealth>(`/v1/devices/${encodeURIComponent(deviceId)}/worker/health`);
    return response;
  }

  public async getCapabilities(deviceId: string): Promise<WorkerCapabilities> {
    const response = await this.request<WorkerCapabilities>(`/v1/devices/${encodeURIComponent(deviceId)}/worker/capabilities`);
    return response;
  }

  public async listDevices(): Promise<Device[]> {
    const response = await this.request<Device[]>("/v1/devices");
    return response;
  }

  public async listProjects(): Promise<RemoteProject[]> {
    const response = await this.request<RemoteProject[]>("/v1/projects");
    return response;
  }

  public async listConversations(): Promise<CodexConversation[]> {
    const response = await this.request<CodexConversation[]>("/v1/conversations");
    return response;
  }

  public async listTasks(): Promise<BoardTask[]> {
    return this.request<BoardTask[]>("/v1/tasks");
  }

  public async createTask(input: CreateTaskInput): Promise<BoardTask> {
    return this.request<BoardTask>("/v1/tasks", {
      body: input,
      method: "POST",
    });
  }

  public async linkTaskConversation(taskId: string, input: LinkTaskConversationInput): Promise<TaskConversationLink> {
    return this.request<TaskConversationLink>(`/v1/tasks/${encodeURIComponent(taskId)}/conversation-links`, {
      body: input,
      method: "POST",
    });
  }

  public async unlinkTaskConversation(taskId: string, deviceId: string, conversationId: string): Promise<void> {
    await this.request<void>(
      `/v1/tasks/${encodeURIComponent(taskId)}/conversation-links/${encodeURIComponent(deviceId)}/${encodeURIComponent(conversationId)}`,
      {
        method: "DELETE",
      },
    );
  }

  public async getTimeline(deviceId: string, conversationId: string): Promise<ConversationTimeline> {
    const response = await this.request<ConversationTimeline>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/timeline`,
    );
    return response;
  }

  public async startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted> {
    const response = await this.request<CommandAccepted>(`/v1/devices/${encodeURIComponent(deviceId)}/conversations`, {
      body: input,
      method: "POST",
    });
    return response;
  }

  public async startReview(deviceId: string, conversationId: string, input: StartReviewInput): Promise<CommandAccepted> {
    return this.request<CommandAccepted>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/local-actions/review-start`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async openConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    return this.request<OpenConversationResult>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/open`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async archiveConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    return this.request<OpenConversationResult>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/archive`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async unarchiveConversation(deviceId: string, conversationId: string, input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    return this.request<OpenConversationResult>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/unarchive`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async renameConversation(deviceId: string, conversationId: string, input: RenameConversationInput): Promise<OpenConversationResult> {
    return this.request<OpenConversationResult>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}`,
      {
        body: input,
        method: "PATCH",
      },
    );
  }

  public async followUpConversation(deviceId: string, conversationId: string, input: FollowUpInput): Promise<CommandAccepted> {
    const response = await this.request<CommandAccepted>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/follow-up`,
      {
      body: input,
      method: "POST",
      },
    );
    return response;
  }

  public async listQueuedMessages(deviceId: string, conversationId: string): Promise<ConversationQueuedMessage[]> {
    return this.request<ConversationQueuedMessage[]>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/queued-messages`,
    );
  }

  public async queueConversationMessage(
    deviceId: string,
    conversationId: string,
    input: QueueConversationMessageInput,
  ): Promise<ConversationQueuedMessage> {
    return this.request<ConversationQueuedMessage>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/queued-messages`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async cancelQueuedMessage(deviceId: string, conversationId: string, queuedMessageId: string): Promise<void> {
    await this.request<void>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/queued-messages/${encodeURIComponent(queuedMessageId)}`,
      {
        method: "DELETE",
      },
    );
  }

  public async sendQueuedMessage(
    deviceId: string,
    conversationId: string,
    queuedMessageId: string,
    input: SendQueuedConversationMessageInput,
  ): Promise<CommandAccepted> {
    return this.request<CommandAccepted>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/queued-messages/${encodeURIComponent(queuedMessageId)}/send`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async interruptTurn(deviceId: string, conversationId: string, turnId: string, input: InterruptTurnInput): Promise<CommandAccepted> {
    return this.request<CommandAccepted>(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/interrupt`, {
      body: input,
      method: "POST",
    });
  }

  public async steerTurn(deviceId: string, conversationId: string, turnId: string, input: SteerTurnInput): Promise<CommandAccepted> {
    return this.request<CommandAccepted>(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/steer`, {
      body: input,
      method: "POST",
    });
  }

  public async listApprovals(deviceId: string, conversationId: string): Promise<PendingApproval[]> {
    return this.request<PendingApproval[]>(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals`);
  }

  public async decideApproval(
    deviceId: string,
    conversationId: string,
    approvalRequestId: string,
    input: ApprovalDecisionInput,
  ): Promise<CommandAccepted> {
    return this.request<CommandAccepted>(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(approvalRequestId)}/decision`,
      {
        body: input,
        method: "POST",
      },
    );
  }

  public async getLocalWorkbenchSummary(deviceId: string, projectId: string): Promise<LocalWorkbenchSummary> {
    return this.request<LocalWorkbenchSummary>(createLocalWorkbenchPath(deviceId, projectId, "summary"));
  }

  public async listLocalWorkbenchFiles(deviceId: string, projectId: string, path?: string): Promise<ProjectDirectoryListing> {
    return this.request<ProjectDirectoryListing>(
      withQuery(createLocalWorkbenchPath(deviceId, projectId, "files"), path === undefined ? {} : { path }),
    );
  }

  public async getLocalWorkbenchFilePreview(deviceId: string, projectId: string, path: string): Promise<ProjectFilePreview> {
    return this.request<ProjectFilePreview>(withQuery(createLocalWorkbenchPath(deviceId, projectId, "file-preview"), { path }));
  }

  public async getLocalWorkbenchGitSummary(deviceId: string, projectId: string): Promise<ProjectGitSummary> {
    return this.request<ProjectGitSummary>(createLocalWorkbenchPath(deviceId, projectId, "git"));
  }

  public async searchLocalWorkbenchFiles(
    deviceId: string,
    projectId: string,
    options: { limit?: number; path?: string; query: string },
  ): Promise<ProjectSearchResult> {
    return this.request<ProjectSearchResult>(
      withQuery(createLocalWorkbenchPath(deviceId, projectId, "search"), {
        query: options.query,
        ...(options.path === undefined ? {} : { path: options.path }),
        ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      }),
    );
  }

  public async getLocalWorkbenchMcpSummary(deviceId: string, projectId: string): Promise<McpServerSummary> {
    return this.request<McpServerSummary>(createLocalWorkbenchPath(deviceId, projectId, "mcp"));
  }

  public async getLocalWorkbenchExtensionInventory(deviceId: string, projectId: string): Promise<ExtensionInventory> {
    return this.request<ExtensionInventory>(createLocalWorkbenchPath(deviceId, projectId, "extensions"));
  }

  public async getRuntimeSettingsSummary(deviceId: string, projectId: string): Promise<RuntimeSettingsSummary> {
    return this.request<RuntimeSettingsSummary>(
      `/v1/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(projectId)}/runtime-settings`,
    );
  }

  public async getAdvancedPlatformReadinessSummary(deviceId: string, projectId: string): Promise<AdvancedPlatformReadinessSummary> {
    return this.request<AdvancedPlatformReadinessSummary>(
      `/v1/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(projectId)}/advanced-platform-readiness`,
    );
  }

  private async request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
    const url = new URL(path, this.config.baseUrl);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${this.config.token}`);
    headers.set("accept", "application/json");
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const abortController = new AbortController();
    const timeout = globalThis.setTimeout(() => abortController.abort(), this.config.requestTimeoutMs ?? defaultRequestTimeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: options.method ?? "GET",
        headers,
        signal: abortController.signal,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new WorkerApiRequestError(0, {
        code: "request_failure",
        message: fallbackErrorMessage,
        details: {
          reason: abortController.signal.aborted ? "request_timeout" : "network_error",
          retryable: true,
        },
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (!response.ok) {
      const envelope = await this.parseErrorEnvelope(response);
      throw new WorkerApiRequestError(response.status, envelope);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return response.json() as Promise<TResponse>;
  }

  private async parseErrorEnvelope(response: Response): Promise<SanitizedErrorEnvelope> {
    const fallback = {
      code: "http_error",
      message: "Worker request failed.",
    };

    const responseContentType = response.headers.get("content-type") ?? "";
    if (!responseContentType.includes("application/json")) {
      return fallback;
    }

    const body = (await this.safeParseJson(response)) as JsonValue;
    if (!isRecord(body)) {
      return fallback;
    }

    const code = typeof body.code === "string" && body.code.trim() !== "" ? body.code : fallback.code;
    const message =
      typeof body.message === "string" && body.message.trim() !== "" ? sanitizeErrorMessage(body.message) : fallback.message;

    return {
      code,
      message,
      ...(isRecord(body.details)
        ? {
            details: sanitizeErrorDetails(body.details),
          }
        : {}),
      ...(typeof body.requestId === "string" && body.requestId.trim() !== "" ? { requestId: body.requestId } : {}),
    };
  }

  private async safeParseJson(response: Response): Promise<JsonValue> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}

function createLocalWorkbenchPath(deviceId: string, projectId: string, section: string): string {
  return `/v1/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(projectId)}/local-workbench/${section}`;
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function sanitizeErrorDetails(details: unknown): {
  operation?: string;
  retryable?: boolean;
  diagnosticId?: string;
  reason?: string;
  field?: string;
  limit?: number;
  expected?: string;
  actualKind?: string;
  deviceId?: string;
} | undefined {
  if (!isRecord(details)) {
    return undefined;
  }

  const sanitized: {
    operation?: string;
    retryable?: boolean;
    diagnosticId?: string;
    reason?: string;
    field?: string;
    limit?: number;
    expected?: string;
    actualKind?: string;
    deviceId?: string;
  } = {};

  for (const [rawKey, rawValue] of Object.entries(details)) {
    if (!errorDetailKeys.has(rawKey)) {
      continue;
    }

    const key = rawKey as keyof typeof sanitized;
    switch (key) {
      case "operation":
      case "diagnosticId":
      case "reason":
      case "field":
      case "expected":
      case "actualKind":
      case "deviceId":
        if (typeof rawValue === "string" && rawValue.trim() !== "") {
          sanitized[key] = rawValue;
        }
        break;
      case "retryable":
        if (typeof rawValue === "boolean") {
          sanitized[key] = rawValue;
        }
        break;
      case "limit":
        if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
          sanitized[key] = rawValue;
        }
        break;
      default:
        break;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeErrorMessage(message: string): string {
  let sanitized = message.trim();
  if (sanitized.length === 0) {
    return fallbackErrorMessage;
  }

  sanitized = sanitized.replace(/\b(?:https?|wss?|file):\/\/[^\s"'`<>]+/gi, "[redacted-url]");
  sanitized = sanitized.replace(/(?:api[-_]?key|access[-_]?token|auth[-_]?token|authorization|bearer|token)\s*[:=]\s*[^\s,.;)]+/gi, "token=[redacted-token]");
  sanitized = sanitized.replace(/\b(?:private path|privatePath|json[-_]rpc|full diff)\b[^.\n]*/gi, "");

  if (containsUnsafeErrorMessageContent(sanitized)) {
    return fallbackErrorMessage;
  }

  return sanitized;
}

function containsUnsafeErrorMessageContent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /(stack|cause|prompt|command output|private path|privatePath|json[-_]rpc|full diff)/.test(lower) ||
    /\b(?:https?|wss?|file):\/\/[^\s"'`<>]+/i.test(message) ||
    /\b(?:[A-Za-z]:\\|\/)(?:[\w.-]+[\\/])+[\w.-]+/i.test(message)
  );
}
