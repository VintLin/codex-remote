import assert from "node:assert/strict";
import test from "node:test";

import { PreconditionMissingError, runReadOnlyProbe, type ReadOnlyProbeClient } from "./readOnlyProbe.ts";

const passingClient: ReadOnlyProbeClient = {
  async readyz() {},
  async initialize() {},
  async initialized() {},
  async listModels() {},
  async listThreads() {
    return {
      exactCwdListProven: true,
      completedUntilNextCursorNull: true,
      pageCount: 1,
      cursorCount: 0,
      count: 1,
    };
  },
  async readFirstAllowedThread() {},
  close() {},
};

const noAllowedThreadClient: ReadOnlyProbeClient = {
  ...passingClient,
  async readFirstAllowedThread() {
    throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
  },
};

test("when no client is supplied, should return env_not_configured", async () => {
  const summary = await runReadOnlyProbe();

  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.failureType, "env_not_configured");
});

test("when read-only checks pass, should mark missing turns list as explicit precondition", async () => {
  const summary = await runReadOnlyProbe({
    client: passingClient,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.appServer.readyz, true);
  assert.equal(summary.checks.some((check) => check.name === "thread/turns/list"), true);
  assert.equal(summary.checks.at(-1)?.failureType, "precondition_missing");
  assert.deepEqual(summary.checks.find((check) => check.name === "thread/list"), {
    name: "thread/list",
    ok: true,
    durationMs: summary.checks.find((check) => check.name === "thread/list")?.durationMs,
    exactCwdListProven: true,
    completedUntilNextCursorNull: true,
    pageCount: 1,
    cursorCount: 0,
    count: 1,
  });
});

test("when no allowed thread exists, should skip thread/read as a precondition", async () => {
  const summary = await runReadOnlyProbe({ client: noAllowedThreadClient });
  const readCheck = summary.checks.find((check) => check.name === "thread/read");

  assert.equal(summary.ok, true);
  assert.equal(readCheck?.failureType, "precondition_missing");
});

test("when a probe check hangs, should time it out with a safe error kind", async () => {
  const summary = await runReadOnlyProbe({
    client: {
      ...passingClient,
      async readyz() {
        await new Promise(() => {});
      },
    },
    checkTimeoutMs: 10,
  });
  const readyzCheck = summary.checks.find((check) => check.name === "readyz");

  assert.equal(summary.ok, false);
  assert.equal(readyzCheck?.failureType, "assertion_failed");
  assert.equal(readyzCheck?.errorKind, "app_server_request_timeout");
});
