import assert from "node:assert/strict";
import test from "node:test";

import { runReadOnlyProbe } from "./readOnlyProbe.ts";

test("when read-only probe has no app-server client, should return env_not_configured", async () => {
  const summary = await runReadOnlyProbe();

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.mode, "readOnly");
  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.failureType, "env_not_configured");
});
