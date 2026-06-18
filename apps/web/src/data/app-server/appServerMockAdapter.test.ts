import assert from "node:assert/strict";
import { readWebSource } from "../../test-support/sourcePaths.ts";
import test from "node:test";

import listFixture from "./fixtures/demo.thread-list.json" with { type: "json" };
import readFixture from "./fixtures/demo.thread-read.json" with { type: "json" };
import sidebarStateFixture from "./fixtures/demo.sidebar-state.json" with { type: "json" };
import { createAppServerMockData, getThreadTitle } from "./appServerMockAdapter.ts";
import type {
  RawCodexThread,
  RawSidebarProjectStateFixture,
  RawThreadListFixture,
  RawThreadReadFixture,
  RawThreadReadResult,
} from "./rawAppServerSnapshotTypes.ts";

const list = listFixture as unknown as RawThreadListFixture;
const reads = readFixture as unknown as RawThreadReadFixture;
const sidebarState = sidebarStateFixture as unknown as RawSidebarProjectStateFixture;

test("when deriving mock data, should use app-server thread ids as conversation ids", () => {
  const data = createAppServerMockData({ list, reads, sidebarState });
  const listedThreads = list.pages
    .flatMap((page) => page.data ?? page.threads ?? page.items ?? [])
    .filter((thread) => typeof thread.id === "string");

  assert.equal(data.conversations.length, listedThreads.length);
  assert.deepEqual(
    data.conversations.map((conversation) => conversation.id).sort(),
    listedThreads.map((thread) => thread.id as string).sort(),
  );
});

test("when app-server status is active, should derive running or waiting instead of done", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/demo",
    capturedAt: "2026-06-17T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-running",
            cwd: "/workspace/demo",
            name: "Running thread",
            status: { type: "active", activeFlags: [] },
            updatedAt: 1_782_000_000,
          } as unknown as RawCodexThread,
          {
            id: "thread-waiting",
            cwd: "/workspace/demo",
            name: "Waiting thread",
            status: { type: "active", activeFlags: ["waitingOnApproval"] },
            updatedAt: 1_782_000_100,
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.deepEqual(
    data.conversations.map((conversation) => ({ id: conversation.id, status: conversation.status })),
    [
      { id: "thread-running", status: "running" },
      { id: "thread-waiting", status: "waiting" },
    ],
  );
});

test("when thread/read is missing for a listed thread, should expose missingRead instead of an empty loaded timeline", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/demo",
    capturedAt: "2026-06-17T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-without-read",
            cwd: "/workspace/demo",
            name: "Listed only",
            status: { type: "notLoaded" },
            updatedAt: 1_782_000_000,
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.equal(data.assistantThreads[0]?.loadState, "missingRead");
  assert.deepEqual(data.assistantThreads[0]?.timeline.turns, []);
});

test("when deriving mock data, should follow the original Codex App project order without forcing the current project to the front", () => {
  const data = createAppServerMockData({ list, reads, sidebarState });

  assert.ok(data.sidebarProjects.length >= 2);
  assert.deepEqual(
    data.sidebarProjects.map((project) => project.path),
    sidebarState.projectOrder,
  );
  assert.equal(data.sidebarProjects[0]?.pinned, false);
  assert.equal(data.sidebarProjects[1]?.pinned, true);
  assert.ok(data.conversations.length > 0);
  const projectIds = new Set(data.sidebarProjects.map((project) => project.id));
  assert.ok(data.conversations.every((conversation) => conversation.projectId === undefined || projectIds.has(conversation.projectId)));
});

test("when Codex App has a renamed worktree project, should keep it as an independent project", () => {
  const worktreePath = "/workspace/worktrees/skill-flow-feat-cross-platform";
  const baseProjectPath = "/workspace/projects/01_skill-flow";
  const syntheticList: RawThreadListFixture = {
    projectCwd: worktreePath,
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-worktree",
            cwd: worktreePath,
            name: "Worktree discussion",
            updatedAt: 1_797_249_600,
            gitInfo: { branch: "feat-cross-platform" },
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {
      "thread-worktree": {
        thread: {
          id: "thread-worktree",
          cwd: worktreePath,
          name: "Worktree discussion",
          updatedAt: 1_797_249_600,
          gitInfo: { branch: "feat-cross-platform" },
        } as unknown as RawCodexThread,
      },
    },
  };
  const syntheticSidebarState: RawSidebarProjectStateFixture = {
    projectOrder: [baseProjectPath, worktreePath],
    savedWorkspaceRoots: [baseProjectPath, worktreePath],
    activeWorkspaceRoots: [worktreePath],
    pinnedProjectIds: [],
    collapsedGroups: {},
    labels: {
      [worktreePath]: "跨平台-跨平台",
    },
    projectlessThreadIds: [],
    threadWorkspaceRootHints: {},
    threadProjectlessOutputDirectories: {},
  };
  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads, sidebarState: syntheticSidebarState });

  const project = data.sidebarProjects.find((item) => item.path === worktreePath);
  const conversation = data.conversations.find((item) => item.id === "thread-worktree");

  assert.equal(project?.name, "跨平台-跨平台");
  assert.equal(conversation?.projectId, project?.id);
  assert.equal(conversation?.projectName, "跨平台-跨平台");
});

