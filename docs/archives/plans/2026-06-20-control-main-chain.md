# Worker Control Main Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the Stage 5 control slice: schema-first interrupt, steer, pending approval listing, explicit approval decisions, Worker-only app-server control, Web controls, and Chrome verification.

**Architecture:** `packages/api-contract/openapi.yaml` defines the public control API. `apps/worker` maps public control shapes to generated Codex app-server protocol methods and JSON-RPC approval responses while maintaining a process-local approval registry. `apps/web` calls only Worker/Control Plane-shaped HTTP APIs and renders compact control states without raw protocol details.

**Tech Stack:** TypeScript, OpenAPI 3.1, `openapi-typescript`, Hono at Worker HTTP boundary, React/Next.js, Node built-in test runner, pnpm, Turborepo.

## Global Constraints

- Contract changes start in `packages/api-contract/openapi.yaml`; generated files update only through package generation commands.
- Web imports public types only from `@codex-remote/api-contract`.
- Worker is the only package importing `@codex-remote/codex-protocol` for control methods or approval responses.
- Do not render or log token, provider secret, raw app-server URL, raw JSON-RPC frame, prompt echo, command output, full diff, stack/cause, private path, command text, cwd, patch text, or raw approval request params.
- `202 CommandAccepted` means submitted/accepted, not completed.
- Stage 5 approval and idempotency state is process-local and best-effort; do not create DB or persistence.
- Approval decisions are limited to `accept`, `decline`, and `cancel`.
- Permissions approval requests are unsupported in Stage 5 because generated responses require permission profile and scope. Do not expose them as public pending approvals.
- Do not implement Control Plane, DB, iOS, pairing, reverse WSS, productized auth, task board, terminal control, model switching, sandbox override UI, policy amendment UI, permission-profile editing, SSE, WebSocket, durable event log, or external deployment.

---

## Task 1: Contract First Control API

**Files:**

- Modify: `packages/api-contract/openapi.yaml`
- Modify generated: `packages/api-contract/src/generated/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`

**Interfaces:**

- Produces: `InterruptTurnInput`, `SteerTurnInput`, `PendingApproval`, `ApprovalDecisionInput`, and reused `CommandAccepted` public aliases from `@codex-remote/api-contract`.

**Steps:**

- [x] Add red contract tests that assert the four Stage 5 paths exist:
  - `POST /v1/conversations/{conversationId}/turns/{turnId}/interrupt`
  - `POST /v1/conversations/{conversationId}/turns/{turnId}/steer`
  - `GET /v1/conversations/{conversationId}/approvals`
  - `POST /v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision`
- [x] Add red contract tests that assert no unversioned public control paths exist for approval, interrupt, or steer.
- [x] Add red contract tests that assert `clientRequestId` has `maxLength: 128`, message fields have `maxLength: 20000`, and control request schemas use `additionalProperties: false`.
- [x] Add red export tests for `InterruptTurnInput`, `SteerTurnInput`, `PendingApproval`, and `ApprovalDecisionInput`.
- [x] Update `openapi.yaml` with the four Stage 5 paths and schemas.
- [x] Use existing `ErrorEnvelope` for non-2xx responses and existing `CommandAccepted` for 202 responses.
- [x] Run the package generation command.
- [x] Export public aliases from `packages/api-contract/src/index.ts`.

