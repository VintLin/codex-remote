# Isolated Approval Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `approval decision` real-check evidence pass through a temporary isolated real Codex approval fixture without broadening product approval behavior.

**Architecture:** Keep public APIs unchanged. Add a Worker runtime-only calibration flag that makes write calls include generated-protocol approval/sandbox fields, then let `real-local-calibration.mjs` spin up a short-lived isolated Worker and Control Plane only when the main real stack has no safe pending approval.

**Tech Stack:** TypeScript, Node scripts, pnpm, Hono, OpenAPI-derived public types, generated `packages/codex-protocol` app-server types.

## Global Constraints

- `packages/api-contract/openapi.yaml` remains the public API source of truth.
- `packages/codex-protocol` generated types remain the app-server protocol source of truth.
- `apps/worker` remains the only app-server caller.
- No OpenAPI schema change for this stage.
- No automatic approval `accept`, `acceptForSession`, persistent policy amendment, or production approval safety model.
- No raw prompt, command output, raw JSON-RPC, raw ids, raw URLs, stack/cause, token, provider secret, or private path in reports or tracked docs.
- Fixture project roots use the OS temp directory outside this repository and are removed in `finally`; fixture root strings never enter reports.

---

## Task 1: Add Worker Calibration Approval Runtime Flag

**Files:**
- Modify: `apps/worker/src/http/workerHttpConfig.ts`
- Modify: `apps/worker/src/http/workerHttpConfig.test.ts`
- Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/writeHandlers.test.ts`

**Interfaces:**
- Produces `WorkerHttpConfig.calibrationApprovalMode: "on-request" | null`.
- Consumes env `CODEX_REMOTE_CALIBRATION_APPROVAL_MODE`.
- `writeHandlers.ts` uses `v2.ThreadStartParams`, `v2.TurnStartParams`, and generated protocol values only, including explicit `approvalsReviewer: "user"` for calibration runs.

- [x] **Step 1: Add failing config test**

In `apps/worker/src/http/workerHttpConfig.test.ts`, add a test that valid config with `CODEX_REMOTE_CALIBRATION_APPROVAL_MODE=on-request` returns `calibrationApprovalMode: "on-request"` and any other non-empty value throws `worker_config_invalid`.

Run:

```bash
pnpm --filter @codex-remote/worker exec node --test src/http/workerHttpConfig.test.ts
```

Expected: FAIL because the config field does not exist.

- [x] **Step 2: Parse the runtime flag**

Add `calibrationApprovalMode` to `WorkerHttpConfigInput` and `WorkerHttpConfig`, parse only `undefined` or `"on-request"`, and reject blank/unknown values.

- [x] **Step 3: Add failing write handler test**

In `apps/worker/src/http/writeHandlers.test.ts`, add a test for `startConversation` with `calibrationApprovalMode: "on-request"` asserting the fake client receives values assigned through generated protocol types:

```ts
const expectedThreadParams = {
  approvalPolicy: "on-request",
  approvalsReviewer: "user",
  sandbox: "read-only",
} satisfies Pick<v2.ThreadStartParams, "approvalPolicy" | "approvalsReviewer" | "sandbox">;

const expectedTurnParams = {
  approvalPolicy: "on-request",
  approvalsReviewer: "user",
  sandboxPolicy: {
    type: "readOnly",
    networkAccess: false,
  },
} satisfies Pick<v2.TurnStartParams, "approvalPolicy" | "approvalsReviewer" | "sandboxPolicy">;
```

The fake client assertions should compare against `expectedThreadParams` and `expectedTurnParams`, not duplicate untyped objects.

Run:

```bash
pnpm --filter @codex-remote/worker exec node --test src/http/writeHandlers.test.ts
```

Expected: FAIL because write calls do not include the calibration fields.

- [x] **Step 4: Add minimal write mapping**

In `apps/worker/src/http/writeHandlers.ts`, if `context.config.calibrationApprovalMode === "on-request"`, add helper functions whose return values are typed with generated protocol aliases:

```ts
function getCalibrationThreadStartOverrides(context: WorkerWriteHandlerContext): Pick<v2.ThreadStartParams, "approvalPolicy" | "approvalsReviewer" | "sandbox"> {
  if (context.config.calibrationApprovalMode !== "on-request") {
    return {};
  }
  return { approvalPolicy: "on-request", approvalsReviewer: "user", sandbox: "read-only" };
}

