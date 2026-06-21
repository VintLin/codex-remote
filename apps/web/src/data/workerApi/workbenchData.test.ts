import assert from "node:assert/strict";
import test from "node:test";

import type {
  ErrorEnvelope,
  ExtensionInventory,
  LocalWorkbenchSummary,
  McpServerSummary,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  RuntimeSettingsSummary,
} from "@codex-remote/api-contract";
import type {
  AssistantTimelineNode,
  AssistantTimelineTurn,
  AssistantThreadSnapshot,
} from "../../domain/assistant/assistantTimeline.ts";

import { assistantThreads as mockAssistantThreads, conversations as mockConversations } from "../app-server/mockData.ts";
import { createConversationKey } from "../../domain/sidebar/conversationIdentity.ts";
import { loadWorkbenchData, createFallbackWorkbenchData } from "./workbenchData.ts";

function jsonResponse<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createFetchMock(endpointMap: Record<string, Response>): typeof fetch {
  return async (input: RequestInfo | URL | string): Promise<Response> => {
    const requestUrl = new URL(input.toString());
    const response = endpointMap[requestUrl.pathname];

    if (!response) {
      if (requestUrl.pathname.endsWith("/queued-messages")) {
        return Promise.resolve(jsonResponse([]));
      }
      throw new Error(`Unexpected endpoint: ${requestUrl.pathname}`);
    }

    return Promise.resolve(response);
  };
}

function project(id: string, name: string, deviceId: string) {
  return {
    id,
    name,
    deviceId,
    path: "",
    branch: "unknown",
    hasChanges: false,
    pinned: false,
    expanded: true,
  };
}

test("workbench datasource when endpoint responses are valid should create snapshot from contract payloads", async () => {
  const responses: Record<string, Response> = {
    "/v1/devices": jsonResponse([
      {
        id: "w1",
        icon: "laptop",
        name: "w1",
        status: "Connected",
        ip: "local",
        lastOnlineAt: "2026-06-20T00:00:00.000Z",
        currentProject: "project-live",
        model: "Codex",
      },
    ]),
    "/v1/worker/health": jsonResponse({
      deviceId: "w1",
      status: "connected",
      checkedAt: "2026-06-20T00:00:00.000Z",
      codexVersion: "1.0.0",
      appServer: {
        transport: "loopbackWebSocket",
        readyz: true,
      },
    }),
    "/v1/worker/capabilities": jsonResponse({
      deviceId: "w1",
      canReadProjects: true,
      canReadConversations: true,
      canReadTimeline: true,
      canRunReadOnlyProbe: true,
      appServerTransport: "loopbackWebSocket",
      supportedSourceKinds: ["cli", "vscode", "appServer"],
    }),
    "/v1/conversations": jsonResponse([
      {
        id: "conv-live-1",
        title: "Live with project",
        deviceId: "w1",
        projectId: "p-live",
        projectName: "project-live",
        status: "done",
        updatedAt: "今天",
        summary: "Live response",
        sandbox: "workspace-write",
        approval: "never",
      },
      {
        id: "conv-live-2",
        title: "Projectless",
        deviceId: "w1",
        projectName: "Free area",
        status: "done",
        updatedAt: "刚刚",
        summary: "No project",
        sandbox: "workspace-write",
        approval: "never",
      },
    ]),
    "/v1/projects": jsonResponse([project("p-live", "project-live", "w1")]),
    "/v1/devices/w1/conversations/conv-live-1/timeline": jsonResponse({
      deviceId: "w1",
      conversationId: "conv-live-1",
      projectId: "p-live",
      readStartedAt: "2026-06-20T00:00:00.000Z",
      readCompletedAt: "2026-06-20T00:00:01.000Z",
      snapshotRevision: "r1",
      runtimeStatus: "idle",
      latestTurnStatus: "completed",
      turns: [
        {
          id: "t-1",
          status: "completed",
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
          itemsView: "full",
          nodes: [],
        },
      ],
    }),
    "/v1/devices/w1/conversations/conv-live-1/queued-messages": jsonResponse([
      {
        id: "queue-live-1",
        deviceId: "w1",
        conversationId: "conv-live-1",
        message: "Run later",
        status: "queued",
        createdAt: "2026-06-20T00:00:02.000Z",
        updatedAt: "2026-06-20T00:00:02.000Z",
      },
    ]),
    "/v1/tasks": jsonResponse([
      {
        id: "task-live",
        title: "Live task",
        status: "in_progress",
        createdAt: "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
        linkedConversations: [
          {
            deviceId: "w1",
            conversationId: "conv-live-1",
            projectId: "project-live",
            linkedAt: "2026-06-20T00:00:00.000Z",
          },
        ],
      },
    ]),
    "/v1/devices/w1/projects/p-live/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary()),
    "/v1/devices/w1/projects/p-live/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
    "/v1/devices/w1/projects/p-live/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
    "/v1/devices/w1/projects/p-live/local-workbench/git": jsonResponse(createProjectGitSummary()),
    "/v1/devices/w1/projects/p-live/local-workbench/mcp": jsonResponse(createMcpServerSummary()),
    "/v1/devices/w1/projects/p-live/local-workbench/extensions": jsonResponse(createExtensionInventory()),
  };

  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock(responses),
  });

  const firstConversation = data.conversations[0];
  assert.ok(firstConversation);
  assert.equal(firstConversation.id, "conv-live-1");
  assert.equal(data.source.reason, "loaded");
  assert.equal(data.source.error, undefined);
  assert.equal(data.projects[0]?.id, "p-live");
  assert.equal(data.searchRecents[0]?.conversationId, "conv-live-1");
  assert.equal(data.tasks[0]?.id, "task-live");
  assert.equal(data.tasks[0]?.linkedConversations[0]?.deviceId, "w1");
  assert.equal(data.queuedMessages[0]?.message, "Run later");
  assert.equal(data.assistantThreads.length, 2);
  assert.equal(data.localWorkbench.status, "loaded");
  assert.equal(data.localWorkbench.summary?.projectId, "p-live");
  assert.equal(data.localWorkbench.files.data?.entries[0]?.path, "src");
  assert.equal(data.localWorkbench.preview.data?.path, "README.md");
  assert.equal(data.localWorkbench.git.data?.changedFiles[0]?.path, "src/app.ts");
  assert.equal(data.localWorkbench.search.status, "unavailable");
  assert.equal(data.localWorkbench.search.data, null);
  assert.equal(data.localWorkbench.mcp.data?.servers[0]?.name, "context7");
  assert.equal(data.localWorkbench.extensions.data?.skills[0]?.name, "test-driven-development");
});

