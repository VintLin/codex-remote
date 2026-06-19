import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CodexConversation,
  ConversationTimeline,
  ErrorEnvelope,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

const defaultHost = "127.0.0.1";
const defaultPort = 8788;
const defaultToken = "example-token";
const allowedOrigin = "http://127.0.0.1:5173";

const conversations: CodexConversation[] = [
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

const timelines: Record<string, ConversationTimeline> = {
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

  return createServer((request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "GET") {
      writeError(response, 405, "method_not_allowed", "Method is not allowed.");
      return;
    }

    const authHeader = request.headers.authorization ?? "";
    if (authHeader !== `Bearer ${token}`) {
      writeError(response, 401, "unauthorized", "Missing or invalid bearer token.");
      return;
    }

    const path = getRequestPath(request);
    console.log(`${request.method} ${path}`);
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

function getRequestPath(request: IncomingMessage): string {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${defaultHost}:${defaultPort}`}`);
  return url.pathname;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("access-control-allow-headers", "authorization, content-type, accept");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
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
