import assert from "node:assert/strict";
import test from "node:test";

import listFixture from "./fixtures/app-server/050_codex_remote.thread-list.json" with { type: "json" };
import readFixture from "./fixtures/app-server/050_codex_remote.thread-read.json" with { type: "json" };
import {
  createAppServerMockData,
  deriveAssistantMessages,
  getThreadTitle,
} from "./appServerMockAdapter.ts";
import type { RawCodexThread, RawThreadListFixture, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";

const list = listFixture as RawThreadListFixture;
const reads = readFixture as RawThreadReadFixture;

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

  assert.deepEqual(data.sidebarProjects.map((project) => project.name), ["050_codex_remote"]);
  assert.equal(data.sidebarProjects[0]?.path, "/Users/Vint/Repos/01_Project_Personal/050_codex_remote");
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

test("when resolving titles, should prefer name then preview then fallback", () => {
  assert.equal(getThreadTitle({ id: "a", name: "Named", preview: "Preview" }), "Named");
  assert.equal(getThreadTitle({ id: "b", name: "", preview: "Preview\nsecond line" }), "Preview");
  assert.equal(getThreadTitle({ id: "c", name: null, preview: "" }), "Untitled thread");
});

test("when deriving messages, should handle empty turns and unknown items", () => {
  const thread: RawCodexThread = {
    id: "thread-empty",
    turns: [
      {
        id: "turn-a",
        items: [{ id: "item-unknown", type: "something/new", content: { value: 1 } }],
      },
    ],
  };

  const messages = deriveAssistantMessages(thread);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, "item-unknown");
  assert.equal(messages[0]?.role, "assistant");
  assert.match(messages[0]?.contentText ?? "", /something\/new/);
});
