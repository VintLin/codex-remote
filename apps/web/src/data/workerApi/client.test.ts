import assert from "node:assert/strict";
import test from "node:test";

import type {
  AdvancedPlatformReadinessSummary,
  BoardTask,
  CommandAccepted,
  ConversationQueuedMessage,
  ExtensionInventory,
  LocalWorkbenchSummary,
  McpServerSummary,
  OpenConversationResult,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  ProjectSearchResult,
  RemoteProject,
  RuntimeSettingsSummary,
  TaskConversationLink,
  WorkerHealth,
} from "@codex-remote/api-contract";

import { WorkerApiClient } from "./client.ts";

test("WorkerApiClient request when using global fetch should bind the fetch receiver", async () => {
  const originalFetch = globalThis.fetch;
  const health: WorkerHealth = {
    deviceId: "test-device",
    status: "connected",
    checkedAt: "2026-06-20T00:00:00.000Z",
    codexVersion: "test",
    appServer: {
      transport: "loopbackWebSocket",
      readyz: true,
    },
  };
  let receivedThis: unknown = null;
  const fetchWithReceiverCheck = function fetchWithReceiverCheck(this: unknown): Promise<Response> {
    receivedThis = this;
    return Promise.resolve(
      new Response(JSON.stringify(health), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
  };

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: fetchWithReceiverCheck,
    writable: true,
  });

  try {
    const client = new WorkerApiClient({
      baseUrl: "http://127.0.0.1:8788",
      token: "example-token",
    });

    await client.getHealth("device-a");

    assert.equal(receivedThis, globalThis);
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true,
    });
  }
});

test("WorkerApiClient follow-up when called, should POST contract body with bearer auth", async () => {
  const accepted: CommandAccepted = {
    id: "follow-up:thread-1:client-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: "turn-1",
    acceptedAt: "2026-06-20T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(accepted), {
      headers: { "content-type": "application/json" },
      status: 202,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.followUpConversation("device-a", "thread-1", {
    message: "Continue safely",
    clientRequestId: "client-1",
    expectedConversationId: "thread-1",
  });

  assert.deepEqual(response, accepted);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/follow-up");
  assert.equal(requests[0]?.init.method, "POST");
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal((requests[0]?.init.headers as Headers).get("content-type"), "application/json");
  assert.equal(
    requests[0]?.init.body,
    JSON.stringify({
      message: "Continue safely",
      clientRequestId: "client-1",
      expectedConversationId: "thread-1",
    }),
  );
});

test("WorkerApiClient project discovery when called, should GET versioned projects route", async () => {
  const projects: RemoteProject[] = [
    {
      id: "local-project",
      name: "local",
      deviceId: "device-a",
      path: "",
      branch: "unknown",
      hasChanges: false,
      pinned: false,
      expanded: true,
    },
  ];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(projects), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.listProjects();

  assert.deepEqual(response, projects);
  assert.equal(requests[0]?.url, "http://127.0.0.1:8787/v1/projects");
  assert.equal(requests[0]?.init.method, "GET");
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
});

test("WorkerApiClient control methods when called, should use versioned control routes", async () => {
  const accepted: CommandAccepted = {
    id: "control:thread-1:turn-1:client-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: "turn-1",
    acceptedAt: "2026-06-20T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(requests.length === 3 ? [] : accepted), {
      headers: { "content-type": "application/json" },
      status: requests.length === 3 ? 200 : 202,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  await client.interruptTurn("device-a", "thread-1", "turn-1", { clientRequestId: "client-i", expectedTurnId: "turn-1" });
  await client.steerTurn("device-a", "thread-1", "turn-1", { clientRequestId: "client-s", expectedTurnId: "turn-1", message: "Adjust" });
  await client.listApprovals("device-a", "thread-1");
  await client.decideApproval("device-a", "thread-1", "approval-1", {
    clientRequestId: "client-a",
    decision: "accept",
    expectedApprovalRequestId: "approval-1",
    expectedConversationId: "thread-1",
    expectedTurnId: "turn-1",
  });

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/turns/turn-1/interrupt",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/turns/turn-1/steer",
    "GET http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/approvals",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/approvals/approval-1/decision",
  ]);
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
});

