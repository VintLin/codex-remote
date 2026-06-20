import assert from "node:assert/strict";
import test from "node:test";

import { submitStartConversation } from "./startConversationSubmitController.ts";

test("start conversation submit: when project and token exist, should call startConversation and refresh selected conversation", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: "local-device",
    message: "codex-remote-calibration start",
    projectId: "local-project",
    refreshWorkbenchData: async (conversationKey) => {
      events.push(`refresh:${conversationKey}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async (deviceId, input) => {
        events.push(`${deviceId}:${input.projectId}:${input.message}:${input.clientRequestId}`);
        return {
          id: "accepted-1",
          status: "accepted",
          conversationId: "thread-1",
          turnId: "turn-1",
          acceptedAt: "2026-06-20T00:00:00.000Z",
        };
      },
    },
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, [
    "status:submitting",
    "local-device:local-project:codex-remote-calibration start:client-start-1",
    "status:accepted",
    "refresh:local-device\u001fthread-1",
  ]);
});

test("start conversation submit: when device is missing, should fail closed without Worker call or refresh", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: null,
    message: "start",
    projectId: "local-project",
    refreshWorkbenchData: async (conversationKey) => {
      events.push(`refresh:${conversationKey}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async () => {
        events.push("worker-called");
        throw new Error("should not call worker");
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:failed"]);
});

test("start conversation submit: when project is missing, should fail closed without Worker call or refresh", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: "local-device",
    message: "start",
    projectId: null,
    refreshWorkbenchData: async (conversationKey) => {
      events.push(`refresh:${conversationKey}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async () => {
        events.push("worker-called");
        throw new Error("should not call worker");
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:failed"]);
});

test("start conversation submit: when trimmed message is empty, should fail closed without Worker call or refresh", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: "local-device",
    message: "   ",
    projectId: "local-project",
    refreshWorkbenchData: async (conversationKey) => {
      events.push(`refresh:${conversationKey}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async () => {
        events.push("worker-called");
        throw new Error("should not call worker");
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:failed"]);
});

test("start conversation submit: when Worker rejects, should return failed without raw error exposure", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: "local-device",
    message: "start",
    projectId: "local-project",
    refreshWorkbenchData: async (conversationKey) => {
      events.push(`refresh:${conversationKey}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async () => {
        events.push("worker-called");
        throw new Error("raw upstream failure");
      },
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:submitting", "worker-called", "status:failed"]);
});
