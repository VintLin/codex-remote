import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ApprovalDecisionInput,
  CommandAccepted,
  CodexConversation,
  ConversationTimeline,
  ConversationTimelineTurn,
  ErrorEnvelope,
  FollowUpInput,
  InterruptTurnInput,
  PendingApproval,
  StartConversationInput,
  SteerTurnInput,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

const defaultHost = "127.0.0.1";
const defaultPort = 8788;
const defaultToken = "example-token";
const defaultDeviceId = "smoke-worker";
const defaultConversationIds = {
  active: "smoke-thread-1",
  complete: "smoke-thread-2",
} as const;
const defaultProjectId = "smoke-project";
const defaultProjectName = "stage3-smoke";
const allowedOrigin = "http://127.0.0.1:5173";
const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;

export interface FakeWorkerSmokeServerOptions {
  conversationIds?: {
    active: string;
    complete: string;
  };
  deviceId?: string;
  host?: string;
  port?: number;
  projectId?: string;
  projectName?: string;
  token?: string;
}

interface FakeWorkerSeedInput {
  conversationIds: {
    active: string;
    complete: string;
  };
  deviceId: string;
  projectId: string;
  projectName: string;
}

interface FakeWorkerSeedData extends FakeWorkerSeedInput {
  activeTurnId: string;
  approvals: PendingApproval[];
  capabilities: WorkerCapabilities;
  conversations: CodexConversation[];
  health: WorkerHealth;
  timelines: Record<string, ConversationTimeline>;
}

