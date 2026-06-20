# Worker Write And Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first write-capable Worker HTTP slice: schema-first start/follow-up, Worker-only app-server writes, Web follow-up composer submit, and safe read-refresh verification.

**Architecture:** `packages/api-contract/openapi.yaml` defines public inputs/responses; `apps/worker` maps those public shapes to generated app-server protocol types; `apps/web` calls only Worker HTTP for follow-up and then refreshes Stage 3 read endpoints. No Control Plane, DB, approval, interrupt, steer, durable stream, SSE, or WebSocket is introduced.

**Tech Stack:** TypeScript, OpenAPI 3.1, `openapi-typescript`, Hono at Worker HTTP boundary, React/Next.js, Node built-in test runner, pnpm, Turborepo.

## Global Constraints

- Contract changes start in `packages/api-contract/openapi.yaml`; generated files update only through package generation commands.
- Web imports public types only from `@codex-remote/api-contract`.
- Worker is the only package importing `@codex-remote/codex-protocol` for write methods.
- Do not render or log token, provider secret, raw app-server URL, raw JSON-RPC frame, prompt echo, command output, full diff, stack/cause, or private path.
- `202 CommandAccepted` means submitted/accepted, not completed.
- Idempotency is process-local and best-effort in Stage 4; do not create DB or persistence.
- Do not implement approval, interrupt, steer, Control Plane, DB, iOS, pairing, productized auth, or external deployment.

---

## Task 1: Contract First Write API

**Files:**

- Modify: `packages/api-contract/openapi.yaml`
- Modify generated: `packages/api-contract/src/generated/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Modify/Add tests under `packages/api-contract/src`

**Steps:**

- [x] Add `POST /v1/conversations` with `StartConversationInput` and `CommandAccepted`.
- [x] Replace legacy unversioned `POST /conversations/{conversationId}/follow-up` by removing or disabling it in `openapi.yaml`.
- [x] Add `POST /v1/conversations/{conversationId}/follow-up` under the versioned Worker API.
- [x] Require `clientRequestId` for both start and follow-up.
- [x] Add `expectedConversationId` guard to follow-up if it is not already present.
- [x] Ensure response schemas and errors use existing `ErrorEnvelope`.
- [x] Generate OpenAPI TypeScript.
- [x] Export public aliases from `packages/api-contract/src/index.ts`.
- [x] Add source-of-truth tests that prevent parallel DTOs, prove write schemas exist, and prove no unversioned public write path remains.

Run:

```bash
pnpm --filter @codex-remote/api-contract build
pnpm --filter @codex-remote/api-contract test
```

Expected:

- Generated API contract is in sync.
- Contract tests pass.

Review and verification:

- Initial red test: `pnpm --filter @codex-remote/api-contract test` failed on missing `StartConversationInput`, missing Stage 4 v1 POST routes, and legacy unversioned follow-up.
- Focused verification after implementation: `pnpm --filter @codex-remote/api-contract test` passed; `pnpm --filter @codex-remote/api-contract build` passed.
- Task-level review requested changes for spec/contract mismatch, write route test strictness, and `acceptedAt` date-time format. All three were fixed and focused verification was rerun.

---

## Task 2: Worker Write Handler Tests

**Files:**

- Create: `apps/worker/src/http/writeHandlers.test.ts`
- Create/Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/errors.ts`
- Modify: `apps/worker/src/protocol/protocolSurface.test.ts`

**Steps:**

- [x] Define a write-capable handler context extending the read-only context with app-server write methods.
- [x] Add red tests for start mapping to Worker-owned cwd, then initial `turn/start` with generated protocol shapes.
- [x] Add red tests for follow-up proving conversation allowlist before `turn/start`.
- [x] Add red tests for missing/mismatched `clientRequestId` and `expectedConversationId`.
- [x] Add red tests for duplicate `operation + conversationId/projectId + clientRequestId` returning the same `CommandAccepted`.
- [x] Add red tests for the same idempotency key with a different request fingerprint returning sanitized conflict/invalid request.
- [x] Add red tests for sanitized app-server failure mapping.
- [x] Update protocol surface tests so write methods are allowed only in write handler modules.

