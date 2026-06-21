# Conversation Workbench Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Stage 11 around the agreed Codex App-like workbench shape: composer-centered start/follow-up/interrupt/steer/queue, app-like timeline content, archived conversations in Settings, protocol-derived permission UI, and assistant message action rows.

**Architecture:** `packages/api-contract/openapi.yaml` remains the public API source. `apps/worker` is the only Codex app-server/local adapter. `apps/control-plane` owns routing and product state such as queued messages. `apps/web` consumes only Control Plane-shaped APIs and presents the Codex App-like workbench.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner, Playwright/Chrome verification.

## Global Constraints

- API fields start in `packages/api-contract/openapi.yaml`; generated types update only through `pnpm --filter @codex-remote/api-contract generate`.
- Codex app-server protocol shapes come only from `packages/codex-protocol`.
- DB schema changes are allowed only if the current Stage 11 queue/settings state requires durable Control Plane product state.
- `apps/worker` is the only app-server/local filesystem/Git/shell boundary.
- `apps/control-plane` does not call app-server directly.
- `apps/web` imports only public API contract types, never `packages/codex-protocol`.
- Do not expose token, provider secret, raw app-server URL, raw JSON-RPC, raw prompt, command output, full diff, stack/cause, or private path.
- Do not implement rollback, raw `inject_items`, arbitrary shell/filesystem write, plugin install, account login/logout, realtime voice, Windows setup, feedback upload, or external agent import.
- Preserve confirmed UI placeholders; do not remove known future controls just because they are not implemented yet.
- Unsupported placeholders must be disabled or visibly non-destructive, with implementation TODO comments when code is touched.
- Required input: `docs/references/2026-06-21-app-server-protocol-inventory.md`.

---

## Task 0: Reconcile Existing WIP Against The Active Spec

**Files:**
- Inspect: `apps/web/src/components/conversation/codex-assistant-thread.tsx`
- Inspect: `apps/web/src/data/workerApi/workbenchData.ts`
- Inspect: `apps/worker/src/http/projections.ts`
- Inspect: `apps/worker/src/http/readOnlyHandlers.ts`
- Inspect: `packages/api-contract/openapi.yaml`
- Inspect: `docs/references/2026-06-21-feature-support-ui-audit.md`
- Inspect: `docs/references/2026-06-21-app-server-protocol-inventory.md`

**Interfaces:**
- Consumes the active spec and current dirty worktree.
- Produces a short implementation note in the plan status section before code continues.

- [x] Identify which existing dirty changes are reusable, unsafe, or obsolete.
- [x] Compare every dirty app-server-derived field against the protocol inventory.
- [x] Keep reusable protocol/API work only when it matches the active spec.
- [ ] Remove or replace unsafe draft behavior made by the agent, especially metadata-only/timeline and debug-strip UI paths, without reverting unrelated user changes.
- [x] Record the reconciliation result in `PLAN.md` before claiming implementation progress.

Task 0 result:

- `packages/api-contract/openapi.yaml`: keep the `ConversationTimelineNode` direction, but do not accept the draft as complete. Add `Turn.itemsView` / partial snapshot state, generated types, and contract tests before implementation proceeds.
- `apps/worker/src/http/projections.ts`: keep the idea of projecting `ThreadItem` into public nodes, but rewrite projection around explicit safe helpers and tests. Raw command, cwd, output, diff, MCP arguments/results, collab prompt, image path, raw reasoning, stack/cause, token, JSON-RPC, and app-server URL must not leave Worker.
- `apps/web/src/data/workerApi/workbenchData.ts`: replace guessed tool mapping. Web must render public node kind/status and must not map unknown/command/image tools into file-change UI.
- `apps/web/src/components/conversation/codex-assistant-thread.tsx`: keep permission and interrupt UI surfaces, but permission labels remain placeholders and must not change request behavior until a public permission model exists.
- `apps/worker/src/http/readOnlyHandlers.ts`: `local-project` can remain as current one-project boundary, with multi-project discovery deferred.

## Task 1: Public Contract For App-Like Workbench State

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Generate: `packages/api-contract/src/generated/openapi.ts`
- Test: `packages/api-contract/src/*.test.ts`

**Interfaces:**
- Produces public types for safe timeline nodes, request cards, archived conversation listing, queued composer messages, and message action capabilities.

