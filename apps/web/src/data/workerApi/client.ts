import type {
  CodexConversation,
  ConversationTimeline,
  ErrorEnvelope,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

export interface WorkerApiClientConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface WorkerApiClientLike {
  getHealth(): Promise<WorkerHealth>;
  getCapabilities(): Promise<WorkerCapabilities>;
  listConversations(): Promise<CodexConversation[]>;
  getTimeline(conversationId: string): Promise<ConversationTimeline>;
}

type RequestOptions = {
  method?: string;
};

type JsonValue = unknown;
type SanitizedErrorEnvelope = {
  code: string;
  message: string;
  details?: ErrorEnvelope["details"];
  requestId?: string;
};

const errorDetailKeys = new Set(["operation", "retryable", "diagnosticId", "reason", "field", "limit"]);

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
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async getHealth(): Promise<WorkerHealth> {
    const response = await this.request<WorkerHealth>("/v1/worker/health");
    return response;
  }

  public async getCapabilities(): Promise<WorkerCapabilities> {
    const response = await this.request<WorkerCapabilities>("/v1/worker/capabilities");
    return response;
  }

  public async listConversations(): Promise<CodexConversation[]> {
    const response = await this.request<CodexConversation[]>("/v1/conversations");
    return response;
  }

  public async getTimeline(_conversationId: string): Promise<ConversationTimeline> {
    const response = await this.request<ConversationTimeline>(`/v1/conversations/${_conversationId}/timeline`);
    return response;
  }

  private async request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
    const url = new URL(path, this.config.baseUrl);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${this.config.token}`);
    headers.set("accept", "application/json");

    const response = await this.fetchImpl(url.toString(), {
      method: options.method ?? "GET",
      headers,
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
      typeof body.message === "string" && body.message.trim() !== "" ? body.message : fallback.message;

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
