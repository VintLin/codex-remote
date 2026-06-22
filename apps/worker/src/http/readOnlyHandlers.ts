import { createHash } from "node:crypto";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

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
  listThreads(params: v2.ThreadListParams): Promise<v2.ThreadListResponse>;
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

type ListedThread = {
  thread: v2.Thread;
  archived: boolean;
};

type LocalSessionSummary = {
  id: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

const sourceKinds = ["cli", "vscode", "appServer"] as const;
const listLimit = 25;
const maxPages = 100;
const maxDiscoveredProjectRoots = 500;
const sessionMetaReadBytes = 16 * 1024;
const sessionSummaryReadBytes = 256 * 1024;
const maxConversationTitleLength = 96;
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
    const threads = await listAllThreads(client, context);
    const loadedThreadIds = await listLoadedThreadIds(client);
    return threads.map((listedThread) =>
      projectThreadToConversation(
        listedThread.thread,
        createProjectionContext(context, listedThread.thread.cwd, {
          archived: listedThread.archived,
          loadedThreadIds,
        }),
      ),
    );
  });
}

export async function listProjects(context: WorkerReadOnlyHandlerContext): Promise<RemoteProject[]> {
  return await withClient(context, "thread/list", async (client) => {
    const projectsById = new Map<string, RemoteProject>();
    for (const listedThread of await listAllThreads(client, context)) {
      const project = createProjectFromCwd(context, listedThread.thread.cwd);
      projectsById.set(project.id, project);
    }

    if (projectsById.size === 0) {
      const project = createProjectFromCwd(context, context.config.allowedProjectRoot);
      projectsById.set(project.id, project);
    }

    return [...projectsById.values()].sort((left, right) => {
      if (left.id === localProjectId) {
        return -1;
      }
      if (right.id === localProjectId) {
        return 1;
      }
      return 0;
    });
  });
}