Run:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
```

Expected:

- Initial test run fails before schema implementation.
- Final test and build pass after generated types are updated.

Review:

- Request task review for schema-source consistency, absence of parallel DTOs, route versioning, and error-envelope coverage.

---

## Task 2: Worker Control And Approval Tests

**Files:**

- Create: `apps/worker/src/http/controlHandlers.test.ts`
- Create: `apps/worker/src/http/controlHandlers.ts`
- Create: `apps/worker/src/http/approvalRegistry.test.ts`
- Create: `apps/worker/src/http/approvalRegistry.ts`
- Modify: `apps/worker/src/protocol/protocolSurface.test.ts`
- Modify: `apps/worker/src/app-server/appServerRpcClient.test.ts`

**Interfaces:**

- Produces: `WorkerControlAppServerClient` with `interruptTurn`, `steerTurn`, and `sendApprovalResponse`.
- Produces: `createWorkerApprovalRegistry()` with `captureServerRequest`, `listPendingApprovals`, `resolveApproval`, and `markResolved`.
- Produces: `interruptTurn(context, conversationId, turnId, input)`, `steerTurn(context, conversationId, turnId, input)`, `listApprovals(context, conversationId)`, and `decideApproval(context, conversationId, approvalRequestId, input)`.

**Steps:**

- [x] Add red tests for interrupt requiring allowed conversation proof before app-server control.
- [x] Add red tests for interrupt rejecting mismatched `expectedTurnId` before app-server control.
- [x] Add red tests for steer mapping to app-server `turn/steer` with one text input, `expectedTurnId`, and `clientUserMessageId`.
- [x] Add red tests for steer preserving sanitized failure and no prompt echo in public response.
- [x] Add red tests for control idempotency replay and same-key different-fingerprint conflict.
- [x] Add red tests that app-server `turn/interrupt` and `turn/steer` are allowed only in Worker control modules.
- [x] Add red approval registry tests that capture only supported approval `ServerRequest` methods: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `execCommandApproval`, and `applyPatchApproval`.
- [x] Add red approval registry tests that `item/permissions/requestApproval` is unsupported and is not exposed in public pending approvals.
- [x] Add red approval registry tests that projected `PendingApproval` excludes command, cwd, patch, raw JSON-RPC id, token, URL, stack/cause, and private path.
- [x] Add red approval decision tests for explicit per-kind response mapping:
  - command execution: `accept -> { decision: "accept" }`, `decline -> { decision: "decline" }`, `cancel -> { decision: "cancel" }`;
  - file change: `accept -> { decision: "accept" }`, `decline -> { decision: "decline" }`, `cancel -> { decision: "cancel" }`;
  - legacy exec: `accept -> { decision: "approved" }`, `decline -> { decision: "denied" }`, `cancel -> { decision: "abort" }`;
  - legacy apply patch: `accept -> { decision: "approved" }`, `decline -> { decision: "denied" }`, `cancel -> { decision: "abort" }`.
- [x] Add red approval decision tests for wrong conversation, wrong turn, wrong approval id, missing approval, and resolved approval failing closed.

Run:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "control|approval"
pnpm --filter @codex-remote/worker typecheck
```

Expected before implementation:

- Control and approval tests fail on missing implementation.
- Typecheck may pass with placeholder exports.

Review:

- Request task review for safety boundaries, test sufficiency, protocol source use, and fail-closed behavior.

---

## Task 3: Implement Worker Control Boundary

**Files:**

- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/app-server/readOnlyAppServerSession.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/http/controlHandlers.ts`
- Modify: `apps/worker/src/http/approvalRegistry.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/http/workerHttpApp.test.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.ts`

**Interfaces:**

- Consumes: generated `ClientRequest`, `ServerRequest`, v2 `TurnInterruptParams`, v2 `TurnSteerParams`, and approval response types from `@codex-remote/codex-protocol`.
- Produces: Worker HTTP routes and framework-independent handlers for Stage 5 control operations.

**Steps:**

- [x] Extend `WorkerAppServerMethod` to include `turn/interrupt` and `turn/steer`.
- [x] Extend the RPC client so non-response `ServerRequest` messages can be observed without exposing raw frames.
- [x] Add a low-level `respondToServerRequest(id, result)` path that sends a JSON-RPC response for captured approval requests.
- [x] Implement process-local approval registry with bounded pending entries and deterministic sanitized projection.
- [x] Implement control idempotency cache scoped by operation, conversation id, turn id or approval id, and `clientRequestId`.
- [x] Implement interrupt handler with allowed conversation proof, expected turn guard, `turn/interrupt`, and sanitized `CommandAccepted`.
- [x] Implement steer handler with allowed conversation proof, expected turn guard, text `UserInput`, `turn/steer`, and sanitized `CommandAccepted`.
- [x] Implement approval listing and decision handlers with fail-closed identity checks.
- [x] Implement the explicit per-kind approval decision adapter from the Stage 5 spec; do not infer values from public decision strings.
- [x] Treat permissions approval requests as unsupported and do not expose them to Web.
- [x] Add Hono routes and strict body validation matching `additionalProperties: false`.
- [x] Ensure CORS methods include the new `GET` and `POST` routes without widening auth.

Run:

```bash
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
```

Expected:

- Worker tests pass.
- Worker typecheck exits `0`.

Review:

- Request task review for RPC boundary safety, approval response correctness, no raw data leaks, and no Control Plane/DB scope creep.

---

## Task 4: Web Control Client And UI Flow

**Files:**

- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Create: `apps/web/src/components/shell/controlSubmitController.ts`
- Create: `apps/web/src/components/shell/controlSubmitController.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/conversation/codex-assistant-thread.tsx` only if the selected turn controls belong near the composer.
- Modify tests under `apps/web/src/domain` or `apps/web/src/components` to cover UI source wiring.

**Interfaces:**

- Consumes: public Stage 5 types from `@codex-remote/api-contract`.
- Produces: `WorkerApiClient.interruptTurn`, `WorkerApiClient.steerTurn`, `WorkerApiClient.listApprovals`, and `WorkerApiClient.decideApproval`.
- Produces: non-throwing control submit helpers returning `accepted` or `failed`.

**Steps:**

- [x] Add Worker API client methods and tests for request path, body, auth, and sanitized error parsing.
- [x] Add a controller helper for interrupt accepted/failure state and selected conversation refresh.
- [x] Add a controller helper for steer accepted/failure state, draft clearing only on accepted, and selected conversation refresh.
- [x] Add a controller helper for approval decision accepted/failure state and approval list refresh.
- [x] Wire `CodexRemoteApp` to load pending approvals for the selected conversation when Worker datasource is loaded.
- [x] Render compact interrupt and steer controls only when a selected conversation has a known active turn id.
- [x] Render pending approvals as sanitized metadata with accept, decline, and cancel controls.
- [x] Keep control statuses compact and separate from assistant output.
- [x] Add source/boundary tests proving Web still does not import `@codex-remote/codex-protocol`.

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected:

- Web tests pass.
- Web typecheck exits `0`.

Review:

- Request task review for UI scope, error handling, no prompt/raw-data leakage, and generated public type usage.

---

## Task 5: Fake Worker Chrome Smoke Support

**Files:**

- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`