test("workbench datasource when token is missing should return fallback and skip fetch", async () => {
  let requestCount = 0;

  const fallback = createFallbackWorkbenchData("not_configured");

  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "",
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("should not happen");
    },
  });

  assert.equal(requestCount, 0);
  assert.equal(data.source.reason, "not_configured");
  assert.deepEqual(data.conversations, mockConversations);
  assert.deepEqual(data.tasks, fallback.tasks);
  assert.deepEqual(data.searchRecents, fallback.searchRecents);
  assert.deepEqual(data.assistantThreads, fallback.assistantThreads);
  assert.equal(data.localWorkbench.status, "unavailable");
  assert.equal(data.localWorkbench.summary, null);
  assert.equal(data.localWorkbench.files.status, "unavailable");
  assert.equal(data.assistantThreads.length, mockConversations.length);
  const hasRichNodes = data.assistantThreads.some((thread: AssistantThreadSnapshot) =>
    thread.timeline.turns.some((turn: AssistantTimelineTurn) => turn.nodes.length > 0),
  );
  assert.equal(hasRichNodes, false);
  assert.notDeepEqual(data.assistantThreads, mockAssistantThreads);
});

test("workbench datasource when fallback is returned, should label source as not real data", async () => {
  const data = createFallbackWorkbenchData("not_configured");

  assert.equal(data.source.reason, "not_configured");
  assert.equal(data.conversations.every((conversation) => conversation.title.startsWith("Example ")), true);
});

test("workbench datasource when remote conversations are empty should keep remote empty state", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-empty",
          icon: "laptop",
          name: "Empty worker",
          status: "Not connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "",
          model: "",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([]),
      "/v1/tasks": jsonResponse([]),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.devices[0]?.id, "w-empty");
  assert.equal(data.devices.length, 1);
  assert.equal(data.projects.length, 0);
  assert.equal(data.conversations.length, 0);
  assert.equal(data.tasks.length, 0);
  assert.equal(data.assistantThreads.length, 0);
  assert.equal(data.searchRecents.length, 0);
  assert.equal(data.localWorkbench.status, "empty");
  assert.equal(data.localWorkbench.summary, null);
  assert.notDeepEqual(data.conversations, mockConversations);
});

test("workbench datasource when conversations are empty and projects exist should keep loaded source", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-projects",
          icon: "laptop",
          name: "Projects worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "local",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("local-project", "local", "w-projects")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-projects/projects/local-project/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary({ deviceId: "w-projects", projectId: "local-project" })),
      "/v1/devices/w-projects/projects/local-project/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/w-projects/projects/local-project/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/w-projects/projects/local-project/local-workbench/git": jsonResponse(createProjectGitSummary()),
      "/v1/devices/w-projects/projects/local-project/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "w-projects", projectId: "local-project" })),
      "/v1/devices/w-projects/projects/local-project/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "w-projects", projectId: "local-project" })),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0]?.id, "local-project");
  assert.equal(data.conversations.length, 0);
  assert.equal(data.localWorkbench.status, "loaded");
  assert.equal(data.localWorkbench.summary?.projectId, "local-project");
});

