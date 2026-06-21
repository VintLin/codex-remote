# Runtime And Settings Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Stage 14 read-only project-scoped runtime/settings summary through Web -> Control Plane -> Worker -> Codex app-server.

**Architecture:** Public fields start in `packages/api-contract/openapi.yaml`. Worker validates the selected project, calls generated app-server methods, and projects a closed safe summary; Control Plane only routes a device/project-scoped GET; Web renders the public summary in Settings.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner, Playwright/Chrome verification.

## Global Constraints

- No DB changes.
- No model switching, config write, login/logout, token refresh, usage/rate/credits, MCP OAuth, or experimental enablement.
- Worker is the only app-server, config, account, auth, and local runtime caller.
- Web imports only public API types from `@codex-remote/api-contract`.
- Public responses must not include auth tokens, provider secrets, raw config maps, config layers, prompts, instructions, raw JSON-RPC, app-server URLs, local paths, stack/cause, command output, or full diff.

---

## Planned Files

- Modify `packages/api-contract/openapi.yaml`: add one Stage 14 project-scoped GET route and closed response schemas.
- Modify `packages/api-contract/src/index.ts`: export generated aliases.
- Generate `packages/api-contract/src/generated/openapi.ts`.
- Modify `packages/api-contract/src/contractGeneration.test.ts`: route, export, and leak-field checks.
- Create `apps/worker/src/http/runtimeSettingsHandlers.ts`: aggregate safe runtime/settings sections.
- Create `apps/worker/src/http/runtimeSettingsProjections.ts`: project generated protocol responses into public shapes.
- Modify `apps/worker/src/http/workerHttpApp.ts`: mount Worker route.
- Modify `apps/worker/src/app-server/appServerRpcClient.ts`: allowlist Stage 14 read methods.
- Modify `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`: add typed methods if reused by Worker HTTP client.
- Modify `apps/worker/src/cli/readOnlyHttpServerCli.ts` and `.test.ts`: forward new read methods in the real local harness.
- Add `apps/worker/src/http/runtimeSettingsHandlers.test.ts`.
- Add `apps/worker/src/http/runtimeSettingsProjections.test.ts`.
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
- Produces `RuntimeSettingsSummary`.
- Produces `GET /v1/devices/{deviceId}/projects/{projectId}/runtime-settings`.

- [ ] Add failing contract tests proving the project-scoped route exists, is `GET`, returns `RuntimeSettingsSummary`, and uses existing `ErrorEnvelope` for `400`, `401`, `404`, `424`, and `500`.
- [ ] Add failing leak-field tests proving Stage 14 schemas do not contain `authToken`, `token`, `secret`, `apiKey`, `rawConfig`, `layers`, `instructions`, `developerInstructions`, `compactPrompt`, `cwd`, `absolutePath`, `jsonRpc`, `appServerUrl`, `stack`, `cause`, `stdout`, `stderr`, or `fullDiff`.
- [ ] Add closed schemas for `RuntimeSettingsSummary`, `RuntimeSettingsSectionStatus`, `RuntimeModelSummary`, `RuntimeProviderCapabilities`, `RuntimeAccountSummary`, `RuntimeConfigPosture`, `RuntimePermissionProfileSummary`, and `RuntimeExperimentalFeatureSummary`.
- [ ] Add tests proving no public request body exists for Stage 14 and no write routes such as login/logout/config write/model switch/experimental enablement are added.
- [ ] Run `pnpm --filter @codex-remote/api-contract generate`.
- [ ] Export new aliases from `packages/api-contract/src/index.ts`.
- [ ] Run `pnpm --filter @codex-remote/api-contract test`.

## Task 2: Worker Runtime Settings Projection

**Files:**
- Create: `apps/worker/src/http/runtimeSettingsProjections.ts`
- Create: `apps/worker/src/http/runtimeSettingsProjections.test.ts`
- Create: `apps/worker/src/http/runtimeSettingsHandlers.ts`
- Create: `apps/worker/src/http/runtimeSettingsHandlers.test.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.ts`
- Modify: `apps/worker/src/cli/readOnlyHttpServerCli.test.ts`