Run:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "write"
```

Expected before Task 3:

- Tests fail on missing implementation.

Review and verification:

- Type verification: `pnpm --filter @codex-remote/worker typecheck` passed.
- Expected red test: `pnpm --filter @codex-remote/worker test -- --test-name-pattern "write handlers"` failed on 11 write-handler behavior assertions because the handler shell has no implementation yet.

---

## Task 3: Implement Worker Write Boundary

**Files:**

- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/app-server/readOnlyAppServerSession.ts` or create a write session if needed.
- Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/http/workerHttpApp.test.ts`
- Modify: `apps/worker/src/http/workerHttpConfig.ts` only if a small config flag is needed.

**Steps:**

- [x] Add typed app-server client methods for `thread/start` and `turn/start` using generated protocol types.
- [x] Implement `createTextUserInput(message)` locally in Worker write code.
- [x] Implement `startConversation` as `thread/start` followed by initial `turn/start` with Worker-owned cwd, public `projectId` guard, and `clientUserMessageId`.
- [x] Implement `followUpConversation` with allowed thread proof before write.
- [x] Implement bounded process-local idempotency cache scoped by operation, target id, client request id, and request fingerprint.
- [x] Add Hono POST routes with existing auth/CORS/error middleware.
- [x] Keep route list versioned under `/v1`.
- [x] Ensure CORS `Access-Control-Allow-Methods` includes `POST`.

Run:

```bash
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
```

Expected:

- Worker tests pass.
- Worker typecheck exits `0`.

Review and verification:

- Focused green verification: `pnpm --filter @codex-remote/worker test -- --test-name-pattern "write handlers|worker http app|stage 4 write requests|protocol"` passed.
- Package verification: `pnpm --filter @codex-remote/worker test` passed; `pnpm --filter @codex-remote/worker typecheck` passed.
- Task-level review requested bounded idempotency cache, HTTP unknown body parsing to 400, and paginated follow-up allowlist parity with read path. Added regression tests and fixed all three; reran `pnpm --filter @codex-remote/worker test` and `pnpm --filter @codex-remote/worker typecheck`, both passed.

---

## Task 4: Web Submit Flow

**Files:**

- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts` if refresh helpers need small additions.
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: composer/detail components only where the existing component API requires it.
- Add/modify tests under `apps/web/src`.

**Steps:**

- [x] Add Worker API client methods for start/follow-up using generated public types.
- [x] Generate `clientRequestId` in Web for each submit.
- [x] Enable follow-up composer only when datasource is loaded and selected conversation can accept input.
- [x] POST follow-up on send.
- [x] Clear composer only after `202`.
- [x] Preserve composer text on failure.
- [x] Refresh selected timeline after accepted response.
- [x] Render compact accepted/failure status without prompt echo.
- [x] Keep start conversation API-only for Stage 4; do not add a Web start entrypoint or Chrome start smoke in this stage.

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected:

- Web tests pass.
- Web typecheck exits `0`.

Review and verification:

- Red tests added for Worker API follow-up POST body/auth, active composer source wiring, and shell follow-up submit/refresh wiring.
- Focused verification: `pnpm --filter @codex-remote/web test -- --test-name-pattern "assistant thread|follow-up submit"` passed; `pnpm --filter @codex-remote/web typecheck` passed.
- Package verification: `pnpm --filter @codex-remote/web test` passed.
- Task-level review requested eliminating raw error rethrow from the shell submit handler and replacing source-only coverage with behavior-level harness tests. Added `followUpComposerSubmit` and `followUpSubmitController` tests for success clear, failure preserve, accepted refresh, and non-throwing failed status; reran focused Web tests and typecheck, both passed.

---

## Task 5: Fake Worker Chrome Smoke

**Files:**

- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Modify tests if fake server is covered.

**Steps:**

- [x] Add fake `POST /v1/conversations/{conversationId}/follow-up`.
- [x] Add fake `POST /v1/conversations` only for Worker/API parity; Chrome smoke does not need to exercise Web start UI in Stage 4.
- [x] Return `202 CommandAccepted`.
- [x] After fake accepted response, mutate fake timeline metadata enough for Web refresh to show a new safe turn/status.
- [x] Add a deterministic failure mode for sanitized error verification.

Review and verification:

