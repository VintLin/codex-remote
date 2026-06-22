# Advanced Platform Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Stage 15 read-only advanced platform support summary through Web -> Control Plane -> Worker -> Codex app-server.

**Architecture:** Public fields start in `packages/api-contract/openapi.yaml`. Worker validates the selected project, calls only safe advanced read capability `windowsSandbox/readiness`, projects static support-matrix watchlist items for unsupported advanced areas, and returns a closed summary. Control Plane only routes a device/project-scoped GET with exact-field projection. Web renders the public summary in Settings.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner, Playwright/Chrome verification.

## Global Constraints

- No DB changes.
- No realtime voice start/control, WebRTC, audio, transcript streaming, feedback upload, external-agent detect/import, Windows setup, remote GUI, automations, shell, filesystem writes, config writes, login/logout, model switching, plugin/MCP mutation, or provider abstraction.
- Worker is the only app-server, local platform, filesystem, feedback, remote-control, and automation boundary.
- Web imports only public API types from `@codex-remote/api-contract`.
- Public responses must not include auth tokens, provider secrets, app-server URLs, raw JSON-RPC, local paths, logs, prompts, command output, stack/cause, full diff, environment variables, hostnames, usernames, migration items, executable action ids, input fields, support claims for unsupported features, or uploaded-file metadata.

---

## Planned Files

- Modify `packages/api-contract/openapi.yaml`: add one Stage 15 project-scoped GET route and closed response schemas.
- Modify `packages/api-contract/src/index.ts`: export generated aliases.
- Generate `packages/api-contract/src/generated/openapi.ts`.
- Modify `packages/api-contract/src/contractGeneration.test.ts`: route, export, closed schema, and non-exposure checks.
- Create `apps/worker/src/http/advancedPlatformHandlers.ts`: aggregate readiness sections and watchlist items.
- Create `apps/worker/src/http/advancedPlatformProjections.ts`: project generated Windows readiness and static support-matrix rows into public shapes.
- Modify `apps/worker/src/http/workerHttpApp.ts`: mount Worker route.
- Modify `apps/worker/src/app-server/appServerRpcClient.ts`: allowlist `windowsSandbox/readiness` only from the Stage 15 advanced protocol group.
- Modify `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`: add typed Windows readiness method if the Worker HTTP harness reuses it.
- Modify `apps/worker/src/cli/readOnlyHttpServerCli.ts` and `.test.ts`: forward the new read method in the real local harness.
- Add `apps/worker/src/http/advancedPlatformHandlers.test.ts`.
- Add `apps/worker/src/http/advancedPlatformProjections.test.ts`.
- Modify `apps/control-plane/src/client/workerClient.ts` and `.test.ts`.
- Modify `apps/control-plane/src/http/controlPlaneHttpApp.ts` and `.test.ts`.
- Modify `apps/web/src/data/workerApi/client.ts` and `.test.ts`.
- Modify `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts` and `.test.ts`.
- Modify `apps/web/src/data/workerApi/workbenchData.ts` and `.test.ts` only if Settings consumes the summary through workbench data.
- Modify `apps/web/src/components/detail/main-panels.tsx`, `apps/web/src/components/shell/codex-remote-app.tsx`, and `apps/web/src/app/globals.css`.
- Modify Web boundary tests under `apps/web/src/components/shell/`.
- Modify `PLAN.md`, `FEATURE_SUPPORT.md`, and `CODEX_APP_PARITY.md` only at closure.

## Task 1: Public Contract

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify: `packages/api-contract/src/contractGeneration.test.ts`
- Modify: `packages/api-contract/src/index.ts`
- Generate: `packages/api-contract/src/generated/openapi.ts`

**Interfaces:**
- Produces `AdvancedPlatformReadinessSummary`.
- Produces `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`.

- [ ] Add failing contract tests proving the project-scoped route exists, is `GET`, returns `AdvancedPlatformReadinessSummary`, and uses existing `ErrorEnvelope` for `400`, `401`, `404`, `424`, and `500`.
- [ ] Add failing tests proving all Stage 15 object schemas are closed and bounded.
- [ ] Add failing leak-field tests proving Stage 15 schemas do not contain `authToken`, `token`, `secret`, `apiKey`, `appServerUrl`, `jsonRpc`, `absolutePath`, `cwd`, `home`, `hostname`, `username`, `env`, `logs`, `prompt`, `stdout`, `stderr`, `stack`, `cause`, `fullDiff`, `migrationItems`, `extraLogFiles`, or upload fields.
- [ ] Add closed schemas for `AdvancedPlatformReadinessSummary`, `AdvancedPlatformReadinessSection`, and `AdvancedPlatformWatchlistItem`.
- [ ] Add tests proving readiness status and watchlist support use separate enums; watchlist items cannot use `ready`.
- [ ] Add tests proving no public request body exists for Stage 15 and no write routes such as realtime start, feedback upload, external-agent detect/import, Windows setup, remote GUI, automation mutation, shell, config write, login/logout, or model switch are added.
- [ ] Run `pnpm --filter @codex-remote/api-contract generate`.
- [ ] Export new aliases from `packages/api-contract/src/index.ts`.
- [ ] Run `pnpm --filter @codex-remote/api-contract test`.

## Task 2: Worker Advanced Readiness Projection