test("workbench datasource when selected device has no conversations should load that device local workbench project", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    selectedDeviceId: "device-b",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "device-a",
          icon: "laptop",
          name: "Device A",
          status: "Connected",
          ip: "local-a",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "project-a",
          model: "Codex",
        },
        {
          id: "device-b",
          icon: "laptop",
          name: "Device B",
          status: "Connected",
          ip: "local-b",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "project-b",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([
        project("project-a", "Project A", "device-a"),
        project("project-b", "Project B", "device-b"),
      ]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/device-b/projects/project-b/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary({ deviceId: "device-b", projectId: "project-b" })),
      "/v1/devices/device-b/projects/project-b/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/device-b/projects/project-b/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/device-b/projects/project-b/local-workbench/git": jsonResponse(createProjectGitSummary()),
      "/v1/devices/device-b/projects/project-b/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "device-b", projectId: "project-b" })),
      "/v1/devices/device-b/projects/project-b/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "device-b", projectId: "project-b" })),
    }),
  });

  assert.equal(data.localWorkbench.deviceId, "device-b");
  assert.equal(data.localWorkbench.projectId, "project-b");
  assert.equal(data.localWorkbench.status, "loaded");
});

test("workbench datasource when one local workbench section fails should keep other sections loaded and mark degraded", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-degraded",
          icon: "laptop",
          name: "Degraded worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "local",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("p-degraded", "local", "w-degraded")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary({ deviceId: "w-degraded", projectId: "p-degraded" })),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/git": jsonResponse(
        { code: "device_unavailable", message: "git unavailable" },
        424,
      ),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "w-degraded", projectId: "p-degraded" })),
      "/v1/devices/w-degraded/projects/p-degraded/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "w-degraded", projectId: "p-degraded" })),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.localWorkbench.status, "degraded");
  assert.equal(data.localWorkbench.git.status, "failed");
  assert.equal(data.localWorkbench.git.error?.code, "device_unavailable");
  assert.equal(data.localWorkbench.files.status, "loaded");
  assert.equal(data.localWorkbench.extensions.status, "loaded");
});

test("workbench datasource when local workbench summary fails should mark degraded", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-summary-fail",
          icon: "laptop",
          name: "Summary failure worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "local",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("p-summary-fail", "local", "w-summary-fail")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/summary": jsonResponse(
        { code: "device_unavailable", message: "summary unavailable" },
        424,
      ),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/git": jsonResponse(createProjectGitSummary()),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "w-summary-fail", projectId: "p-summary-fail" })),
      "/v1/devices/w-summary-fail/projects/p-summary-fail/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "w-summary-fail", projectId: "p-summary-fail" })),
    }),
  });

  assert.equal(data.localWorkbench.status, "degraded");
  assert.equal(data.localWorkbench.summary, null);
  assert.equal(data.localWorkbench.files.status, "loaded");
});

test("workbench datasource when runtime settings summary loads should expose selected project runtime data", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        { id: "device-runtime", icon: "laptop", name: "Runtime", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "Runtime", model: "Codex" },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("project-runtime", "Runtime", "device-runtime")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary({ deviceId: "device-runtime", projectId: "project-runtime" })),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/git": jsonResponse(createProjectGitSummary()),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "device-runtime", projectId: "project-runtime" })),
      "/v1/devices/device-runtime/projects/project-runtime/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "device-runtime", projectId: "project-runtime" })),
      "/v1/devices/device-runtime/projects/project-runtime/runtime-settings": jsonResponse(createRuntimeSettingsSummary({ deviceId: "device-runtime", projectId: "project-runtime" })),
    }),
  });

  assert.equal(data.runtimeSettings.status, "loaded");
  assert.equal(data.runtimeSettings.summary?.projectId, "project-runtime");
  assert.equal(data.runtimeSettings.summary?.models[0]?.id, "gpt-5");
  assert.equal(data.runtimeSettings.summary?.account.emailDomain, "example.com");
});

test("workbench datasource when no selected project exists should mark runtime settings empty", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        { id: "device-empty", icon: "laptop", name: "Empty", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "", model: "Codex" },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([]),
      "/v1/tasks": jsonResponse([]),
    }),
  });

  assert.equal(data.runtimeSettings.status, "empty");
  assert.equal(data.runtimeSettings.summary, null);
  assert.equal(data.runtimeSettings.deviceId, null);
  assert.equal(data.runtimeSettings.projectId, null);
});

test("workbench datasource when runtime settings request fails should keep app source loaded and mark runtime degraded", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        { id: "device-runtime-fail", icon: "laptop", name: "Runtime fail", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "Runtime", model: "Codex" },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("project-runtime-fail", "Runtime", "device-runtime-fail")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/summary": jsonResponse(createLocalWorkbenchSummary({ deviceId: "device-runtime-fail", projectId: "project-runtime-fail" })),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/files": jsonResponse(createProjectDirectoryListing()),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/file-preview": jsonResponse(createProjectFilePreview()),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/git": jsonResponse(createProjectGitSummary()),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/mcp": jsonResponse(createMcpServerSummary({ deviceId: "device-runtime-fail", projectId: "project-runtime-fail" })),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/local-workbench/extensions": jsonResponse(createExtensionInventory({ deviceId: "device-runtime-fail", projectId: "project-runtime-fail" })),
      "/v1/devices/device-runtime-fail/projects/project-runtime-fail/runtime-settings": jsonResponse(
        { code: "app_server_unavailable", message: "runtime unavailable" },
        424,
      ),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.runtimeSettings.status, "degraded");
  assert.equal(data.runtimeSettings.summary, null);
  assert.equal(data.runtimeSettings.error?.code, "app_server_unavailable");
  assert.equal(data.localWorkbench.status, "loaded");
});