test("when deriving search recents, should derive them from conversations", () => {
  const data = createAppServerMockData({ list, reads, sidebarState });

  assert.equal(data.searchRecents.length, data.conversations.length);
  assert.deepEqual(
    data.searchRecents.map((item) => item.title),
    data.conversations.map((conversation) => conversation.title),
  );
});

test("when deriving search recents, should include conversation ids without fixed active state", () => {
  const data = createAppServerMockData({ list, reads, sidebarState });

  assert.equal(data.searchRecents.length, data.conversations.length);
  assert.deepEqual(
    data.searchRecents.map((item) => item.conversationId),
    data.conversations.map((conversation) => conversation.id),
  );
  assert.equal(data.searchRecents.some((item) => item.active === true), false);
});

test("when deriving projects from raw threads, should keep every unarchived cwd and filter archived entries", () => {
  const archivedListedThread = {
    id: "thread-archived",
    cwd: "/workspace/archived-project",
    name: "Archived thread",
    updatedAt: 1_797_249_580,
    archived: true,
  } as unknown as RawCodexThread;
  const currentReadThread = {
    id: "thread-current",
    cwd: "/workspace/current-project",
    name: "Current project thread",
    updatedAt: 1_797_249_600,
    gitInfo: { branch: "main" },
  } as unknown as RawCodexThread;
  const otherReadThread = {
    id: "thread-other",
    cwd: "/workspace/other-project",
    name: "Other project thread",
    updatedAt: 1_797_249_590,
    gitInfo: { branch: "feature/other" },
  } as unknown as RawCodexThread;
  const archivedReadThread = {
    id: "thread-archived",
    cwd: "/workspace/archived-project",
    name: "Archived thread",
    updatedAt: 1_797_249_580,
    archived: true,
    gitInfo: { branch: "archive/old" },
  } as unknown as RawCodexThread;
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/current-project",
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-current",
            cwd: "/workspace/current-project",
            name: "Current project thread",
            updatedAt: 1_797_249_600,
          },
          {
            id: "thread-other",
            cwd: "/workspace/other-project",
            name: "Other project thread",
            updatedAt: 1_797_249_590,
          },
          archivedListedThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {
      "thread-current": {
        thread: currentReadThread,
      } satisfies RawThreadReadResult,
      "thread-other": {
        thread: otherReadThread,
      } satisfies RawThreadReadResult,
      "thread-archived": {
        thread: archivedReadThread,
      } satisfies RawThreadReadResult,
    },
  };
  const syntheticSidebarState: RawSidebarProjectStateFixture = {
    projectOrder: [
      "/workspace/current-project",
      "/workspace/empty-project",
      "/workspace/other-project",
    ],
    savedWorkspaceRoots: [
      "/workspace/current-project",
      "/workspace/empty-project",
      "/workspace/other-project",
    ],
    activeWorkspaceRoots: ["/workspace/current-project"],
    pinnedProjectIds: ["/workspace/empty-project"],
    collapsedGroups: {
      "/workspace/empty-project": true,
      "/workspace/other-project": true,
    },
    labels: {
      "/workspace/empty-project": "Empty project",
    },
    projectlessThreadIds: [],
    threadWorkspaceRootHints: {},
    threadProjectlessOutputDirectories: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads, sidebarState: syntheticSidebarState });

  assert.deepEqual(
    data.sidebarProjects.map((project) => ({ name: project.name, path: project.path, pinned: project.pinned, branch: project.branch })),
    [
      {
        name: "current-project",
        path: "/workspace/current-project",
        pinned: false,
        branch: "main",
      },
      {
        name: "Empty project",
        path: "/workspace/empty-project",
        pinned: true,
        branch: "main",
      },
      {
        name: "other-project",
        path: "/workspace/other-project",
        pinned: false,
        branch: "feature/other",
      },
    ],
  );
  assert.deepEqual(
    data.conversations.map((conversation) => ({ id: conversation.id, projectName: conversation.projectName })),
    [
      { id: "thread-current", projectName: "current-project" },
      { id: "thread-other", projectName: "other-project" },
    ],
  );
  assert.deepEqual(
    data.tasks.map((task) => task.title),
    ["current-project app-server snapshot", "other-project app-server snapshot"],
  );
});

