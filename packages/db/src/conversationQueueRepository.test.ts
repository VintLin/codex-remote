import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openTaskDatabase } from "./index.ts";

test("ConversationQueueRepository > queueMessage > when database is reopened, should persist queued messages in FIFO order", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const first = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "first", "request-1"));
    const second = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "second", "request-2"));
    fixture.database.close();

    const reopened = openTaskDatabase(fixture.databasePath);
    try {
      assert.deepEqual(reopened.conversationQueue.listMessages("macbook", "thread-1"), [first, second]);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.remove();
  }
});

test("ConversationQueueRepository > queueMessage > when client request id is repeated, should return existing message without duplication", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const first = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "first", "request-1"));
    const repeated = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "first ignored", "request-1"));

    assert.deepEqual(repeated, first);
    assert.deepEqual(fixture.database.conversationQueue.listMessages("macbook", "thread-1"), [first]);
  } finally {
    fixture.close();
  }
});

test("ConversationQueueRepository > listMessages > when conversation ids match across devices, should keep queues device-scoped", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const macbook = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "macbook message", "request-1"));
    const studio = fixture.database.conversationQueue.queueMessage(queueInput("studio", "thread-1", "studio message", "request-1"));

    assert.deepEqual(fixture.database.conversationQueue.listMessages("macbook", "thread-1"), [macbook]);
    assert.deepEqual(fixture.database.conversationQueue.listMessages("studio", "thread-1"), [studio]);
  } finally {
    fixture.close();
  }
});

test("ConversationQueueRepository > claimMessage > when multiple messages are queued, should claim only the selected queued message", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const first = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "first", "request-1"));
    const second = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "second", "request-2"));

    const claimed = fixture.database.conversationQueue.claimMessage("macbook", "thread-1", first.id);

    assert.equal(claimed.id, first.id);
    assert.equal(claimed.status, "sending");
    assert.deepEqual(
      fixture.database.conversationQueue.listMessages("macbook", "thread-1").map(({ id, status }) => ({ id, status })),
      [
        { id: first.id, status: "sending" },
        { id: second.id, status: "queued" },
      ],
    );
    assert.throws(() => fixture.database.conversationQueue.claimMessage("macbook", "thread-1", first.id), /queue_message_conflict/);
  } finally {
    fixture.close();
  }
});

test("ConversationQueueRepository > completeMessage > when sending succeeds or fails, should preserve auditable terminal state", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const sent = fixture.database.conversationQueue.claimMessage(
      "macbook",
      "thread-1",
      fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "send", "request-1")).id,
    );
    const failed = fixture.database.conversationQueue.claimMessage(
      "macbook",
      "thread-1",
      fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "fail", "request-2")).id,
    );

    assert.equal(fixture.database.conversationQueue.markSent(sent.id).status, "sent");
    const failedMessage = fixture.database.conversationQueue.markFailed(failed.id, "worker_unavailable");

    assert.equal(failedMessage.status, "failed");
    assert.equal(failedMessage.failureCode, "worker_unavailable");
  } finally {
    fixture.close();
  }
});

test("ConversationQueueRepository > cancelMessage > when a queued message is canceled, should keep it out of pending queue", () => {
  const fixture = ConversationQueueFixture.create();
  try {
    const queued = fixture.database.conversationQueue.queueMessage(queueInput("macbook", "thread-1", "cancel me", "request-1"));

    const canceled = fixture.database.conversationQueue.cancelMessage("macbook", "thread-1", queued.id);

    assert.equal(canceled.status, "canceled");
    assert.deepEqual(fixture.database.conversationQueue.listQueuedMessages("macbook", "thread-1"), []);
  } finally {
    fixture.close();
  }
});

function queueInput(deviceId: string, conversationId: string, message: string, clientRequestId: string) {
  return { deviceId, conversationId, message, clientRequestId };
}

class ConversationQueueFixture {
  readonly temporaryDirectory: string;
  readonly databasePath: string;
  readonly database: ReturnType<typeof openTaskDatabase>;

  private constructor(temporaryDirectory: string, databasePath: string, database: ReturnType<typeof openTaskDatabase>) {
    this.temporaryDirectory = temporaryDirectory;
    this.databasePath = databasePath;
    this.database = database;
  }

  static create(): ConversationQueueFixture {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "codex-remote-db-"));
    const databasePath = join(temporaryDirectory, "tasks.sqlite");
    return new ConversationQueueFixture(temporaryDirectory, databasePath, openTaskDatabase(databasePath));
  }

  close(): void {
    this.database.close();
    this.remove();
  }

  remove(): void {
    rmSync(this.temporaryDirectory, { force: true, recursive: true });
  }
}
