import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { BoardTask } from "@codex-remote/api-contract";
import { openTaskDatabase } from "./index.ts";

test("TaskRepository > createTask > when called with a title, should persist a default in-progress task", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask({ title: "Review Stage 7 DB" });

    assert.equal(task.title, "Review Stage 7 DB");
    assert.equal(task.status, "in_progress");
    assert.deepEqual(task.linkedConversations, []);
    assert.deepEqual(fixture.database.tasks.listTasks(), [task]);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > linkConversation > when same conversation id appears on two devices, should keep device-scoped links", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask({ title: "Investigate shared thread", status: "waiting" });

    fixture.database.tasks.linkConversation(task.id, { deviceId: "macbook", conversationId: "thread-1" });
    const linked = fixture.database.tasks.linkConversation(task.id, { deviceId: "studio", conversationId: "thread-1" });

    assert.deepEqual(linked, {
      id: task.id,
      title: "Investigate shared thread",
      status: "waiting",
      linkedConversations: [
        { deviceId: "macbook", conversationId: "thread-1" },
        { deviceId: "studio", conversationId: "thread-1" },
      ],
    } satisfies BoardTask);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > unlinkConversation > when one device-scoped link is removed, should keep the other matching conversation id", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask({ title: "Split linked work" });
    fixture.database.tasks.linkConversation(task.id, { deviceId: "macbook", conversationId: "thread-1" });
    fixture.database.tasks.linkConversation(task.id, { deviceId: "studio", conversationId: "thread-1" });

    const unlinked = fixture.database.tasks.unlinkConversation(task.id, "macbook", "thread-1");

    assert.deepEqual(unlinked.linkedConversations, [{ deviceId: "studio", conversationId: "thread-1" }]);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > listTasks > when database is reopened, should read persisted tasks and links", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask({ title: "Persist me", status: "done" });
    fixture.database.tasks.linkConversation(task.id, { deviceId: "macbook", conversationId: "thread-2" });
    fixture.database.close();

    const reopened = openTaskDatabase(fixture.databasePath);
    try {
      assert.deepEqual(reopened.tasks.listTasks(), [
        {
          id: task.id,
          title: "Persist me",
          status: "done",
          linkedConversations: [{ deviceId: "macbook", conversationId: "thread-2" }],
        },
      ] satisfies BoardTask[]);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.remove();
  }
});

test("TaskRepository > package boundary > when source imports are inspected, should not depend on app or protocol packages", () => {
  const source = TaskRepositoryFixture.readSourceTree();

  assert.match(source, /@codex-remote\/api-contract/);
  assert.doesNotMatch(source, /@codex-remote\/codex-protocol/);
  assert.doesNotMatch(source, /@codex-remote\/web/);
  assert.doesNotMatch(source, /@codex-remote\/worker/);
  assert.doesNotMatch(source, /@codex-remote\/control-plane/);
  assert.doesNotMatch(source, /from ["']\.\.\/\.\.\/apps\//);
});

class TaskRepositoryFixture {
  readonly temporaryDirectory: string;
  readonly databasePath: string;
  readonly database: ReturnType<typeof openTaskDatabase>;

  private constructor(temporaryDirectory: string, databasePath: string, database: ReturnType<typeof openTaskDatabase>) {
    this.temporaryDirectory = temporaryDirectory;
    this.databasePath = databasePath;
    this.database = database;
  }

  static create(): TaskRepositoryFixture {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "codex-remote-db-"));
    const databasePath = join(temporaryDirectory, "tasks.sqlite");
    return new TaskRepositoryFixture(temporaryDirectory, databasePath, openTaskDatabase(databasePath));
  }

  static readSourceTree(): string {
    const srcDirectory = new URL(".", import.meta.url);
    return readdirSync(srcDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => readFileSync(new URL(entry.name, srcDirectory), "utf8"))
      .join("\n");
  }

  close(): void {
    this.database.close();
    this.remove();
  }

  remove(): void {
    rmSync(this.temporaryDirectory, { force: true, recursive: true });
  }
}
