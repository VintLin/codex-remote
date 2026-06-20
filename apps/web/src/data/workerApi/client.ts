import type {
  CodexConversation,
  CommandAccepted,
  ConversationTimeline,
  Device,
  ErrorEnvelope,
  FollowUpInput,
  ApprovalDecisionInput,
  InterruptTurnInput,
  PendingApproval,
  StartConversationInput,
  SteerTurnInput,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

export interface WorkerApiClientConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface WorkerApiClientLike {
  getHealth(deviceId: string): Promise<WorkerHealth>;
  getCapabilities(deviceId: string): Promise<WorkerCapabilities>;
  listDevices(): Promise<Device[]>;
  listConversations(): Promise<CodexConversation[]>;
  getTimeline(deviceId: string, conversationId: string): Promise<ConversationTimeline>;
  startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted>;
  followUpConversation(deviceId: string, conversationId: string, input: FollowUpInput): Promise<CommandAccepted>;
  interruptTurn(deviceId: string, conversationId: string, turnId: string, input: InterruptTurnInput): Promise<CommandAccepted>;
  steerTurn(deviceId: string, conversationId: string, turnId: string, input: SteerTurnInput): Promise<CommandAccepted>;
  listApprovals(deviceId: string, conversationId: string): Promise<PendingApproval[]>;
  decideApproval(deviceId: string, conversationId: string, approvalRequestId: string, input: ApprovalDecisionInput): Promise<CommandAccepted>;
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

  public async listConversations(): Promise<CodexConversation[]> {
    const response = await this.request<CodexConversation[]>("/v1/conversations");
    return response;
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

  private async request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
    const url = new URL(path, this.config.baseUrl);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${this.config.token}`);
    headers.set("accept", "application/json");
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await this.fetchImpl(url.toString(), {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    if (!response.ok) {
      const envelope = await this.parseErrorEnvelope(response);
      throw new WorkerApiRequestError(response.status, envelope);
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
