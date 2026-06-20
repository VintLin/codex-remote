# DB Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DB-backed task board slice with persisted tasks and manual device-scoped conversation links.

**Architecture:** `packages/db` owns Drizzle SQLite schema, migrations, and a tiny repository. `apps/control-plane` exposes schema-first task APIs backed by `packages/db`. `apps/web` consumes Control Plane task APIs and renders a minimal task board/link flow.

**Tech Stack:** TypeScript, pnpm, Turborepo, OpenAPI 3.1, Drizzle ORM, `better-sqlite3`, Node built-in test runner, Next.js.

## Global Constraints

- API fields start in `packages/api-contract/openapi.yaml`.
- DB persistence fields start in `packages/db/src/schema.ts`.
- Generated DB migrations are committed under `packages/db/drizzle/`.
- `apps/web` imports API contract types only; it must not import `packages/db` or `packages/codex-protocol`.
- `apps/control-plane` may import `packages/db`; it must not import `packages/codex-protocol` or Worker internals.
- `apps/worker` remains the only Codex app-server caller and must not import `packages/db`.
- Do not store provider secrets, Codex auth, Worker bearer tokens, raw upstream URLs, raw JSON-RPC, raw prompt, raw command output, full diff, stack/cause, or private paths in DB/API/UI/tests/docs.
- Do not implement remote sync, pairing, reverse WSS, token rotation, revocation, iOS, installer, durable streaming, automatic task inference, automatic device choice, or productized auth.

---

## Task 1: Contract First Task API

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify: `packages/api-contract/src/index.ts`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`
- Generate: `packages/api-contract/src/generated/openapi.ts`

**Interfaces:**
- Produces:
  - `BoardTask`
  - `TaskConversationLink`
  - `CreateTaskInput`
  - `LinkTaskConversationInput`
  - `GET /v1/tasks`
  - `POST /v1/tasks`
  - `POST /v1/tasks/{taskId}/conversation-links`
  - `DELETE /v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}`

- [x] Add failing contract tests that assert the four versioned task routes exist, no unversioned task routes exist, and `BoardTask` contains `linkedConversations` rather than `linkedConversationIds`.
- [x] Update `openapi.yaml` with the task paths and schemas.
- [x] Export public aliases from `packages/api-contract/src/index.ts`.
- [x] Regenerate OpenAPI types with the package's existing generation command.
- [x] Run `pnpm --filter @codex-remote/api-contract test && pnpm --filter @codex-remote/api-contract build`.
- [x] Request task review for schema source-of-truth, route versioning, and device-scoped conversation links.

## Task 2: DB Package

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/taskRepository.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/taskRepository.test.ts`
- Generate: `packages/db/drizzle/0000_*.sql`

**Interfaces:**
- Consumes: `BoardTask`, `CreateTaskInput`, `LinkTaskConversationInput` from `@codex-remote/api-contract`.
- Produces:
  - `openTaskDatabase(path: string): TaskDatabase`
  - `TaskDatabase.close(): void`
  - `TaskRepository.listTasks(): BoardTask[]`
  - `TaskRepository.createTask(input: CreateTaskInput): BoardTask`
  - `TaskRepository.linkConversation(taskId: string, input: LinkTaskConversationInput): BoardTask`
  - `TaskRepository.unlinkConversation(taskId: string, deviceId: string, conversationId: string): BoardTask`

- [x] Add `packages/db` workspace package with `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, and `@types/better-sqlite3`.
- [x] Write failing repository tests using a temp SQLite file, including a task linked to the same `conversationId` from two different `deviceId` values.
- [x] Define Drizzle schema for `tasks` and `task_conversation_links`.
- [x] Generate and commit the first migration.
- [x] Implement the minimal repository.
- [x] Add a boundary test that `packages/db` does not import Web, Worker, Control Plane, or `codex-protocol`.
- [x] Run `pnpm --filter @codex-remote/db test && pnpm --filter @codex-remote/db build`.
- [x] Request task review for DB schema source-of-truth, migration, persistence behavior, and secret-free fields.

## Task 3: Control Plane Task Routes

**Files:**
- Modify: `apps/control-plane/package.json`
- Modify: `apps/control-plane/src/config/controlPlaneConfig.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Modify: `apps/control-plane/src/boundary.test.ts`

**Interfaces:**
- Consumes: `TaskRepository` from `@codex-remote/db`.
- Produces: Control Plane task HTTP routes matching Task 1.

- [x] Add failing Control Plane tests for auth, task creation/list, file-backed persistence across reopen, duplicate link idempotency, same `conversationId` across two `deviceId` values, missing task errors, and sanitized failures that assert response bodies do not contain raw URL, stack/cause, or private path content.
- [x] Add DB path runtime config with `:memory:` default and file path support.
- [x] Wire `TaskRepository` into the HTTP app.
- [x] Implement `GET /v1/tasks`, `POST /v1/tasks`, `POST /v1/tasks/{taskId}/conversation-links`, and `DELETE /v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}`.
- [x] Update boundary tests so Control Plane may import `@codex-remote/db` but still must not import `codex-protocol`, Web code, or Worker internals.
- [x] Run `pnpm --filter @codex-remote/control-plane test && pnpm --filter @codex-remote/control-plane typecheck`.
- [x] Request task review for route contracts, DB ownership, sanitized errors, and package boundaries.

