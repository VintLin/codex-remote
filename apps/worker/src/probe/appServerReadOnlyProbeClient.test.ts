import assert from "node:assert/strict";
import test from "node:test";

import { AppServerReadOnlyProbeClient } from "./appServerReadOnlyProbeClient.ts";

test("when readyz hangs, should abort with a safe timeout error", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("This operation was aborted", "AbortError"));
          },
          { once: true },
        );
      })) as typeof fetch;

    const client = new AppServerReadOnlyProbeClient(
      {
        close() {},
        notify() {},
        request: async () => {
          throw new Error("unexpected request");
        },
      } as never,
      "http://127.0.0.1:4317/readyz",
      "/repo/project",
      { readyzTimeoutMs: 10 },
    );

    await assert.rejects(client.readyz(), /app_server_request_timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