**Files:**
- Create: `apps/worker/src/http/advancedPlatformProjections.ts`
- Create: `apps/worker/src/http/advancedPlatformProjections.test.ts`
- Create: `apps/worker/src/http/advancedPlatformHandlers.ts`
- Create: `apps/worker/src/http/advancedPlatformHandlers.test.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.test.ts`

**Interfaces:**
- Consumes generated `windowsSandbox/readiness`.
- Produces `getAdvancedPlatformReadinessSummary(context, projectId): Promise<AdvancedPlatformReadinessSummary>`.

- [ ] Add failing projection tests for Windows readiness values `ready`, `notConfigured`, and `updateRequired`.
- [ ] Add failing projection tests for static watchlist items: realtime voice, feedback upload, external agent config, remote GUI/computer use, and automations.
- [ ] Add failing projection tests proving non-Windows Windows sandbox state is `not_applicable` when no transport/app-server failure occurs, and transport/app-server failure is `degraded`.
- [ ] Add failing leak tests using fake tokens, provider secrets, local paths, home paths, hostnames, usernames, environment variable text, raw JSON-RPC text, prompts, logs, command output, full diff, migration items, extra log file names, and stack/cause text.
- [ ] Implement projection helpers with bounded readiness sections, bounded watchlist items, and stable product identifiers.
- [ ] Add failing handler tests proving invalid `projectId` is rejected before app-server calls and valid `projectId` maps to the allowed project root without exposing that path.
- [ ] Add failing handler tests proving the only Stage 15 advanced app-server method called is `windowsSandbox/readiness`.
- [ ] Add failing handler tests proving readiness failure returns a degraded section and safe watchlist items instead of failing the whole response.
- [ ] Mount only `GET /v1/projects/{projectId}/advanced-platform-readiness` on Worker.
- [ ] Add only `windowsSandbox/readiness` to the app-server RPC allowlist and CLI harness.
- [ ] Run `pnpm --filter @codex-remote/worker test`.

## Task 3: Control Plane Routing

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/client/workerClient.test.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`

**Interfaces:**
- Consumes Worker `GET /v1/projects/{projectId}/advanced-platform-readiness`.
- Produces Control Plane `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`.

- [ ] Add failing Worker client tests for the project-scoped URL and bearer auth.
- [ ] Add failing Control Plane tests proving the route calls only the selected configured device and forwards the public `projectId`.
- [ ] Add failing tests for unknown device and upstream failure using sanitized `404` and `424`.
- [ ] Add tests proving Control Plane normalizes `deviceId` and `projectId` to the selected route values without altering readiness sections or watchlist items.
- [ ] Add exact-field projection tests proving hostile upstream extra fields such as `cwd`, `appServerUrl`, `logs`, `stack`, `actionId`, and input fields are rejected rather than forwarded.
- [ ] Implement `projectAdvancedPlatformReadinessSummary` using exact-field projection in the Worker client.
- [ ] Implement the client method and route.
- [ ] Run `pnpm --filter @codex-remote/control-plane test`.

## Task 4: Web Settings UI

**Files:**
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/shell/localWorkbenchBoundary.test.ts`

**Interfaces:**
- Consumes `WorkerApiClient.getAdvancedPlatformReadiness(deviceId, projectId): Promise<AdvancedPlatformReadinessSummary>`.
- Produces Settings advanced platform panel props and rendering.

- [ ] Add failing Web client tests for `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`.
- [ ] Add failing fake Worker smoke server tests for loaded readiness, non-Windows `not_applicable`, degraded Windows readiness, project mismatch rejection, and serialized response-body no-leak values.
- [ ] Add failing boundary tests proving Web does not import `@codex-remote/codex-protocol` and does not render forbidden raw fields.
- [ ] Add failing UI source tests proving Settings keeps Runtime & Settings plus archive restore and adds read-only Advanced Platform without upload/import/setup/automation/remote-control buttons.
- [ ] Implement one Settings advanced platform panel below Runtime & Settings and above archived conversations.
- [ ] Load advanced platform readiness for the selected device/project when Settings opens; show compact loaded, empty, degraded, and failed states.
- [ ] Run `pnpm --filter @codex-remote/web test`.

## Task 5: Verification, Browser, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md`
- Archive completed Stage 15 spec/plan only after gates pass.

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
- [ ] Run direct real API smoke for `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`, proving the new endpoint uses Web -> Control Plane -> Worker -> Codex app-server and returns selected `deviceId`/`projectId`, one Windows readiness section with `ready`/`not_applicable`/`degraded`/`unavailable`, watchlist items without action/input fields, and no forbidden values.
- [ ] Use Chrome to verify Settings advanced platform loaded/degraded/empty/no-secret-leak states.
- [ ] Scan fake, degraded, real, and browser-visible serialized responses for forbidden values, not just forbidden field names.
- [ ] Update `PLAN.md`, `FEATURE_SUPPORT.md`, and `CODEX_APP_PARITY.md`.
- [ ] Archive Stage 15 spec/plan after full verification.
- [ ] Commit locally once after full verification. Do not push unless explicitly requested.

## Current Status

- Stage 15 spec and plan created.
- Required architecture review pending: 你作为架构师思考需要审核的维度，指派 subagent 审核该计划。
