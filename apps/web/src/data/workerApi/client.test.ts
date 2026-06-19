import assert from "node:assert/strict";
import test from "node:test";

import type { WorkerHealth } from "@codex-remote/api-contract";

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