function createLocalWorkbenchSummary(overrides: Partial<LocalWorkbenchSummary> = {}): LocalWorkbenchSummary {
  return {
    deviceId: "w1",
    projectId: "p-live",
    projectName: "project-live",
    fileCount: 2,
    directoryCount: 1,
    gitStatus: "dirty",
    searchResultCount: 1,
    mcpServerCount: 1,
    extensionCount: 2,
    previewAvailable: true,
    ...overrides,
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
    path: "README.md",
    previewKind: "text",
    mimeType: "text/markdown",
    byteCount: 80,
    lineCount: 4,
    truncated: false,
    previewText: "# Project",
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

function createMcpServerSummary(overrides: Partial<McpServerSummary> = {}): McpServerSummary {
  return {
    deviceId: "w1",
    projectId: "p-live",
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
    ...overrides,
  };
}

function createExtensionInventory(overrides: Partial<ExtensionInventory> = {}): ExtensionInventory {
  return {
    deviceId: "w1",
    projectId: "p-live",
    skills: [{ name: "test-driven-development", enabled: true, status: "installed" }],
    hooks: [{ name: "preflight", enabled: false, event: "before-run" }],
    plugins: [{ id: "github", name: "GitHub", enabled: true, skillCount: 2, appCount: 1, mcpServerCount: 1 }],
    marketplaceEntries: [{ name: "Data Analytics", installStatus: "not_installed" }],
    apps: [{ id: "gmail", name: "Gmail", enabled: false }],
    ...overrides,
  };
}

function createRuntimeSettingsSummary(overrides: Partial<RuntimeSettingsSummary> = {}): RuntimeSettingsSummary {
  return {
    deviceId: "w1",
    projectId: "p-live",
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
    ...overrides,
  };
}

test("workbench datasource when task list fails should keep conversation source loaded and expose task failure", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-task-fail",
          icon: "laptop",
          name: "Task failure worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "task-failure",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([
        {
          id: "conversation-task-fail",
          title: "Conversation stays enabled",
          deviceId: "w-task-fail",
          projectId: "task-failure-project",
          projectName: "task-failure",
          status: "running",
          updatedAt: "刚刚",
          summary: "task api failed",
          sandbox: "workspace-write",
          approval: "never",
        },
      ]),
      "/v1/projects": jsonResponse([project("task-failure-project", "task-failure", "w-task-fail")]),
      "/v1/tasks": jsonResponse(
        {
          code: "internal_server_error",
          message: "database REDACTED failure marker",
          details: {
            internal: "REDACTED",
          },
        },
        500,
      ),
      "/v1/devices/w-task-fail/conversations/conversation-task-fail/timeline": jsonResponse({
        deviceId: "w-task-fail",
        conversationId: "conversation-task-fail",
        projectId: "task-failure-project",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "r-task-fail",
        runtimeStatus: "running",
        latestTurnStatus: "in_progress",
        turns: [
          {
            id: "turn-active",
            status: "in_progress",
            startedAt: 1,
            completedAt: null,
            durationMs: null,
            itemsView: "full",
            nodes: [],
          },
        ],
      }),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.source.error, undefined);
  assert.equal(data.conversations[0]?.id, "conversation-task-fail");
  assert.equal(data.assistantThreads[0]?.loadState, "loaded");
  assert.equal(data.tasks.length, 0);
  assert.equal(data.taskSource.status, "failed");
});

for (const [status, reason] of [
  [401, "unauthorized"],
  [403, "forbidden"],
  [424, "app_server_unavailable"],
] as const) {
  test(`workbench datasource when worker api returns ${status} should use fallback reason ${reason}`, async () => {
    const error: ErrorEnvelope = {
      code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "app_server_unavailable",
      message: `status ${status}`,
      details: {
        operation: "worker",
      },
    };

    const data = await loadWorkbenchData({
      baseUrl: "http://example.test",
      token: "token",
      fetchImpl: createFetchMock({
        "/v1/devices": jsonResponse(error, status),
      }),
    });

    assert.equal(data.source.reason, reason);
    assert.equal(data.conversations.length, mockConversations.length);
  });
}

test("workbench datasource should sanitize unsafe error message content", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse(
        {
          code: "internal_server_error",
          message: "Unable to complete request.",
          details: {
            internal: "REDACTED",
          },
        },
        500,
      ),
    }),
  });

  assert.equal(data.source.reason, "request_failure");
  assert.equal(data.source.error?.code, "internal_server_error");
  const message = data.source.error?.message ?? "";
  assert.equal(message.includes("REDACTED"), false);
  assert.equal(Boolean(data.source.error?.details && "internal" in data.source.error.details), false);
});

