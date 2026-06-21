import { basename } from "node:path";

import type {
  CodexConversation,
  ConversationTimeline,
  RemoteProject,
  WorkerCapabilities,
  WorkerHealth,
  WorkerProbeSummary,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import {
  createReadOnlyProbeFailureSummary,
  PreconditionMissingError,
  runReadOnlyProbe,
  type ThreadListProbeEvidence,
} from "../probe/readOnlyProbe.ts";
import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
import type { WorkerApprovalRegistry } from "./approvalRegistry.ts";
import { mapUnknownError, WorkerHttpError } from "./errors.ts";
import {
  projectThreadToConversation,
  projectThreadToTimeline,
  type ConversationProjectionContext,
} from "./projections.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

export interface WorkerReadOnlyAppServerClient {
  readyz(): Promise<void>;
  initialize(): Promise<void>;
  initialized(): Promise<void>;
  getCodexVersion?(): string | null;
  listThreads(params: ThreadListParams): Promise<v2.ThreadListResponse>;
  listLoadedThreads?(params: v2.ThreadLoadedListParams): Promise<v2.ThreadLoadedListResponse>;
  readThread(params: { threadId: string; includeTurns: true }): Promise<v2.ThreadReadResponse>;
  close(): void;
}

export interface WorkerReadOnlyHandlerContext {
  approvalRegistry?: WorkerApprovalRegistry;
  config: WorkerHttpConfig;
  openClient(): Promise<WorkerReadOnlyAppServerClient>;
  now(): string;
}

type ThreadListParams = {
  cwd: string;
  sourceKinds: readonly ["cli", "vscode", "appServer"];
  archived: boolean;
  limit: number;
  sortDirection: "desc";
  cursor: string | null;
};

type ListedThread = {
  thread: v2.Thread;
  archived: boolean;
};

const sourceKinds = ["cli", "vscode", "appServer"] as const;
const listLimit = 25;
const maxPages = 100;
const localProjectId = "local-project";

export async function getHealth(context: WorkerReadOnlyHandlerContext): Promise<WorkerHealth> {
  const checkedAt = context.now();
  return await withClient(context, "readyz", async (client) => {
    await client.readyz();
    return {
      deviceId: context.config.deviceId,
      status: "connected",
      checkedAt,
      codexVersion: client.getCodexVersion?.() ?? null,
      appServer: {
        transport: context.config.appServerTransport,
        readyz: true,
      },
    };
  });
}

export function getCapabilities(context: WorkerReadOnlyHandlerContext): WorkerCapabilities {
  return {
    deviceId: context.config.deviceId,
    canReadProjects: true,
    canReadConversations: true,
    canReadTimeline: true,
    canRunReadOnlyProbe: true,
    appServerTransport: context.config.appServerTransport,
    supportedSourceKinds: [...sourceKinds],
  };
}

export async function runProbe(context: WorkerReadOnlyHandlerContext): Promise<WorkerProbeSummary> {
  let client: WorkerReadOnlyAppServerClient;

  try {
    client = await context.openClient();
  } catch (error) {
    const httpError = mapUnknownError(error, "probe.open");
    return createReadOnlyProbeFailureSummary({
      checkName: "probe.client",
      deviceId: context.config.deviceId,
      errorKind: httpError.code,
    });
  }

  return await runReadOnlyProbe({
    client: {
      readyz: () => client.readyz(),
      initialize: () => client.initialize(),
      initialized: () => client.initialized(),
      listModels: async () => {
        throw new PreconditionMissingError("Worker HTTP read-only client does not expose model/list.");
      },
      listThreads: async () => collectThreadListProbeEvidence(client, context.config.allowedProjectRoot),
      readFirstAllowedThread: async () => {
        const response = await client.listThreads(createThreadListParams(context.config.allowedProjectRoot, null));
        const firstAllowed = await findFirstAllowedThread(response.data, context.config.allowedProjectRoot);
        if (!firstAllowed) {
          throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
        }
        const readResponse = await client.readThread({ threadId: firstAllowed.id, includeTurns: true });
        if (!(await isPathInsideRootRealpath(readResponse.thread.cwd, context.config.allowedProjectRoot))) {
          throw new Error("thread/read returned a thread outside the allowed project root");
        }
        return readResponse;
      },
      close: () => client.close(),
    },
    deviceId: context.config.deviceId,
  });
}

export async function listConversations(context: WorkerReadOnlyHandlerContext): Promise<CodexConversation[]> {
  return await withClient(context, "thread/list", async (client) => {
    const threads = await listAllowedThreads(client, context.config.allowedProjectRoot);
    const loadedThreadIds = await listLoadedThreadIds(client);
    return threads.map((listedThread) =>
      projectThreadToConversation(
        listedThread.thread,
        createProjectionContext(context, {
          archived: listedThread.archived,
          loadedThreadIds,
        }),
      ),
    );
  });
}

export function listProjects(context: WorkerReadOnlyHandlerContext): RemoteProject[] {
  return [
    {
      id: localProjectId,
      name: basename(context.config.allowedProjectRoot),
      deviceId: context.config.deviceId,
      path: "",
      branch: "unknown",
      hasChanges: false,
      pinned: false,
      expanded: true,
    },
  ];
}

export async function readConversationTimeline(
  context: WorkerReadOnlyHandlerContext,
  conversationId: string,
): Promise<ConversationTimeline> {
  return await withClient(context, "thread/read", async (client) => {
    const readStartedAt = context.now();
    const thread = await readAllowedConversationThread(
      client,
      context.config.allowedProjectRoot,
      conversationId,
      "thread/read",
    );

    return projectThreadToTimeline(thread, {
      allowedProjectRoot: context.config.allowedProjectRoot,
      deviceId: context.config.deviceId,
      projectId: localProjectId,
      archived: false,
      loadedThreadIds: await listLoadedThreadIds(client),
      approvals: [
        ...(context.approvalRegistry?.listPendingApprovals(conversationId) ?? []),
        ...(context.approvalRegistry?.listResolvedApprovals(conversationId) ?? []),
      ],
      readStartedAt,
      readCompletedAt: context.now(),
    });
  });
}

export async function readAllowedConversationThread(
  client: WorkerReadOnlyAppServerClient,
  allowedProjectRoot: string,
  conversationId: string,
  operation: string,
): Promise<v2.Thread> {
  let response: v2.ThreadReadResponse;

  try {
    response = await client.readThread({ threadId: conversationId, includeTurns: true });
  } catch (error) {
    if (error instanceof Error && isConnectionFailure(error.message)) {
      throw error;
    }

    throw conversationNotFound(operation);
  }

  if (!(await isPathInsideRootRealpath(response.thread.cwd, allowedProjectRoot))) {
    throw conversationNotFound(operation);
  }

  return response.thread;
}

async function withClient<T>(
  context: WorkerReadOnlyHandlerContext,
  operation: string,
  run: (client: WorkerReadOnlyAppServerClient) => Promise<T>,
): Promise<T> {
  let client: WorkerReadOnlyAppServerClient;

  try {
    client = await context.openClient();
  } catch (error) {
    throw mapUnknownError(error, operation);
  }

  try {
    return await run(client);
  } catch (error) {
    throw mapUnknownError(error, operation);
  } finally {
    client.close();
  }
}

async function listAllowedThreads(
  client: WorkerReadOnlyAppServerClient,
  allowedProjectRoot: string,
): Promise<ListedThread[]> {
  const allowedThreads: ListedThread[] = [];
  for (const archived of [false, true]) {
    allowedThreads.push(...await listAllowedThreadsByArchiveState(client, allowedProjectRoot, archived));
  }

  return allowedThreads;
}

async function listAllowedThreadsByArchiveState(
  client: WorkerReadOnlyAppServerClient,
  allowedProjectRoot: string,
  archived: boolean,
): Promise<ListedThread[]> {
  const allowedThreads: ListedThread[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.listThreads(createThreadListParams(allowedProjectRoot, cursor, archived));
    for (const thread of response.data) {
      if (await isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)) {
        allowedThreads.push({ thread, archived });
      }
    }

    cursor = response.nextCursor;
    if (!cursor) {
      break;
    }
  }

  return allowedThreads;
}

