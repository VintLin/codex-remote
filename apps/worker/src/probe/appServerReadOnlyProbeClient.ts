import type { v2 } from "@codex-remote/codex-protocol";

import { AppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
import { PreconditionMissingError, type ReadOnlyProbeClient } from "./readOnlyProbe.ts";

interface AppServerReadOnlyProbeClientOptions {
  readyzTimeoutMs?: number;
}

export class AppServerReadOnlyProbeClient implements ReadOnlyProbeClient {
  private firstAllowedThreadId: string | null = null;
  private readonly maxPages = 3;
  protected readonly rpc: AppServerRpcClient;
  private readonly readyzUrl: string;
  private readonly allowedProjectRoot: string;
  private readonly readyzTimeoutMs: number;

  constructor(
    rpc: AppServerRpcClient,
    readyzUrl: string,
    allowedProjectRoot: string,
    options: AppServerReadOnlyProbeClientOptions = {},
  ) {
    this.rpc = rpc;
    this.readyzUrl = readyzUrl;
    this.allowedProjectRoot = allowedProjectRoot;
    this.readyzTimeoutMs = options.readyzTimeoutMs ?? 5_000;
  }

  async readyz(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.readyzTimeoutMs);

    try {
      const response = await fetch(this.readyzUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`readyz returned ${response.status}`);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("app_server_request_timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(): Promise<void> {
    await this.rpc.request("initialize", {
      clientInfo: {
        name: "codex-remote-worker",
        title: "Codex Remote Worker",
        version: "0.0.0",
      },
      capabilities: null,
    });
  }

  async initialized(): Promise<void> {
    this.rpc.notify({ method: "initialized" });
  }

  async listModels(): Promise<unknown> {
    return this.rpc.request("model/list", {
      limit: 25,
      includeHidden: false,
    });
  }

  async listThreads(): Promise<unknown> {
    return await this.listThreadsWithParams({
      cwd: this.allowedProjectRoot,
      sourceKinds: ["cli", "vscode", "appServer"],
      archived: false,
      limit: 25,
      sortDirection: "desc",
      cursor: null,
    });
  }

  async listThreadsWithParams(params: {
    cwd: string;
    sourceKinds: readonly ["cli", "vscode", "appServer"];
    archived: false;
    limit: number;
    sortDirection: "desc";
    cursor: string | null;
  }): Promise<v2.ThreadListResponse> {
    let cursor: string | null = params.cursor;
    let lastResponse: v2.ThreadListResponse | null = null;

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = (await this.rpc.request("thread/list", {
        cwd: params.cwd,
        sourceKinds: [...params.sourceKinds],
        archived: params.archived,
        limit: params.limit,
        sortDirection: params.sortDirection,
        cursor,
      })) as v2.ThreadListResponse;

      lastResponse = response;
      for (const thread of response.data) {
        if (await isPathInsideRootRealpath(thread.cwd, this.allowedProjectRoot)) {
          this.firstAllowedThreadId = thread.id;
          break;
        }
      }

      if (this.firstAllowedThreadId) {
        break;
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }

    return lastResponse ?? { data: [], nextCursor: null, backwardsCursor: null };
  }

  async readThread(params: { threadId: string; includeTurns: true }): Promise<v2.ThreadReadResponse> {
    return (await this.rpc.request("thread/read", params)) as v2.ThreadReadResponse;
  }

  async readFirstAllowedThread(): Promise<unknown> {
    if (!this.firstAllowedThreadId) {
      throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
    }

    const response = (await this.rpc.request("thread/read", {
      threadId: this.firstAllowedThreadId,
      includeTurns: true,
    })) as v2.ThreadReadResponse;

    if (!(await isPathInsideRootRealpath(response.thread.cwd, this.allowedProjectRoot))) {
      throw new Error("thread/read returned a thread outside the allowed project root");
    }

    return response;
  }

  close(): void {
    this.rpc.close();
  }
}

export class AppServerWorkerClient extends AppServerReadOnlyProbeClient {
  async startThread(params: v2.ThreadStartParams): Promise<v2.ThreadStartResponse> {
    return (await this.rpc.request("thread/start", params)) as v2.ThreadStartResponse;
  }

  async startTurn(params: v2.TurnStartParams): Promise<v2.TurnStartResponse> {
    return (await this.rpc.request("turn/start", params)) as v2.TurnStartResponse;
  }
}
