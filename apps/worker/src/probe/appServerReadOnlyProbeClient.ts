import type { v2 } from "@codex-remote/codex-protocol";

import { AppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { isPathInsideRoot } from "../security/workerSecurity.ts";
import { PreconditionMissingError, type ReadOnlyProbeClient } from "./readOnlyProbe.ts";

export class AppServerReadOnlyProbeClient implements ReadOnlyProbeClient {
  private firstAllowedThreadId: string | null = null;
  private readonly maxPages = 3;
  private readonly rpc: AppServerRpcClient;
  private readonly readyzUrl: string;
  private readonly allowedProjectRoot: string;

  constructor(rpc: AppServerRpcClient, readyzUrl: string, allowedProjectRoot: string) {
    this.rpc = rpc;
    this.readyzUrl = readyzUrl;
    this.allowedProjectRoot = allowedProjectRoot;
  }

  async readyz(): Promise<void> {
    const response = await fetch(this.readyzUrl);
    if (!response.ok) {
      throw new Error(`readyz returned ${response.status}`);
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
    let cursor: string | null = null;
    let lastResponse: v2.ThreadListResponse | null = null;

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = (await this.rpc.request("thread/list", {
        cwd: this.allowedProjectRoot,
        sourceKinds: ["cli", "vscode", "appServer"],
        archived: false,
        limit: 25,
        sortDirection: "desc",
        cursor,
      })) as v2.ThreadListResponse;

      lastResponse = response;
      const firstAllowedThread = response.data.find((thread) => isPathInsideRoot(thread.cwd, this.allowedProjectRoot));
      if (firstAllowedThread) {
        this.firstAllowedThreadId = firstAllowedThread.id;
        break;
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }

    return lastResponse;
  }

  async readFirstAllowedThread(): Promise<unknown> {
    if (!this.firstAllowedThreadId) {
      throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
    }

    const response = (await this.rpc.request("thread/read", {
      threadId: this.firstAllowedThreadId,
      includeTurns: true,
    })) as v2.ThreadReadResponse;

    if (!isPathInsideRoot(response.thread.cwd, this.allowedProjectRoot)) {
      throw new Error("thread/read returned a thread outside the allowed project root");
    }

    return response;
  }

  close(): void {
    this.rpc.close();
  }
}
