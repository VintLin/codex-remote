# Controlled Local Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first controlled local action slice: explicit review-start for uncommitted changes through Web -> Control Plane -> Worker -> Codex app-server.

**Architecture:** Public API starts in `packages/api-contract/openapi.yaml`. Control Plane only routes configured device requests. Worker validates project/conversation boundaries and sends generated app-server requests; Web only calls Control Plane-shaped APIs.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner, Playwright/Chrome verification.

## Global Constraints

- No DB changes in the first Stage 13 slice.
- No raw app-server proxy.
- No `thread/shellCommand`, `command/exec`, PTY, stdin/write/resize/terminate, raw terminal stream, raw command output, or command history.
- No filesystem write/create/remove/copy/watch.
- No Git stage/unstage/revert, skill config write, plugin install, MCP tool call/OAuth/reload, account/config/model writes.
- Worker is the only app-server, filesystem, Git, shell, MCP, plugin, and auth caller.
- Web imports only public API types from `@codex-remote/api-contract`.
- Public responses must not include raw command output, full diff, raw JSON-RPC, app-server URL, stack/cause, token, provider secret, private path, or prompt.

---

## Planned Files

- Modify `packages/api-contract/openapi.yaml`: add one Stage 13 POST route and request schema.
- Modify `packages/api-contract/src/index.ts`: export generated public types.
- Generate `packages/api-contract/src/generated/openapi.ts`.
- Modify `packages/api-contract/src/contractGeneration.test.ts`: route and leak-field checks.
- Create `apps/worker/src/http/localActionHandlers.ts`: review-start handler.
- Modify `apps/worker/src/http/controlHandlers.ts` only if existing conversation allowlist helper must be exported.
- Modify `apps/worker/src/http/workerHttpApp.ts`: mount Worker local action routes.
- Modify `apps/worker/src/app-server/appServerRpcClient.ts`: whitelist `review/start`.
- Modify `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`: add typed app-server methods if no write client exists yet.
- Add `apps/worker/src/http/localActionHandlers.test.ts`.
- Modify `apps/worker/src/cli/readOnlyHttpServerCli.ts` and `.test.ts`: forward new app-server methods in the local CLI harness.
- Modify `apps/control-plane/src/client/workerClient.ts` and `.test.ts`: add device-scoped client calls.
- Modify `apps/control-plane/src/http/controlPlaneHttpApp.ts` and `.test.ts`: add routes.
- Modify `apps/web/src/data/workerApi/client.ts` and `.test.ts`: add Web API client methods.
- Modify `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts` and `.test.ts`: keep smoke server contract aligned.
- Modify `apps/web/src/components/detail/main-panels.tsx`, `apps/web/src/components/shell/codex-remote-app.tsx`, and `apps/web/src/app/globals.css`: minimal confirmed review-start UI.
- Add/modify Web tests under `apps/web/src/components/shell/` or `apps/web/src/data/workerApi/`.
- Modify `PLAN.md`, `FEATURE_SUPPORT.md`, and `CODEX_APP_PARITY.md` only at closure.

## Task 1: Public Contract

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`
- Modify: `packages/api-contract/src/index.ts`
- Generate: `packages/api-contract/src/generated/openapi.ts`

**Interfaces:**
- Produces `StartReviewInput` and reused `CommandAccepted`.
- Produces:
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/local-actions/review-start`

- [ ] Add failing contract tests proving the route exists, is `POST`, requires `projectId`, `expectedConversationId`, `clientRequestId`, and returns `CommandAccepted`.
- [ ] Add failing leak-field test proving new schemas do not contain `rawOutput`, `stdout`, `stderr`, `fullDiff`, `jsonRpc`, `appServerUrl`, `stack`, `cause`, `token`, `secret`, `absolutePath`, or `cwd`.
- [ ] Add `StartReviewInput` with `projectId`, `expectedConversationId`, `clientRequestId`, and `confirmationText`.
- [ ] Add tests proving no public schema exposes app-server `ReviewTarget`, `baseBranch`, `commit`, `custom`, or shell-command input.
- [ ] Add route responses for `202`, `400`, `401`, `404`, `424`, and `500` using existing public shapes.
- [ ] Run `pnpm --filter @codex-remote/api-contract generate`.
- [ ] Export new aliases from `packages/api-contract/src/index.ts`.
- [ ] Run `pnpm --filter @codex-remote/api-contract test`.
- [ ] Commit contract slice.

## Task 2: Worker Local Action Handlers

