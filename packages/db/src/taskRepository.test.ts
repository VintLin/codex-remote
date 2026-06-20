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
    const task = fixture.database.tasks.createTask(createTaskInput("Review Stage 7 DB"));

    assert.equal(task.title, "Review Stage 7 DB");
    assert.equal(task.status, "in_progress");
    assert.match(task.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(task.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(task.linkedConversations, []);
    assert.deepEqual(fixture.database.tasks.listTasks(), [task]);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > linkConversation > when same conversation id appears on two devices, should keep device-scoped links", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask(createTaskInput("Investigate shared thread", { status: "waiting" }));

    fixture.database.tasks.linkConversation(task.id, linkInput("macbook", "thread-1", "project-a"));
    const linked = fixture.database.tasks.linkConversation(task.id, linkInput("studio", "thread-1", "project-b"));

    assert.equal(linked.id, task.id);
    assert.equal(linked.title, "Investigate shared thread");
    assert.equal(linked.status, "waiting");
    assert.match(linked.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(linked.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(linked.linkedConversations.length, 2);
    assert.deepEqual(linked.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "macbook", conversationId: "thread-1", projectId: "project-a" },
      { deviceId: "studio", conversationId: "thread-1", projectId: "project-b" },
    ]);
    assert.match(linked.linkedConversations[0]?.linkedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > unlinkConversation > when one device-scoped link is removed, should keep the other matching conversation id", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask(createTaskInput("Split linked work"));
    fixture.database.tasks.linkConversation(task.id, linkInput("macbook", "thread-1", "project-a"));
    fixture.database.tasks.linkConversation(task.id, linkInput("studio", "thread-1", "project-b"));

    const unlinked = fixture.database.tasks.unlinkConversation(task.id, "macbook", "thread-1");

    assert.deepEqual(unlinked.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "studio", conversationId: "thread-1", projectId: "project-b" },
    ]);
  } finally {
    fixture.close();
  }
});

test("TaskRepository > listTasks > when database is reopened, should read persisted tasks and links", () => {
  const fixture = TaskRepositoryFixture.create();
  try {
    const task = fixture.database.tasks.createTask(createTaskInput("Persist me", { status: "done" }));
    fixture.database.tasks.linkConversation(task.id, linkInput("macbook", "thread-2", "project-a"));
    fixture.database.close();

    const reopened = openTaskDatabase(fixture.databasePath);
    try {
      assert.deepEqual(reopened.tasks.listTasks(), [
        {
          id: task.id,
          title: "Persist me",
          status: "done",
          createdAt: task.createdAt,
          updatedAt: reopened.tasks.listTasks()[0]?.updatedAt ?? "",
          linkedConversations: [
            {
              deviceId: "macbook",
              conversationId: "thread-2",
              projectId: "project-a",
              linkedAt: reopened.tasks.listTasks()[0]?.linkedConversations[0]?.linkedAt ?? "",
            },
          ],
        },
      ] satisfies BoardTask[]);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.remove();
  }
});

function createTaskInput(title: string, options: { status?: BoardTask["status"] } = {}) {
  return {
    title,
    clientRequestId: `request-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    ...(options.status === undefined ? {} : { status: options.status }),
  };
}

function linkInput(deviceId: string, conversationId: string, projectId: string) {
  return { deviceId, conversationId, projectId };
}

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
