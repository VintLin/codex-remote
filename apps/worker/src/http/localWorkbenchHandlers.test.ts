import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type {
  FuzzyFileSearchResponse,
  GitDiffToRemoteResponse,
} from "@codex-remote/codex-protocol";
import type { v2 } from "@codex-remote/codex-protocol";

import { createWorkerApprovalRegistry } from "./approvalRegistry.ts";
import type { WorkerControlHandlerContext } from "./controlHandlers.ts";
import {
  getExtensionInventory,
  getLocalWorkbenchSummary,
  getMcpServerSummary,
  getProjectFilePreview,
  getProjectGitSummary,
  listProjectFiles,
  searchProjectFiles,
  type WorkerLocalWorkbenchAppServerClient,
  type WorkerLocalWorkbenchHandlerContext,
} from "./localWorkbenchHandlers.ts";
import { createWorkerHttpApp } from "./workerHttpApp.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

const authHeaders = { authorization: "Bearer example-token" };

test("local workbench handlers when listing files and previewing text, should return project-relative metadata inside the allowed root", async () => {
  const paths = await createTempProject();
  await writeFile(join(paths.projectRoot, "README.md"), "# Local Workbench\nLine 2\n", "utf8");
  await mkdir(join(paths.projectRoot, "src"), { recursive: true });
  await writeFile(join(paths.projectRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
  const context = createContext(paths.allowedRoot, new FakeClient());

  const listing = await listProjectFiles(context, "local-project", "");
  const preview = await getProjectFilePreview(context, "local-project", "README.md");

  assert.deepEqual(
    listing.entries.map((entry) => ({ path: entry.path, kind: entry.kind })),
    [
      { path: "README.md", kind: "file" },
      { path: "src", kind: "directory" },
    ],
  );
  assert.deepEqual(preview, {
    path: "README.md",
    previewKind: "text",
    mimeType: "text/markdown",
    byteCount: 25,
    lineCount: 3,
    truncated: false,
    previewText: "# Local Workbench\nLine 2\n",
    reason: null,
  });
});

test("local workbench handlers when previewing binary or oversized files, should return unavailable metadata without file bytes", async () => {
  const paths = await createTempProject();
  await writeFile(join(paths.projectRoot, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
  await writeFile(join(paths.projectRoot, "oversized.txt"), "a".repeat(70_000), "utf8");
  const context = createContext(paths.allowedRoot, new FakeClient());

  const binaryPreview = await getProjectFilePreview(context, "local-project", "binary.bin");
  const oversizedPreview = await getProjectFilePreview(context, "local-project", "oversized.txt");

  assert.deepEqual(binaryPreview, {
    path: "binary.bin",
    previewKind: "unavailable",
    mimeType: "application/octet-stream",
    byteCount: 3,
    lineCount: null,
    truncated: false,
    previewText: null,
    reason: "binary_file",
  });
  assert.deepEqual(oversizedPreview, {
    path: "oversized.txt",
    previewKind: "unavailable",
    mimeType: "text/plain",
    byteCount: 70_000,
    lineCount: null,
    truncated: true,
    previewText: null,
    reason: "file_too_large",
  });
});

test("local workbench handlers when reading git search mcp and extensions, should project fake app-server responses through safe public shapes", async () => {
  const paths = await createTempProject();
  const context = createContext(
    paths.allowedRoot,
    new FakeClient({
      appsResponse: {
        data: [
          {
            id: "app-1",
            name: "Safe App",
            description: "Safe app description",
            logoUrl: null,
            logoUrlDark: null,
            distributionChannel: null,
            branding: null,
            appMetadata: null,
            labels: null,
            installUrl: "https://example.com/install",
            isAccessible: true,
            isEnabled: true,
            pluginDisplayNames: ["Safe Plugin"],
          },
        ],
        nextCursor: null,
      },
      fuzzyResponse: {
        files: [
          {
            root: paths.projectRoot,
            path: "src/index.ts",
            match_type: "file",
            file_name: "index.ts",
            score: 0.9,
            indices: [0, 1],
          },
        ],
      },
      gitResponse: {
        sha: "abc123" as never,
        diff: "## main...origin/main\n M src/index.ts | 3 ++-\n",
      },
      hooksResponse: {
        data: [
          {
            cwd: paths.projectRoot,
            hooks: [
              {
                key: "post-tool",
                eventName: "postToolUse",
                handlerType: "command",
                matcher: null,
                command: "echo PRIVATE_COMMAND",
                timeoutSec: 10n,
                statusMessage: null,
                sourcePath: join(paths.projectRoot, ".hooks/post-tool.sh"),
                source: "user",
                pluginId: "plugin-1",
                displayOrder: 0n,
                enabled: true,
                isManaged: false,
                currentHash: "hash",
                trustStatus: "trusted",
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
      mcpResponse: {
        data: [
          {
            name: "filesystem",
            serverInfo: {
              name: "filesystem",
              title: "Filesystem",
              version: "1.0.0",
              description: "Safe MCP description",
              icons: null,
              websiteUrl: null,
            },
            tools: {
              read_file: {
                name: "read_file",
                description: "Read a file",
                inputSchema: {},
              },
            },
            resources: [{ name: "repo", uri: "repo://local", description: "Repository", mimeType: "text/plain" }],
            resourceTemplates: [{ name: "repo-template", uriTemplate: "repo://{path}", description: "Template" }],
            authStatus: "bearerToken",
          },
        ],
        nextCursor: null,
      },
      pluginDetails: {
        "local-market::Safe Plugin": {
          plugin: {
            marketplaceName: "local-market",
            marketplacePath: join(paths.projectRoot, "marketplace.json"),
            summary: {
              id: "plugin-1",
              remotePluginId: null,
              localVersion: "1.0.0",
              name: "Safe Plugin",
              shareContext: null,
              source: "local",
              installed: true,
              enabled: true,
              installPolicy: "allowed",
              authPolicy: "notRequired",
              availability: "available",
              interface: null,
              keywords: [],
            },
            description: "Plugin description",
            skills: [{ name: "safe-skill", description: "Skill description", path: join(paths.projectRoot, "SKILL.md"), scope: "project", enabled: true }],
            hooks: [{ key: "post-tool", eventName: "postToolUse" }],
            apps: [{ id: "app-1", name: "Safe App", description: "App description", installUrl: "https://example.com", needsAuth: false }],
            appTemplates: [],
            mcpServers: ["filesystem"],
          },
        },
      },
      pluginListResponse: {
        marketplaces: [
          {
            name: "local-market",
            path: join(paths.projectRoot, "marketplace.json"),
            interface: null,
            plugins: [
              {
                id: "plugin-1",
                remotePluginId: null,
                localVersion: "1.0.0",
                name: "Safe Plugin",
                shareContext: null,
                source: "local",
                installed: true,
                enabled: true,
                installPolicy: "allowed",
                authPolicy: "notRequired",
                availability: "available",
                interface: null,
                keywords: [],
              },
            ],
          },
        ],
        marketplaceLoadErrors: [],
        featuredPluginIds: [],
      },
      skillsResponse: {
        data: [
          {
            cwd: paths.projectRoot,
            skills: [
              {
                name: "safe-skill",
                description: "Skill description",
                shortDescription: "Short description",
                interface: undefined,
                dependencies: undefined,
                path: join(paths.projectRoot, "SKILL.md"),
                scope: "project",
                enabled: true,
              },
            ],
            errors: [],
          },
        ],
      },
    }),
  );

  const summary = await getLocalWorkbenchSummary(context, "local-project");
  const git = await getProjectGitSummary(context, "local-project");
  const search = await searchProjectFiles(context, "local-project", "index", "", 20);
  const mcp = await getMcpServerSummary(context, "local-project");
  const extensions = await getExtensionInventory(context, "local-project");

  assert.equal(summary.deviceId, "device-local");
  assert.equal(summary.projectId, "local-project");
  assert.equal(summary.gitStatus, "dirty");
  assert.equal(git.changedFiles[0]?.path, "src/index.ts");
  assert.deepEqual(search, {
    query: "index",
    matches: [{ path: "src/index.ts", lineNumber: 1, columnNumber: null, match: "index.ts", snippet: null, score: 0.9 }],
  });
  assert.equal(mcp.servers[0]?.name, "filesystem");
  assert.equal(extensions.plugins[0]?.skillCount, 1);
  assert.doesNotMatch(JSON.stringify({ summary, git, search, mcp, extensions }), /PRIVATE_COMMAND|marketplacePath|sourcePath/);
});

test("local workbench handlers when search results include sibling-prefix paths, should keep only in-root matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workbench-handlers-boundary-"));
  const allowedRoot = join(root, "project");
  const siblingRoot = join(root, "project-evil");
  await mkdir(join(allowedRoot, "src"), { recursive: true });
  await mkdir(siblingRoot, { recursive: true });
  await writeFile(join(allowedRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
  await writeFile(join(siblingRoot, "secret.ts"), "export const secret = 2;\n", "utf8");

  const search = await searchProjectFiles(
    createContext(allowedRoot, new FakeClient({
      fuzzyResponse: {
        files: [
          {
            root: allowedRoot,
            path: "src/index.ts",
            match_type: "file",
            file_name: "index.ts",
            score: 0.9,
            indices: [0, 1],
          },
          {
            root: siblingRoot,
            path: join(siblingRoot, "secret.ts"),
            match_type: "file",
            file_name: "secret.ts",
            score: 0.8,
            indices: [0, 1],
          },
        ],
      },
    })),
    "local-project",
    "index",
    "",
    20,
  );

  assert.deepEqual(search, {
    query: "index",
    matches: [{ path: "src/index.ts", lineNumber: 1, columnNumber: null, match: "index.ts", snippet: null, score: 0.9 }],
  });
  assert.doesNotMatch(JSON.stringify(search), /project-evil|secret\.ts/);
});

test("local workbench handlers when routes are mounted, should expose get-only local workbench endpoints", async () => {
  const paths = await createTempProject();
  await writeFile(join(paths.projectRoot, "README.md"), "# Local Workbench\n", "utf8");
  const app = createWorkerHttpApp(createControlContext(paths.allowedRoot, new FakeClient()));

  const filesResponse = await app.request("/v1/projects/local-project/local-workbench/files", { headers: authHeaders });
  const previewResponse = await app.request("/v1/projects/local-project/local-workbench/file-preview?path=README.md", {
    headers: authHeaders,
  });
  const gitResponse = await app.request("/v1/projects/local-project/local-workbench/git", { headers: authHeaders });
  const searchResponse = await app.request("/v1/projects/local-project/local-workbench/search?query=README", { headers: authHeaders });
  const mcpResponse = await app.request("/v1/projects/local-project/local-workbench/mcp", { headers: authHeaders });
  const extensionsResponse = await app.request("/v1/projects/local-project/local-workbench/extensions", { headers: authHeaders });
  const summaryResponse = await app.request("/v1/projects/local-project/local-workbench/summary", { headers: authHeaders });
  const rejectedPost = await app.request("/v1/projects/local-project/local-workbench/git", {
    method: "POST",
    headers: authHeaders,
  });

  assert.equal(filesResponse.status, 200);
  assert.equal(previewResponse.status, 200);
  assert.equal(gitResponse.status, 200);
  assert.equal(searchResponse.status, 200);
  assert.equal(mcpResponse.status, 200);
  assert.equal(extensionsResponse.status, 200);
  assert.equal(summaryResponse.status, 200);
  assert.equal(rejectedPost.status, 404);
});

class FakeClient implements WorkerLocalWorkbenchAppServerClient {
  readonly appsResponse: v2.AppsListResponse;
  readonly fuzzyResponse: FuzzyFileSearchResponse;
  readonly gitResponse: GitDiffToRemoteResponse;
  readonly hooksResponse: v2.HooksListResponse;
  readonly mcpResponse: v2.ListMcpServerStatusResponse;
  readonly pluginDetails: Record<string, v2.PluginReadResponse>;
  readonly pluginListResponse: v2.PluginListResponse;
  readonly skillsResponse: v2.SkillsListResponse;

  constructor(options: Partial<{
    appsResponse: v2.AppsListResponse;
    fuzzyResponse: FuzzyFileSearchResponse;
    gitResponse: GitDiffToRemoteResponse;
    hooksResponse: v2.HooksListResponse;
    mcpResponse: v2.ListMcpServerStatusResponse;
    pluginDetails: Record<string, v2.PluginReadResponse>;
    pluginListResponse: v2.PluginListResponse;
    skillsResponse: v2.SkillsListResponse;
  }> = {}) {
    this.appsResponse = options.appsResponse ?? { data: [], nextCursor: null };
    this.fuzzyResponse = options.fuzzyResponse ?? { files: [] };
    this.gitResponse = options.gitResponse ?? { sha: "sha" as never, diff: "## main...origin/main\n" };
    this.hooksResponse = options.hooksResponse ?? { data: [], errors: [] as never };
    this.mcpResponse = options.mcpResponse ?? { data: [], nextCursor: null };
    this.pluginDetails = options.pluginDetails ?? {};
    this.pluginListResponse = options.pluginListResponse ?? { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] };
    this.skillsResponse = options.skillsResponse ?? { data: [] };
  }

  async readyz(): Promise<void> {}
  async initialize(): Promise<void> {}
  async initialized(): Promise<void> {}
  async listThreads(): Promise<v2.ThreadListResponse> {
    return { data: [], nextCursor: null, backwardsCursor: null };
  }
  async readThread(): Promise<v2.ThreadReadResponse> {
    throw new Error("not_needed");
  }
  async listLoadedThreads(): Promise<v2.ThreadLoadedListResponse> {
    return { data: [], nextCursor: null };
  }
  async gitDiffToRemote(): Promise<GitDiffToRemoteResponse> {
    return this.gitResponse;
  }
  async fuzzyFileSearch(): Promise<FuzzyFileSearchResponse> {
    return this.fuzzyResponse;
  }
  async listMcpServerStatus(): Promise<v2.ListMcpServerStatusResponse> {
    return this.mcpResponse;
  }
  async listSkills(): Promise<v2.SkillsListResponse> {
    return this.skillsResponse;
  }
  async listHooks(): Promise<v2.HooksListResponse> {
    return this.hooksResponse;
  }
  async listPlugins(): Promise<v2.PluginListResponse> {
    return this.pluginListResponse;
  }
  async readPlugin(params: v2.PluginReadParams): Promise<v2.PluginReadResponse> {
    const key = `${params.remoteMarketplaceName ?? "local-market"}::${params.pluginName}`;
    const response = this.pluginDetails[key];
    assert.ok(response);
    return response;
  }
  async listApps(): Promise<v2.AppsListResponse> {
    return this.appsResponse;
  }
  close(): void {}
}

async function createTempProject(): Promise<{ allowedRoot: string; projectRoot: string }> {
  const projectRoot = await mkdtemp(join(tmpdir(), "local-workbench-handlers-"));
  return { allowedRoot: projectRoot, projectRoot };
}

function createContext(
  allowedProjectRoot: string,
  client: WorkerLocalWorkbenchAppServerClient,
): WorkerLocalWorkbenchHandlerContext {
  const ticks = ["2026-06-21T10:00:00.000Z", "2026-06-21T10:00:01.000Z"];

  return {
    config: createConfig(allowedProjectRoot),
    now: () => ticks.shift() ?? "2026-06-21T10:00:01.000Z",
    openClient: async () => client,
  };
}

function createControlContext(
  allowedProjectRoot: string,
  client: WorkerLocalWorkbenchAppServerClient,
): WorkerControlHandlerContext {
  const ticks = ["2026-06-21T10:00:00.000Z", "2026-06-21T10:00:01.000Z"];

  return {
    config: createConfig(allowedProjectRoot),
    now: () => ticks.shift() ?? "2026-06-21T10:00:01.000Z",
    openClient: async () => client,
    approvalRegistry: createWorkerApprovalRegistry(),
    writeState: createWorkerWriteHandlerState(),
  };
}

function createConfig(allowedProjectRoot: string): WorkerHttpConfig {
  return {
    allowedOrigins: ["http://127.0.0.1:5173"],
    allowedProjectRoot,
    appServerTransport: "loopbackWebSocket",
    appServerUrl: "ws://127.0.0.1:4321",
    bindHost: "127.0.0.1",
    calibrationApprovalMode: null,
    connectTimeoutMs: 5_000,
    deviceId: "device-local",
    port: 8787,
    requestTimeoutMs: 5_000,
    startAppServer: false,
    workerToken: "example-token",
  };
}