**Files:**
- Create: `apps/worker/src/http/localActionHandlers.ts`
- Modify: `apps/worker/src/http/controlHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.ts`
- Test: `apps/worker/src/http/localActionHandlers.test.ts`
- Test: `apps/worker/src/cli/readOnlyHttpServerCli.test.ts`

**Interfaces:**
- Consumes public inputs from Task 1.
- Produces `startLocalReview(context, conversationId, input)`.

- [ ] Add failing tests that missing confirmation, wrong confirmation, mismatched `expectedConversationId`, and mismatched `projectId` are rejected before app-server calls.
- [ ] Add failing tests that forbidden conversations are rejected before app-server calls.
- [ ] Add failing tests that successful review start calls app-server `review/start` with `{ threadId, target: { type: "uncommittedChanges" } }` and no public-provided target.
- [ ] Add failing tests proving base-branch, commit, custom review, `thread/shellCommand`, and `command/exec` are not reachable from this handler.
- [ ] Add failing tests that thrown upstream errors become sanitized `ErrorEnvelope` without command text, URLs, stack, cause, local paths, or raw diff.
- [ ] Implement the smallest handler module with one exported function and local validation constants.
- [ ] Mount only the one `POST` route in `workerHttpApp.ts`.
- [ ] Add app-server RPC method whitelist entry for `review/start`.
- [ ] Forward the review-start method through the CLI harness used by tests.
- [ ] Run `pnpm --filter @codex-remote/worker test`.
- [ ] Commit Worker slice.

## Task 3: Control Plane Routing

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/client/workerClient.test.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`

**Interfaces:**
- Consumes Worker routes from Task 2.
- Produces `startReview(device, conversationId, input)` on the configured Worker client.

- [ ] Add failing Worker client tests for the device-scoped URL and request body.
- [ ] Add failing Control Plane HTTP tests proving the route calls only the selected configured device.
- [ ] Add failing tests for unknown device and upstream failure using sanitized `404` / `424` responses.
- [ ] Add stale-context tests for mismatched `expectedConversationId` and `projectId`.
- [ ] Implement the client method and Control Plane route.
- [ ] Run `pnpm --filter @codex-remote/control-plane test`.
- [ ] Commit Control Plane slice.

## Task 4: Web API And Minimal UI

**Files:**
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Test: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts`
- Test: `apps/web/src/components/shell/localWorkbenchBoundary.test.ts`

**Interfaces:**
- Consumes Control Plane routes from Task 3.
- Produces UI action for confirmed review start.

- [ ] Add failing Web client tests for the POST route.
- [ ] Add failing fake Worker smoke server tests for accepted review-start and invalid body rejection.
- [ ] Add failing source-boundary tests proving Web does not import `@codex-remote/codex-protocol` and does not render forbidden phrases from raw protocol fields.
- [ ] Add failing UI tests proving action buttons are disabled without selected conversation/project/device and enabled only when confirmation is present.
- [ ] Implement minimal form state: confirmation text, submit status, sanitized error message.
- [ ] Add review-start button in Git/Review section with confirmation text.
- [ ] On success, refresh workbench data and selected conversation timeline.
- [ ] Run `pnpm --filter @codex-remote/web test`.
- [ ] Commit Web slice.

## Task 5: Verification, Chrome, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md`
- Archive completed Stage 13 spec/plan only after gates pass.

**Interfaces:**
- Consumes implementation evidence from Tasks 1-4.
- Produces Stage 13 closure evidence.

- [ ] Run focused checks:
  - `pnpm --filter @codex-remote/api-contract test`
  - `pnpm --filter @codex-remote/worker test`
  - `pnpm --filter @codex-remote/control-plane test`
  - `pnpm --filter @codex-remote/web test`
- [ ] Run full checks:
  - `pnpm product:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- [ ] Run real stack checks:
  - `pnpm real:start`
  - `pnpm real:status`
  - `pnpm real:check`
  - `pnpm web:e2e:smoke`
- [ ] Use Chrome to verify disabled, confirmation, accepted, failed/degraded, and no-secret-leak states.
- [ ] Update docs and archive Stage 13 spec/plan.
- [ ] Commit locally. Do not push unless explicitly requested.

## Current Status

- Stage 13 spec and plan created.
- Architecture review requested changes.
- Addressed scope by removing `thread/shellCommand` from the first slice, fixing `review/start` to uncommitted changes only, adding stale-context guards, and adding fake Worker smoke server coverage.