test("when Codex App marks a thread as projectless, should keep it in independent conversations", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/project-a",
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-projectless",
            cwd: "/workspace/projectless",
            name: "Temporary discussion",
            updatedAt: 1_797_249_600,
          },
          {
            id: "thread-project",
            cwd: "/workspace/project-a",
            name: "Project discussion",
            updatedAt: 1_797_249_590,
          },
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };
  const syntheticSidebarState: RawSidebarProjectStateFixture = {
    projectOrder: ["/workspace/project-a"],
    savedWorkspaceRoots: ["/workspace/project-a"],
    activeWorkspaceRoots: ["/workspace/project-a"],
    pinnedProjectIds: [],
    collapsedGroups: {},
    labels: {},
    projectlessThreadIds: ["thread-projectless"],
    threadWorkspaceRootHints: {
      "thread-projectless": "/workspace/projectless",
    },
    threadProjectlessOutputDirectories: {
      "thread-projectless": "/workspace/projectless/2026-06-15/example/outputs",
    },
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads, sidebarState: syntheticSidebarState });

  assert.deepEqual(
    data.sidebarProjects.map((project) => project.path),
    ["/workspace/project-a"],
  );
  assert.deepEqual(
    data.conversations.map((conversation) => ({
      id: conversation.id,
      projectId: conversation.projectId,
      projectName: conversation.projectName,
    })),
    [
      {
        id: "thread-projectless",
        projectId: undefined,
        projectName: "对话",
      },
      {
        id: "thread-project",
        projectId: data.sidebarProjects[0]?.id,
        projectName: "project-a",
      },
    ],
  );
});

test("when workspace root hints point at a base project, should not override Codex App project roots", () => {
  const worktreePath = "/workspace/worktrees/skill-flow-feat-cross-platform";
  const baseProjectPath = "/workspace/projects/01_skill-flow";
  const syntheticList: RawThreadListFixture = {
    projectCwd: worktreePath,
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-worktree",
            cwd: worktreePath,
            name: "Worktree discussion",
            updatedAt: 1_797_249_600,
            gitInfo: { branch: "feat-cross-platform" },
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };
  const syntheticSidebarState: RawSidebarProjectStateFixture = {
    projectOrder: [baseProjectPath, worktreePath],
    savedWorkspaceRoots: [baseProjectPath, worktreePath],
    activeWorkspaceRoots: [worktreePath],
    pinnedProjectIds: [],
    collapsedGroups: {},
    labels: {
      [worktreePath]: "跨平台-跨平台",
    },
    projectlessThreadIds: [],
    threadWorkspaceRootHints: {
      "thread-worktree": baseProjectPath,
    },
    threadProjectlessOutputDirectories: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads, sidebarState: syntheticSidebarState });

  assert.deepEqual(
    data.sidebarProjects.map((project) => ({ path: project.path, name: project.name })),
    [
      { path: baseProjectPath, name: "01_skill-flow" },
      { path: worktreePath, name: "跨平台-跨平台" },
    ],
  );
  assert.equal(data.conversations[0]?.projectName, "跨平台-跨平台");
});

test("when deriving assistant threads, should preserve fork metadata from selected raw threads", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/codex-remote",
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-with-read",
            forkedFromId: null,
            parentThreadId: null,
            name: "Listed thread",
            updatedAt: 1_797_249_600,
          },
          {
            id: "thread-from-list",
            forkedFromId: "listed-fork",
            parentThreadId: "listed-parent",
            name: "Fallback thread",
            updatedAt: 1_797_249_590,
          },
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {
      "thread-with-read": {
        thread: {
          id: "thread-with-read",
          forkedFromId: "read-fork",
          parentThreadId: "read-parent",
          name: "Readable thread",
          updatedAt: 1_797_249_600,
        },
      },
    },
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.deepEqual(
    data.assistantThreads.map((thread) => ({
      id: thread.id,
      forkedFromId: thread.forkedFromId,
      parentThreadId: thread.parentThreadId,
    })),
    [
      {
        id: "thread-with-read",
        forkedFromId: "read-fork",
        parentThreadId: "read-parent",
      },
      {
        id: "thread-from-list",
        forkedFromId: "listed-fork",
        parentThreadId: "listed-parent",
      },
    ],
  );
});

