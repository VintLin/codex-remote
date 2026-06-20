import type { InitializeResponse, v2 } from "@codex-remote/codex-protocol";

import { AppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
import { PreconditionMissingError, type ReadOnlyProbeClient, type ThreadListProbeEvidence } from "./readOnlyProbe.ts";

interface AppServerReadOnlyProbeClientOptions {
  readyzTimeoutMs?: number;
  readyzMode?: "http" | "rpc";
}

export class AppServerReadOnlyProbeClient implements ReadOnlyProbeClient {
  private firstAllowedThreadId: string | null = null;
  private readonly maxPages = 100;
  protected readonly rpc: AppServerRpcClient;
  private readonly readyzUrl: string;
  private readonly allowedProjectRoot: string;
  private readonly readyzTimeoutMs: number;
  private readonly readyzMode: "http" | "rpc";
  private codexVersion: string | null = null;
  private handshakeComplete = false;

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
    this.readyzMode = options.readyzMode ?? "http";
  }

  async readyz(): Promise<void> {
    if (this.readyzMode === "rpc") {
      await this.initialize();
      await this.initialized();
      return;
    }

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
    if (this.handshakeComplete) {
      return;
    }

    const response = (await this.rpc.request("initialize", {
      clientInfo: {
        name: "codex-remote-worker",
        title: "Codex Remote Worker",
        version: "0.0.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    })) as InitializeResponse;

    this.codexVersion = sanitizeCodexVersion(response.userAgent);
  }

  async initialized(): Promise<void> {
    if (this.handshakeComplete) {
      return;
    }

    this.rpc.notify({ method: "initialized" });
    this.handshakeComplete = true;
  }

  getCodexVersion(): string | null {
    return this.codexVersion;
  }

  async listModels(): Promise<unknown> {
    return this.rpc.request("model/list", {
      limit: 25,
      includeHidden: false,
    });
  }

  async listThreads(): Promise<ThreadListProbeEvidence> {
    return await this.probeThreadListWithParams({
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
    archived: boolean;
    limit: number;
    sortDirection: "desc";
    cursor: string | null;
  }): Promise<v2.ThreadListResponse> {
    return await this.requestThreadList(params);
  }

  private async probeThreadListWithParams(params: {
    cwd: string;
    sourceKinds: readonly ["cli", "vscode", "appServer"];
    archived: false;
    limit: number;
    sortDirection: "desc";
    cursor: string | null;
  }): Promise<ThreadListProbeEvidence> {
    let cursor: string | null = params.cursor;
    let pageCount = 0;
    let cursorCount = 0;
    let count = 0;
    let completedUntilNextCursorNull = false;
    let exactCwdListProven = false;

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = await this.requestThreadList({ ...params, cursor });

      pageCount += 1;
      count += response.data.length;
      for (const thread of response.data) {
        if (await isPathInsideRootRealpath(thread.cwd, this.allowedProjectRoot)) {
          exactCwdListProven = true;
          this.firstAllowedThreadId = thread.id;
        }
      }

      cursor = response.nextCursor;
      if (!cursor) {
        completedUntilNextCursorNull = true;
        break;
      }
      cursorCount += 1;
    }

    return {
      exactCwdListProven,
      completedUntilNextCursorNull,
      pageCount,
      cursorCount,
      count,
      ...(completedUntilNextCursorNull ? {} : { reasonCode: "pagination_probe_incomplete" }),
    };
  }

  private async requestThreadList(params: {
    cwd: string;
    sourceKinds: readonly ["cli", "vscode", "appServer"];
    archived: boolean;
    limit: number;
    sortDirection: "desc";
    cursor: string | null;
  }): Promise<v2.ThreadListResponse> {
    return (await this.rpc.request("thread/list", {
      cwd: params.cwd,
      sourceKinds: [...params.sourceKinds],
      archived: params.archived,
      limit: params.limit,
      sortDirection: params.sortDirection,
      cursor: params.cursor,
    })) as v2.ThreadListResponse;
  }

  async readThread(params: { threadId: string; includeTurns: true }): Promise<v2.ThreadReadResponse> {
    return (await this.rpc.request("thread/read", params)) as v2.ThreadReadResponse;
  }

  async listLoadedThreads(params: v2.ThreadLoadedListParams): Promise<v2.ThreadLoadedListResponse> {
    return (await this.rpc.request("thread/loaded/list", params)) as v2.ThreadLoadedListResponse;
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

function sanitizeCodexVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160 || /\/Users\/|Bearer|token|codexHome|stack|cause/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export class AppServerWorkerClient extends AppServerReadOnlyProbeClient {
  async startThread(params: v2.ThreadStartParams): Promise<v2.ThreadStartResponse> {
    return (await this.rpc.request("thread/start", params)) as v2.ThreadStartResponse;
  }

  async startTurn(params: v2.TurnStartParams): Promise<v2.TurnStartResponse> {
    return (await this.rpc.request("turn/start", params)) as v2.TurnStartResponse;
  }

  async interruptTurn(params: v2.TurnInterruptParams): Promise<v2.TurnInterruptResponse> {
    return (await this.rpc.request("turn/interrupt", params)) as v2.TurnInterruptResponse;
  }

  async steerTurn(params: v2.TurnSteerParams): Promise<v2.TurnSteerResponse> {
    return (await this.rpc.request("turn/steer", params)) as v2.TurnSteerResponse;
  }

  async resumeThread(params: v2.ThreadResumeParams): Promise<v2.ThreadResumeResponse> {
    return (await this.rpc.request("thread/resume", params)) as v2.ThreadResumeResponse;
  }

  async archiveThread(params: v2.ThreadArchiveParams): Promise<v2.ThreadArchiveResponse> {
    return (await this.rpc.request("thread/archive", params)) as v2.ThreadArchiveResponse;
  }

  async unarchiveThread(params: v2.ThreadUnarchiveParams): Promise<v2.ThreadUnarchiveResponse> {
    return (await this.rpc.request("thread/unarchive", params)) as v2.ThreadUnarchiveResponse;
  }

  async setThreadName(params: v2.ThreadSetNameParams): Promise<v2.ThreadSetNameResponse> {
    return (await this.rpc.request("thread/name/set", params)) as v2.ThreadSetNameResponse;
  }

  async sendApprovalResponse(params: { requestId: string | number; result: unknown }): Promise<void> {
    this.rpc.sendApprovalResponse(params);
  }
}
