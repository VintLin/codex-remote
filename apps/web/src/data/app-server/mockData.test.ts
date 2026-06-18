import assert from "node:assert/strict";
import test from "node:test";

import { assistantThreads, conversations } from "./mockData.ts";

test("when demo assistant threads define metadata, should derive it from conversations", () => {
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  for (const thread of assistantThreads) {
    const conversation = conversationById.get(thread.id);
    assert.ok(conversation, `missing conversation for assistant thread ${thread.id}`);
    assert.equal(thread.title, conversation.title);
    assert.equal(thread.deviceId, conversation.deviceId);
    assert.equal(thread.projectId, conversation.projectId);
    assert.equal(thread.projectName, conversation.projectName);
    assert.equal(thread.status, conversation.status);
    assert.equal(thread.updatedAt, conversation.updatedAt);
    assert.equal(thread.timeline.threadId, thread.id);
  }
});