test("when deriving assistant threads, should expose assistant timeline nodes", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/codex-remote",
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [{ id: "thread-with-turns", name: "Thread with turns", updatedAt: 1_797_249_600 }],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {
      "thread-with-turns": {
        thread: {
          id: "thread-with-turns",
          name: "Thread with turns",
          updatedAt: 1_797_249_600,
          turns: [
            {
              id: "turn-a",
              status: "completed",
              startedAt: 1_797_249_500,
              completedAt: 1_797_249_545,
              durationMs: 45_250,
              items: [{ id: "item-a", type: "agentMessage", text: "Turn A" }],
            },
          ],
        },
      },
    },
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.equal(data.assistantThreads[0]?.timeline.threadId, "thread-with-turns");
  assert.deepEqual(data.assistantThreads[0]?.timeline.turns, [
    {
      id: "turn-a",
      status: "completed",
      startedAt: 1_797_249_500,
      completedAt: 1_797_249_545,
      durationMs: 45_250,
      nodes: [
        {
          type: "text",
          id: "item-a",
          turnId: "turn-a",
          sourceItemIds: ["item-a"],
          role: "assistant",
          text: "Turn A",
          links: [],
        },
      ],
    },
  ]);
});

test("when resolving titles, should prefer name then preview then fallback", () => {
  assert.equal(getThreadTitle({ id: "a", name: "Named", preview: "Preview" }), "Named");
  assert.equal(getThreadTitle({ id: "b", name: "", preview: "Preview\nsecond line" }), "Preview");
  assert.equal(getThreadTitle({ id: "c", name: null, preview: "" }), "Untitled thread");
});

test("when resolving titles from markdown previews, should use rendered text and skip leading skill links", () => {
  assert.equal(
    getThreadTitle({
      id: "markdown-link",
      name: null,
      preview: "[$browser-action](/workspace/skills/browser-action/SKILL.md) 继续按 [任务目标.md](任务目标.md) 爬取帖子内容。",
    }),
    "继续按 任务目标.md 爬取帖子内容。",
  );
  assert.equal(
    getThreadTitle({
      id: "named-markdown",
      name: "继续按 [任务目标.md](任务目标.md) 爬取帖子内容。",
      preview: "",
    }),
    "继续按 任务目标.md 爬取帖子内容。",
  );
});

test("when rendering the assistant thread, should keep assistant-ui runtime and composer primitives", () => {
  const source = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.match(source, /AssistantRuntimeProvider/);
  assert.match(source, /useExternalStoreRuntime/);
  assert.match(source, /ComposerPrimitive/);
  assert.match(source, /ThreadPrimitive\.ViewportProvider/);
  assert.doesNotMatch(source, /<ThreadPrimitive\.Viewport[\\s>]/);
  assert.doesNotMatch(source, /ComposerPrimitive\.Input/);
  assert.doesNotMatch(source, /<form\b/);
  assert.doesNotMatch(source, /<textarea\b/);
});

test("when rendering the composer access control, should expose the confirmed approval mode menu options", () => {
  const source = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.match(source, /const accessModeOptions = \[/);
  assert.match(source, /label: "请求批准"/);
  assert.match(source, /label: "请求批准", icon: "hand"/);
  assert.match(source, /label: "替我审批"/);
  assert.match(source, /label: "替我审批", icon: "shield-check"/);
  assert.match(source, /label: "完全访问"/);
  assert.match(source, /label: "完全访问", icon: "shield-alert"/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /data-mode=\{selectedAccessMode\}/);
  assert.match(source, /role="menuitemradio"/);
});

test("non-assistant runtime messages should not receive status", () => {
  const source = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.match(source, /status\?: ThreadMessageLike\["status"\];/);
  assert.match(source, /role === "assistant"\s*\?\s*\{\s*status:/);
  assert.doesNotMatch(source, /status: message\.status,/);
});
