import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import listFixture from "./fixtures/app-server/050_codex_remote.thread-list.json" with { type: "json" };
import readFixture from "./fixtures/app-server/050_codex_remote.thread-read.json" with { type: "json" };
import { createAppServerMockData, getThreadTitle } from "./appServerMockAdapter.ts";
import type { RawThreadListFixture, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";

const list = listFixture as unknown as RawThreadListFixture;
const reads = readFixture as unknown as RawThreadReadFixture;

test("when deriving mock data, should use app-server thread ids as conversation ids", () => {
  const data = createAppServerMockData({ list, reads });
  const listedThreads = list.pages
    .flatMap((page) => page.data ?? page.threads ?? page.items ?? [])
    .filter((thread) => typeof thread.id === "string");

  assert.equal(data.conversations.length, listedThreads.length);
  assert.deepEqual(
    data.conversations.map((conversation) => conversation.id).sort(),
    listedThreads.map((thread) => thread.id as string).sort(),
  );
});

test("when deriving mock data, should attach all conversations to one 050_codex_remote project", () => {
  const data = createAppServerMockData({ list, reads });
  const expectedProjectName = list.projectCwd.split("/").filter(Boolean).at(-1);

  assert.deepEqual(data.sidebarProjects.map((project) => project.name), [expectedProjectName]);
  assert.equal(data.sidebarProjects[0]?.path, list.projectCwd);
  assert.ok(data.conversations.length > 0);
  assert.ok(data.conversations.every((conversation) => conversation.projectId === data.sidebarProjects[0]?.id));
});

test("when deriving search recents, should derive them from conversations", () => {
  const data = createAppServerMockData({ list, reads });

  assert.equal(data.searchRecents.length, data.conversations.length);
  assert.deepEqual(
    data.searchRecents.map((item) => item.title),
    data.conversations.map((conversation) => conversation.title),
  );
});

test("when deriving assistant threads, should preserve fork metadata from selected raw threads", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/Users/Vint/Repos/01_Project_Personal/050_codex_remote",
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
    projectCwd: "/Users/Vint/Repos/01_Project_Personal/050_codex_remote",
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

test("when rendering the assistant thread, should keep assistant-ui runtime and composer primitives", () => {
  const source = readFileSync(new URL("./components/codex-assistant-thread.tsx", import.meta.url), "utf8");

  assert.match(source, /AssistantRuntimeProvider/);
  assert.match(source, /useExternalStoreRuntime/);
  assert.match(source, /ComposerPrimitive/);
  assert.match(source, /ThreadPrimitive\.ViewportProvider/);
  assert.doesNotMatch(source, /<ThreadPrimitive\.Viewport[\\s>]/);
  assert.doesNotMatch(source, /ComposerPrimitive\.Input/);
  assert.doesNotMatch(source, /<form\b/);
  assert.doesNotMatch(source, /<textarea\b/);
});

test("non-assistant runtime messages should not receive status", () => {
  const source = readFileSync(new URL("./components/codex-assistant-thread.tsx", import.meta.url), "utf8");

  assert.match(source, /status\?: ThreadMessageLike\["status"\];/);
  assert.match(source, /role === "assistant"\s*\?\s*\{\s*status:/);
  assert.doesNotMatch(source, /status: message\.status,/);
});
