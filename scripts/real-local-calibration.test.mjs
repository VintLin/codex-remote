import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../", import.meta.url).pathname;

test("real local calibration when probing active-turn controls should require active proof before steer", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  const mainBody = source.slice(source.indexOf("async function main()"), source.indexOf("function inspectWorkerEvidence"));
  const controlsBody = source.slice(
    source.indexOf("async function recordActiveTurnControls"),
    source.indexOf("async function request("),
  );

  assert.match(mainBody, /const steerSample = await startSteerSample\(deviceId, projectId\)/);
  assert.match(mainBody, /steerTurnId = steerSample\.turnId/);
  assert.match(mainBody, /steerActiveTurnId = steerTurnId && steerConversationId \? await waitForActiveTurn\(deviceId, steerConversationId, steerTurnId\) : null/);
  assert.match(mainBody, /recordActiveTurnControls\(deviceId, conversationId, \{ interruptTurnId: activeTurnId, steerConversationId, steerTurnId, steerActiveTurnId \}, workerEvidence\)/);
  assert.match(controlsBody, /turnIds\.steerTurnId/);
  assert.match(controlsBody, /turnIds\.steerActiveTurnId/);
  assert.match(controlsBody, /activeTurnProven: true/);
  assert.match(controlsBody, /reasonCode: "active-turn-gap"/);
  assert.match(controlsBody, /"steer-rpc-gap"/);
  assert.match(controlsBody, /turnIds\.interruptTurnId/);
});

test("real local calibration when reading a started conversation should wait for timeline visibility", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  const mainBody = source.slice(source.indexOf("async function main()"), source.indexOf("function inspectWorkerEvidence"));
  const waitBody = source.slice(source.indexOf("async function waitForTimeline"), source.indexOf("async function recordActiveTurnControls"));

  assert.match(mainBody, /const timeline = await waitForTimeline\(deviceId, conversationId\)/);
  assert.match(waitBody, /for \(let attempt = 0; attempt < 10; attempt \+= 1\)/);
  assert.match(waitBody, /await sleep\(250\)/);
});

test("real local calibration should use only safe public steer probes", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  assert.doesNotMatch(source, /thread\/shellCommand|dangerously-bypass|--yolo|rawOutput|commandOutput|processOutput/);
  assert.match(source, /safeSteerPrompt/);
  const prompt = source.match(/const safeSteerSamplePrompt = "([^"]+)"/)?.[1] ?? "";
  assert.equal(prompt, "codex-remote-calibration steer sample: wait ten seconds, then reply with OK.");
  assert.doesNotMatch(prompt, /read|write|file|command|network|environment|env|token|path|output|tool|approval|sandbox|shell|terminal|bash|run|execute/i);
  assert.match(source, /startSteerSample/);
  assert.match(source, /steerConversationId/);
});

test("real local calibration when probing Q23 should use Worker-owned probe evidence", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");
  const mainBody = source.slice(source.indexOf("async function main()"), source.indexOf("function inspectWorkerEvidence"));
  const probeBody = source.slice(source.indexOf("function recordThreadListProbe"), source.indexOf("async function waitForTimeline"));

  assert.match(mainBody, /\/worker\/probe/);
  assert.match(mainBody, /recordThreadListProbe\(workerProbe\)/);
  assert.match(probeBody, /exactCwdListProven/);
  assert.match(probeBody, /completedUntilNextCursorNull/);
  assert.match(probeBody, /cwd_scope_probe_incomplete/);
  assert.match(probeBody, /pagination_probe_incomplete/);
  assert.doesNotMatch(source, /no_control_plane_cwd_scope_probe|no_control_plane_pagination_probe/);
});
