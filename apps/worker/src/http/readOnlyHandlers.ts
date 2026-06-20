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

import { createReadOnlyProbeFailureSummary, PreconditionMissingError, runReadOnlyProbe } from "../probe/readOnlyProbe.ts";
import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
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
  listThreads(params: ThreadListParams): Promise<v2.ThreadListResponse>;
  readThread(params: { threadId: string; includeTurns: true }): Promise<v2.ThreadReadResponse>;
  close(): void;
}

export interface WorkerReadOnlyHandlerContext {
  config: WorkerHttpConfig;
  openClient(): Promise<WorkerReadOnlyAppServerClient>;
  now(): string;
}

type ThreadListParams = {
  cwd: string;
  sourceKinds: readonly ["cli", "vscode", "appServer"];
  archived: false;
  limit: number;
  sortDirection: "desc";
  cursor: string | null;
};

const sourceKinds = ["cli", "vscode", "appServer"] as const;
const listLimit = 25;
const maxPages = 3;

export async function getHealth(context: WorkerReadOnlyHandlerContext): Promise<WorkerHealth> {
  const checkedAt = context.now();
  return await withClient(context, "readyz", async (client) => {
    await client.readyz();
    return {
      deviceId: context.config.deviceId,
      status: "connected",
      checkedAt,
      codexVersion: null,
      appServer: {
        transport: "loopbackWebSocket",
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
      listThreads: async () => client.listThreads(createThreadListParams(context.config.allowedProjectRoot, null)),
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
    return threads.map((thread) => projectThreadToConversation(thread, createProjectionContext(context)));
  });
}

export function listProjects(context: WorkerReadOnlyHandlerContext): RemoteProject[] {
  return [
    {
      id: "local-project",
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
    const allowedThreads = await listAllowedThreads(client, context.config.allowedProjectRoot);
    if (!allowedThreads.some((thread) => thread.id === conversationId)) {
      throw new WorkerHttpError(404, "conversation_not_found", "Conversation was not found.", {
        operation: "thread/read",
        retryable: false,
      });
    }

    const readStartedAt = context.now();
    const response = await client.readThread({ threadId: conversationId, includeTurns: true });
    if (!(await isPathInsideRootRealpath(response.thread.cwd, context.config.allowedProjectRoot))) {
      throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
        operation: "thread/read",
        retryable: false,
      });
    }

    return projectThreadToTimeline(response.thread, {
      allowedProjectRoot: context.config.allowedProjectRoot,
      deviceId: context.config.deviceId,
      readStartedAt,
      readCompletedAt: context.now(),
    });
  });
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
): Promise<v2.Thread[]> {
  const allowedThreads: v2.Thread[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.listThreads(createThreadListParams(allowedProjectRoot, cursor));
    for (const thread of response.data) {
      if (await isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)) {
        allowedThreads.push(thread);
      }
    }

    cursor = response.nextCursor;
    if (!cursor) {
      break;
    }
  }

  return allowedThreads;
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

function createThreadListParams(cwd: string, cursor: string | null): ThreadListParams {
  return {
    cwd,
    sourceKinds,
    archived: false,
    limit: listLimit,
    sortDirection: "desc",
    cursor,
  };
}

function createProjectionContext(context: WorkerReadOnlyHandlerContext): ConversationProjectionContext {
  return {
    allowedProjectRoot: context.config.allowedProjectRoot,
    deviceId: context.config.deviceId,
    projectName: basename(context.config.allowedProjectRoot),
  };
}
