import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CommandAccepted,
  CodexConversation,
  ConversationTimeline,
  ConversationTimelineTurn,
  ErrorEnvelope,
  FollowUpInput,
  StartConversationInput,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

const defaultHost = "127.0.0.1";
const defaultPort = 8788;
const defaultToken = "example-token";
const allowedOrigin = "http://127.0.0.1:5173";
const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;

const initialConversations: CodexConversation[] = [
  {
    id: "smoke-thread-1",
    title: "Smoke Worker conversation",
    deviceId: "smoke-worker",
    projectId: "smoke-project",
    projectName: "stage3-smoke",
    status: "running",
    updatedAt: "2026-06-20T00:00:00.000Z",
    summary: "Read-only fake Worker data",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "smoke-thread-2",
    title: "Smoke complete conversation",
    deviceId: "smoke-worker",
    projectId: "smoke-project",
    projectName: "stage3-smoke",
    status: "done",
    updatedAt: "2026-06-20T00:01:00.000Z",
    summary: "Second fake Worker conversation",
    sandbox: "workspace-write",
    approval: "never",
  },
];

const health: WorkerHealth = {
  deviceId: "smoke-worker",
  status: "connected",
  checkedAt: "2026-06-20T00:02:00.000Z",
  codexVersion: "fake-smoke",
  appServer: {
    transport: "loopbackWebSocket",
    readyz: true,
  },
};

const capabilities: WorkerCapabilities = {
  deviceId: "smoke-worker",
  canReadProjects: true,
  canReadConversations: true,
  canReadTimeline: true,
  canRunReadOnlyProbe: false,
  appServerTransport: "loopbackWebSocket",
  supportedSourceKinds: ["cli", "appServer"],
};

const initialTimelines: Record<string, ConversationTimeline> = {
  "smoke-thread-1": {
    deviceId: "smoke-worker",
    conversationId: "smoke-thread-1",
    projectId: "smoke-project",
    readStartedAt: "2026-06-20T00:02:00.000Z",
    readCompletedAt: "2026-06-20T00:02:01.000Z",
    snapshotRevision: "smoke-thread-1:2026-06-20T00:02:01.000Z",
    runtimeStatus: "running",
    latestTurnStatus: "completed",
    turns: [
      {
        id: "smoke-turn-1",
        status: "completed",
        startedAt: 1,
        completedAt: 2,
        durationMs: 1_000,
      },
    ],
  },
  "smoke-thread-2": {
    deviceId: "smoke-worker",
    conversationId: "smoke-thread-2",
    projectId: "smoke-project",
    readStartedAt: "2026-06-20T00:03:00.000Z",
    readCompletedAt: "2026-06-20T00:03:01.000Z",
    snapshotRevision: "smoke-thread-2:2026-06-20T00:03:01.000Z",
    runtimeStatus: "idle",
    latestTurnStatus: "completed",
    turns: [
      {
        id: "smoke-turn-2",
        status: "completed",
        startedAt: 3,
        completedAt: 4,
        durationMs: 1_000,
      },
    ],
  },
};

export interface FakeWorkerSmokeServerOptions {
  host?: string;
  port?: number;
  token?: string;
}

export function createFakeWorkerSmokeServer(options: FakeWorkerSmokeServerOptions = {}) {
  const token = options.token ?? defaultToken;
  const conversations = cloneConversations(initialConversations);
  const timelines = cloneTimelines(initialTimelines);
  let commandSequence = 0;

  return createServer((request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const authHeader = request.headers.authorization ?? "";
    if (authHeader !== `Bearer ${token}`) {
      writeError(response, 401, "unauthorized", "Missing or invalid bearer token.");
      return;
    }

    const path = getRequestPath(request);
    console.log(`${request.method} ${path}`);

    if (request.method === "POST") {
      void handleWriteRequest({
        conversations,
        timelines,
        nextSequence: () => {
          commandSequence += 1;
          return commandSequence;
        },
        path,
        request,
        response,
      });
      return;
    }

    if (request.method !== "GET") {
      writeError(response, 405, "method_not_allowed", "Method is not allowed.");
      return;
    }

    if (path === "/v1/worker/health") {
      writeJson(response, 200, health);
      return;
    }

    if (path === "/v1/worker/capabilities") {
      writeJson(response, 200, capabilities);
      return;
    }

    if (path === "/v1/conversations") {
      writeJson(response, 200, conversations);
      return;
    }

    const timelineConversationId = path.match(/^\/v1\/conversations\/([^/]+)\/timeline$/)?.[1];
    if (timelineConversationId && timelines[timelineConversationId]) {
      writeJson(response, 200, timelines[timelineConversationId]);
      return;
    }

    writeError(response, 404, "conversation_not_found", "Conversation was not found.");
  });
}