- [ ] Add failing contract tests for app-like timeline content nodes with redaction-safe fields.
- [ ] Add failing contract tests for partial timeline state derived from `Turn.itemsView`.
- [ ] Add failing contract tests for archived-conversation listing separate from normal conversation list semantics.
- [ ] Add failing contract tests for queued message state: queued, sending, sent, failed, canceled.
- [ ] Add failing contract tests for message action capability flags: copy, feedback placeholder, fork placeholder, hooks placeholder, timestamp.
- [ ] Update OpenAPI from those tests, then regenerate generated types.
- [ ] Run `pnpm --filter @codex-remote/api-contract test`.

## Task 2: Worker Projection And Lifecycle Boundaries

**Files:**
- Modify: `apps/worker/src/http/projections.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/controlHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Test: `apps/worker/src/http/*.test.ts`

**Interfaces:**
- Consumes generated app-server protocol through `packages/codex-protocol`.
- Produces safe public conversation/timeline/lifecycle responses.

- [ ] Add failing Worker tests proving user/assistant timeline content is projected safely.
- [ ] Add failing Worker tests proving tool/request summaries never include raw command output, full diff, private paths, raw JSON-RPC, stack/cause, token, provider secret, or app-server URL.
- [ ] Add failing Worker tests proving conversations include the allowed project association when they belong to the allowed project.
- [ ] Add failing Worker tests proving archived conversations can be fetched for Settings while normal list filtering can exclude them.
- [ ] Implement only the projection and lifecycle behavior needed by those tests.
- [ ] Run `pnpm --filter @codex-remote/worker test`.

## Task 3: Control Plane Product State

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `packages/db/*` only if durable queue/settings state is required by the chosen implementation.
- Test: `apps/control-plane/src/**/*.test.ts`

**Interfaces:**
- Consumes Worker public API.
- Produces Control Plane-shaped APIs for normal conversation list, archived conversations, lifecycle actions, and queued running-turn messages.

- [ ] Add failing tests for normal conversation list excluding archived conversations.
- [ ] Add failing tests for Settings archived conversation list and restore.
- [ ] Add failing tests for queue-after-current behavior when a conversation has an active turn.
- [ ] Add failing tests for queue cancellation/failure state with sanitized errors.
- [ ] Implement routing/state with the least durable store that satisfies multi-device/self-hosted requirements for this stage.
- [ ] Run `pnpm --filter @codex-remote/control-plane test`.

## Task 4: Web Workbench UI Repair

**Files:**
- Modify: `apps/web/src/components/conversation/codex-assistant-thread.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/sidebar/sidebar.tsx`
- Modify: `apps/web/src/components/sidebar/action-menu.tsx`
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/**/*.test.ts`
- Test: `apps/web/e2e/*.spec.ts`

**Interfaces:**
- Consumes public Control Plane-shaped APIs only.
- Produces the app-like browser workbench.

- [x] Add failing tests proving selecting a conversation opens and displays its content without pressing a separate Start button.
- [x] Add failing tests proving start/follow-up share the composer.
- [x] Add failing tests proving running composer exposes interrupt plus steer-now/queue-later choice.
- [x] Add failing tests proving archived rows disappear from the normal sidebar and appear under Settings -> 已归档对话.
- [x] Add failing tests proving request cards render in the timeline/workbench flow.
- [x] Add failing tests proving assistant messages show copy, thumbs up, thumbs down, fork, hooks, and timestamp action row; only copy/timestamp are enabled unless public routes exist.
- [x] Add failing tests proving permission menu UI remains present but does not send unconfirmed approval/sandbox behavior.
- [x] Implement UI repair from the tests, preserving confirmed placeholders.
- [x] Run `pnpm --filter @codex-remote/web test`.

## Task 5: Protocol-Derived Permission Menu Spec Detail

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-conversation-workbench-parity-design.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: Web tests only if behavior is enabled in this stage.

**Interfaces:**
- Consumes generated protocol fields: `approvalPolicy`, `approvalsReviewer`, `sandboxPolicy`, `permissionProfile/list`, and `item/permissions/requestApproval`.
- Produces exact product labels and enabled/disabled behavior.

- [ ] Document which current UI labels map to which protocol fields.
- [ ] Keep labels as placeholders if mapping is not verified.
- [ ] Do not send new permission fields from Web until tests prove the full Web -> Control Plane -> Worker -> app-server path.