function getCalibrationTurnStartOverrides(context: WorkerWriteHandlerContext): Pick<v2.TurnStartParams, "approvalPolicy" | "approvalsReviewer" | "sandboxPolicy"> {
  if (context.config.calibrationApprovalMode !== "on-request") {
    return {};
  }
  return {
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandboxPolicy: {
      type: "readOnly",
      networkAccess: false,
    },
  };
}
```

Spread those helpers into `thread/start` and `turn/start`. Leave the normal path unchanged.

- [x] **Step 5: Verify Worker focused tests**

Run:

```bash
pnpm --filter @codex-remote/worker exec node --test src/http/workerHttpConfig.test.ts src/http/writeHandlers.test.ts
pnpm --filter @codex-remote/worker typecheck
```

Expected: PASS.

---

## Task 2: Add Isolated Approval Fixture To Real Check

**Files:**
- Modify: `scripts/real-local-calibration.mjs`
- Modify: `scripts/real-local-calibration.test.mjs`

**Interfaces:**
- Produces internal function `runIsolatedApprovalFixture(): Promise<{ status: "real-pass" | "real-gap"; detail: Record<string, unknown> }>`
- Uses existing `request()` helper shape for sanitized HTTP calls.
- Reuses existing `record("approval decision", ...)` report name.

- [x] **Step 1: Add failing script guard test**

In `scripts/real-local-calibration.test.mjs`, add assertions that the script:

```js
assert.match(source, /runIsolatedApprovalFixture/);
assert.match(source, /CODEX_REMOTE_CALIBRATION_APPROVAL_MODE/);
assert.match(source, /decision: "decline"/);
assert.doesNotMatch(source, /decision: "accept"|acceptForSession|rawApproval|rawPrompt|rawCommand|rawOutput/);
```

Run:

```bash
node --test scripts/real-local-calibration.test.mjs
```

Expected: FAIL because the fixture does not exist.

- [x] **Step 2: Start isolated fixture processes**

In `scripts/real-local-calibration.mjs`, add `runIsolatedApprovalFixture()` that:

- creates a fixture root with `mkdtemp(join(tmpdir(), "codex-remote-approval-"))`;
- finds free loopback Worker and Control Plane ports with existing stdlib `net` helper style;
- spawns Worker with `CODEX_REMOTE_ALLOWED_PROJECT_ROOT=<fixtureRoot>`, `CODEX_REMOTE_CALIBRATION_APPROVAL_MODE=on-request`, `CODEX_REMOTE_START_APP_SERVER=true`, and `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio`;
- spawns Control Plane pointed at that Worker;
- never writes raw process output into reports.
- stops both processes and removes the fixture root in `finally`.

- [x] **Step 3: Drive decline through public Control Plane routes**

In `runIsolatedApprovalFixture()`:

- call fixture `/v1/projects` to get the opaque project id;
- call fixture `POST /v1/devices/{deviceId}/conversations` with a calibration instruction that asks for one harmless stdout-only shell command under the temporary root;
- poll fixture approval list for a bounded number of attempts;
- record `approval_fixture_approval_list_failed` immediately when the approval list route returns a non-2xx response or the sanitized request fails before an HTTP response is available;
- record `approval_fixture_malformed_response` immediately when the approval list route response parses but does not match the expected Control Plane approval list shape;
- record `approval_fixture_no_pending_request` only when the bounded poll exhausts valid empty approval list responses;
- record `approval_fixture_process_failed` when either fixture process exits or errors before the decision completes;
- record `approval_fixture_timeout` when the request or poll deadline is exceeded;
- accept only public approval kinds `file_change`, `command_execution`, `legacy_apply_patch`, or `legacy_exec`;
- send `decision: "decline"` to the existing approval decision route;
- verify the fixture target file does not exist after decline, proving the decline-only path did not leave the known fixture side effect;
- record only status, sanitized code, count, `conversationRef`, and `turnRef`;
- stop fixture processes in `finally`.

Use these sanitized reason codes:

- `approval_fixture_start_not_accepted`
- `approval_fixture_approval_list_failed`
- `approval_fixture_malformed_response`
- `approval_fixture_no_pending_request`
- `approval_fixture_unexpected_kind`
- `approval_fixture_decline_not_accepted`
- `approval_fixture_side_effect_remained`
- `approval_fixture_timeout`
- `approval_fixture_process_failed`

- [x] **Step 4: Wire the fallback into approval decision**

In the existing approval decision branch, when the normal approval list is empty, call `runIsolatedApprovalFixture()` instead of immediately recording `no_safe_pending_approval`. Preserve `real-gap` if the fixture cannot produce a safe pending approval.

- [x] **Step 5: Verify script tests**

Run:

```bash
node --test scripts/real-local-calibration.test.mjs
```

Expected: PASS.

- [x] **Step 6: Add report artifact leak assertion**

In `scripts/real-local-calibration.test.mjs`, add a small report sanitizer test with an in-memory sample detail object or local temp report string proving the allowlist rejects fixture-root-like paths, raw ids, raw URLs, stack/cause, output-shaped keys, token/provider-secret shaped values, raw JSON-RPC frame fields such as `jsonrpc`/`method`/`id`, prompt-shaped keys or text, diff hunk markers, and `fullDiff`-shaped fields. Keep it script-level and stdlib-only.

---

## Task 3: Stage Status, Real Verification, And Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `QUESTIONS.md`
- Modify: `docs/references/questions/SYNTHESIS.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/superpowers/plans/2026-06-21-isolated-approval-fixture.md`

**Interfaces:**
- `logs/real-check/latest.json` should move `approval decision` from `real-gap` to `real-pass` if the fixture succeeds.
- If the fixture cannot safely trigger approval, leave `real-gap` and document the exact sanitized blocker.

- [x] **Step 1: Run real verification**

Run:

```bash
pnpm real:start
pnpm real:check
pnpm real:status
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected if fixture succeeds: `logs/real-check/latest.json` has `approval decision` as `real-pass`.

