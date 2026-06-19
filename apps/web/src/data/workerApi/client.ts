import type { CodexConversation, ConversationTimeline, WorkerCapabilities, WorkerHealth } from "@codex-remote/api-contract";

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

export class WorkerApiClient implements WorkerApiClientLike {
  private readonly fetchImpl: typeof fetch;
  private readonly config: WorkerApiClientConfig;

  public constructor(config: WorkerApiClientConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async getHealth(): Promise<WorkerHealth> {
    throw new Error(`placeholder worker api client not implemented in task 1: ${this.config.baseUrl}`);
  }

  public async getCapabilities(): Promise<WorkerCapabilities> {
    throw new Error(`placeholder worker api client not implemented in task 1: ${this.config.baseUrl}`);
  }

  public async listConversations(): Promise<CodexConversation[]> {
    throw new Error(`placeholder worker api client not implemented in task 1: ${this.config.baseUrl}`);
  }

  public async getTimeline(_conversationId: string): Promise<ConversationTimeline> {
    throw new Error(`placeholder worker api client not implemented in task 1: ${this.config.baseUrl}`);
  }
}