**Interfaces:**

- Produces fake Stage 5 endpoints matching the public contract and strict validation rules.

**Steps:**

- [x] Add fake active turn metadata to the smoke conversation.
- [x] Add fake `POST /v1/conversations/{conversationId}/turns/{turnId}/steer`.
- [x] Add fake `POST /v1/conversations/{conversationId}/turns/{turnId}/interrupt`.
- [x] Add fake `GET /v1/conversations/{conversationId}/approvals`.
- [x] Add fake `POST /v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision`.
- [x] Mutate fake read state after accepted steer/interrupt/approval decisions enough for Web refresh verification.
- [x] Add deterministic failure modes for steer, interrupt, and approval decision.
- [x] Add tests for strict body validation, optional GET auth behavior, sanitized pending approval metadata, accepted mutations, and sanitized failures.

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fake Worker smoke server"
```

Expected:

- Fake Worker smoke tests pass.

Review:

- Request task review for contract parity and leak-check coverage.

---

## Task 6: Chrome Verification, Docs, And Stage Commit

**Files:**

- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/superpowers/specs/2026-06-20-control-main-chain-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-control-main-chain.md`

**Steps:**

- [x] Run focused package verification:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

- [x] Run project gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [x] Start fake Worker and Web local dev server.
- [x] Use `chrome:control-chrome` to verify loaded state, steer accepted path, interrupt accepted path, pending approval list, approval accept/decline/cancel paths, deterministic failures, and leak checks.
- [x] Fix Chrome or test findings with minimal changes and rerun affected focused tests plus Chrome checks.
- [x] Request final broad implementation review from architecture boundary, unique source of truth, DRY, modularity, security, tests, maintainability, and roadmap alignment.
- [x] Fix final review Critical/Important findings and rerun affected tests.
- [x] Update `PLAN.md` with Stage 5 status, risks, verification, Chrome result, and Stage 6 recommendation.
- [x] Update `docs/references/development-context.md` with Stage 5 completion context and Stage 6 input.
- [x] Update this spec and plan with review findings, fixes, verification, Chrome records, and remaining risks.
- [x] Commit Stage 5 changes on `main`.

Expected:

- Focused and project-level commands exit `0`.
- Chrome smoke passes normal, failure, and leak-check paths.
- Stage 5 docs record review findings, fixes, verification, and remaining risks.

## Implementation Record

Status: completed.

Task review records:

- Pre-implementation architecture review initially requested changes for permissions approval scope and legacy approval decision mapping. The spec and plan were updated to keep `item/permissions/requestApproval` unsupported in Stage 5 and to document explicit per-kind decision mapping. Follow-up review approved.
- Task 1 contract review approved after `packages/api-contract/openapi.yaml` became the source for all Stage 5 public fields and generated/exported public aliases.
- Task 2 red-test review approved after approval registry tests covered supported kinds, permissions omission, fail-closed identity checks, and leak exclusions.
- Task 3 Worker review initially found three issues: approval observer session lifetime, pending approval deletion before failed response sends, and Unix epoch fallback for unknown approval start time. Fixes kept one shared Worker session for HTTP approval observers, completed approvals only after `sendApprovalResponse` succeeds, and used Worker capture time for unknown starts. Follow-up review approved.
- Task 4/5 review found one P1: approval list/decision lacked allowed-project proof. Fix added `withControlClient + assertConversationAllowed` to `listApprovals` and `decideApproval`; `resolveApproval` now happens after allowlist proof. Regression tests confirm forbidden conversations cannot list approvals, cannot send approval responses, and do not consume pending approvals. Follow-up review approved.