test("workbench datasource when conversations are projectless should not create projects", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w2",
          icon: "laptop",
          name: "w2",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "alpha",
          model: "Codex",
        },
      ]),
      "/v1/worker/health": jsonResponse({
        deviceId: "w2",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: null,
        appServer: {
          transport: "loopbackWebSocket",
          readyz: true,
        },
      }),
      "/v1/worker/capabilities": jsonResponse({
        deviceId: "w2",
        canReadProjects: true,
        canReadConversations: true,
        canReadTimeline: true,
        canRunReadOnlyProbe: true,
        appServerTransport: "loopbackWebSocket",
        supportedSourceKinds: ["cli", "vscode", "appServer"],
      }),
      "/v1/conversations": jsonResponse([
        {
          id: "p-less",
          title: "No project",
          deviceId: "w2",
          projectName: "临时",
          status: "done",
          updatedAt: "刚刚",
          summary: "without projectId",
          sandbox: "workspace-write",
          approval: "never",
        },
        {
          id: "with-project",
          title: "With project",
          deviceId: "w2",
          projectId: "p2",
          projectName: "alpha",
          status: "done",
          updatedAt: "刚刚",
          summary: "with projectId",
          sandbox: "workspace-write",
          approval: "never",
        },
      ]),
      "/v1/projects": jsonResponse([project("p2", "alpha", "w2")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w2/conversations/p-less/timeline": jsonResponse({
        deviceId: "w2",
        conversationId: "p-less",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "r1",
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [],
      }),
    }),
  });

  const projectNames = new Set(data.projects.map((item) => item.name));
  assert.equal(projectNames.has("alpha"), true);
  assert.equal(projectNames.has("临时"), false);
  assert.equal(data.projects.length, 1);
});

test("workbench datasource when timeline loads should create metadata-only nodes", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w3",
          icon: "laptop",
          name: "w3",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "timeline",
          model: "Codex",
        },
      ]),
      "/v1/worker/health": jsonResponse({
        deviceId: "w3",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: null,
        appServer: {
          transport: "loopbackWebSocket",
          readyz: true,
        },
      }),
      "/v1/worker/capabilities": jsonResponse({
        deviceId: "w3",
        canReadProjects: true,
        canReadConversations: true,
        canReadTimeline: true,
        canRunReadOnlyProbe: true,
        appServerTransport: "loopbackWebSocket",
        supportedSourceKinds: ["cli", "vscode", "appServer"],
      }),
      "/v1/conversations": jsonResponse([
        {
          id: "timeline",
          title: "Has turns",
          deviceId: "w3",
          projectId: "p-timeline",
          projectName: "timeline",
          status: "running",
          updatedAt: "刚刚",
          summary: "timeline test",
          sandbox: "workspace-write",
          approval: "never",
        },
      ]),
      "/v1/projects": jsonResponse([project("p-timeline", "timeline", "w3")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w3/conversations/timeline/timeline": jsonResponse({
        deviceId: "w3",
        conversationId: "timeline",
        projectId: "p-timeline",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "r1",
        runtimeStatus: "running",
        latestTurnStatus: "completed",
        turns: [
          {
            id: "turn-ok",
            status: "completed",
            startedAt: 1,
            completedAt: 2,
            durationMs: 3,
            itemsView: "full",
            nodes: [],
          },
          {
            id: "turn-warn",
            status: "failed",
            startedAt: 4,
            completedAt: 5,
            durationMs: 6,
            itemsView: "full",
            nodes: [],
          },
        ],
      }),
    }),
  });

  const thread = data.assistantThreads.find((item) => item.id === "timeline");
  assert.ok(thread);
  const unsafeNodes = thread.timeline.turns.flatMap((turn: AssistantTimelineTurn) =>
    turn.nodes.filter((node: AssistantTimelineNode) => node.type !== "contextCompaction"),
  );

  assert.equal(unsafeNodes.length, 0);
  const labels = thread.timeline.turns.flatMap((turn: AssistantTimelineTurn) =>
    turn.nodes.map((node: AssistantTimelineNode) => (node.type === "contextCompaction" ? node.text : "")),
  );
  assert.deepEqual(labels.includes(""), false);
});

test("workbench datasource when real timeline turn omits optional item fields, should keep loaded source", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-real",
          icon: "laptop",
          name: "Real worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "real",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([
        {
          id: "real-thread",
          title: "Real thread",
          deviceId: "w-real",
          projectId: "p-real",
          projectName: "real",
          status: "unknown",
          updatedAt: "2026-06-21T00:00:00.000Z",
          summary: "",
          sandbox: "unknown",
          approval: "unknown",
          archived: false,
          loaded: true,
          live: false,
        },
      ]),
      "/v1/projects": jsonResponse([project("p-real", "real", "w-real")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-real/conversations/real-thread/timeline": jsonResponse({
        deviceId: "w-real",
        conversationId: "real-thread",
        readStartedAt: "2026-06-21T00:00:00.000Z",
        readCompletedAt: "2026-06-21T00:00:01.000Z",
        snapshotRevision: "r-real",
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [
          {
            id: "turn-real",
            status: "completed",
            startedAt: 1,
            completedAt: 2,
            durationMs: 3,
          },
        ],
        events: [],
      }),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.assistantThreads[0]?.timeline.turns[0]?.itemsView, "unknown");
  assert.equal(data.assistantThreads[0]?.timeline.turns[0]?.nodes[0]?.type, "contextCompaction");
});

