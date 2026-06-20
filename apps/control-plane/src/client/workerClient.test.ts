import assert from "node:assert/strict";
import test from "node:test";

import { createWorkerUpstreamClient } from "./workerClient.ts";

const device = {
  id: "device-a",
  name: "Device A",
  baseUrl: "http://127.0.0.1:8788",
  token: "example-token",
};

test("worker upstream client when requesting, should use bearer token and versioned path", async () => {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      calls.push({ init, url: String(request) });
      return Response.json({ deviceId: "device-a", status: "connected", checkedAt: "2026-06-20T00:00:00.000Z", codexVersion: null, appServer: { transport: "loopbackWebSocket", readyz: true } });
    },
  });

  await client.getHealth(device);

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(calls[0]?.url, "http://127.0.0.1:8788/v1/worker/health");
  assert.equal(headers.get("authorization"), "Bearer example-token");
});

test("worker upstream client when requesting probe, should use worker probe path and project sanitized evidence", async () => {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async (request, init) => {
      calls.push({ init, url: String(request) });
      return Response.json({
        schemaVersion: 1,
        startedAt: "2026-06-20T00:00:00.000Z",
        completedAt: "2026-06-20T00:00:01.000Z",
        ok: true,
        mode: "readOnly",
        deviceId: "device-a",
        codexVersion: null,
        appServer: { transport: "stdio", startedByWorker: true, readyz: true },
        checks: [
          {
            name: "thread/list",
            ok: true,
            durationMs: 1,
            exactCwdListProven: true,
            completedUntilNextCursorNull: true,
            pageCount: 2,
            cursorCount: 1,
            count: 3,
          },
        ],
      });
    },
  });

  const probe = await client.getProbeSummary(device);

  assert.equal(calls[0]?.url, "http://127.0.0.1:8788/v1/worker/probe");
  assert.equal(probe.checks[0]?.exactCwdListProven, true);
  assert.equal(probe.checks[0]?.completedUntilNextCursorNull, true);
});

test("worker upstream client when upstream fails, should throw sanitized error", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => new Response("raw http://127.0.0.1:8788 example-token stack", { status: 500 }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /example-token|8788|stack/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns invalid json, should throw sanitized unavailable error", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () => new Response("raw http://127.0.0.1:8788 example-token stack", { status: 200 }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /example-token|8788|stack|raw/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns extra public fields, should fail closed without leaking them", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1_000,
    fetch: async () =>
      Response.json({
        deviceId: "device-a",
        status: "connected",
        checkedAt: "2026-06-20T00:00:00.000Z",
        codexVersion: null,
        appServer: { transport: "loopbackWebSocket", readyz: true },
        rawUrl: "http://127.0.0.1:8788",
      }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /rawUrl|8788/);
    return error instanceof Error;
  });
});

test("worker upstream client when upstream returns public errors, should preserve status and safe code", async () => {
  const responses = [
    { expectedCode: "unauthorized", expectedStatus: 401, responseStatus: 401 },
    { expectedCode: "duplicate_request", expectedStatus: 409, responseStatus: 409 },
  ];

  for (const entry of responses) {
    const client = createWorkerUpstreamClient({
      timeoutMs: 1_000,
      fetch: async () =>
        Response.json(
          {
            code: entry.expectedCode,
            message: "safe",
            details: { operation: "worker_request", retryable: false, rawUrl: "http://127.0.0.1:8788" },
          },
          { status: entry.responseStatus },
        ),
    });

    await assert.rejects(client.getHealth(device), (error) => {
      assert.equal((error as { status?: number }).status, entry.expectedStatus);
      assert.equal((error as { code?: string }).code, entry.expectedCode);
      assert.doesNotMatch(JSON.stringify(error), /rawUrl|8788/);
      return true;
    });
  }
});

test("worker upstream client when request times out, should map to request timeout", async () => {
  const client = createWorkerUpstreamClient({
    timeoutMs: 1,
    fetch: async (_request, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });

  await assert.rejects(client.getHealth(device), (error) => {
    assert.equal((error as { status?: number }).status, 408);
    assert.equal((error as { code?: string }).code, "app_server_timeout");
    return true;
  });
});
