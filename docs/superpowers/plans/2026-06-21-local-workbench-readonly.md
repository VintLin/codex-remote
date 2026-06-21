# Local Workbench Read-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only local work surfaces for files, Git/review, search, MCP, extensions, skills, hooks, and apps through Web -> Control Plane -> Worker -> Codex app-server/local project boundaries.

**Architecture:** Public API starts in `packages/api-contract/openapi.yaml`. Worker owns filesystem/app-server access and redaction. Control Plane routes selected-device requests, and Web renders only Control Plane-shaped public data.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner, Playwright/Chrome verification.

## Global Constraints

- No DB changes for Stage 12 unless implementation discovers a real persistence need.
- No write/execute routes: no filesystem writes, shell execution, command evidence/history/output, plugin install, MCP tool call, review start, config write, or account login/logout.
- Exposed file paths must be project-relative; absolute local paths remain Worker-private.
- File previews are text-only and bounded; binary or oversized files return safe unavailable metadata.
- No raw prompt, raw command output, command text, full diff, diff hunk/header/body, raw JSON-RPC, stack/cause, token, provider secret, app-server URL, or private path leaks.
- Extension inventory is whitelist-only: never expose `path`, `sourcePath`, `marketplacePath`, `command`, `contents`, skill prompt bodies, hook commands, or plugin skill file contents.
- Web imports only `@codex-remote/api-contract` public types, never `@codex-remote/codex-protocol`.
- Control Plane imports no Worker internals and no app-server protocol types.

---

## Planned Files

- Modify `packages/api-contract/openapi.yaml`: add Stage 12 public schemas and routes.
- Modify `packages/api-contract/src/index.ts`: export generated public types only.
- Generate `packages/api-contract/src/generated/openapi.ts`.
- Modify `packages/api-contract/src/contractGeneration.test.ts`: contract/source-of-truth tests.
- Create `apps/worker/src/http/localWorkbenchHandlers.ts`: Worker read-only local work handlers.
- Create `apps/worker/src/http/localWorkbenchProjections.ts`: small redaction/projection helpers.
- Modify `apps/worker/src/http/workerHttpApp.ts`: mount Worker read-only routes.
- Add `apps/worker/src/http/localWorkbenchHandlers.test.ts` and `localWorkbenchProjections.test.ts`.
- Modify `apps/control-plane/src/client/workerClient.ts`: route/project Stage 12 Worker responses.
- Modify `apps/control-plane/src/http/controlPlaneHttpApp.ts`: add device-scoped Stage 12 routes.
- Modify `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`: routing, identity, sanitized errors.
- Modify `apps/web/src/data/workerApi/client.ts`: Stage 12 API client methods.
- Modify `apps/web/src/data/workerApi/workbenchData.ts`: load local workbench data for selected device/project.
- Add `apps/web/src/domain/localWorkbench/localWorkbenchModel.ts`: tiny grouping/filter helpers if two Web components need them.
- Modify `apps/web/src/components/detail/main-panels.tsx`, `apps/web/src/components/sidebar/sidebar.tsx`, and `apps/web/src/components/shell/codex-remote-app.tsx`: Local Tools view.
- Modify `apps/web/src/app/globals.css`: compact tool surface styles using existing tokens.
- Add/modify `apps/web/src/**/*.test.ts`: client, datasource, UI source-boundary tests.
- Modify `FEATURE_SUPPORT.md`, `CODEX_APP_PARITY.md`, and `PLAN.md`: stage status and evidence.