test("workbench datasource when timeline includes duplicate approval events, should project latest approval card state per approval id", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w-events",
          icon: "laptop",
          name: "Events worker",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-21T00:00:00.000Z",
          currentProject: "events",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([
        {
          id: "events-thread",
          title: "Events thread",
          deviceId: "w-events",
          projectId: "p-events",
          projectName: "events",
          status: "waiting",
          updatedAt: "刚刚",
          summary: "",
          sandbox: "workspace-write",
          approval: "on-request",
          archived: false,
          loaded: true,
          live: true,
        },
      ]),
      "/v1/projects": jsonResponse([project("p-events", "events", "w-events")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-events/conversations/events-thread/timeline": jsonResponse({
        deviceId: "w-events",
        conversationId: "events-thread",
        projectId: "p-events",
        readStartedAt: "2026-06-21T00:00:00.000Z",
        readCompletedAt: "2026-06-21T00:00:01.000Z",
        snapshotRevision: "r-events",
        runtimeStatus: "waiting_approval",
        latestTurnStatus: "in_progress",
        loaded: true,
        live: true,
        archived: false,
        turns: [],
        events: [
          {
            eventId: "event-late",
            seq: 3,
            deviceId: "w-events",
            conversationId: "events-thread",
            kind: "approval_resolved",
            createdAt: "2026-06-21T00:00:03.000Z",
            source: "live",
            approvalCard: {
              id: "approval-resolved",
              conversationId: "events-thread",
              turnId: "turn-1",
              itemId: "item-2",
              kind: "command_execution",
              status: "resolved",
              title: "Resolved approval",
              summary: "resolved safely",
              risk: "low",
              createdAt: "2026-06-21T00:00:02.000Z",
              resolvedAt: "2026-06-21T00:00:03.000Z",
            },
          },
          {
            eventId: "event-pending",
            seq: 2,
            deviceId: "w-events",
            conversationId: "events-thread",
            kind: "approval_pending",
            createdAt: "2026-06-21T00:00:02.000Z",
            source: "snapshot",
            approvalCard: {
              id: "approval-resolved",
              conversationId: "events-thread",
              turnId: "turn-1",
              itemId: "item-2",
              kind: "command_execution",
              status: "pending",
              title: "Stale pending approval",
              summary: "pending safely",
              risk: "medium",
              createdAt: "2026-06-21T00:00:02.000Z",
            },
          },
          {
            eventId: "event-pending",
            seq: 2,
            deviceId: "w-events",
            conversationId: "events-thread",
            kind: "approval_pending",
            createdAt: "2026-06-21T00:00:02.000Z",
            source: "live",
            approvalCard: {
              id: "approval-pending",
              conversationId: "events-thread",
              turnId: "turn-1",
              itemId: "item-1",
              kind: "command_execution",
              status: "pending",
              title: "Pending approval duplicate",
              summary: "duplicate should not show",
              risk: "medium",
              createdAt: "2026-06-21T00:00:02.000Z",
            },
          },
          {
            eventId: "event-reset",
            seq: 1,
            deviceId: "w-events",
            conversationId: "events-thread",
            kind: "snapshot_reset",
            createdAt: "2026-06-21T00:00:01.000Z",
            source: "snapshot",
            gap: true,
          },
        ],
      }),
    }),
  });

  assert.deepEqual(data.approvalCards.map((card) => `${card.status}:${card.id}`), [
    "resolved:approval-resolved",
  ]);
  assert.equal(data.approvalCards[0]?.summary, "resolved safely");
});

test("workbench datasource when fallback is returned should not reuse rich mock assistant threads", async () => {

  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "",
    fetchImpl: async () => {
      throw new Error("mock not used");
    },
  });

  const fallback = createFallbackWorkbenchData("not_configured");
  assert.deepEqual(data.assistantThreads, fallback.assistantThreads);
  const hasRichNodes = data.assistantThreads.some((thread: AssistantThreadSnapshot) =>
    thread.timeline.turns.some((turn: AssistantTimelineTurn) => turn.nodes.length > 0),
  );
  assert.equal(hasRichNodes, false);
  assert.notDeepEqual(data.assistantThreads, mockAssistantThreads);
});

