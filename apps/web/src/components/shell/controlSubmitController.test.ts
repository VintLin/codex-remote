import assert from "node:assert/strict";
import test from "node:test";

import type { CommandAccepted, PendingApproval } from "@codex-remote/api-contract";

import { submitApprovalDecision, submitInterrupt, submitSteer, type ControlWorkerClient } from "./controlSubmitController.ts";

const accepted: CommandAccepted = {
  id: "control:thread-1:turn-1:client-1",
  status: "accepted",
  conversationId: "thread-1",
  turnId: "turn-1",
  acceptedAt: "2026-06-20T00:00:00.000Z",
};

const approval: PendingApproval = {
  id: "approval-1",
  conversationId: "thread-1",
  turnId: "turn-1",
  itemId: "item-1",
  kind: "command_execution",
  status: "pending",
  startedAt: "2026-06-20T00:00:00.000Z",
  summary: "Command execution approval",
  risk: "medium",
};

test("submitInterrupt when accepted, should post expected turn and refresh", async () => {
  const events: string[] = [];
  const result = await submitInterrupt({
    conversationId: "thread-1",
    createClientRequestId: () => "client-1",
    deviceId: "device-a",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    turnId: "turn-1",
    workerClient: createClient({
      interruptTurn: async (deviceId, conversationId, turnId, input) => {
        events.push(`interrupt:${deviceId}:${conversationId}:${turnId}:${input.clientRequestId}:${input.expectedTurnId}`);
        return accepted;
      },
    }),
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, ["status:submitting", "interrupt:device-a:thread-1:turn-1:client-1:turn-1", "status:accepted", "refresh:thread-1"]);
});

test("submitSteer when Worker rejects, should fail without throwing raw error", async () => {
  const events: string[] = [];
  const result = await submitSteer({
    conversationId: "thread-1",
    createClientRequestId: () => "client-1",
    deviceId: "device-a",
    message: "Adjust",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    turnId: "turn-1",
    workerClient: createClient({
      steerTurn: async () => {
        events.push("steer");
        throw new Error("raw worker url stack should not escape");
      },
    }),
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["status:submitting", "steer", "status:failed"]);
});

test("submitApprovalDecision when accepted, should post expected ids and refresh", async () => {
  const events: string[] = [];
  const result = await submitApprovalDecision({
    approval,
    conversationId: "thread-1",
    createClientRequestId: () => "client-1",
    decision: "accept",
    deviceId: "device-a",
    refreshWorkbenchData: async (conversationId) => {
      events.push(`refresh:${conversationId}`);
    },
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: createClient({
      decideApproval: async (deviceId, conversationId, approvalRequestId, input) => {
        events.push(`${deviceId}:${conversationId}:${approvalRequestId}:${input.decision}:${input.expectedTurnId}:${input.expectedApprovalRequestId}`);
        return accepted;
      },
    }),
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, ["status:submitting", "device-a:thread-1:approval-1:accept:turn-1:approval-1", "status:accepted", "refresh:thread-1"]);
});

function createClient(overrides: Partial<ControlWorkerClient>): ControlWorkerClient {
  return {
    decideApproval: async () => accepted,
    interruptTurn: async () => accepted,
    listApprovals: async () => [],
    steerTurn: async () => accepted,
    ...overrides,
  };
}