- Red tests added for fake Worker follow-up accepted refresh, sanitized failure envelope, and API-only start acceptance.
- Focused verification: `pnpm --filter @codex-remote/web test -- --test-name-pattern "submitConversationFollowUp|submitFollowUpDraft|fake Worker smoke server|follow-up submit"` passed.
- Package verification: `pnpm --filter @codex-remote/web test` passed.

Chrome checks:

- [x] Loaded Stage 3 read state is visible.
- [x] Composer sends follow-up.
- [x] Accepted status is visible.
- [x] Timeline refresh shows metadata-only update.
- [x] No token, raw URL, prompt echo, command output, full diff, stack/cause, or raw JSON-RPC appears.
- [x] Failure path preserves composer text and shows sanitized error.

Chrome verification record:

- Started fake Worker on `127.0.0.1:8788` with `example-token` and Web on `127.0.0.1:5173`.
- Normal path verified: page showed `Smoke Worker conversation`, datasource `loaded`, composer send enabled after typing, accepted status, cleared draft, and refreshed metadata with `turn in_progress`.
- Failure path verified: `smoke-fail` returned sanitized failure state, composer text stayed intact, and browser console had no error entries.
- Leak checks passed on both paths: no token, raw Worker URL, prompt echo on success, command output, full diff, stack/cause, or JSON-RPC appeared in the UI.
- Chrome smoke found two UI defects after initial automated tests passed:
  - `ComposerPrimitive.Send` stayed disabled because the custom contenteditable composer did not use assistant-ui internal input state. Fixed by using a regular send button under `ComposerPrimitive.Root`.
  - Shell converted Worker failure into a resolved failed result, but the composer helper still cleared draft on any resolved submit. Fixed by returning explicit submit results and clearing only on `accepted`.

---

## Task 6: Stage Review, Verification, Docs, Commit

**Files:**

- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`
- Modify: this plan and the Stage 4 spec with execution records.

**Steps:**

- [x] Run focused package verification.
- [x] Run repository gate.
- [x] Perform Chrome normal and failure smoke.
- [x] Run subagent implementation review from architecture boundary, source-of-truth, DRY, modularity, security, tests, maintainability, and roadmap alignment.
- [x] Fix findings and re-run affected tests/smoke.
- [x] Update `PLAN.md` with Stage 4 status, risks, and Stage 5 recommendation.
- [x] Update `docs/references/development-context.md` to remove stale Stage 2 current-stage wording.
- [ ] Commit Stage 4 changes on `main`.

Commands:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- Focused and project-level commands exit `0`.
- Chrome smoke passes.
- Stage 4 docs record review findings, fixes, verification, and remaining risks.

Verification record:

- Focused checks passed:
  - `pnpm --filter @codex-remote/api-contract test`
  - `pnpm --filter @codex-remote/api-contract build`
  - `pnpm --filter @codex-remote/worker test`
  - `pnpm --filter @codex-remote/worker typecheck`
  - `pnpm --filter @codex-remote/web test`
  - `pnpm --filter @codex-remote/web typecheck`
- Final project gate passed after Chrome fixes:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`

Final review fixes:

- Final implementation review requested strict runtime validation parity with `additionalProperties: false` and `clientRequestId.maxLength: 128`.
- Worker HTTP write body parsing now rejects unknown fields and overlong `clientRequestId` before app-server writes.
- Worker write handler also enforces `clientRequestId` length for direct handler use.
- Fake Worker smoke server now uses the same strict write body key/length validation and treats `expectedConversationId` as optional, matching the public contract.
- Focused review-fix verification passed:
  - `pnpm --filter @codex-remote/worker test -- --test-name-pattern "write body is invalid"`
  - `pnpm --filter @codex-remote/web test -- --test-name-pattern "fake Worker smoke server"`
  - `pnpm --filter @codex-remote/worker typecheck`
  - `pnpm --filter @codex-remote/web typecheck`

## Architecture Review Record

Pre-implementation architect review:

- First pass: REQUEST CHANGES.
- Fixed findings:
  - legacy unversioned follow-up must be removed/replaced by versioned `/v1`;
  - no `approvalPolicy` or `sandbox` public inputs in Stage 4;
  - idempotency key must include operation and target plus request fingerprint;
  - Web scope is follow-up only, Worker/API start remains implemented and tested.
- Second pass: APPROVE.