test("workbench datasource when timeline fetch fails should keep loaded snapshot and mark selected thread readError", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    selectedConversationKey: createConversationKey({ deviceId: "w4", id: "timeline-error" }),
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w4",
          icon: "laptop",
          name: "w4",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "project-four",
          model: "Codex",
        },
      ]),
      "/v1/worker/health": jsonResponse({
        deviceId: "w4",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: null,
        appServer: {
          transport: "loopbackWebSocket",
          readyz: true,
        },
      }),
      "/v1/worker/capabilities": jsonResponse({
        deviceId: "w4",
        canReadProjects: true,
        canReadConversations: true,
        canReadTimeline: true,
        canRunReadOnlyProbe: true,
        appServerTransport: "loopbackWebSocket",
        supportedSourceKinds: ["cli", "vscode", "appServer"],
      }),
      "/v1/conversations": jsonResponse([
        {
          id: "timeline-error",
          title: "Timeline unavailable",
          deviceId: "w4",
          projectId: "p4",
          projectName: "project-four",
          status: "running",
          updatedAt: "刚刚",
          summary: "timeline read failure",
          sandbox: "workspace-write",
          approval: "never",
        },
        {
          id: "timeline-ok",
          title: "Other thread",
          deviceId: "w4",
          projectId: "p5",
          projectName: "project-five",
          status: "done",
          updatedAt: "刚刚",
          summary: "healthy thread",
          sandbox: "workspace-write",
          approval: "never",
        },
      ]),
      "/v1/projects": jsonResponse([project("p4", "project-four", "w4"), project("p5", "project-five", "w4")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w4/conversations/timeline-error/timeline": jsonResponse(
        {
          code: "timeline_read_failed",
          message: "Unable to read conversation timeline.",
          details: {
            operation: "read_timeline",
            internal: "REDACTED",
          } as Record<string, string>,
        },
        500,
      ),
    }),
  });

  const errored = data.assistantThreads.find((item) => item.id === "timeline-error");
  const other = data.assistantThreads.find((item) => item.id === "timeline-ok");

  assert.equal(data.source.reason, "request_failure");
  assert.equal(data.source.error?.code, "timeline_read_failed");
  assert.equal(data.source.error?.message, "Unable to read conversation timeline.");
  assert.equal(data.source.error?.details?.operation, "read_timeline");
  assert.equal(data.source.error?.details && "url" in data.source.error.details, false);
  assert.equal(data.source.error?.details && "token" in data.source.error.details, false);

  assert.equal(data.devices[0]?.id, "w4");
  assert.equal(data.devices.length, 1);
  assert.equal(data.projects.length, 2);
  assert.equal(data.conversations.length, 2);
  assert.equal(errored?.loadState, "readError");
  assert.equal(errored?.timeline.turns.length, 0);
  assert.equal(other?.loadState, "missingRead");
});

test("workbench datasource when conversation ids collide across devices, should load selected device timeline", async () => {
  const requestedPaths: string[] = [];
  const conversations = [
    {
      id: "shared-thread",
      title: "Shared on A",
      deviceId: "device-a",
      projectId: "project-a",
      projectName: "A",
      status: "running",
      updatedAt: "1h",
      summary: "A copy",
      sandbox: "workspace-write",
      approval: "never",
    },
    {
      id: "shared-thread",
      title: "Shared on B",
      deviceId: "device-b",
      projectId: "project-b",
      projectName: "B",
      status: "running",
      updatedAt: "1m",
      summary: "B copy",
      sandbox: "workspace-write",
      approval: "never",
    },
  ];
  const fetchImpl: typeof fetch = async (input) => {
    const requestUrl = new URL(input.toString());
    requestedPaths.push(requestUrl.pathname);
    if (requestUrl.pathname === "/v1/devices") {
      return jsonResponse([
        { id: "device-a", icon: "laptop", name: "A", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "A", model: "Codex" },
        { id: "device-b", icon: "laptop", name: "B", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "B", model: "Codex" },
      ]);
    }
    if (requestUrl.pathname === "/v1/conversations") {
      return jsonResponse(conversations);
    }
    if (requestUrl.pathname === "/v1/projects") {
      return jsonResponse([project("project-a", "A", "device-a"), project("project-b", "B", "device-b")]);
    }
    if (requestUrl.pathname === "/v1/tasks") {
      return jsonResponse([
        {
          id: "task-shared",
          title: "Shared task",
          status: "waiting",
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
          linkedConversations: [
            {
              deviceId: "device-a",
              conversationId: "shared-thread",
              projectId: "shared-project-a",
              linkedAt: "2026-06-20T00:00:00.000Z",
            },
            {
              deviceId: "device-b",
              conversationId: "shared-thread",
              projectId: "shared-project-b",
              linkedAt: "2026-06-20T00:00:00.000Z",
            },
          ],
        },
      ]);
    }
    if (requestUrl.pathname === "/v1/devices/device-b/conversations/shared-thread/timeline") {
      return jsonResponse({
        deviceId: "device-b",
        conversationId: "shared-thread",
        projectId: "project-b",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "b",
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [],
      });
    }
    throw new Error(`Unexpected endpoint: ${requestUrl.pathname}`);
  };

  const data = await loadWorkbenchData({
    baseUrl: "http://collision.test",
    token: "token",
    selectedConversationKey: createConversationKey({ deviceId: "device-b", id: "shared-thread" }),
    fetchImpl,
  });

  assert.equal(requestedPaths.includes("/v1/devices/device-b/conversations/shared-thread/timeline"), true);
  assert.equal(requestedPaths.includes("/v1/devices/device-a/conversations/shared-thread/timeline"), false);
  assert.equal(data.assistantThreads.find((thread) => thread.deviceId === "device-b")?.loadState, "loaded");
  assert.equal(data.assistantThreads.find((thread) => thread.deviceId === "device-a")?.loadState, "missingRead");
  assert.equal(data.searchRecents.find((item) => item.conversationKey === createConversationKey({ deviceId: "device-b", id: "shared-thread" }))?.active, true);
  assert.deepEqual(data.tasks[0]?.linkedConversations, [
    {
      deviceId: "device-a",
      conversationId: "shared-thread",
      projectId: "shared-project-a",
      linkedAt: "2026-06-20T00:00:00.000Z",
    },
    {
      deviceId: "device-b",
      conversationId: "shared-thread",
      projectId: "shared-project-b",
      linkedAt: "2026-06-20T00:00:00.000Z",
    },
  ]);
});