## Task 4: Web Task Board

**Files:**
- Modify: `apps/web/src/data/app-server/mockData.ts`
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/sidebar/sidebar.tsx`
- Modify: relevant Web tests under `apps/web/src/domain` or `apps/web/src/components` only if the touched UI behavior needs them.

**Interfaces:**
- Consumes: Control Plane task API routes.
- Produces: minimal Web task board and selected conversation link flow.

- [x] Add failing Web client tests for list/create/link/unlink task routes.
- [x] Add failing workbench datasource tests that tasks load from Control Plane, empty task API responses render explicit empty state, task API failure is not replaced with mock persisted tasks, and duplicate conversation ids link with `deviceId`.
- [x] Update Web client methods.
- [x] Add tasks to `WorkbenchData`.
- [x] Replace automations placeholder with a minimal task board view using existing compact panels/buttons.
- [x] Add one title input for task creation and a link button for the selected conversation.
- [x] Keep UI copy short and stateful; no marketing or decorative layout.
- [x] Run `pnpm --filter @codex-remote/web test && pnpm --filter @codex-remote/web typecheck`.
- [x] Request task review for task route usage, device-scoped links, fallback behavior, and UI scope.

## Task 5: Verification, Chrome Smoke, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `PROJECT_STRUCTURE.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/superpowers/specs/2026-06-20-db-task-board-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-db-task-board.md`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: Stage 7 evidence and commit.

- [x] Run focused package checks:
  - `pnpm --filter @codex-remote/api-contract test`
  - `pnpm --filter @codex-remote/db test`
  - `pnpm --filter @codex-remote/control-plane test`
  - `pnpm --filter @codex-remote/web test`
- [x] Run project gate:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- [x] Start fake Worker, Control Plane with a temp file DB, and Web.
- [x] Use `chrome:control-chrome` with two fake Workers exposing the same `conversationId` under different `deviceId` values; create a task, link both device-scoped conversations, refresh, and verify the task shows two distinct links.
- [x] Start Chrome once with an empty DB and verify the task board shows an empty state, not mock tasks or an error.
- [x] Verify Chrome DOM does not show token, raw Worker URL, private path, raw JSON-RPC, prompt, command output, full diff, stack/cause.
- [x] Request final broad implementation review from architecture boundary, unique source of truth, DRY, modularity, security, tests, maintainability, and roadmap alignment.
- [x] Fix Critical/Important review findings and rerun affected tests.
- [x] Update Stage 7 docs and `PLAN.md`.
- [x] Commit Stage 7 on `main`; do not push.

## Completion Notes

- Subagent plan review approved after same-`conversationId` cross-device and empty-state review fixes.
- Task-level reviews approved for API contract, DB repository, Control Plane routes, and Web task board after fixing task datasource failure state.
- Final broad review requested fixes for required timestamp/project/idempotency fields, task-specific 404 contract, and sensitive-shape fixture literals; fixes were applied and focused/full verification was rerun.
- Chrome smoke verified empty DB state, task creation, linking the same `conversationId` from two `deviceId` values, persistence after refresh, and no sensitive DOM hits.

## Plan Self-Review

- Spec coverage: tasks cover contract, DB schema/migration, Control Plane routes, Web UI/datasource, verification, Chrome, docs, and commit.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: task API schemas use `linkedConversations` with device-scoped identity; DB repository returns API contract types.

## Architecture Review Prompt

```text
你作为架构师思考需要审核的维度，指派 subagent 审核该计划。

审核 docs/superpowers/specs/2026-06-20-db-task-board-design.md 和 docs/superpowers/plans/2026-06-20-db-task-board.md。

请从架构边界、唯一事实源、DRY、模块化、安全、测试充分性、后续可维护性和是否偏离总目标等维度审核。特别检查：
- API 字段是否仍以 packages/api-contract/openapi.yaml 为唯一事实源；
- DB 字段是否以 packages/db/src/schema.ts 为唯一事实源；
- apps/web 是否不依赖 packages/db 或 codex-protocol；
- apps/control-plane 是否只通过 packages/db 访问持久化，不调用 app-server；
- apps/worker 是否不引入 DB；
- 任务 conversation link 是否 device-scoped；
- 是否避免 remote sync、pairing、reverse WSS、iOS、installer、产品化 auth、stream/event log 或自动任务推断；
- 是否避免 token、provider secrets、raw URL、raw JSON-RPC、prompt、command output、full diff、stack/cause、private path 泄漏；
- 测试和 Chrome smoke 是否覆盖持久化、重复 conversation id、失败/空态和泄漏路径。

输出 APPROVE 或 REQUEST_CHANGES；如需修改，请给出阻塞项、原因和建议修复。
```
