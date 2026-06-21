import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExtensionInventory,
  LocalWorkbenchSummary,
  McpServerSummary,
  OpenConversationResult,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  ProjectSearchResult,
  StartReviewInput,
} from "@codex-remote/api-contract";

import { createWorkerUpstreamClient } from "./workerClient.ts";

const device = {
  id: "device-a",
  name: "Device A",
  baseUrl: "http://127.0.0.1:8788",
  token: "example-token",
};

test("worker upstream client when requesting, should use bearer token and versioned path", async () => {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      calls.push({ init, url: String(request) });
      return Response.json({ deviceId: "device-a", status: "connected", checkedAt: "2026-06-20T00:00:00.000Z", codexVersion: null, appServer: { transport: "loopbackWebSocket", readyz: true } });
    },
  });

  await client.getHealth(device);

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(calls[0]?.url, "http://127.0.0.1:8788/v1/worker/health");
  assert.equal(headers.get("authorization"), "Bearer example-token");
});

test("worker upstream client when requesting probe, should use worker probe path and project sanitized evidence", async () => {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      calls.push({ init, url: String(request) });
      return Response.json({
        schemaVersion: 1,
        startedAt: "2026-06-20T00:00:00.000Z",
        completedAt: "2026-06-20T00:00:01.000Z",
        ok: true,
        mode: "readOnly",
        deviceId: "device-a",
        codexVersion: null,
        appServer: { transport: "stdio", startedByWorker: true, readyz: true },
        checks: [
          {
            name: "thread/list",
            ok: true,
            durationMs: 1,
            exactCwdListProven: true,
            completedUntilNextCursorNull: true,
            pageCount: 2,
            cursorCount: 1,
            count: 3,
          },
        ],
      });
    },
  });

  const probe = await client.getProbeSummary(device);

  assert.equal(calls[0]?.url, "http://127.0.0.1:8788/v1/worker/probe");
  assert.equal(probe.checks[0]?.exactCwdListProven, true);
  assert.equal(probe.checks[0]?.completedUntilNextCursorNull, true);
});

test("worker upstream client when upstream fails, should throw sanitized error", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => new Response("raw http://127.0.0.1:8788 example-token stack", { status: 500 }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /example-token|8788|stack/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns invalid json, should throw sanitized unavailable error", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => new Response("raw http://127.0.0.1:8788 example-token stack", { status: 200 }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /example-token|8788|stack|raw/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns extra public fields, should fail closed without leaking them", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () =>
      Response.json({
        deviceId: "device-a",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: null,
        appServer: { transport: "loopbackWebSocket", readyz: true },
        rawUrl: "http://127.0.0.1:8788",
      }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /rawUrl|8788/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns public errors, should preserve status and safe code", async () => {
  const responses = [
    { expectedCode: "unauthorized", expectedStatus: 401, responseStatus: 401 },
    { expectedCode: "duplicate_request", expectedStatus: 409, responseStatus: 409 },
  ];

  for (const entry of responses) {
    const client = createWorkerUpstreamClient({
      timeoutMs: 1_000,
      fetch: async () =>
        Response.json(
          {
            code: entry.expectedCode,
            message: "safe",
            details: { operation: "worker_request", retryable: false, rawUrl: "http://127.0.0.1:8788" },
          },
          { status: entry.responseStatus },
        ),
    });

    await assert.rejects(client.getHealth(device), (error) => {
      assert.equal((error as { status?: number }).status, entry.expectedStatus);
      assert.equal((error as { code?: string }).code, entry.expectedCode);
      assert.doesNotMatch(JSON.stringify(error), /rawUrl|8788/);
      return true;
    });
  }
});

test("worker upstream client when request times out, should map to request timeout", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1,
    fetch: async (_request, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    assert.equal((error as { status?: number }).status, 408);
    assert.equal((error as { code?: string }).code, "app_server_timeout");
    return true;
  });
});

