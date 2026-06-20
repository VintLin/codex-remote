# Control Plane Multi-Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stage 6 Control Plane multi-device routing: schema-first device-scoped Control Plane API, local configured Worker registry, aggregation across multiple Worker upstreams, Web datasource through Control Plane, and Chrome verification.

**Architecture:** `packages/api-contract/openapi.yaml` defines public Control Plane API fields. `apps/control-plane` owns configured Worker upstream routing and aggregation but never calls Codex app-server. `apps/worker` remains the only app-server protocol boundary. `apps/web` calls Control Plane-shaped HTTP APIs and keeps fallback behavior.

**Tech Stack:** TypeScript, OpenAPI 3.1, `openapi-typescript`, Hono, React/Next.js, Node built-in test runner, pnpm, Turborepo.

## Global Constraints

- Contract changes start in `packages/api-contract/openapi.yaml`; generated files update only through package generation commands.
- Create `apps/control-plane` only for Stage 6 code; do not create `packages/db`.
- Web imports public types only from `@codex-remote/api-contract`.
- Control Plane and Web must not import `@codex-remote/codex-protocol`.
- Worker remains the only app-server caller.
- Control Plane may keep upstream Worker tokens only in runtime config/process memory. Do not persist tokens or echo them in API responses, logs, tests, or docs.
- Do not implement pairing, reverse WSS, DPoP/device-bound token, token rotation UI, revocation UI, DB, task board, iOS, external deployment, productized auth, durable stream/event log, or installer.
- Do not render or log provider secrets, Codex auth, raw Worker token, raw upstream base URL, raw app-server URL, raw JSON-RPC frame, prompt echo, command output, full diff, stack/cause, private path, command text, cwd, or patch text.
- Stage 6 auth is a local Control Plane bearer token only; record it as development posture, not production device-bound auth.

---

## Task 1: Contract First Control Plane API

**Files:**

- Modify: `packages/api-contract/openapi.yaml`
- Modify generated: `packages/api-contract/src/generated/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`

**Interfaces:**

- Produces: `ControlPlaneHealth` public alias.
- Reuses: `Device`, `WorkerHealth`, `WorkerCapabilities`, `CodexConversation`, `ConversationTimeline`, `StartConversationInput`, `FollowUpInput`, `InterruptTurnInput`, `SteerTurnInput`, `PendingApproval`, `ApprovalDecisionInput`, `CommandAccepted`, and `ErrorEnvelope`.

**Steps:**

- [ ] Add red contract tests for these Stage 6 paths:
  - `GET /v1/control-plane/health`
  - `GET /v1/devices`
  - `GET /v1/conversations`
  - `GET /v1/devices/{deviceId}/worker/health`
  - `GET /v1/devices/{deviceId}/worker/capabilities`
  - `GET /v1/devices/{deviceId}/conversations/{conversationId}/timeline`
  - `GET /v1/devices/{deviceId}/conversations/{conversationId}/approvals`
  - `POST /v1/devices/{deviceId}/conversations`
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/follow-up`
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt`
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer`
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision`
- [ ] Add red tests that no unversioned Control Plane paths exist.
- [ ] Add red tests that device-scoped routes reuse existing public schemas rather than adding parallel conversation/timeline DTOs.
- [ ] Add red tests that `ErrorEnvelope.details` allows only safe device diagnostics such as `deviceId`, `operation`, `field`, `limit`, `retryable`, `diagnosticId`, `expected`, and `actualKind`.
- [ ] Add `ControlPlaneHealth` schema with `additionalProperties: false`.
- [ ] Update `openapi.yaml` with Stage 6 paths and schemas.
- [ ] Run the package generation command.
- [ ] Export `ControlPlaneHealth` from `packages/api-contract/src/index.ts`.

