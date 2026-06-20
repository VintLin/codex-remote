import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { CommandAccepted, ConversationTimeline, ErrorEnvelope, PendingApproval } from "@codex-remote/api-contract";

import { createFakeWorkerSmokeServer } from "./fakeWorkerSmokeServer.ts";

const token = "example-token";

test("fake Worker smoke server when follow-up is accepted, should expose accepted metadata on refresh", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const acceptedResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/follow-up`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Continue safely",
        clientRequestId: "client-smoke-1",
        expectedConversationId: "smoke-thread-1",
      }),
    });

    assert.equal(acceptedResponse.status, 202);
    const accepted = (await acceptedResponse.json()) as CommandAccepted;
    assert.equal(accepted.conversationId, "smoke-thread-1");
    assert.equal(accepted.id, "follow-up:smoke-thread-1:client-smoke-1");
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.turnId, "smoke-turn-client-smoke-1");

    const timelineResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/timeline`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(timelineResponse.status, 200);
    const timeline = (await timelineResponse.json()) as ConversationTimeline;
    assert.equal(timeline.latestTurnStatus, "unknown");
    assert.equal(timeline.runtimeStatus, "running");
    assert.equal(timeline.turns.at(-1)?.id, "smoke-turn-client-smoke-1");
    assert.equal(timeline.turns.at(-1)?.status, "in_progress");
  } finally {
    await close();
  }
});

test("fake Worker smoke server when follow-up omits optional expectedConversationId, should accept", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const response = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/follow-up`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Continue safely",
        clientRequestId: "client-smoke-no-guard",
      }),
    });

    assert.equal(response.status, 202);
    const accepted = (await response.json()) as CommandAccepted;
    assert.equal(accepted.id, "follow-up:smoke-thread-1:client-smoke-no-guard");
  } finally {
    await close();
  }
});

test("fake Worker smoke server when follow-up fails, should return sanitized error envelope", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const response = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/follow-up`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "smoke-fail",
        clientRequestId: "client-smoke-fail",
        expectedConversationId: "smoke-thread-1",
      }),
    });

    assert.equal(response.status, 424);
    const envelope = (await response.json()) as ErrorEnvelope;
    assert.equal(envelope.code, "app_server_unavailable");
    assert.equal(envelope.message.includes("http://"), false);
    assert.equal(envelope.message.includes("stack"), false);
    assert.equal(envelope.message.includes("token"), false);
  } finally {
    await close();
  }
});

test("fake Worker smoke server when start is accepted, should expose new conversation metadata", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const response = await fetch(`${baseUrl}/v1/conversations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "smoke-project",
        message: "Start safely",
        clientRequestId: "client-start-1",
      }),
    });

    assert.equal(response.status, 202);
    const accepted = (await response.json()) as CommandAccepted;
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.conversationId, "smoke-start-client-start-1");

    const conversationsResponse = await fetch(`${baseUrl}/v1/conversations`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const conversations = (await conversationsResponse.json()) as Array<{ id: string }>;
    assert.equal(conversations.some((conversation) => conversation.id === "smoke-start-client-start-1"), true);
  } finally {
    await close();
  }
});

test("fake Worker smoke server when turn controls are accepted, should update timeline state", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const steerResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/turns/smoke-turn-1/steer`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Keep going",
        clientRequestId: "client-steer-1",
        expectedTurnId: "smoke-turn-1",
      }),
    });
    assert.equal(steerResponse.status, 202);
    assert.equal(((await steerResponse.json()) as CommandAccepted).id, "steer:smoke-thread-1:client-steer-1");

    const interruptResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/turns/smoke-turn-1/interrupt`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientRequestId: "client-interrupt-1",
        expectedTurnId: "smoke-turn-1",
      }),
    });
    assert.equal(interruptResponse.status, 202);
    assert.equal(((await interruptResponse.json()) as CommandAccepted).id, "interrupt:smoke-thread-1:client-interrupt-1");

    const timelineResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/timeline`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const timeline = (await timelineResponse.json()) as ConversationTimeline;
    assert.equal(timeline.runtimeStatus, "idle");
    assert.equal(timeline.turns.find((turn) => turn.id === "smoke-turn-1")?.status, "completed");
  } finally {
    await close();
  }
});

test("fake Worker smoke server when approval is decided, should remove pending approval", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const listResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/approvals`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(listResponse.status, 200);
    const approvals = (await listResponse.json()) as PendingApproval[];
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0]?.id, "smoke-approval-1");

    const decisionResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/approvals/smoke-approval-1/decision`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        decision: "accept",
        clientRequestId: "client-approval-1",
        expectedConversationId: "smoke-thread-1",
        expectedTurnId: "smoke-turn-1",
        expectedApprovalRequestId: "smoke-approval-1",
      }),
    });
    assert.equal(decisionResponse.status, 202);
    assert.equal(((await decisionResponse.json()) as CommandAccepted).id, "approval-accept:smoke-thread-1:client-approval-1");

    const emptyResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/approvals`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.deepEqual(await emptyResponse.json(), []);
  } finally {
    await close();
  }
});

test("fake Worker smoke server when write body violates contract, should reject invalid request", async () => {
  const { baseUrl, close } = await startFakeServer();
  try {
    const followUpExtraResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/follow-up`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Continue safely",
        clientRequestId: "client-smoke-extra",
        expectedConversationId: "smoke-thread-1",
        rawJsonRpc: "{}",
      }),
    });
    const followUpLongIdResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/follow-up`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Continue safely",
        clientRequestId: "x".repeat(129),
      }),
    });
    const startExtraResponse = await fetch(`${baseUrl}/v1/conversations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "smoke-project",
        message: "Start safely",
        clientRequestId: "client-start-extra",
        rawJsonRpc: "{}",
      }),
    });
    const steerConflictResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/turns/smoke-turn-1/steer`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Continue safely",
        clientRequestId: "client-steer-conflict",
        expectedTurnId: "other-turn",
      }),
    });
    const decisionExtraResponse = await fetch(`${baseUrl}/v1/conversations/smoke-thread-1/approvals/smoke-approval-1/decision`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        decision: "accept",
        clientRequestId: "client-approval-extra",
        expectedConversationId: "smoke-thread-1",
        expectedTurnId: "smoke-turn-1",
        expectedApprovalRequestId: "smoke-approval-1",
        rawJsonRpc: "{}",
      }),
    });

    assert.equal(followUpExtraResponse.status, 400);
    assert.equal(((await followUpExtraResponse.json()) as ErrorEnvelope).code, "invalid_request");
    assert.equal(followUpLongIdResponse.status, 400);
    assert.equal(((await followUpLongIdResponse.json()) as ErrorEnvelope).code, "invalid_request");
    assert.equal(startExtraResponse.status, 400);
    assert.equal(((await startExtraResponse.json()) as ErrorEnvelope).code, "invalid_request");
    assert.equal(steerConflictResponse.status, 409);
    assert.equal(((await steerConflictResponse.json()) as ErrorEnvelope).code, "conflict");
    assert.equal(decisionExtraResponse.status, 400);
    assert.equal(((await decisionExtraResponse.json()) as ErrorEnvelope).code, "invalid_request");
  } finally {
    await close();
  }
});

async function startFakeServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createFakeWorkerSmokeServer({ token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