test("worker upstream client lifecycle methods when called, should use device worker lifecycle routes", async () => {
  const result: OpenConversationResult = {
    conversation: {
      id: "thread-1",
      title: "Thread one",
      deviceId: "upstream-device",
      projectId: "project-1",
      projectName: "Project",
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
      deviceId: "upstream-device",
      conversationId: "thread-1",
      projectId: "project-1",
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
  const requests: Array<{ body: string | null; method: string | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      requests.push({
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method,
        url: String(request),
      });
      return Response.json(result);
    },
  });

  await client.openConversation(device, "thread-1", { clientRequestId: "open-1" });
  await client.archiveConversation(device, "thread-1", { clientRequestId: "archive-1" });
  await client.unarchiveConversation(device, "thread-1", { clientRequestId: "restore-1" });
  await client.renameConversation(device, "thread-1", { title: "Renamed", clientRequestId: "rename-1" });

  assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
    "POST http://127.0.0.1:8788/v1/conversations/thread-1/open",
    "POST http://127.0.0.1:8788/v1/conversations/thread-1/archive",
    "POST http://127.0.0.1:8788/v1/conversations/thread-1/unarchive",
    "PATCH http://127.0.0.1:8788/v1/conversations/thread-1",
  ]);
  assert.equal(requests[3]?.body, JSON.stringify({ title: "Renamed", clientRequestId: "rename-1" }));
});

test("worker upstream client local workbench methods when called, should use stage 12 worker routes and query strings", async () => {
  const requests: Array<{ method: string | undefined; url: string }> = [];
  const responses = [
    createLocalWorkbenchSummary(),
    createProjectDirectoryListing(),
    createProjectFilePreview(),
    createProjectGitSummary(),
    createProjectSearchResult(),
    createMcpServerSummary(),
    createExtensionInventory(),
  ];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      requests.push({ method: init?.method, url: String(request) });
      return Response.json(responses.shift());
    },
  });

  await client.getLocalWorkbenchSummary(device, "project-a");
  await client.listProjectFiles(device, "project-a");
  await client.getProjectFilePreview(device, "project-a", "src/app.ts");
  await client.getProjectGitSummary(device, "project-a");
  await client.searchProjectFiles(device, "project-a", { limit: 25, path: "src", query: "needle" });
  await client.getMcpServerSummary(device, "project-a");
  await client.getExtensionInventory(device, "project-a");

  assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/summary",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/files",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/file-preview?path=src%2Fapp.ts",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/git",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/search?query=needle&path=src&limit=25",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/mcp",
    "GET http://127.0.0.1:8788/v1/projects/project-a/local-workbench/extensions",
  ]);
});

test("worker upstream client when starting review, should use conversation local action route and public body", async () => {
  const input: StartReviewInput = {
    projectId: "project-a",
    expectedConversationId: "thread-a",
    clientRequestId: "review-1",
    confirmationText: "Start review",
  };
  const requests: Array<{ body: string | null; method: string | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      requests.push({
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method,
        url: String(request),
      });
      return Response.json(createAccepted("review-1", "thread-a"));
    },
  });

  const accepted = await client.startReview(device, "thread-a", input);

  assert.deepEqual(requests, [
    {
      method: "POST",
      url: "http://127.0.0.1:8788/v1/conversations/thread-a/local-actions/review-start",
      body: JSON.stringify(input),
    },
  ]);
  assert.deepEqual(accepted, createAccepted("review-1", "thread-a"));
});

test("worker upstream client when review-start upstream cannot find conversation, should map to sanitized conversation not found", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () =>
      Response.json(
        {
          code: "raw_review_failure",
          message: "raw http://127.0.0.1:8788 example-token stack",
          details: { rawUrl: "http://127.0.0.1:8788", token: "example-token" },
        },
        { status: 404 },
      ),
  });

  await assert.rejects(
    client.startReview(device, "thread-a", {
      projectId: "project-a",
      expectedConversationId: "thread-a",
      clientRequestId: "review-1",
      confirmationText: "Start review",
    }),
    (error) => {
      assert.equal((error as { status?: number }).status, 404);
      assert.equal((error as { code?: string }).code, "conversation_not_found");
      assert.doesNotMatch(JSON.stringify(error), /raw_review_failure|example-token|8788|stack|rawUrl/);
      return true;
    },
  );
});

test("worker upstream client when projecting local workbench summary, should keep public summary fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createLocalWorkbenchSummary({ deviceId: "upstream-device" })),
  });

  const summary = await client.getLocalWorkbenchSummary(device, "project-a");

  assert.deepEqual(summary, createLocalWorkbenchSummary({ deviceId: "upstream-device" }));
});

test("worker upstream client when projecting project directory listing, should keep public file entries", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createProjectDirectoryListing()),
  });

  const listing = await client.listProjectFiles(device, "project-a");

  assert.deepEqual(listing, createProjectDirectoryListing());
});

test("worker upstream client when projecting project file preview, should keep public preview fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createProjectFilePreview()),
  });

  const preview = await client.getProjectFilePreview(device, "project-a", "src/app.ts");

  assert.deepEqual(preview, createProjectFilePreview());
});