test("workbench datasource when project ids collide across devices, should keep device-scoped projects", async () => {
  const conversations = [
    {
      id: "conversation-a",
      title: "Shared project on A",
      deviceId: "device-a",
      projectId: "shared-project",
      projectName: "Shared A",
      status: "running",
      updatedAt: "1h",
      summary: "A project copy",
      sandbox: "workspace-write",
      approval: "never",
    },
    {
      id: "conversation-b",
      title: "Shared project on B",
      deviceId: "device-b",
      projectId: "shared-project",
      projectName: "Shared B",
      status: "running",
      updatedAt: "1m",
      summary: "B project copy",
      sandbox: "workspace-write",
      approval: "never",
    },
  ];

  const data = await loadWorkbenchData({
    baseUrl: "http://project-collision.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        { id: "device-a", icon: "laptop", name: "A", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "Shared A", model: "Codex" },
        { id: "device-b", icon: "laptop", name: "B", status: "Connected", ip: "local", lastOnlineAt: "now", currentProject: "Shared B", model: "Codex" },
      ]),
      "/v1/conversations": jsonResponse(conversations),
      "/v1/projects": jsonResponse([
        project("shared-project", "Shared A", "device-a"),
        project("shared-project", "Shared B", "device-b"),
      ]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/device-a/conversations/conversation-a/timeline": jsonResponse({
        deviceId: "device-a",
        conversationId: "conversation-a",
        projectId: "shared-project",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "a",
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [],
      }),
    }),
  });

  assert.deepEqual(
    data.projects.map((project) => ({ deviceId: project.deviceId, id: project.id, name: project.name })),
    [
      { deviceId: "device-a", id: "shared-project", name: "Shared A" },
      { deviceId: "device-b", id: "shared-project", name: "Shared B" },
    ],
  );
});

test("workbench datasource search recents should be derived from conversations", async () => {
  const conversations = [
    {
      id: "search-1",
      title: "Search one",
      deviceId: "w-search",
      projectId: "search-project",
      projectName: "search",
      status: "running",
      updatedAt: "1h",
      summary: "for search",
      sandbox: "workspace-write",
      approval: "never",
    },
  ];

  const data = await loadWorkbenchData({
    baseUrl: "http://search.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "w5",
          icon: "laptop",
          name: "w5",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "2026-06-20T00:00:00.000Z",
          currentProject: "search",
          model: "Codex",
        },
      ]),
      "/v1/worker/health": jsonResponse({
        deviceId: "w-search",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: "",
        appServer: {
          transport: "loopbackWebSocket",
          readyz: true,
        },
      }),
      "/v1/worker/capabilities": jsonResponse({
        deviceId: "w-search",
        canReadProjects: true,
        canReadConversations: true,
        canReadTimeline: true,
        canRunReadOnlyProbe: true,
        appServerTransport: "loopbackWebSocket",
        supportedSourceKinds: ["cli", "vscode", "appServer"],
      }),
      "/v1/conversations": jsonResponse(conversations),
      "/v1/projects": jsonResponse([project("search-project", "search", "w-search")]),
      "/v1/tasks": jsonResponse([]),
      "/v1/devices/w-search/conversations/search-1/timeline": jsonResponse({
        deviceId: "w-search",
        conversationId: "search-1",
        projectId: "search-project",
        readStartedAt: "2026-06-20T00:00:00.000Z",
        readCompletedAt: "2026-06-20T00:00:01.000Z",
        snapshotRevision: "r1",
        runtimeStatus: "idle",
        latestTurnStatus: "completed",
        turns: [],
      }),
    }),
  });

  const expected = conversations.map((conversation) => ({
    conversationId: conversation.id,
    title: conversation.title,
    project: conversation.projectName,
  }));

  assert.equal(data.searchRecents.length, conversations.length);
  assert.equal(data.searchRecents[0]?.conversationId, expected[0]?.conversationId);
  assert.equal(data.searchRecents[0]?.title, expected[0]?.title);
  assert.equal(data.searchRecents[0]?.project, expected[0]?.project);
  assert.equal("active" in data.searchRecents[0]!, false);
  assert.equal("marker" in data.searchRecents[0]!, false);
});

test("workbench datasource when task API fails should not replace tasks with persisted mocks", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://task-failure.test",
    token: "token",
    fetchImpl: createFetchMock({
      "/v1/devices": jsonResponse([
        {
          id: "task-device",
          icon: "laptop",
          name: "Task device",
          status: "Connected",
          ip: "local",
          lastOnlineAt: "now",
          currentProject: "tasks",
          model: "Codex",
        },
      ]),
      "/v1/conversations": jsonResponse([]),
      "/v1/projects": jsonResponse([project("local-project", "tasks", "task-device")]),
      "/v1/tasks": jsonResponse(
        {
          code: "task_store_unavailable",
          message: "Task store unavailable.",
        },
        500,
      ),
    }),
  });

  assert.equal(data.source.reason, "loaded");
  assert.equal(data.source.error, undefined);
  assert.equal(data.taskSource.status, "failed");
  assert.deepEqual(data.tasks, []);
});
