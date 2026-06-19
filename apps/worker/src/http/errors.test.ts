import assert from "node:assert/strict";
import test from "node:test";

import { WorkerHttpError, mapUnknownError, toErrorEnvelope } from "./errors.ts";

test("worker http errors when upstream request times out should map to 408 envelope", () => {
  const envelope = toErrorEnvelope(new Error("app_server_request_timeout"), "req-timeout");

  assert.deepEqual(envelope, {
    code: "app_server_timeout",
    message: "App-server request timed out.",
    details: {
      operation: "unknown",
      retryable: true,
    },
    requestId: "req-timeout",
  });
});

test("worker http errors when upstream connection is unavailable should map to 424 envelope", async (t) => {
  const transientFailures = [
    "app_server_connection_error",
    "app_server_connection_timeout",
    "app_server_spawn_failed",
    "app_server_websocket_unavailable",
  ] as const;

  for (const failure of transientFailures) {
    await t.test(`when upstream failure is ${failure}`, () => {
      const mapped = mapUnknownError(new Error(failure), "worker.probe");

      assert.equal(mapped.status, 424);
      assert.equal(mapped.code, "app_server_unavailable");

      const envelope = toErrorEnvelope(mapped, "req-unavailable");
      assert.deepEqual(envelope, {
        code: "app_server_unavailable",
        message: "Codex app-server is unavailable.",
        details: {
          operation: "worker.probe",
          retryable: true,
        },
        requestId: "req-unavailable",
      });
    });
  }
});

test("worker http errors when error is unexpected should map to sanitized 500 envelope", () => {
  const envelope = toErrorEnvelope(
    mapUnknownError(new Error("raw upstream failure with token=secret-token"), "conversation.list"),
    "req-internal",
  );

  assert.deepEqual(envelope, {
    code: "worker_internal_error",
    message: "Worker request failed.",
    details: {
      operation: "conversation.list",
      retryable: false,
    },
    requestId: "req-internal",
  });
});

test("worker http errors when details contain forbidden keys should drop them from envelope", () => {
  const envelope = toErrorEnvelope(
    new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "conversation.timeline",
      reason: "invalid_cursor",
      field: "cursor",
      limit: 100,
      retryable: false,
      diagnosticId: "diag-123",
      token: "secret-token",
      url: "ws://127.0.0.1:4317/private?token=secret",
      stack: "trace",
      cause: "root cause",
      extra: "ignored",
    }),
    "req-allowlist",
  );

  assert.deepEqual(envelope, {
    code: "invalid_request",
    message: "Request validation failed.",
    details: {
      operation: "conversation.timeline",
      reason: "invalid_cursor",
      field: "cursor",
      limit: 100,
      retryable: false,
      diagnosticId: "diag-123",
    },
    requestId: "req-allowlist",
  });
});

test("worker http errors when serializing envelopes should not leak raw sensitive strings", () => {
  const upstream = new Error("token=secret-token\n@@ -1,2 +1,2 @@\n- old\n+ new");
  (upstream as Error & { stack?: string }).stack =
    "Error: secret stack\n    at ws://127.0.0.1:4317/private?token=secret";

  const envelope = toErrorEnvelope(
    new WorkerHttpError(500, "worker_internal_error", "Worker request failed.", {
      operation: "probe.run",
      retryable: false,
      diagnosticId: "diag-safe",
      reason: "command failed: full diff @@ -1,2 +1,2 @@",
      prompt: "show raw prompt",
      output: "full command output",
      cause: upstream,
      stack: upstream.stack,
      url: "ws://127.0.0.1:4317/private?token=secret",
    }),
    "req-sensitive",
  );

  const serialized = JSON.stringify(envelope);

  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /ws:\/\/127\.0\.0\.1:4317\/private/);
  assert.doesNotMatch(serialized, /full diff/i);
  assert.doesNotMatch(serialized, /@@ -1,2 \+1,2 @@/);
  assert.doesNotMatch(serialized, /raw prompt/i);
  assert.doesNotMatch(serialized, /full command output/i);
  assert.doesNotMatch(serialized, /secret stack/i);
  assert.equal(envelope.message, "Worker request failed.");
});