test("WorkerApiClient review-start when called, should POST confirmation body to device conversation local action route", async () => {
  const accepted: CommandAccepted = {
    id: "review-start:thread-1:client-review-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: null,
    acceptedAt: "2026-06-22T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(accepted), {
      headers: { "content-type": "application/json" },
      status: 202,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.startReview("device-a", "thread-1", {
    projectId: "project-a",
    expectedConversationId: "thread-1",
    clientRequestId: "client-review-1",
    confirmationText: "START REVIEW",
  });

  assert.deepEqual(response, accepted);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/local-actions/review-start");
  assert.equal(requests[0]?.init.method, "POST");
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal((requests[0]?.init.headers as Headers).get("content-type"), "application/json");
  assert.equal(
    requests[0]?.init.body,
    JSON.stringify({
      projectId: "project-a",
      expectedConversationId: "thread-1",
      clientRequestId: "client-review-1",
      confirmationText: "START REVIEW",
    }),
  );
});

test("WorkerApiClient task methods when called, should use task board routes", async () => {
  const task: BoardTask = {
    id: "task-1",
    title: "Task one",
    status: "in_progress",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    linkedConversations: [],
  };
  const link: TaskConversationLink = {
    deviceId: "device-a",
    conversationId: "thread-1",
    projectId: "project-a",
    linkedAt: "2026-06-20T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    const index = requests.length;
    if (index === 1) {
      return new Response(JSON.stringify([task]), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (index === 2) {
      return new Response(JSON.stringify(task), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }
    if (index === 3) {
      return new Response(JSON.stringify(link), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }
    return new Response(null, { status: 204 });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  await client.listTasks();
  await client.createTask({ title: "Task one", clientRequestId: "request-task-one", status: "in_progress" });
  await client.linkTaskConversation("task-1", { deviceId: "device-a", conversationId: "thread-1", projectId: "project-a" });
  await client.unlinkTaskConversation("task-1", "device-a", "thread-1");

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "GET http://127.0.0.1:8787/v1/tasks",
    "POST http://127.0.0.1:8787/v1/tasks",
    "POST http://127.0.0.1:8787/v1/tasks/task-1/conversation-links",
    "DELETE http://127.0.0.1:8787/v1/tasks/task-1/conversation-links/device-a/thread-1",
  ]);
  assert.equal((requests[2]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal(
    requests[2]?.init.body,
    JSON.stringify({
      deviceId: "device-a",
      conversationId: "thread-1",
      projectId: "project-a",
    }),
  );
});

test("WorkerApiClient queue methods when called, should use device-scoped queued message routes", async () => {
  const queued: ConversationQueuedMessage = {
    id: "queue-1",
    deviceId: "device-a",
    conversationId: "thread-1",
    message: "Run later",
    status: "queued",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
  const accepted: CommandAccepted = {
    id: "send-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: "turn-1",
    acceptedAt: "2026-06-21T00:00:01.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    const index = requests.length;
    if (index === 1) {
      return new Response(JSON.stringify([queued]), { headers: { "content-type": "application/json" }, status: 200 });
    }
    if (index === 2) {
      return new Response(JSON.stringify(queued), { headers: { "content-type": "application/json" }, status: 201 });
    }
    if (index === 3) {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(accepted), { headers: { "content-type": "application/json" }, status: 202 });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  await client.listQueuedMessages("device-a", "thread-1");
  await client.queueConversationMessage("device-a", "thread-1", { message: "Run later", clientRequestId: "queue-request-1" });
  await client.cancelQueuedMessage("device-a", "thread-1", "queue-1");
  await client.sendQueuedMessage("device-a", "thread-1", "queue-1", { clientRequestId: "send-request-1", expectedQueuedMessageId: "queue-1" });

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "GET http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/queued-messages",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/queued-messages",
    "DELETE http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/queued-messages/queue-1",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/queued-messages/queue-1/send",
  ]);
  assert.equal(
    requests[3]?.init.body,
    JSON.stringify({ clientRequestId: "send-request-1", expectedQueuedMessageId: "queue-1" }),
  );
});

test("WorkerApiClient lifecycle methods when called, should use device-scoped lifecycle routes", async () => {
  const lifecycleResult: OpenConversationResult = {
    conversation: {
      id: "thread-1",
      title: "Thread one",
      deviceId: "device-a",
      projectId: "project-a",
      projectName: "Project A",
      status: "running",
      updatedAt: "2026-06-21T00:00:00.000Z",
      summary: "",
      sandbox: "workspace-write",
      approval: "never",
      archived: false,
      loaded: true,
      live: true,
    },
    timeline: {
      deviceId: "device-a",
      conversationId: "thread-1",
      projectId: "project-a",
      readStartedAt: "2026-06-21T00:00:00.000Z",
      readCompletedAt: "2026-06-21T00:00:01.000Z",
      snapshotRevision: "r1",
      runtimeStatus: "running",
      latestTurnStatus: "unknown",
      archived: false,
      loaded: true,
      live: true,
      turns: [],
      events: [],
    },
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(lifecycleResult), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  await client.openConversation("device-a", "thread-1", { clientRequestId: "open-1" });
  await client.archiveConversation("device-a", "thread-1", { clientRequestId: "archive-1" });
  await client.unarchiveConversation("device-a", "thread-1", { clientRequestId: "restore-1" });
  await client.renameConversation("device-a", "thread-1", { title: "Renamed", clientRequestId: "rename-1" });

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/open",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/archive",
    "POST http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1/unarchive",
    "PATCH http://127.0.0.1:8787/v1/devices/device-a/conversations/thread-1",
  ]);
  assert.equal(requests[3]?.init.body, JSON.stringify({ title: "Renamed", clientRequestId: "rename-1" }));
});

test("WorkerApiClient local workbench methods when called, should use seven device-scoped GET routes", async () => {
  const responses: unknown[] = [
    createLocalWorkbenchSummary(),
    createProjectDirectoryListing(),
    createProjectFilePreview(),
    createProjectGitSummary(),
    createProjectSearchResult(),
    createMcpServerSummary(),
    createExtensionInventory(),
  ];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(responses[requests.length - 1]), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  assert.deepEqual(await client.getLocalWorkbenchSummary("device-a", "project-a"), createLocalWorkbenchSummary());
  assert.deepEqual(await client.listLocalWorkbenchFiles("device-a", "project-a", "src"), createProjectDirectoryListing());
  assert.deepEqual(await client.getLocalWorkbenchFilePreview("device-a", "project-a", "src/app.ts"), createProjectFilePreview());
  assert.deepEqual(await client.getLocalWorkbenchGitSummary("device-a", "project-a"), createProjectGitSummary());
  assert.deepEqual(
    await client.searchLocalWorkbenchFiles("device-a", "project-a", { query: "needle", path: "src", limit: 25 }),
    createProjectSearchResult(),
  );
  assert.deepEqual(await client.getLocalWorkbenchMcpSummary("device-a", "project-a"), createMcpServerSummary());
  assert.deepEqual(await client.getLocalWorkbenchExtensionInventory("device-a", "project-a"), createExtensionInventory());

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/summary",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/files?path=src",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/file-preview?path=src%2Fapp.ts",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/git",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/search?query=needle&path=src&limit=25",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/mcp",
    "GET http://127.0.0.1:8787/v1/devices/device-a/projects/project-a/local-workbench/extensions",
  ]);
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
}
);

test("WorkerApiClient runtime settings summary when called, should use project-scoped Control Plane GET route", async () => {
  const runtimeSettings = createRuntimeSettingsSummary();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(runtimeSettings), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.getRuntimeSettingsSummary("device/a", "project/a");

  assert.deepEqual(response, runtimeSettings);
  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "GET http://127.0.0.1:8787/v1/devices/device%2Fa/projects/project%2Fa/runtime-settings",
  ]);
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal((requests[0]?.init.headers as Headers).get("content-type"), null);
});

test("WorkerApiClient advanced platform readiness when called, should use project-scoped Control Plane GET route", async () => {
  const summary = createAdvancedPlatformReadinessSummary();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(summary), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.getAdvancedPlatformReadinessSummary("device/a", "project/a");

  assert.deepEqual(response, summary);
  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "GET http://127.0.0.1:8787/v1/devices/device%2Fa/projects/project%2Fa/advanced-platform-readiness",
  ]);
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal((requests[0]?.init.headers as Headers).get("content-type"), null);
});