async function listLoadedThreadIds(client: WorkerReadOnlyAppServerClient): Promise<ReadonlySet<string>> {
  if (!client.listLoadedThreads) {
    return new Set();
  }

  const loadedThreadIds = new Set<string>();
  let cursor: string | null = null;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const response = await client.listLoadedThreads({ cursor, limit: 100 });
      for (const threadId of response.data) {
        loadedThreadIds.add(threadId);
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }
  } catch {
    return new Set();
  }

  return loadedThreadIds;
}

async function collectThreadListProbeEvidence(
  client: WorkerReadOnlyAppServerClient,
  allowedProjectRoot: string,
): Promise<ThreadListProbeEvidence> {
  let cursor: string | null = null;
  let pageCount = 0;
  let cursorCount = 0;
  let count = 0;
  let exactCwdListProven = false;
  let completedUntilNextCursorNull = false;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.listThreads(createThreadListParams(allowedProjectRoot, cursor, false));
    pageCount += 1;
    count += response.data.length;

    for (const thread of response.data) {
      if (await isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)) {
        exactCwdListProven = true;
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

async function findFirstAllowedThread(
  threads: readonly v2.Thread[],
  allowedProjectRoot: string,
): Promise<v2.Thread | null> {
  for (const thread of threads) {
    if (await isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)) {
      return thread;
    }
  }

  return null;
}

function isConnectionFailure(message: string): boolean {
  return [
    "app_server_request_timeout",
    "app_server_connection_error",
    "app_server_connection_timeout",
    "app_server_env_not_configured",
    "app_server_spawn_failed",
    "app_server_websocket_unavailable",
  ].includes(message);
}

function createThreadListParams(cwd: string, cursor: string | null, archived = false): ThreadListParams {
  return {
    cwd,
    sourceKinds,
    archived,
    limit: listLimit,
    sortDirection: "desc",
    cursor,
  };
}

function conversationNotFound(operation: string): WorkerHttpError {
  return new WorkerHttpError(404, "conversation_not_found", "Conversation was not found.", {
    operation,
    retryable: false,
  });
}

function createProjectionContext(
  context: WorkerReadOnlyHandlerContext,
  overrides: Pick<ConversationProjectionContext, "archived" | "loadedThreadIds"> = {},
): ConversationProjectionContext {
  return {
    allowedProjectRoot: context.config.allowedProjectRoot,
    deviceId: context.config.deviceId,
    projectId: localProjectId,
    projectName: basename(context.config.allowedProjectRoot),
    ...overrides,
  };
}