async function handleWriteRequest(params: {
  conversations: CodexConversation[];
  timelines: Record<string, ConversationTimeline>;
  nextSequence: () => number;
  path: string;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  if (params.path === "/v1/conversations") {
    const input = await readStartInput(params.request);
    if (!input) {
      writeError(params.response, 400, "invalid_request", "Request validation failed.");
      return;
    }

    if (input.message === "smoke-fail") {
      writeError(params.response, 424, "app_server_unavailable", "Fake Worker app-server write failed.");
      return;
    }

    const sequence = params.nextSequence();
    const conversationId = `smoke-start-${input.clientRequestId}`;
    const turnId = `smoke-turn-${input.clientRequestId}`;
    const acceptedAt = createAcceptedAt(sequence);
    const conversation: CodexConversation = {
      id: conversationId,
      title: "Smoke started conversation",
      deviceId: "smoke-worker",
      projectId: input.projectId,
      projectName: "stage4-smoke",
      status: "running",
      updatedAt: acceptedAt,
      summary: "Accepted fake Worker start",
      sandbox: "workspace-write",
      approval: "never",
    };
    params.conversations.unshift(conversation);
    params.timelines[conversationId] = createStartedTimeline(conversationId, input.projectId, turnId, acceptedAt);
    writeJson(params.response, 202, createAcceptedCommand("start", conversationId, input.clientRequestId, turnId, acceptedAt));
    return;
  }

  const followUpConversationId = params.path.match(/^\/v1\/conversations\/([^/]+)\/follow-up$/)?.[1];
  if (!followUpConversationId) {
    writeError(params.response, 404, "conversation_not_found", "Conversation was not found.");
    return;
  }

  const timeline = params.timelines[followUpConversationId];
  const conversation = params.conversations.find((item) => item.id === followUpConversationId);
  const input = await readFollowUpInput(params.request);
  if (!input) {
    writeError(params.response, 400, "invalid_request", "Request validation failed.");
    return;
  }

  if (!timeline || !conversation) {
    writeError(params.response, 404, "conversation_not_found", "Conversation was not found.");
    return;
  }

  if (input.expectedConversationId !== undefined && input.expectedConversationId !== followUpConversationId) {
    writeError(params.response, 409, "conflict", "Conversation guard did not match.");
    return;
  }

  if (input.message === "smoke-fail") {
    writeError(params.response, 424, "app_server_unavailable", "Fake Worker app-server write failed.");
    return;
  }

  const sequence = params.nextSequence();
  const acceptedAt = createAcceptedAt(sequence);
  const turnId = `smoke-turn-${input.clientRequestId}`;
  const turn: ConversationTimelineTurn = {
    id: turnId,
    status: "in_progress",
    startedAt: sequence,
    completedAt: null,
    durationMs: null,
  };
  timeline.turns.push(turn);
  timeline.latestTurnStatus = "unknown";
  timeline.runtimeStatus = "running";
  timeline.readCompletedAt = acceptedAt;
  timeline.snapshotRevision = `${followUpConversationId}:${acceptedAt}`;
  conversation.status = "running";
  conversation.updatedAt = acceptedAt;
  conversation.summary = "Accepted fake Worker follow-up";
  writeJson(params.response, 202, createAcceptedCommand("follow-up", followUpConversationId, input.clientRequestId, turnId, acceptedAt));
}

function createStartedTimeline(
  conversationId: string,
  projectId: string,
  turnId: string,
  acceptedAt: string,
): ConversationTimeline {
  return {
    deviceId: "smoke-worker",
    conversationId,
    projectId,
    readStartedAt: acceptedAt,
    readCompletedAt: acceptedAt,
    snapshotRevision: `${conversationId}:${acceptedAt}`,
    runtimeStatus: "running",
    latestTurnStatus: "unknown",
    turns: [
      {
        id: turnId,
        status: "in_progress",
        startedAt: 1,
        completedAt: null,
        durationMs: null,
      },
    ],
  };
}

function createAcceptedCommand(
  operation: "follow-up" | "start",
  conversationId: string,
  clientRequestId: string,
  turnId: string,
  acceptedAt: string,
): CommandAccepted {
  return {
    id: `${operation}:${conversationId}:${clientRequestId}`,
    status: "accepted",
    conversationId,
    turnId,
    acceptedAt,
  };
}

function createAcceptedAt(sequence: number): string {
  return `2026-06-20T00:04:${String(sequence).padStart(2, "0")}.000Z`;
}

async function readStartInput(request: IncomingMessage): Promise<StartConversationInput | null> {
  const body = await readJsonObject(request);
  if (!body || hasUnknownFields(body, ["projectId", "message", "clientRequestId"])) {
    return null;
  }

  const projectId = readRequiredStringField(body, "projectId");
  const message = readRequiredStringField(body, "message", messageMaxLength);
  const clientRequestId = readRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength);
  if (projectId === null || message === null || clientRequestId === null) {
    return null;
  }

  return { projectId, message, clientRequestId };
}

