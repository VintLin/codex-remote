import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import {
  projectExtensionInventory,
  projectGitDiffToSummary,
  projectMcpServerSummary,
  resolveProjectPath,
} from "./localWorkbenchProjections.ts";

test("local workbench projections when resolving project paths, should normalize project-relative paths and reject escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workbench-projection-paths-"));
  const allowedRoot = join(root, "allowed");
  const nestedDir = join(allowedRoot, "src");
  const nestedFile = join(nestedDir, "index.ts");
  const outsideRoot = join(root, "outside");
  await mkdir(nestedDir, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(nestedFile, "export const value = 1;\n", "utf8");
  await symlink(outsideRoot, join(allowedRoot, "escape"));

  assert.deepEqual(await resolveProjectPath(allowedRoot, "."), {
    absolutePath: await realpath(allowedRoot),
    relativePath: "",
  });
  assert.deepEqual(await resolveProjectPath(allowedRoot, "src/./index.ts"), {
    absolutePath: await realpath(nestedFile),
    relativePath: "src/index.ts",
  });

  for (const input of ["/tmp/absolute.txt", "../outside.txt", "escape"]) {
    await assert.rejects(
      resolveProjectPath(allowedRoot, input),
      (error) => error instanceof Error && "code" in error && error.code === "project_forbidden",
    );
  }
});

test("local workbench projections when projecting git diff, should keep only file summary metadata", async () => {
  const summary = projectGitDiffToSummary(
    {
      sha: "abc123" as never,
      diff: [
        "## feature/local-workbench...origin/main [ahead 2, behind 1]",
        " M src/changed.ts | 4 ++--",
        " A src/new.ts | 2 ++",
        " D src/old.ts | 3 ---",
        "?? scratch.md",
        "diff --git a/src/changed.ts b/src/changed.ts",
        "@@ -1,2 +1,2 @@",
        "+sk-test-secret-token",
        "+PROMPT: reply with one short sentence",
        "+/Users/vint/private/path",
      ].join("\n"),
    },
    "/Users/Vint/Repos/01_Project_Personal/050_codex_remote",
  );

  assert.deepEqual(summary, {
    branch: "feature/local-workbench",
    status: "dirty",
    aheadCount: 2,
    behindCount: 1,
    stagedCount: 0,
    unstagedCount: 3,
    untrackedCount: 1,
    reviewState: "unknown",
    changedFiles: [
      { path: "src/changed.ts", status: "modified", additions: 2, deletions: 2 },
      { path: "src/new.ts", status: "added", additions: 2, deletions: 0 },
      { path: "src/old.ts", status: "deleted", additions: 0, deletions: 3 },
      { path: "scratch.md", status: "untracked", additions: null, deletions: null },
    ],
  });
  assert.doesNotMatch(JSON.stringify(summary), /diff --git|@@|sk-test-secret-token|PROMPT|private\/path/);
});

test("local workbench projections when projecting extension inventory, should expose only whitelist metadata", async () => {
  const inventory = projectExtensionInventory(
    {
      deviceId: "device-local",
      projectId: "local-project",
      apps: {
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
      hooks: {
        data: [
          {
            cwd: "/Users/vint/private/project",
            hooks: [
              {
                key: "post-tool",
                eventName: "postToolUse",
                handlerType: "command",
                matcher: null,
                command: "echo PRIVATE_COMMAND",
                timeoutSec: 10n,
                statusMessage: "PRIVATE_COMMAND",
                sourcePath: "/Users/vint/private/hooks/post-tool.sh",
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
      pluginDetails: [
        {
          plugin: {
            marketplaceName: "local-market",
            marketplacePath: "/Users/vint/private/marketplace.json",
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
              keywords: ["private"],
            },
            description: "Plugin description",
            skills: [{ name: "safe-skill", description: "Skill description", path: "/Users/vint/private/skill.md", scope: "project", enabled: true }],
            hooks: [{ key: "post-tool", eventName: "postToolUse" }],
            apps: [{ id: "app-1", name: "Safe App", description: "App description", installUrl: "https://example.com", needsAuth: false }],
            appTemplates: [],
            mcpServers: ["filesystem"],
          },
        },
      ],
      pluginList: {
        marketplaces: [
          {
            name: "local-market",
            path: "/Users/vint/private/marketplace.json",
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
                keywords: ["private"],
              },
            ],
          },
        ],
        marketplaceLoadErrors: [],
        featuredPluginIds: [],
      },
      skills: {
        data: [
          {
            cwd: "/Users/vint/private/project",
            skills: [
              {
                name: "safe-skill",
                description: "Skill description",
                shortDescription: "Short description",
                interface: undefined,
                dependencies: undefined,
                path: "/Users/vint/private/skill.md",
                scope: "project",
                enabled: true,
              },
            ],
            errors: [],
          },
        ],
      },
    },
  );

  assert.deepEqual(inventory, {
    deviceId: "device-local",
    projectId: "local-project",
    skills: [{ name: "safe-skill", enabled: true, description: "Skill description", status: "installed" }],
    hooks: [{ name: "post-tool", enabled: true, description: null, event: "postToolUse" }],
    plugins: [
      {
        id: "plugin-1",
        name: "Safe Plugin",
        enabled: true,
        description: "Plugin description",
        skillCount: 1,
        appCount: 1,
        mcpServerCount: 1,
      },
    ],
    marketplaceEntries: [{ name: "local-market", installStatus: "installed", description: null }],
    apps: [{ id: "app-1", name: "Safe App", enabled: true, description: "Safe app description" }],
  });
  assert.doesNotMatch(JSON.stringify(inventory), /sourcePath|marketplacePath|PRIVATE_COMMAND|\/Users\/vint\/private|contents/);
});

test("local workbench projections when projecting mcp summary, should keep only safe names and status", () => {
  const summary = projectMcpServerSummary(
    {
      deviceId: "device-local",
      projectId: "local-project",
      response: {
        data: [
          {
            name: "filesystem",
            serverInfo: {
              name: "filesystem",
              title: "Filesystem",
              version: "1.0.0",
              description: "/Users/vint/private/path should be removed",
              icons: null,
              websiteUrl: "https://example.com",
            },
            tools: {
              read_file: {
                name: "read_file",
                description: "Read a file",
                inputSchema: {},
              },
            },
            resources: [
              { name: "repo", uri: "repo://local", description: "Repository", mimeType: "text/plain" },
            ],
            resourceTemplates: [
              { name: "repo-template", uriTemplate: "repo://{path}", description: "Template" },
            ],
            authStatus: "bearerToken",
          },
        ],
        nextCursor: null,
      },
    },
  );

  assert.deepEqual(summary, {
    deviceId: "device-local",
    projectId: "local-project",
    servers: [
      {
        name: "filesystem",
        status: "connected",
        description: null,
        tools: ["read_file"],
        resources: ["repo"],
        resourceTemplates: ["repo-template"],
        authStatus: "ready",
      },
    ],
  });
});
