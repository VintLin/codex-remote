import assert from "node:assert/strict";
import test from "node:test";

import type { ErrorEnvelope } from "@codex-remote/api-contract";

import { assistantThreads as mockAssistantThreads, conversations as mockConversations } from "../app-server/mockData.ts";
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
      throw new Error(`Unexpected endpoint: ${requestUrl.pathname}`);
    }

    return Promise.resolve(response);
  };
}

test("workbench datasource when endpoint responses are valid should create snapshot from contract payloads", async () => {
  const responses: Record<string, Response> = {
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
    "/v1/conversations/conv-live-1/timeline": jsonResponse({
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
        },
      ],
    }),
  };

  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock(responses),
  });

  const firstConversation = data.conversations[0];
  assert.ok(firstConversation);
  assert.equal(firstConversation.id, "conv-live-1");
  assert.equal(data.projects[0]?.id, "p-live");
  assert.equal(data.searchRecents[0]?.conversationId, "conv-live-1");
  assert.equal(data.assistantThreads.length, 2);
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
  assert.deepEqual(data.searchRecents, fallback.searchRecents);
  assert.deepEqual(data.assistantThreads, fallback.assistantThreads);
  assert.equal(data.assistantThreads.length, mockConversations.length);
  const hasRichNodes = data.assistantThreads.some((thread) =>
    thread.timeline.turns.some((turn) => turn.nodes.length > 0),
  );
  assert.equal(hasRichNodes, false);
  assert.notDeepEqual(data.assistantThreads, mockAssistantThreads);
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
        "/v1/worker/health": jsonResponse(error, status),
      }),
    });

    assert.equal(data.source.reason, reason);
    assert.equal(data.conversations.length, mockConversations.length);
  });
}

test("workbench datasource when conversations are projectless should not create projects", async () => {
  const data = await loadWorkbenchData({
    baseUrl: "http://example.test",
    token: "token",
    fetchImpl: createFetchMock({
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
      "/v1/conversations/p-less/timeline": jsonResponse({
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
      "/v1/conversations/timeline/timeline": jsonResponse({
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
          },
          {
            id: "turn-warn",
            status: "failed",
            startedAt: 4,
            completedAt: 5,
            durationMs: 6,
          },
        ],
      }),
    }),
  });

  const thread = data.assistantThreads.find((item) => item.id === "timeline");
  assert.ok(thread);
  const unsafeNodes = thread.timeline.turns.flatMap((turn) =>
    turn.nodes.filter((node) => node.type !== "contextCompaction"),
  );

  assert.equal(unsafeNodes.length, 0);
  const labels = thread.timeline.turns.flatMap((turn) =>
    turn.nodes.map((node) => (node.type === "contextCompaction" ? node.text : "")),
  );
  assert.deepEqual(labels.includes(""), false);
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
  const hasRichNodes = data.assistantThreads.some((thread) =>
    thread.timeline.turns.some((turn) => turn.nodes.length > 0),
  );
  assert.equal(hasRichNodes, false);
  assert.notDeepEqual(data.assistantThreads, mockAssistantThreads);
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
      "/v1/conversations/search-1/timeline": jsonResponse({
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