async function readFollowUpInput(request: IncomingMessage): Promise<FollowUpInput | null> {
  const body = await readJsonObject(request);
  if (!body || hasUnknownFields(body, ["message", "clientRequestId", "expectedConversationId"])) {
    return null;
  }

  const message = readRequiredStringField(body, "message", messageMaxLength);
  const clientRequestId = readRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength);
  const expectedConversationId = readOptionalStringField(body, "expectedConversationId");
  if (message === null || clientRequestId === null || expectedConversationId === null) {
    return null;
  }

  return {
    message,
    clientRequestId,
    ...(expectedConversationId === undefined ? {} : { expectedConversationId }),
  };
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasUnknownFields(body: Record<string, unknown>, allowedFields: readonly string[]): boolean {
  const allowed = new Set(allowedFields);
  return Object.keys(body).some((field) => !allowed.has(field));
}

function readRequiredStringField(
  body: Record<string, unknown>,
  field: string,
  maxLength?: number,
): string | null {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || (maxLength !== undefined && value.length > maxLength)) {
    return null;
  }

  return value;
}

function readOptionalStringField(body: Record<string, unknown>, field: string): string | null | undefined {
  if (!(field in body)) {
    return undefined;
  }

  return readRequiredStringField(body, field);
}

function cloneConversations(source: readonly CodexConversation[]): CodexConversation[] {
  return source.map((conversation) => ({ ...conversation }));
}

function cloneTimelines(source: Readonly<Record<string, ConversationTimeline>>): Record<string, ConversationTimeline> {
  return Object.fromEntries(
    Object.entries(source).map(([conversationId, timeline]) => [
      conversationId,
      {
        ...timeline,
        turns: timeline.turns.map((turn) => ({ ...turn })),
      },
    ]),
  );
}

function getRequestPath(request: IncomingMessage): string {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${defaultHost}:${defaultPort}`}`);
  return url.pathname;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("access-control-allow-headers", "authorization, content-type, accept");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("vary", "origin");
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function writeError(response: ServerResponse, status: number, code: string, message: string): void {
  const body: ErrorEnvelope = {
    code,
    message,
  };
  writeJson(response, status, body);
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && resolve(entrypoint) === fileURLToPath(import.meta.url));
}

if (isEntrypoint()) {
  const host = process.env.CODEX_REMOTE_FAKE_WORKER_HOST ?? defaultHost;
  const port = Number(process.env.CODEX_REMOTE_FAKE_WORKER_PORT ?? defaultPort);
  const token = process.env.CODEX_REMOTE_FAKE_WORKER_TOKEN ?? defaultToken;
  const server = createFakeWorkerSmokeServer({ host, port, token });

  server.listen(port, host, () => {
    console.log(`Fake Worker smoke server listening on http://${host}:${port}`);
  });
}