## Task 6: Verification And Stage Closure

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md`
- Modify: `docs/references/2026-06-21-feature-support-ui-audit.md` if findings change.

**Interfaces:**
- Consumes implementation evidence.
- Produces route/status updates and verification record.

- [ ] Run focused checks:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/web test
```

- [x] Run full checks:

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [x] Run real stack checks:

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
```

- [x] Use Chrome to verify every Stage 11 feature, boundary state, degraded state, and no-sensitive-leak condition from the spec.
- [x] Update `PLAN.md`, `FEATURE_SUPPORT.md`, and `CODEX_APP_PARITY.md` with real results.
- [ ] Archive the completed spec/plan only after all automated and Chrome verification gates pass.

## Current Stage Status

- Active spec and plan have been rewritten from the 2026-06-21 consensus.
- Previous pre-consensus Stage 11 spec/plan are archived and must not be used as completion evidence.
- Stage 11A app-server output calibration has completed the docs-only reconciliation pass.
- Stage 11A contract/projection cleanup has started:
  - `ConversationTimelineTurn` now carries `itemsView` and public `nodes`.
  - Public tool node `kind` includes neutral/non-file variants so Web no longer maps unknown tools into file-change UI.
  - Worker projection now exposes safe user/assistant text and neutral tool/request summaries while redacting raw command, cwd, output, diff, MCP arguments/results, collab prompt, image path, raw reasoning, tokens, JSON-RPC, and app-server URLs.
  - Control Plane parser now validates/pass-through timeline nodes instead of dropping them.
- Current dirty code changes have completed the first UI repair pass for composer controls, archived Settings, message action row, and permission placeholders.
- Stage 11 completion is blocked on final review and optional archival.
- UI repair pass after subagent REQUEST CHANGES:
  - Web no longer falls back from Control Plane env vars to Worker env vars.
  - Normal sidebar filters archived conversations; Settings -> 已归档对话 lists archived conversations and calls restore.
  - Composer owns start/follow-up/interrupt/steer, with queue-later implemented as a local queue; durable Control Plane queue state is deferred.
  - Permission menu remains visible but options are disabled TODO placeholders.
  - Assistant messages render action rows with copy enabled and feedback/fork/hooks placeholders disabled.
  - Web carries `itemsView` into `AssistantTimelineTurn`.
  - Focused web tests and typecheck pass.
- Real stack evidence after UI repair:
  - `pnpm real:status` shows Worker, Control Plane, and Web listening on `127.0.0.1:8787`, `127.0.0.1:8786`, and `127.0.0.1:5173`.
  - `pnpm real:check` reports `real-pass=18`, `real-gap=1`; the remaining gap is approval decision because the safe fixture has no pending request.
  - `pnpm web:e2e:smoke` passes against the real local stack, loads real Control Plane data, starts a conversation from the composer, and sends follow-up through the composer.
  - Web projection now tolerates real timeline turns that omit `nodes` / `itemsView` and keeps the datasource loaded.
- Full verification after UI repair:
  - `pnpm product:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Browser verification after UI repair:
  - Desktop workbench, Settings archived list, and mobile sidebar were checked with Chromium.
  - No non-loopback browser requests were observed.
  - Screenshots: `logs/stage11-browser-check/desktop-workbench.png`, `logs/stage11-browser-check/settings-archived.png`, `logs/stage11-browser-check/mobile-workbench.png`.
  - Note: local Next dev overlay appears in screenshots and is not app UI.

Focused verification for Stage 11A contract/projection cleanup:

- `pnpm --filter @codex-remote/api-contract test`
- `pnpm --filter @codex-remote/api-contract typecheck`
- `pnpm --filter @codex-remote/worker typecheck`
- `pnpm --filter @codex-remote/worker test -- --test-name-pattern projections`
- `pnpm --filter @codex-remote/control-plane typecheck`
- `pnpm --filter @codex-remote/control-plane test -- --test-name-pattern "worker client|conversation timeline|lifecycle"`
- `pnpm --filter @codex-remote/web typecheck`
- `pnpm --filter @codex-remote/web test -- --test-name-pattern "workbenchData|fake Worker smoke server|assistantTimeline|CodexAssistant"`