export function createFakeWorkerSmokeServer(options: FakeWorkerSmokeServerOptions = {}) {
  const token = options.token ?? defaultToken;
  const seed = createSeedData({
    conversationIds: options.conversationIds ?? defaultConversationIds,
    deviceId: options.deviceId ?? defaultDeviceId,
    projectId: options.projectId ?? defaultProjectId,
    projectName: options.projectName ?? defaultProjectName,
  });
  const conversations = cloneConversations(seed.conversations);
  const timelines = cloneTimelines(seed.timelines);
  const approvals = cloneApprovals(seed.approvals);
  const health = seed.health;
  const capabilities = seed.capabilities;
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
        approvals,
        deviceId: health.deviceId,
        projectName: seed.projectName,
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

    const approvalsConversationId = path.match(/^\/v1\/conversations\/([^/]+)\/approvals$/)?.[1];
    if (approvalsConversationId) {
      writeJson(response, 200, approvals.filter((approval) => approval.conversationId === approvalsConversationId));
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

function createSeedData(input: FakeWorkerSeedInput): FakeWorkerSeedData {
  const activeTurnId = "smoke-turn-1";
  const completeTurnId = "smoke-turn-2";
  const conversations: CodexConversation[] = [
    {
      id: input.conversationIds.active,
      title: "Smoke Worker conversation",
      deviceId: input.deviceId,
      projectId: input.projectId,
      projectName: input.projectName,
      status: "running",
      updatedAt: "2026-06-20T00:00:00.000Z",
      summary: "Read-only fake Worker data",
      sandbox: "workspace-write",
      approval: "never",
    },
    {
      id: input.conversationIds.complete,
      title: "Smoke complete conversation",
      deviceId: input.deviceId,
      projectId: input.projectId,
      projectName: input.projectName,
      status: "done",
      updatedAt: "2026-06-20T00:01:00.000Z",
      summary: "Second fake Worker conversation",
      sandbox: "workspace-write",
      approval: "never",
    },
  ];
  return {
    ...input,
    activeTurnId,
    approvals: [
      {
        id: "smoke-approval-1",
        conversationId: input.conversationIds.active,
        turnId: activeTurnId,
        itemId: "smoke-item-1",
        kind: "command_execution",
        status: "pending",
        startedAt: "2026-06-20T00:02:01.000Z",
        summary: "Run smoke command",
        risk: "medium",
      },
    ],
    capabilities: {
      deviceId: input.deviceId,
      canReadProjects: true,
      canReadConversations: true,
      canReadTimeline: true,
      canRunReadOnlyProbe: false,
      appServerTransport: "loopbackWebSocket",
      supportedSourceKinds: ["cli", "appServer"],
    },
    conversations,
    health: {
      deviceId: input.deviceId,
      status: "connected",
      checkedAt: "2026-06-20T00:02:00.000Z",
      codexVersion: "fake-smoke",
      appServer: {
        transport: "loopbackWebSocket",
        readyz: true,
      },
    },
    timelines: {
      [input.conversationIds.active]: {
        deviceId: input.deviceId,
        conversationId: input.conversationIds.active,
        projectId: input.projectId,
        readStartedAt: "2026-06-20T00:02:00.000Z",
        readCompletedAt: "2026-06-20T00:02:01.000Z",
        snapshotRevision: `${input.conversationIds.active}:2026-06-20T00:02:01.000Z`,
        runtimeStatus: "running",
        latestTurnStatus: "unknown",
        turns: [
          {
            id: activeTurnId,
            status: "in_progress",
            startedAt: 1,
            completedAt: null,
            durationMs: null,
            itemsView: "full",
            nodes: [],
          },
        ],
      },
      [input.conversationIds.complete]: {
        deviceId: input.deviceId,
        conversationId: input.conversationIds.complete,
        projectId: input.projectId,
        readStartedAt: "2026-06-20T00:03:00.000Z",
        readCompletedAt: "2026-06-20T00:03:01.000Z",
        snapshotRevision: `${input.conversationIds.complete}:2026-06-20T00:03:01.000Z`,
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [
          {
            id: completeTurnId,
            status: "completed",
            startedAt: 3,
            completedAt: 4,
            durationMs: 1_000,
            itemsView: "full",
            nodes: [],
          },
        ],
      },
    },
  };
}

async function handleWriteRequest(params: {
  approvals: PendingApproval[];
  conversations: CodexConversation[];
  deviceId: string;
  projectName: string;
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
      deviceId: params.deviceId,
      projectId: input.projectId,
      projectName: params.projectName,
      status: "running",
      updatedAt: acceptedAt,
      summary: "Accepted fake Worker start",
      sandbox: "workspace-write",
      approval: "never",
    };
    params.conversations.unshift(conversation);
    params.timelines[conversationId] = createStartedTimeline(params.deviceId, conversationId, input.projectId, turnId, acceptedAt);
    writeJson(params.response, 202, createAcceptedCommand("start", conversationId, input.clientRequestId, turnId, acceptedAt));
    return;
  }

  const interruptMatch = params.path.match(/^\/v1\/conversations\/([^/]+)\/turns\/([^/]+)\/interrupt$/);
  if (interruptMatch) {
    await handleInterruptRequest({ ...params, conversationId: interruptMatch[1]!, turnId: interruptMatch[2]! });
    return;
  }

  const steerMatch = params.path.match(/^\/v1\/conversations\/([^/]+)\/turns\/([^/]+)\/steer$/);
  if (steerMatch) {
    await handleSteerRequest({ ...params, conversationId: steerMatch[1]!, turnId: steerMatch[2]! });
    return;
  }

  const approvalDecisionMatch = params.path.match(/^\/v1\/conversations\/([^/]+)\/approvals\/([^/]+)\/decision$/);
  if (approvalDecisionMatch) {
    await handleApprovalDecisionRequest({
      ...params,
      approvalRequestId: approvalDecisionMatch[2]!,
      conversationId: approvalDecisionMatch[1]!,
    });
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
    itemsView: "full",
    nodes: [],
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

async function handleInterruptRequest(params: {
  conversationId: string;
  conversations: CodexConversation[];
  nextSequence: () => number;
  request: IncomingMessage;
  response: ServerResponse;
  timelines: Record<string, ConversationTimeline>;
  turnId: string;
}): Promise<void> {
  const input = await readInterruptInput(params.request);
  const timeline = params.timelines[params.conversationId];
  const conversation = params.conversations.find((item) => item.id === params.conversationId);
  if (!input) {
    writeError(params.response, 400, "invalid_request", "Request validation failed.");
    return;
  }

  if (!timeline || !conversation) {
    writeError(params.response, 404, "conversation_not_found", "Conversation was not found.");
    return;
  }

  if (input.expectedTurnId !== params.turnId) {
    writeError(params.response, 409, "conflict", "Turn guard did not match.");
    return;
  }

  const turn = timeline.turns.find((item) => item.id === params.turnId);
  if (!turn) {
    writeError(params.response, 404, "turn_not_found", "Turn was not found.");
    return;
  }

  const sequence = params.nextSequence();
  const acceptedAt = createAcceptedAt(sequence);
  turn.status = "completed";
  turn.completedAt = sequence;
  turn.durationMs = Math.max(0, sequence - (turn.startedAt ?? sequence));
  timeline.latestTurnStatus = "completed";
  timeline.runtimeStatus = "idle";
  timeline.readCompletedAt = acceptedAt;
  timeline.snapshotRevision = `${params.conversationId}:${acceptedAt}`;
  conversation.status = "done";
  conversation.updatedAt = acceptedAt;
  conversation.summary = "Accepted fake Worker interrupt";
  writeJson(params.response, 202, createAcceptedCommand("interrupt", params.conversationId, input.clientRequestId, params.turnId, acceptedAt));
}

async function handleSteerRequest(params: {
  conversationId: string;
  conversations: CodexConversation[];
  nextSequence: () => number;
  request: IncomingMessage;
  response: ServerResponse;
  timelines: Record<string, ConversationTimeline>;
  turnId: string;
}): Promise<void> {
  const input = await readSteerInput(params.request);
  const timeline = params.timelines[params.conversationId];
  const conversation = params.conversations.find((item) => item.id === params.conversationId);
  if (!input) {
    writeError(params.response, 400, "invalid_request", "Request validation failed.");
    return;
  }

  if (!timeline || !conversation) {
    writeError(params.response, 404, "conversation_not_found", "Conversation was not found.");
    return;
  }

  if (input.expectedTurnId !== params.turnId) {
    writeError(params.response, 409, "conflict", "Turn guard did not match.");
    return;
  }

  if (!timeline.turns.some((item) => item.id === params.turnId)) {
    writeError(params.response, 404, "turn_not_found", "Turn was not found.");
    return;
  }

  const sequence = params.nextSequence();
  const acceptedAt = createAcceptedAt(sequence);
  timeline.latestTurnStatus = "unknown";
  timeline.runtimeStatus = "running";
  timeline.readCompletedAt = acceptedAt;
  timeline.snapshotRevision = `${params.conversationId}:${acceptedAt}`;
  conversation.status = "running";
  conversation.updatedAt = acceptedAt;
  conversation.summary = "Accepted fake Worker steering";
  writeJson(params.response, 202, createAcceptedCommand("steer", params.conversationId, input.clientRequestId, params.turnId, acceptedAt));
}

async function handleApprovalDecisionRequest(params: {
  approvalRequestId: string;
  approvals: PendingApproval[];
  conversationId: string;
  nextSequence: () => number;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  const input = await readApprovalDecisionInput(params.request);
  if (!input) {
    writeError(params.response, 400, "invalid_request", "Request validation failed.");
    return;
  }

  const approvalIndex = params.approvals.findIndex((approval) => approval.id === params.approvalRequestId);
  const approval = approvalIndex === -1 ? undefined : params.approvals[approvalIndex];
  if (!approval || approval.conversationId !== params.conversationId) {
    writeError(params.response, 404, "approval_not_found", "Approval request was not found.");
    return;
  }

  if (
    input.expectedConversationId !== params.conversationId ||
    input.expectedTurnId !== approval.turnId ||
    input.expectedApprovalRequestId !== approval.id
  ) {
    writeError(params.response, 409, "conflict", "Approval guard did not match.");
    return;
  }

  params.approvals.splice(approvalIndex, 1);
  const sequence = params.nextSequence();
  const acceptedAt = createAcceptedAt(sequence);
  writeJson(params.response, 202, createAcceptedCommand(`approval-${input.decision}`, params.conversationId, input.clientRequestId, approval.turnId, acceptedAt));
}

function createStartedTimeline(
  deviceId: string,
  conversationId: string,
  projectId: string,
  turnId: string,
  acceptedAt: string,
): ConversationTimeline {
  return {
    deviceId,
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
        itemsView: "full",
        nodes: [],
      },
    ],
  };
}

function createAcceptedCommand(
  operation: "approval-accept" | "approval-cancel" | "approval-decline" | "follow-up" | "interrupt" | "start" | "steer",
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

async function readInterruptInput(request: IncomingMessage): Promise<InterruptTurnInput | null> {
  const body = await readJsonObject(request);
  if (!body || hasUnknownFields(body, ["clientRequestId", "expectedTurnId"])) {
    return null;
  }

  const clientRequestId = readRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength);
  const expectedTurnId = readRequiredStringField(body, "expectedTurnId");
  if (clientRequestId === null || expectedTurnId === null) {
    return null;
  }

  return { clientRequestId, expectedTurnId };
}

async function readSteerInput(request: IncomingMessage): Promise<SteerTurnInput | null> {
  const body = await readJsonObject(request);
  if (!body || hasUnknownFields(body, ["message", "clientRequestId", "expectedTurnId"])) {
    return null;
  }

  const message = readRequiredStringField(body, "message", messageMaxLength);
  const clientRequestId = readRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength);
  const expectedTurnId = readRequiredStringField(body, "expectedTurnId");
  if (message === null || clientRequestId === null || expectedTurnId === null) {
    return null;
  }

  return { message, clientRequestId, expectedTurnId };
}

async function readApprovalDecisionInput(request: IncomingMessage): Promise<ApprovalDecisionInput | null> {
  const body = await readJsonObject(request);
  if (
    !body ||
    hasUnknownFields(body, ["decision", "clientRequestId", "expectedConversationId", "expectedTurnId", "expectedApprovalRequestId"])
  ) {
    return null;
  }

  const decision = body.decision;
  const clientRequestId = readRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength);
  const expectedConversationId = readRequiredStringField(body, "expectedConversationId");
  const expectedTurnId = readRequiredStringField(body, "expectedTurnId");
  const expectedApprovalRequestId = readRequiredStringField(body, "expectedApprovalRequestId");
  if (
    (decision !== "accept" && decision !== "decline" && decision !== "cancel") ||
    clientRequestId === null ||
    expectedConversationId === null ||
    expectedTurnId === null ||
    expectedApprovalRequestId === null
  ) {
    return null;
  }

  return { decision, clientRequestId, expectedConversationId, expectedTurnId, expectedApprovalRequestId };
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

function cloneApprovals(source: readonly PendingApproval[]): PendingApproval[] {
  return source.map((approval) => ({ ...approval }));
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