**Interfaces:**
- Consumes generated protocol responses from `model/list`, `modelProvider/capabilities/read`, `account/read`, `getAuthStatus`, `config/read`, `permissionProfile/list`, and `experimentalFeature/list`.
- Produces `getRuntimeSettingsSummary(context): Promise<RuntimeSettingsSummary>`.

- [ ] Add failing projection tests for model summaries, provider capability flags, sanitized account summary, config posture allowlist, permission profiles, and experimental features.
- [ ] Add failing leak tests using fake auth tokens, full emails, prompt strings, config layers, local paths, raw JSON-RPC text, provider secrets, command output, full diff, and stack/cause text.
- [ ] Implement projection helpers with bounded arrays: models 50, permission profiles 50, experimental features 50.
- [ ] Add failing handler tests proving invalid `projectId` is rejected before app-server calls and valid `projectId` maps to the allowed project root.
- [ ] Add failing handler tests proving each app-server call uses safe params: `includeHidden: false`, `includeToken: false`, `refreshToken: false`, `includeLayers: false`, and `cwd` equal to the Worker-validated project root only inside Worker.
- [ ] Add failing handler tests proving one failed optional section returns section status `failed` without leaking details or failing the whole response.
- [ ] Mount only `GET /v1/projects/{projectId}/runtime-settings` on Worker.
- [ ] Add the Stage 14 read methods to the app-server RPC allowlist and CLI harness.
- [ ] Run `pnpm --filter @codex-remote/worker test`.

## Task 3: Control Plane Routing

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/client/workerClient.test.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`

**Interfaces:**
- Consumes Worker `GET /v1/projects/{projectId}/runtime-settings`.
- Produces Control Plane `GET /v1/devices/{deviceId}/projects/{projectId}/runtime-settings`.

- [ ] Add failing Worker client tests for the project-scoped URL and bearer auth.
- [ ] Add failing Control Plane tests proving the route calls only the selected configured device and forwards the public `projectId`.
- [ ] Add failing tests for unknown device and upstream failure using sanitized `404` and `424`.
- [ ] Implement the client method and route.
- [ ] Run `pnpm --filter @codex-remote/control-plane test`.

## Task 4: Web Settings UI

**Files:**
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- Modify: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts`
- Modify: `apps/web/src/components/shell/localWorkbenchBoundary.test.ts`

**Interfaces:**
- Consumes `WorkerApiClient.getRuntimeSettings(deviceId, projectId): Promise<RuntimeSettingsSummary>`.
- Produces Settings runtime panel props and rendering.

- [ ] Add failing Web client tests for `GET /v1/devices/{deviceId}/projects/{projectId}/runtime-settings`.
- [ ] Add failing fake Worker smoke server tests for accepted runtime-settings, project mismatch rejection, degraded section response, and serialized response-body no-leak values.
- [ ] Add failing boundary tests proving Web does not import `@codex-remote/codex-protocol` and does not render forbidden raw fields.
- [ ] Add failing UI source tests proving Settings keeps archive restore and adds read-only Runtime without login/logout/config write/model switch buttons.
- [ ] Implement one Settings runtime panel above archived conversations.
- [ ] Load runtime settings for the selected device/project when Settings opens; show compact loaded, empty, and failed states.
- [ ] Run `pnpm --filter @codex-remote/web test`.

## Task 5: Verification, Browser, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md`
- Archive completed Stage 14 spec/plan only after gates pass.

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
- [ ] Use Chrome to verify Settings runtime loaded/degraded/empty/no-secret-leak states.
- [ ] Scan fake, degraded, real, and browser-visible serialized responses for forbidden values, not just forbidden field names.
- [ ] Update docs and archive Stage 14 spec/plan.
- [ ] Commit locally once after full verification. Do not push unless explicitly requested.

## Current Status

- Stage 14 spec and plan created.
- Architecture review pending.