Implemented feature points:

- Public Stage 5 API contract:
  - `POST /v1/conversations/{conversationId}/turns/{turnId}/interrupt`
  - `POST /v1/conversations/{conversationId}/turns/{turnId}/steer`
  - `GET /v1/conversations/{conversationId}/approvals`
  - `POST /v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision`
  - Public aliases: `InterruptTurnInput`, `SteerTurnInput`, `PendingApproval`, `ApprovalDecisionInput`.
- Worker control boundary:
  - `turn/interrupt` and `turn/steer` use generated `packages/codex-protocol` types.
  - All control and approval operations prove `conversationId` is inside `allowedProjectRoot` before app-server control or registry exposure.
  - Control idempotency is process-local and bounded.
  - Approval registry captures command/file/legacy exec/legacy apply-patch requests, omits permissions approvals, projects sanitized metadata, and sends explicit per-kind generated responses.
- Web control surface:
  - Web calls only Worker-shaped HTTP APIs via `WorkerApiClient`.
  - Conversation view shows compact interrupt/steer controls, pending approval metadata, and accept/decline/cancel actions.
  - Control helpers return accepted/failed without throwing raw errors; steer draft clears only on accepted.
- Fake Worker smoke support:
  - Deterministic fake endpoints support active-turn steer, interrupt, approval list, and approval decision state changes for Chrome verification.

Focused verification:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
pnpm --filter @codex-remote/worker typecheck
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/web typecheck
pnpm --filter @codex-remote/web test
```

Result:

- `api-contract` tests: 16/16 passed.
- `worker` tests after P1 fix: 143/143 passed.
- `web` tests: 76/76 passed.
- All focused typecheck/build commands exited `0`.

Project gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Result: all four commands exited `0`.

Chrome verification:

- Started fake Worker on `127.0.0.1:8788` with `example-token` and Web on `127.0.0.1:5173`.
- Loaded path showed `Smoke Worker conversation`, datasource `loaded`, `turn smoke-turn-1`, and pending approval `command_execution · medium · Run smoke command`.
- Steer normal path: filled steer input, submitted `Steer`, UI showed accepted, steer draft cleared, active turn remained, and no raw URL/token appeared.
- Approval normal path: clicked `accept`, pending approval disappeared after refresh, UI showed accepted, and no raw URL/token appeared.
- Interrupt normal path: `Interrupt` was enabled before click; after click, UI showed accepted, `turn completed`, `no active turn`, and Interrupt/Steer disabled.
- Fallback path: stopped fake Worker and reloaded; UI showed `request_failure`, no smoke data, no active turn, disabled control buttons, and no raw URL/token.

Remaining limitations:

- Approval and control idempotency state remains process-local. Worker restart loses pending approvals and accepted-command replay memory.
- Stage 5 intentionally does not expose command text, cwd, patch details, permissions approvals, policy amendment, sandbox override, or richer approval review UI.
- No Control Plane, DB, reverse WSS, iOS, durable stream/event log, task board, pairing, productized auth, or external deployment was introduced.

## Architecture Review Record

Pre-implementation architect review is required before Task 1 implementation.

Review prompt:

```text
你作为架构师思考需要审核的维度，指派 subagent 审核该计划。

审核 docs/superpowers/specs/2026-06-20-control-main-chain-design.md 和 docs/superpowers/plans/2026-06-20-control-main-chain.md。

请从架构边界、唯一事实源、DRY、模块化、安全、测试充分性、后续可维护性和是否偏离总目标等维度审核。特别检查：
- Web 是否仍不依赖 codex-protocol；
- Worker 是否仍是唯一 app-server 控制调用者；
- approval 是否作为显式用户决策而不是错误或普通 follow-up；
- process-local registry/idempotency 是否清楚标注为 Stage 5 限制；
- 是否提前实现 Control Plane、DB、stream、iOS、pairing、产品化 auth 或 policy amendment UI；
- 是否存在 raw command/cwd/path/patch/JSON-RPC/stack/cause/token 泄漏风险；
- tests 和 Chrome smoke 是否覆盖正常、失败、边界和泄漏路径。

输出 APPROVE 或 REQUEST CHANGES；如需修改，请给出阻塞项、原因和建议修复。
```
