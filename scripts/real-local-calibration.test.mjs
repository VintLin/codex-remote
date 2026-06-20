import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../", import.meta.url).pathname;

test("real local calibration when probing active-turn controls should use independent steer and interrupt samples", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  const mainBody = source.slice(source.indexOf("async function main()"), source.indexOf("function inspectWorkerEvidence"));
  const controlsBody = source.slice(
    source.indexOf("async function recordActiveTurnControls"),
    source.indexOf("async function request("),
  );

  assert.match(mainBody, /steerTurnId = followUp\.status === 202 \? firstString\(followUp\.value\?\.turnId\) : null/);
  assert.match(mainBody, /recordActiveTurnControls\(deviceId, conversationId, \{ interruptTurnId: activeTurnId, steerTurnId \}, workerEvidence\)/);
  assert.match(controlsBody, /turnIds\.steerTurnId/);
  assert.match(controlsBody, /turnIds\.interruptTurnId/);
  assert.ok(controlsBody.indexOf("turnIds.steerTurnId") < controlsBody.indexOf("turnIds.interruptTurnId"));
});

test("real local calibration when reading a started conversation should wait for timeline visibility", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  const mainBody = source.slice(source.indexOf("async function main()"), source.indexOf("function inspectWorkerEvidence"));
  const waitBody = source.slice(source.indexOf("async function waitForTimeline"), source.indexOf("async function recordActiveTurnControls"));

  assert.match(mainBody, /const timeline = await waitForTimeline\(deviceId, conversationId\)/);
  assert.match(waitBody, /for \(let attempt = 0; attempt < 10; attempt \+= 1\)/);
  assert.match(waitBody, /await sleep\(250\)/);
});