export async function readConversationTimeline(
  context: WorkerReadOnlyHandlerContext,
  conversationId: string,
): Promise<ConversationTimeline> {
  return await withClient(context, "thread/read", async (client) => {
    const readStartedAt = context.now();
    const thread = await readConversationThread(client, conversationId, "thread/read");

    return projectThreadToTimeline(thread, {
      allowedProjectRoot: context.config.allowedProjectRoot,
      deviceId: context.config.deviceId,
      projectId: createProjectId(context, thread.cwd),
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

async function readConversationThread(
  client: WorkerReadOnlyAppServerClient,
  conversationId: string,
  operation: string,
): Promise<v2.Thread> {
  try {
    return (await client.readThread({ threadId: conversationId, includeTurns: true })).thread;
  } catch (error) {
    if (error instanceof Error && isConnectionFailure(error.message)) {
      throw error;
    }

    throw conversationNotFound(operation);
  }
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

async function listAllThreads(
  client: WorkerReadOnlyAppServerClient,
  context: WorkerReadOnlyHandlerContext,
): Promise<ListedThread[]> {
  const projectRoots = await discoverCodexProjectRoots(context.config.allowedProjectRoot, context.config.codexHome);
  const listedThreads: ListedThread[] = [];
  for (const archived of [false, true]) {
    listedThreads.push(...await listThreadsByArchiveState(client, projectRoots, archived));
  }

  const listedThreadIds = new Set(listedThreads.map((listedThread) => listedThread.thread.id));
  const listedThreadCwds = new Set(listedThreads.map((listedThread) => listedThread.thread.cwd));
  for (const sessionSummary of await listLocalSessionSummaries(context.config.allowedProjectRoot, context.config.codexHome)) {
    if (listedThreadIds.has(sessionSummary.id) || listedThreadCwds.has(sessionSummary.cwd)) {
      continue;
    }
    listedThreads.push({ thread: sessionSummaryToThread(sessionSummary), archived: false });
  }

  return listedThreads;
}

async function listThreadsByArchiveState(
  client: WorkerReadOnlyAppServerClient,
  projectRoots: readonly string[],
  archived: boolean,
): Promise<ListedThread[]> {
  const listedThreads: ListedThread[] = [];

  for (const projectRoot of projectRoots) {
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      let response: v2.ThreadListResponse;
      try {
        response = await client.listThreads(createThreadListParams(projectRoot, cursor, archived));
      } catch (error) {
        if (error instanceof Error && isConnectionFailure(error.message)) {
          throw error;
        }

        break;
      }

      for (const thread of response.data) {
        listedThreads.push({ thread, archived });
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }
  }

  return listedThreads;
}

async function discoverCodexProjectRoots(allowedProjectRoot: string, codexHome: string | undefined): Promise<string[]> {
  const roots = new Set<string>([allowedProjectRoot]);
  const sessionsRoot = join(getCodexHome(codexHome), "sessions");
  const sessionFiles = await listSessionFiles(sessionsRoot);

  for (const sessionFile of sessionFiles) {
    if (roots.size >= maxDiscoveredProjectRoots) {
      break;
    }

    const cwd = await readSessionCwd(sessionFile);
    if (cwd && await isExistingDirectory(cwd)) {
      roots.add(cwd);
    }
  }

  return [...roots];
}

async function listLocalSessionSummaries(
  allowedProjectRoot: string,
  codexHome: string | undefined,
): Promise<LocalSessionSummary[]> {
  const sessionsRoot = join(getCodexHome(codexHome), "sessions");
  const sessionFiles = await listSessionFiles(sessionsRoot);
  const summaries: LocalSessionSummary[] = [];

  for (const sessionFile of sessionFiles) {
    if (summaries.length >= maxDiscoveredProjectRoots) {
      break;
    }

    const summary = await readSessionSummary(sessionFile);
    if (summary && await isExistingDirectory(summary.cwd)) {
      summaries.push(summary);
    }
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function getCodexHome(configuredCodexHome: string | undefined): string {
  const codexHome = configuredCodexHome?.trim() || process.env.CODEX_HOME?.trim();
  return codexHome ? codexHome : join(homedir(), ".codex");
}

async function listSessionFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSessionFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }

  return files;
}

async function readSessionCwd(sessionFile: string): Promise<string | null> {
  let file;
  try {
    file = await open(sessionFile, "r");
    const buffer = Buffer.alloc(sessionMetaReadBytes);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split("\n", 1)[0];
    if (!firstLine) {
      return null;
    }

    const parsed = JSON.parse(firstLine) as unknown;
    if (!parsed || typeof parsed !== "object" || !("payload" in parsed)) {
      return null;
    }

    const payload = (parsed as { payload?: { cwd?: unknown } }).payload;
    return typeof payload?.cwd === "string" && payload.cwd.trim() ? payload.cwd : null;
  } catch {
    return null;
  } finally {
    await file?.close();
  }
}

async function readSessionSummary(sessionFile: string): Promise<LocalSessionSummary | null> {
  let file;
  try {
    const fileStat = await stat(sessionFile);
    file = await open(sessionFile, "r");
    const buffer = Buffer.alloc(sessionSummaryReadBytes);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    let id: string | null = null;
    let cwd: string | null = null;
    let createdAt: string | null = null;
    let title: string | null = null;

    for (const line of lines) {
      if (!line) {
        continue;
      }

      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const event = parsed as { timestamp?: unknown; type?: unknown; payload?: unknown };
      if (typeof event.timestamp === "string") {
        createdAt ??= event.timestamp;
      }

      if (event.type === "session_meta" && event.payload && typeof event.payload === "object") {
        const payload = event.payload as { id?: unknown; cwd?: unknown };
        id = typeof payload.id === "string" ? payload.id : id;
        cwd = typeof payload.cwd === "string" ? payload.cwd : cwd;
      }

      title ??= extractUserTitle(event.payload);
      if (id && cwd && title) {
        break;
      }
    }

    if (!id || !cwd) {
      return null;
    }

    return {
      id,
      cwd,
      title: title ?? basename(cwd),
      createdAt: createdAt ?? fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return null;
  } finally {
    await file?.close();
  }
}

function extractUserTitle(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as { type?: unknown; role?: unknown; message?: unknown; content?: unknown };
  if (value.type === "user_message" && typeof value.message === "string") {
    return sanitizeConversationTitle(value.message);
  }

  if (value.type === "message" && value.role === "user" && Array.isArray(value.content)) {
    const text = value.content
      .map((content) => {
        if (!content || typeof content !== "object") {
          return "";
        }

        const item = content as { text?: unknown };
        return typeof item.text === "string" ? item.text : "";
      })
      .join(" ");
    return sanitizeConversationTitle(text);
  }

  return null;
}

function sanitizeConversationTitle(value: string): string | null {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) {
    return null;
  }
  if (
    oneLine.startsWith("# AGENTS.md instructions") ||
    oneLine.startsWith("<environment_context>") ||
    oneLine.startsWith("<developer_context>") ||
    oneLine.startsWith("<INSTRUCTIONS>")
  ) {
    return null;
  }

  return oneLine.length > maxConversationTitleLength ? `${oneLine.slice(0, maxConversationTitleLength - 1)}…` : oneLine;
}

function sessionSummaryToThread(summary: LocalSessionSummary): v2.Thread {
  return {
    id: summary.id,
    sessionId: summary.id,
    forkedFromId: null,
    parentThreadId: null,
    preview: summary.title,
    ephemeral: false,
    modelProvider: "unknown",
    createdAt: isoToUnixSeconds(summary.createdAt),
    updatedAt: isoToUnixSeconds(summary.updatedAt),
    status: { type: "idle" },
    path: null,
    cwd: summary.cwd as v2.Thread["cwd"],
    cliVersion: "unknown",
    source: "cli",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
  };
}

function isoToUnixSeconds(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
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

function createThreadListParams(cwd: string | string[] | null, cursor: string | null, archived = false): v2.ThreadListParams {
  return {
    ...(cwd === null ? {} : { cwd }),
    sourceKinds: [...sourceKinds],
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
  threadCwd: string,
  overrides: Pick<ConversationProjectionContext, "archived" | "loadedThreadIds"> = {},
): ConversationProjectionContext {
  return {
    allowedProjectRoot: context.config.allowedProjectRoot,
    deviceId: context.config.deviceId,
    projectId: createProjectId(context, threadCwd),
    projectName: createProjectName(threadCwd),
    ...overrides,
  };
}

function createProjectFromCwd(context: WorkerReadOnlyHandlerContext, cwd: string): RemoteProject {
  return {
    id: createProjectId(context, cwd),
    name: createProjectName(cwd),
    deviceId: context.config.deviceId,
    path: "",
    branch: "unknown",
    hasChanges: false,
    pinned: false,
    expanded: true,
  };
}

function createProjectId(context: WorkerReadOnlyHandlerContext, cwd: string): string {
  if (cwd === context.config.allowedProjectRoot) {
    return localProjectId;
  }

  return `project-${createHash("sha256").update(cwd).digest("hex").slice(0, 12)}`;
}

function createProjectName(cwd: string): string {
  const name = basename(cwd).trim();
  return name.length > 0 ? name : "Unknown project";
}
