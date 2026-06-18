import assert from "node:assert/strict";
import test from "node:test";

import { waitForReadyz } from "./appServerProcessService.ts";

test(
  "when readyz fetch hangs, should abort attempts and fail with a safe timeout error",
  { timeout: 500 },
  async () => {
    const originalFetch = globalThis.fetch;
    let abortCount = 0;

    try {
      globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              abortCount += 1;
              reject(new DOMException("This operation was aborted", "AbortError"));
            },
            { once: true },
          );
        })) as typeof fetch;

      await assert.rejects(
        waitForReadyz("http://127.0.0.1:4317/readyz", 50),
        /app_server_request_timeout/,
      );
      assert.ok(abortCount >= 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