test("worker upstream client when projecting project git summary, should keep public git summary fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createProjectGitSummary()),
  });

  const summary = await client.getProjectGitSummary(device, "project-a");

  assert.deepEqual(summary, createProjectGitSummary());
});

test("worker upstream client when projecting project search result, should keep public search result fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createProjectSearchResult()),
  });

  const result = await client.searchProjectFiles(device, "project-a", { query: "needle" });

  assert.deepEqual(result, createProjectSearchResult());
});

test("worker upstream client when projecting mcp server summary, should keep public mcp fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createMcpServerSummary({ deviceId: "upstream-device" })),
  });

  const summary = await client.getMcpServerSummary(device, "project-a");

  assert.deepEqual(summary, createMcpServerSummary({ deviceId: "upstream-device" }));
});

test("worker upstream client when projecting extension inventory, should keep public extension inventory fields", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => Response.json(createExtensionInventory({ deviceId: "upstream-device" })),
  });

  const inventory = await client.getExtensionInventory(device, "project-a");

  assert.deepEqual(inventory, createExtensionInventory({ deviceId: "upstream-device" }));
});

function createLocalWorkbenchSummary(overrides: Partial<LocalWorkbenchSummary> = {}): LocalWorkbenchSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    projectName: "Project A",
    fileCount: 3,
    directoryCount: 1,
    gitStatus: "dirty",
    searchResultCount: 2,
    mcpServerCount: 1,
    extensionCount: 4,
    previewAvailable: true,
    ...overrides,
  };
}

function createProjectDirectoryListing(): ProjectDirectoryListing {
  return {
    entries: [
      { path: "src", name: "src", kind: "directory", sizeBytes: null, modifiedAt: "2026-06-21T00:00:00.000Z", childCount: 2, truncated: false },
      { path: "README.md", name: "README.md", kind: "file", sizeBytes: 100, modifiedAt: "2026-06-21T00:00:00.000Z", childCount: null, truncated: false },
    ],
  };
}

function createProjectFilePreview(): ProjectFilePreview {
  return {
    path: "src/app.ts",
    previewKind: "text",
    mimeType: "text/plain",
    byteCount: 128,
    lineCount: 8,
    truncated: false,
    previewText: "export const value = 1;",
    reason: null,
  };
}

function createProjectGitSummary(): ProjectGitSummary {
  return {
    branch: "feature/local-workbench",
    status: "dirty",
    aheadCount: 1,
    behindCount: 0,
    stagedCount: 1,
    unstagedCount: 2,
    untrackedCount: 1,
    reviewState: "in_review",
    changedFiles: [{ path: "src/app.ts", status: "modified", additions: 3, deletions: 1 }],
  };
}

function createProjectSearchResult(): ProjectSearchResult {
  return {
    query: "needle",
    matches: [{ path: "src/app.ts", lineNumber: 3, columnNumber: 15, match: "needle", snippet: "const needle = true;", score: 0.9 }],
  };
}

function createMcpServerSummary(overrides: Partial<McpServerSummary> = {}): McpServerSummary {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    servers: [
      {
        name: "github",
        status: "connected",
        description: "GitHub MCP",
        tools: ["issues.list"],
        resources: ["repo:openai/codex-remote"],
        resourceTemplates: ["repo:{owner}/{name}"],
        authStatus: "ready",
      },
    ],
    ...overrides,
  };
}

function createExtensionInventory(overrides: Partial<ExtensionInventory> = {}): ExtensionInventory {
  return {
    deviceId: "device-a",
    projectId: "project-a",
    skills: [{ name: "skill-a", enabled: true, description: "A skill", status: "installed" }],
    hooks: [{ name: "hook-a", enabled: true, description: "A hook", event: "pre-commit" }],
    plugins: [{ id: "plugin-a", name: "Plugin A", enabled: true, description: "A plugin", skillCount: 1, appCount: 1, mcpServerCount: 1 }],
    marketplaceEntries: [{ name: "entry-a", installStatus: "installed", description: "A marketplace entry" }],
    apps: [{ id: "github", name: "GitHub", enabled: true, description: "GitHub app" }],
    ...overrides,
  };
}

function createAccepted(clientRequestId: string, conversationId: string) {
  return {
    id: `accepted-${clientRequestId}`,
    status: "accepted" as const,
    conversationId,
    turnId: "turn-review",
    acceptedAt: "2026-06-21T00:00:00.000Z",
  };
}
