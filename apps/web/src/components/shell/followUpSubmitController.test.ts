import assert from "node:assert/strict";
import test from "node:test";

import type { CommandAccepted } from "@codex-remote/api-contract";

import { submitConversationFollowUp } from "./followUpSubmitController.ts";

const accepted: CommandAccepted = {
  id: "follow-up:thread-1:client-1",
  status: "accepted",
  conversationId: "thread-1",
  turnId: "turn-1",
  acceptedAt: "2026-06-20T00:00:00.000Z",
};

test("submitConversationFollowUp when accepted, should submit through Worker and refresh selected conversation", async () => {
  const events: string[] = [];

  const result = await submitConversationFollowUp({
    conversationId: "thread-1",
    createClientRequestId: () => "client-1",
    message: "Continue safely",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setFollowUpStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      followUpConversation: async (conversationId, input) => {
        events.push(`post:${conversationId}:${input.clientRequestId}:${input.expectedConversationId}:${input.message}`);
        return accepted;
      },
    },
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, [
    "status:submitting",
    "post:thread-1:client-1:thread-1:Continue safely",
    "status:accepted",
    "refresh:thread-1",
  ]);
});

test("submitConversationFollowUp when Worker rejects, should set failed and not rethrow raw error", async () => {
  const events: string[] = [];

  const result = await submitConversationFollowUp({
    conversationId: "thread-1",
    createClientRequestId: () => "client-1",
    message: "Continue safely",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setFollowUpStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      followUpConversation: async () => {
        events.push("post");
        throw new Error("raw worker url and stack should not escape");
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:submitting", "post", "status:failed"]);
});

test("submitConversationFollowUp when no conversation is selected, should fail without Worker request", async () => {
  const events: string[] = [];

  const result = await submitConversationFollowUp({
    conversationId: null,
    createClientRequestId: () => "client-1",
    message: "Continue safely",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setFollowUpStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      followUpConversation: async () => {
        events.push("post");
        return accepted;
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:failed"]);
});