function createLocalWorkbenchSummary(): LocalWorkbenchSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    projectName: "Project A",
    fileCount: 2,
    directoryCount: 1,
    gitStatus: "dirty",
    searchResultCount: 1,
    mcpServerCount: 1,
    extensionCount: 2,
    previewAvailable: true,
  };
}

function createProjectDirectoryListing(): ProjectDirectoryListing {
  return {
    entries: [
      { path: "src", name: "src", kind: "directory", childCount: 1 },
      { path: "README.md", name: "README.md", kind: "file", sizeBytes: 120 },
    ],
  };
}

function createProjectFilePreview(): ProjectFilePreview {
  return {
    path: "src/app.ts",
    previewKind: "text",
    mimeType: "text/typescript",
    byteCount: 80,
    lineCount: 4,
    truncated: false,
    previewText: "export const app = true;",
  };
}

function createProjectGitSummary(): ProjectGitSummary {
  return {
    branch: "stage-12",
    status: "dirty",
    aheadCount: 1,
    behindCount: 0,
    stagedCount: 1,
    unstagedCount: 1,
    untrackedCount: 0,
    reviewState: "not_requested",
    changedFiles: [{ path: "src/app.ts", status: "modified", additions: 2, deletions: 1 }],
  };
}

function createProjectSearchResult(): ProjectSearchResult {
  return {
    query: "needle",
    matches: [{ path: "src/app.ts", lineNumber: 1, columnNumber: 8, match: "needle", snippet: "const needle = true;" }],
  };
}