Actual current result: `pnpm real:start`, `pnpm real:check`, `pnpm real:status`, and `pnpm web:e2e:smoke` ran. `logs/real-check/latest.json` currently records `total=19 realPass=18 fixedPass=0 realGap=1`; `approval decision` remains `real-gap` with `reasonCode=approval_fixture_no_pending_request`. The fixture instruction was narrowed from harmless file creation to a harmless stdout-only command probe, and calibration write calls now include generated-protocol `approvalsReviewer: "user"`. Interrupt now records `real-pass` with `activeTurnProven=true` after switching to an independent interrupt-only sample.

After the command, inspect `logs/real-check/latest.json` and assert it does not contain:

- the fixture temp root string;
- `http://127.0.0.1:` fixture upstream URLs;
- raw approval ids or turn ids;
- raw prompt text;
- command output;
- `stack` or `cause`.

- [x] **Step 2: Run full gates**

Run:

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

Actual result: PASS for `pnpm product:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

- [x] **Step 3: Verify in Google Chrome**

Open `http://127.0.0.1:5173/` in Google Chrome against the real stack and confirm:

- real Control Plane state loads;
- start/follow-up controls remain available;
- no raw prompt, private path, raw Worker URL, token, stack/cause, raw JSON-RPC, command output, or fake readiness claim appears.

Actual result: Chrome-channel Playwright verification loaded `http://127.0.0.1:5173/` with title `Codex Remote`, real local Control Plane content, two inputs, and no forbidden text matches for bearer tokens, raw Worker URLs, private paths, JSON-RPC, command output, diffs, stack/cause, fake/mock readiness, or fixture prompt text. The Chrome extension control path was unavailable due a tool-layer sandbox metadata error, so verification used Google Chrome via Playwright `channel: "chrome"`.

- [x] **Step 4: Update docs and commit**

Actual result: docs updated with the `18/1` real-check result, interrupt fix, and approval decision safety gap. Commit message adjusted to avoid claiming approval decision is proven while it remains a real gap.

---

## Subagent Review Record

- Reviewer `019ee64e-74af-79b0-8dc7-7f732155d598`: needs changes. Fixed approval-list route failure diagnosis so route failures cannot be recorded as no pending approvals.
- Reviewer `019ee650-3b80-74b1-9110-8548c57e034b`: needs changes. Fixed malformed response diagnosis and expanded report leak test requirements to include token/provider secret shapes, raw JSON-RPC, raw prompt, and full diff shapes.
- Reviewer `019ee651-d412-7301-99f1-a3b20f3bc561`: clean. Confirmed polling failure taxonomy, report artifact denylist, source-of-truth boundaries, Worker-only app-server boundary, OS temp fixture cleanup, and decline-first decision rule.
- Task 1 reviewer `019ee657-bcd1-7f02-84da-70bc98a38387`: clean. Confirmed required `calibrationApprovalMode` config, generated-protocol overrides, no public API change, and no leak regressions. Noted follow-up also receives the runtime write-call override; Task 2 should use a new fixture conversation.
- Task 2 reviewer `019ee65f-d173-7b10-a37b-372d3fd222ee`: errored due external usage limit before review output. Local follow-up review found and fixed a product-readiness source-scan failure caused by forbidden report-key literals in sanitizer tests; `pnpm product:check` and script/product focused tests pass after replacing those literals with dynamically constructed keys.
- Real verification follow-up: workspace-write/on-request, read-only/on-request, read-only/untrusted, stdout-only command probing, and explicit `approvalsReviewer: "user"` were tried within the focused fix budget. The retained implementation is read-only/on-request with user-routed approvals; current app-server behavior still does not emit a pending approval for the safe fixture prompt within the bounded polling window. The next safe evidence source is a trusted project-local rules layer or equivalent app-server-supported rules injection; do not modify user `~/.codex/rules` automatically or copy auth into a temporary Codex home.
