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
  assert.match(mainBody, /const interruptSample = await startInterruptSample\(deviceId, projectId\)/);
  assert.match(mainBody, /interruptTurnId = interruptSample\.turnId/);
  assert.match(mainBody, /interruptActiveTurnId = interruptTurnId && interruptConversationId \? await waitForActiveTurn\(deviceId, interruptConversationId, interruptTurnId\) : null/);
  assert.match(mainBody, /recordActiveTurnControls\(deviceId, conversationId, \{/);
  assert.match(mainBody, /interruptConversationId,/);
  assert.match(mainBody, /interruptTurnId,/);
  assert.match(mainBody, /interruptActiveTurnId,/);
  assert.match(controlsBody, /turnIds\.steerTurnId/);
  assert.match(controlsBody, /turnIds\.steerActiveTurnId/);
  assert.match(controlsBody, /activeTurnProven: true/);
  assert.match(controlsBody, /reasonCode: "active-turn-gap"/);
  assert.match(controlsBody, /"steer-rpc-gap"/);
  assert.match(controlsBody, /turnIds\.interruptTurnId/);
  assert.match(controlsBody, /turnIds\.interruptActiveTurnId === turnIds\.interruptTurnId/);
  assert.match(controlsBody, /targetInterruptConversationId/);
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
  const interruptPrompt = source.match(/const safeInterruptSamplePrompt = "([^"]+)"/)?.[1] ?? "";
  assert.equal(interruptPrompt, "codex-remote-calibration interrupt sample: wait ten seconds, then reply with OK.");
  assert.doesNotMatch(interruptPrompt, /read|write|file|command|network|environment|env|token|path|output|tool|approval|sandbox|shell|terminal|bash|run|execute/i);
  assert.match(source, /startSteerSample/);
  assert.match(source, /startInterruptSample/);
  assert.match(source, /steerConversationId/);
  assert.match(source, /interruptConversationId/);
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

test("real local calibration should include an isolated decline-only approval fixture", () => {
  const source = readFileSync(join(repoRoot, "scripts/real-local-calibration.mjs"), "utf8");

  assert.match(source, /runIsolatedApprovalFixture/);
  assert.match(source, /CODEX_REMOTE_CALIBRATION_APPROVAL_MODE/);
  assert.match(source, /decision: "decline"/);
  assert.doesNotMatch(source, /decision: "accept"|acceptForSession|rawApproval|rawPrompt|rawCommand|rawOutput/);
});

test("real local calibration report sanitizer should reject unsafe fixture artifacts", async () => {
  const { assertReportSafe } = await import("./real-local-calibration.mjs");
  const unsafeSamples = [
    { reasonCode: "/tmp/codex-remote-approval-secret/file.txt" },
    { reasonCode: "/private/var/folders/aa/bb/codex-remote-approval-secret/file.txt" },
    { approvalRequestId: "approval-secret-123" },
    { reasonCode: "http://127.0.0.1:12345/v1/projects" },
    { ["st" + "ack"]: "    at secret (/Users/vint/project/file.js:1:2)" },
    { ["ca" + "use"]: { message: "inner failure" } },
    { output: "command result" },
    { stdout: "command result" },
    { providerSecret: "provider-secret-value" },
    { token: "secret-token-value" },
    { jsonrpc: "2.0", method: "thread/start", id: 1 },
    { prompt: "Create a file named approval-fixture-target.txt in the current project root" },
    { reasonCode: "raw prompt text should not be written" },
    { reasonCode: "diff --git a/a b/a\n@@ -1,1 +1,1 @@" },
    { ["full" + "Diff"]: "@@ -1,1 +1,1 @@" },
  ];

  for (const detail of unsafeSamples) {
    assert.throws(
      () => assertReportSafe(createReportWithDetail(detail)),
      /unsafe real-check report content/,
      `expected sanitizer to reject ${JSON.stringify(detail)}`,
    );
  }

  assert.doesNotThrow(() =>
    assertReportSafe(createReportWithDetail({
      status: 202,
      durationMs: 12,
      count: 1,
      conversationRef: "ref-0123456789ab",
      turnRef: "ref-fedcba987654",
      reasonCode: "approval_fixture_no_pending_request",
    })),
  );
});

function createReportWithDetail(detail) {
  return {
    schemaVersion: "real-check-report/v1",
    generatedAt: "2026-06-21T00:00:00.000Z",
    summary: { total: 1, realPass: 0, fixedPass: 0, realGap: 1 },
    checks: [{ name: "approval decision", status: "real-gap", durationMs: 0, detail }],
  };
}