## Task 1: Public Stage 12 Contract

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`
- Modify: `packages/api-contract/src/index.ts`
- Generate: `packages/api-contract/src/generated/openapi.ts`

**Interfaces:**
- Produces public schemas: `LocalWorkbenchSummary`, `ProjectDirectoryListing`, `ProjectFilePreview`, `ProjectGitSummary`, `ProjectSearchResult`, `McpServerSummary`, `ExtensionInventory`.
- Produces routes under `/v1/devices/{deviceId}/projects/{projectId}/local-workbench/*`.

- [ ] Add failing contract tests that assert the Stage 12 routes exist, are `GET` only, and every response uses closed public schemas.
- [ ] Add failing tests that assert schema text does not contain raw leak fields: `absolutePath`, `rawCommand`, `rawOutput`, `commandText`, `fullDiff`, `diffHunk`, `jsonRpc`, `token`, `secret`, `appServerUrl`, `sourcePath`, `marketplacePath`, `contents`.
- [ ] Add OpenAPI routes:
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/summary`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/files`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/file-preview`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/git`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/search`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/mcp`
  - `GET /v1/devices/{deviceId}/projects/{projectId}/local-workbench/extensions`
- [ ] Add public schemas with bounded strings, bounded arrays, project-relative path fields, whitelist-only extension fields, parsed Git summary fields, and `ErrorEnvelope` responses.
- [ ] Run `pnpm --filter @codex-remote/api-contract generate`.
- [ ] Export new aliases from `packages/api-contract/src/index.ts`.
- [ ] Run `pnpm --filter @codex-remote/api-contract test`.

## Task 2: Worker Read-only Local Adapters

**Files:**
- Create: `apps/worker/src/http/localWorkbenchProjections.ts`
- Create: `apps/worker/src/http/localWorkbenchHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Test: `apps/worker/src/http/localWorkbenchProjections.test.ts`
- Test: `apps/worker/src/http/localWorkbenchHandlers.test.ts`

**Interfaces:**
- Consumes generated protocol through existing Worker app-server session boundaries.
- Produces public API types from `@codex-remote/api-contract`.

- [ ] Add projection tests for project-relative path normalization and rejection of `..`, absolute paths, sibling realpaths, token-like text, raw command output, command text, and raw diff markers.
- [ ] Add handler tests for directory listing, metadata, and bounded text preview inside the allowed project root.
- [ ] Add handler tests that binary/oversized files return `previewKind: "unavailable"` without file bytes.
- [ ] Add Git projection tests using fake `gitDiffToRemote` output that contains secret markers, absolute paths, prompt-like text, and diff hunks; expected output is only file-level project-relative path, change status, and counts, with no hunk/header/body text.
- [ ] Add extension projection tests using fake skills/hooks/plugins/apps payloads that contain `path`, `sourcePath`, `marketplacePath`, `command`, and `contents`; expected output is whitelist-only metadata and no raw local path, command, or skill body.
- [ ] Add handler tests for Git/search/MCP/extensions using fake app-server client responses.
- [ ] Implement minimal Worker handlers using Node `fs` for read-only file metadata/preview and generated app-server methods for Git/search/MCP/extensions.
- [ ] Mount only `GET` routes in `workerHttpApp.ts`.
- [ ] Run `pnpm --filter @codex-remote/worker test`.

## Task 3: Control Plane Device-scoped Routing

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Test: `apps/control-plane/src/client/workerClient.test.ts`
- Test: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`

**Interfaces:**
- Consumes Worker Stage 12 routes.
- Produces normalized configured `deviceId` for Web.

- [ ] Add worker client tests for every Stage 12 route path and response projector.
- [ ] Add Control Plane HTTP tests proving routes call only the selected device.
- [ ] Add tests proving unknown device returns sanitized 404 and upstream failure returns sanitized 424/500 without Worker URLs or tokens.
- [ ] Implement route pass-through and configured device id normalization.
- [ ] Run `pnpm --filter @codex-remote/control-plane test`.

## Task 4: Web Data And UI

**Files:**
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Create: `apps/web/src/domain/localWorkbench/localWorkbenchModel.ts` only if two components need shared grouping/filtering.
- Modify: `apps/web/src/components/sidebar/sidebar.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/data/workerApi/client.test.ts`
- Test: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Test: `apps/web/src/components/shell/*.test.ts`

**Interfaces:**
- Consumes Control Plane-shaped Stage 12 public APIs only.
- Produces a compact Local Tools view with Files, Git/Review, Search, MCP, and Extensions sections. Command evidence/output is out of scope for Stage 12.

- [ ] Add client tests for the seven Stage 12 GET routes.
- [ ] Add datasource tests for loaded data, empty data, degraded one-section failure, and no-token fallback.
- [ ] Add source-boundary tests that Web does not import `@codex-remote/codex-protocol` and does not render raw leak marker fields, extension raw path fields, hook commands, skill contents, command output, or diff hunks.
- [ ] Implement the smallest usable UI: local tools nav, files list/preview, Git summary, search box/results, MCP list, extension inventory list.
- [ ] Keep unsupported write actions absent or disabled; do not add clickable no-op controls.
- [ ] Run `pnpm --filter @codex-remote/web test`.

## Task 5: Verification, Chrome, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md`
- Archive completed Stage 12 spec/plan only after gates pass.

**Interfaces:**
- Consumes implementation evidence from Tasks 1-4.
- Produces Stage 12 closure evidence.

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
- [ ] Use Chrome to verify normal, empty, degraded, and no-secret-leak states.
- [ ] Update docs and archive Stage 12 spec/plan.
- [ ] Commit locally. Do not push unless explicitly requested.

## Current Status

- Stage 12 spec and plan created.
- Required architecture review pending: 你作为架构师思考需要审核的维度，指派 subagent 审核该计划。
