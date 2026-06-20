import assert from "node:assert/strict";
import test from "node:test";

import type { CommandAccepted, WorkerHealth } from "@codex-remote/api-contract";

import { WorkerApiClient } from "./client.ts";

test("WorkerApiClient request when using global fetch should bind the fetch receiver", async () => {
  const originalFetch = globalThis.fetch;
  const health: WorkerHealth = {
    deviceId: "test-device",
    status: "connected",
    checkedAt: "2026-06-20T00:00:00.000Z",
    codexVersion: "test",
    appServer: {
      transport: "loopbackWebSocket",
      readyz: true,
    },
  };
  let receivedThis: unknown = null;
  const fetchWithReceiverCheck = function fetchWithReceiverCheck(this: unknown): Promise<Response> {
    receivedThis = this;
    return Promise.resolve(
      new Response(JSON.stringify(health), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
  };

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: fetchWithReceiverCheck,
    writable: true,
  });

  try {
    const client = new WorkerApiClient({
      baseUrl: "http://127.0.0.1:8788",
      token: "example-token",
    });

    await client.getHealth();

    assert.equal(receivedThis, globalThis);
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true,
    });
  }
});

test("WorkerApiClient follow-up when called, should POST contract body with bearer auth", async () => {
  const accepted: CommandAccepted = {
    id: "follow-up:thread-1:client-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: "turn-1",
    acceptedAt: "2026-06-20T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(accepted), {
      headers: { "content-type": "application/json" },
      status: 202,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  const response = await client.followUpConversation("thread-1", {
    message: "Continue safely",
    clientRequestId: "client-1",
    expectedConversationId: "thread-1",
  });

  assert.deepEqual(response, accepted);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://127.0.0.1:8787/v1/conversations/thread-1/follow-up");
  assert.equal(requests[0]?.init.method, "POST");
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
  assert.equal((requests[0]?.init.headers as Headers).get("content-type"), "application/json");
  assert.equal(
    requests[0]?.init.body,
    JSON.stringify({
      message: "Continue safely",
      clientRequestId: "client-1",
      expectedConversationId: "thread-1",
    }),
  );
});

test("WorkerApiClient control methods when called, should use versioned control routes", async () => {
  const accepted: CommandAccepted = {
    id: "control:thread-1:turn-1:client-1",
    status: "accepted",
    conversationId: "thread-1",
    turnId: "turn-1",
    acceptedAt: "2026-06-20T00:00:00.000Z",
  };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(requests.length === 3 ? [] : accepted), {
      headers: { "content-type": "application/json" },
      status: requests.length === 3 ? 200 : 202,
    });
  };
  const client = new WorkerApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "example-token",
    fetchImpl: fetchMock,
  });

  await client.interruptTurn("thread-1", "turn-1", { clientRequestId: "client-i", expectedTurnId: "turn-1" });
  await client.steerTurn("thread-1", "turn-1", { clientRequestId: "client-s", expectedTurnId: "turn-1", message: "Adjust" });
  await client.listApprovals("thread-1");
  await client.decideApproval("thread-1", "approval-1", {
    clientRequestId: "client-a",
    decision: "accept",
    expectedApprovalRequestId: "approval-1",
    expectedConversationId: "thread-1",
    expectedTurnId: "turn-1",
  });

  assert.deepEqual(requests.map((request) => `${request.init.method ?? "GET"} ${request.url}`), [
    "POST http://127.0.0.1:8787/v1/conversations/thread-1/turns/turn-1/interrupt",
    "POST http://127.0.0.1:8787/v1/conversations/thread-1/turns/turn-1/steer",
    "GET http://127.0.0.1:8787/v1/conversations/thread-1/approvals",
    "POST http://127.0.0.1:8787/v1/conversations/thread-1/approvals/approval-1/decision",
  ]);
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer example-token");
});