function createMcpServerSummary(): McpServerSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    servers: [
      {
        name: "context7",
        status: "connected",
        tools: ["resolve-library-id"],
        resources: ["docs"],
        resourceTemplates: ["library-docs"],
        authStatus: "ready",
      },
    ],
  };
}

function createExtensionInventory(): ExtensionInventory {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    skills: [{ name: "test-driven-development", enabled: true, status: "installed" }],
    hooks: [{ name: "preflight", enabled: false, event: "before-run" }],
    plugins: [{ id: "github", name: "GitHub", enabled: true, skillCount: 2, appCount: 1, mcpServerCount: 1 }],
    marketplaceEntries: [{ name: "Data Analytics", installStatus: "not_installed" }],
    apps: [{ id: "gmail", name: "Gmail", enabled: false }],
  };
}

function createRuntimeSettingsSummary(): RuntimeSettingsSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    readAt: "2026-06-22T00:00:00.000Z",
    sections: [
      { section: "models", status: "loaded" },
      { section: "providerCapabilities", status: "loaded" },
      { section: "account", status: "loaded" },
      { section: "config", status: "loaded" },
      { section: "permissionProfiles", status: "loaded" },
      { section: "experimentalFeatures", status: "loaded" },
    ],
    models: [
      {
        id: "gpt-5",
        displayName: "GPT-5",
        isDefault: true,
        supportedReasoningEfforts: ["medium"],
        inputModalities: ["text"],
        serviceTiers: ["default"],
      },
    ],
    providerCapabilities: {
      supportsImages: true,
      supportsReasoning: true,
      supportsStructuredOutput: true,
      supportsWebSearch: false,
    },
    account: {
      type: "chatgpt",
      planType: "plus",
      emailDomain: "example.com",
      requiresOpenaiAuth: false,
    },
    config: {
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      compactionGuidanceOmitted: false,
      customGuidanceOmitted: true,
      developerGuidanceOmitted: true,
      model: "gpt-5",
      modelProvider: "openai",
      reasoningEffort: "medium",
      reviewModel: "gpt-5",
      sandboxMode: "workspace-write",
      serviceTier: "default",
      webSearch: false,
    },
    permissionProfiles: [{ id: "default", description: "Default profile" }],
    experimentalFeatures: [
      {
        name: "safe-feature",
        stage: "beta",
        displayName: "Safe feature",
        description: "Read-only feature summary",
        enabled: false,
        defaultEnabled: false,
      },
    ],
  };
}

function createAdvancedPlatformReadinessSummary(): AdvancedPlatformReadinessSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    readAt: "2026-06-22T00:00:00.000Z",
    platform: "macos",
    readinessSections: [
      {
        id: "windows_sandbox",
        label: "Windows sandbox",
        status: "not_applicable",
        summary: "Windows sandbox is not applicable on this platform.",
        details: null,
      },
    ],
    watchlistItems: [
      {
        id: "realtime-voice",
        label: "Realtime voice",
        support: "deferred",
        reason: "Voice transport needs a separate design.",
        nextSafeStep: "Define a privacy model first.",
      },
      {
        id: "remote-gui-computer-use",
        label: "Remote GUI and computer use",
        support: "not_supported",
        reason: "Out of scope for this slice.",
        nextSafeStep: "Keep disabled.",
      },
    ],
  };
}