Run:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
```

Expected:

- Initial tests fail before schema implementation.
- Final tests and build pass after generated types update.

Review:

- Request task review for schema source consistency, no parallel DTOs, route versioning, and error-envelope coverage.

---

## Task 2: Control Plane Config, Registry, And HTTP Tests

**Files:**

- Create: `apps/control-plane/package.json`
- Create: `apps/control-plane/tsconfig.json`
- Create: `apps/control-plane/src/config/controlPlaneConfig.ts`
- Create: `apps/control-plane/src/config/controlPlaneConfig.test.ts`
- Create: `apps/control-plane/src/registry/deviceRegistry.ts`
- Create: `apps/control-plane/src/registry/deviceRegistry.test.ts`
- Create: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Create: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Create: `apps/control-plane/src/http/errors.ts`

**Interfaces:**

- Produces: `ControlPlaneConfig`, `ConfiguredWorkerDevice`, `createDeviceRegistry`, and `createControlPlaneHttpApp`.
- Uses only `@codex-remote/api-contract` public types.

**Steps:**

- [ ] Add package scripts: `build`, `typecheck`, `test`, and `lint`.
- [ ] Add config parser tests for valid env JSON, duplicate device ids, blank ids, invalid URLs, missing tokens, missing public token, and unsafe raw logging.
- [ ] Add device registry tests for known/unknown device resolution and safe public device projection.
- [ ] Add HTTP auth/origin tests matching Worker conservative behavior.
- [ ] Add `GET /v1/control-plane/health` test for ok/degraded counts.
- [ ] Add `GET /v1/devices` test where one Worker is connected and one Worker is down; request still succeeds with one degraded device.
- [ ] Add `GET /v1/conversations` test where two fake upstreams return conversations; Control Plane rewrites or enforces configured `deviceId`.
- [ ] Add tests where upstream health, capabilities, conversation, and timeline responses return `deviceId: other-device`; Control Plane must expose the configured device id for known normalizable shapes.
- [ ] Add tests where an unsafe or unknown device-bearing response conflict fails closed without leaking upstream identity, URL, or token.
- [ ] Add device-scoped proxy tests for health, capabilities, timeline, approvals, start, follow-up, interrupt, steer, and approval decision.
- [ ] Add unknown device tests returning `device_not_found`.
- [ ] Add upstream network/auth failure tests returning sanitized `device_unavailable`.
- [ ] Add boundary test that Control Plane imports `api-contract` but not `codex-protocol`, Worker code, Web code, or DB code.

Run:

```bash
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/control-plane typecheck
```

Expected before implementation:

- Tests fail on missing package/implementation.

Review:

- Request task review for config safety, no token leaks, no app-server/protocol imports, and route coverage.

---

## Task 3: Implement Control Plane Boundary

**Files:**

- Modify files created in Task 2.
- Create: `apps/control-plane/src/client/workerClient.ts`
- Create: `apps/control-plane/src/client/workerClient.test.ts`
- Create: `apps/control-plane/src/index.ts`
- Create: `apps/control-plane/src/cli/controlPlaneHttpServerCli.ts`
- Create: `apps/control-plane/src/cli/controlPlaneHttpServerCli.test.ts`

**Interfaces:**

- Produces: typed Worker upstream client using public API contract shapes.
- Produces: Hono HTTP app and optional CLI server entrypoint for local Chrome smoke.

**Steps:**

- [ ] Implement config parsing from env JSON or config path with sanitized errors.
- [ ] Implement Worker upstream client:
  - exact bearer auth;
  - per-request timeout;
  - JSON body validation;
  - sanitized upstream error mapping;
  - no raw base URL/token in public errors.
- [ ] Implement registry and public `Device` projection.
- [ ] Implement configured device id normalization for every known public response shape containing `deviceId`: `WorkerHealth`, `WorkerCapabilities`, `CodexConversation`, and `ConversationTimeline`.
- [ ] Fail closed on unsafe or ambiguous device identity conflicts instead of forwarding upstream identity.
- [ ] Implement health/capability device-scoped proxy routes.
- [ ] Implement conversations aggregation with per-device isolation and sorted output.
- [ ] Implement device-scoped timeline and approvals proxy routes.
- [ ] Implement device-scoped start/follow-up/control/approval decision proxy routes.
- [ ] Implement process-local request handling only; no DB or audit log.
- [ ] Implement CLI startup with a safe startup line that must omit tokens, raw upstream URLs, raw config, raw app-server URL, prompt, command output, stack/cause, and private paths. It may print device count, device ids, sanitized host labels, and diagnostic ids.

Run:

```bash
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/control-plane typecheck
```

Expected:

- Control Plane tests pass.
- Control Plane typecheck exits `0`.

Review:

- Request task review for upstream routing correctness, auth boundaries, sanitized errors, and no DB/pairing/WSS scope creep.

---

## Task 4: Web Control Plane Datasource

**Files:**

- Modify: `apps/web/src/data/workerApi/client.ts` or introduce a renamed local adapter only if it avoids duplication.
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/shell/controlSubmitController.ts`
- Modify tests under `apps/web/src/domain` or `apps/web/src/components` as needed.

**Interfaces:**

- Consumes Stage 6 device-scoped Control Plane routes.
- Preserves existing fallback output when Control Plane is unavailable or token is missing.

**Steps:**

- [ ] Add Web client methods for Stage 6 device-scoped routes.
- [ ] Update workbench loader so devices and conversations load from Control Plane aggregated endpoints.
- [ ] Update timeline and approvals fetches to use selected conversation `deviceId`.
- [ ] Update follow-up, interrupt, steer, and approval decision submits to use selected conversation `deviceId`.
- [ ] Preserve existing Worker direct fake server tests where useful, but do not duplicate DTOs.
- [ ] Add Web tests proving the selected device route is used for timeline and control operations.
- [ ] Add Web boundary test proving no `@codex-remote/codex-protocol` import.

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected:

- Web tests pass.
- Web typecheck exits `0`.

Review:

- Request task review for Web route scoping, fallback behavior, no duplicated DTOs, and no protocol import.

---

## Task 5: Fake Multi-Worker Chrome Smoke Support

**Files:**

- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`
- Create or modify: `apps/control-plane/src/testing/fakeControlPlaneSmoke.ts` only if Chrome smoke needs a helper.

**Interfaces:**

- Produces deterministic local fake Workers or a helper that starts two fake Workers and one Control Plane for Chrome.

**Steps:**

- [ ] Allow fake Worker smoke server to parameterize `deviceId`, conversation ids, and project names.
- [ ] Add tests for two fake Worker instances returning distinct device/conversation data.
- [ ] Add Control Plane smoke helper only if needed to avoid shell complexity; do not create production-only abstractions.
- [ ] Ensure fake responses never include raw URL/token in visible fields.

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fake Worker smoke server"
pnpm --filter @codex-remote/control-plane test
```

Expected:

- Fake smoke tests pass.

Review:

- Request task review for deterministic Chrome support, no fake-only DTO source, and no leak-prone fixture data.

---

## Task 6: Chrome Verification, Docs, And Stage Commit

**Files:**

- Modify: `PLAN.md`
- Modify: `PROJECT_STRUCTURE.md` if `apps/control-plane` directory rules change from future to active.
- Modify: `docs/references/development-context.md`
- Modify: this spec and plan with completion records.

**Steps:**

- [ ] Run focused package verification:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/control-plane typecheck
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

- [x] Start two fake Workers and one local Control Plane.
- [x] Start Web against Control Plane.
- [x] Use `chrome:control-chrome` to verify:
  - two devices render;
  - conversations from both devices render;
  - selecting device A conversation fetches device A timeline;
  - selecting device B conversation fetches device B timeline;
  - one write or control action mutates only selected device;
  - stopping one Worker degrades only that device;
  - no raw URL/token appears.
- [x] Fix Chrome or test findings with minimal changes and rerun affected focused tests plus Chrome checks.
- [x] Request final broad implementation review from architecture boundary, unique source of truth, DRY, modularity, security, tests, maintainability, and roadmap alignment.
- [x] Fix final review Critical/Important findings and rerun affected tests.
- [x] Update `PLAN.md`, `PROJECT_STRUCTURE.md`, `docs/references/development-context.md`, this spec, and this plan with Stage 6 status, risks, verification, Chrome result, and Stage 7 recommendation.
- [x] Commit Stage 6 changes on `main`.

Expected:

- Focused and project-level commands exit `0`.
- Chrome smoke passes normal, degraded, and leak-check paths.
- Stage 6 docs record review findings, fixes, verification, and remaining risks.

Result:

- Focused tests passed for API contract, Control Plane, Web, Worker, fake Worker smoke, duplicate conversation ids, and empty remote conversations.
- Final review fixes added regression coverage for duplicate project ids across devices and restored `apps/web/next-env.d.ts` to the stable `.next/types` path.
- Project gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Chrome verified two fake Workers through one Control Plane, Project B duplicate `shared-thread` selection routed to `/v1/devices/smoke-b/...`, steer and approval decision mutated only the selected device, single Worker degradation showed `Smoke A Connected` and `Smoke B Not connected`, full Worker outage settled to remote empty state, and no upstream Worker port or token appeared in the DOM.
- Chrome/review findings fixed with regression coverage: remote `GET /v1/conversations` returning `[]` must remain a loaded empty remote state and must not be mistaken for mock fallback; same `projectId` from different devices must remain separate Web sidebar groups keyed by `deviceId + projectId`.

## Architecture Review Record

Pre-implementation architect review is required before Task 1 implementation.

Review prompt:

```text
你作为架构师思考需要审核的维度，指派 subagent 审核该计划。

审核 docs/superpowers/specs/2026-06-20-control-plane-multidevice-design.md 和 docs/superpowers/plans/2026-06-20-control-plane-multidevice.md。

请从架构边界、唯一事实源、DRY、模块化、安全、测试充分性、后续可维护性和是否偏离总目标等维度审核。特别检查：
- Control Plane 是否不直接调用 Codex app-server；
- apps/worker 是否仍是唯一 app-server 调用者；
- Web 和 Control Plane 是否不依赖 codex-protocol；
- API 字段是否仍以 packages/api-contract/openapi.yaml 为唯一事实源；
- 是否避免创建 DB、pairing、reverse WSS、iOS、产品化 auth、任务看板或持久化审计；
- Worker upstream token 是否只在 Control Plane runtime config 内，不进入 API/log/test fixture；
- device-scoped routes 是否避免 conversationId 全局唯一假设；
- tests 和 Chrome smoke 是否覆盖多设备正常、单设备降级、路由边界和泄漏路径。

输出 APPROVE 或 REQUEST CHANGES；如需修改，请给出阻塞项、原因和建议修复。
```

Final implementation review:

- Reviewer: Huygens (`019ee29e-af90-7a91-88db-577c4dadd06b`)
- First result: `REQUEST_CHANGES`
  - P1: Web project identity still assumed `projectId` was globally unique across devices.
  - P1: `apps/web/next-env.d.ts` had been changed by local dev state to `.next/dev/types/routes.d.ts`.
- Fixes:
  - Added local Web sidebar `projectKey = deviceId + projectId`, used for datasource project de-duplication, sidebar grouping, expanded state, React keys, DOM focus attributes, and regression tests.
  - Restored `apps/web/next-env.d.ts` to `.next/types/routes.d.ts`.
- Follow-up result: `APPROVE`.
