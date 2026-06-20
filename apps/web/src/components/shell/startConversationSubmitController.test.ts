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
