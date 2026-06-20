# Web Real Datasource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/web` to the Stage 2 read-only Worker API through a small datasource boundary while keeping fixture fallback.

**Architecture:** The Web app imports public contract types from `@codex-remote/api-contract`, fetches Worker HTTP read-only endpoints through `apps/web/src/data/workerApi`, and renders the existing shell from one `WorkbenchData` snapshot. Mock data remains a fallback/fixture only. Worker and Codex app-server protocols stay outside Web.

**Tech Stack:** TypeScript, React/Next.js, Node built-in test runner, pnpm, Turborepo, OpenAPI-generated public types from `@codex-remote/api-contract`.

## Global Constraints

- Public API fields come from `packages/api-contract/openapi.yaml`; do not hand-write parallel public DTOs.
- Web may import public types from `@codex-remote/api-contract`.
- Web must not import `@codex-remote/codex-protocol`.
- `apps/worker` remains the only package allowed to start or call Codex app-server.
- Do not implement write operations, stream/SSE/WebSocket, approval, interrupt, steer, Control Plane, DB, iOS, pairing, deployment, or productized auth in this stage.
- Do not create `apps/control-plane`, `packages/db`, or broad shared utility packages.
- Do not log or render bearer tokens, raw app-server URL, raw JSON-RPC, stack/cause, prompt text, assistant text, command output, full diff, tool arguments, or private out-of-root paths.
- Timeline rendering in Stage 3 is metadata-only, including fallback.
- Search results derive from the active workbench snapshot, not from global mock data.
- Direct TypeScript imports inside `apps/web/src` should follow the repo's existing extension style.

---

## Task 1: Add Web Datasource Tests

**Files:**

- Create: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Create: `apps/web/src/data/workerApi/workbenchData.ts`
- Create: `apps/web/src/data/workerApi/client.ts`

**Interfaces:**

- Produces: `loadWorkbenchData(options: LoadWorkbenchDataOptions): Promise<WorkbenchData>`
- Produces: `createFallbackWorkbenchData(reason: WorkbenchData["source"]["reason"]): WorkbenchData`
- Produces: `WorkerApiClient` with `getHealth()`, `getCapabilities()`, `listConversations()`, `getTimeline(conversationId)`

**Steps:**

- [x] Create placeholder exported functions/types with minimal bodies so tests compile.
- [x] Add tests for successful snapshot creation from fake contract responses.
- [x] Add tests for missing token fallback without calling fetch.
- [x] Add tests for `401`, `403`, and `424` sanitized fallback.
- [x] Add tests that projectless conversations do not create projects.
- [x] Add tests that timeline projection creates metadata-only nodes.
- [x] Add tests that fallback does not reuse rich mock assistant threads.
- [x] Add tests that search recents are derived from `WorkbenchData.conversations`.

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "workbench datasource"
```

Expected before Task 2:

- Tests fail on placeholder behavior.

---

## Task 2: Implement Worker API Client And Snapshot Projection

**Files:**

- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`

**Interfaces:**

```ts
export interface WorkerApiClientConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface LoadWorkbenchDataOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  selectedConversationId?: string | null;
}
```

**Steps:**

- [x] Implement `WorkerApiClient` using `fetch`.
- [x] Parse non-2xx responses as sanitized `ErrorEnvelope` when available.
- [x] Implement `WorkbenchData` using existing `Device`, `RemoteProject`, `CodexConversation`, and `AssistantThreadSnapshot` types.
- [x] Derive one device from `WorkerHealth`.
- [x] Derive projects from conversations by `projectId`.
- [x] Convert `ConversationTimeline.turns` into safe metadata-only assistant timeline nodes.
- [x] Derive `searchRecents` from the same conversations array.
- [x] Return fallback fixture when token is empty or a request fails.
- [x] Build fallback assistant threads from conversation metadata only; do not import or reuse rich `assistantThreads`.

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "workbench datasource"
pnpm --filter @codex-remote/web typecheck
```

Expected:

- Focused datasource tests pass.
- Web typecheck exits `0`.

---

## Task 3: Wire CodexRemoteApp To WorkbenchData

**Files:**

- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/data/app-server/mockData.test.ts`

**Interfaces:**

- Consumes: `loadWorkbenchData(options): Promise<WorkbenchData>`
- Consumes: `WorkbenchData.devices`, `WorkbenchData.projects`, `WorkbenchData.conversations`, `WorkbenchData.assistantThreads`, `WorkbenchData.searchRecents`, `WorkbenchData.source`

**Steps:**

- [x] Replace direct shell reads from `mockData` with component state initialized from `createFallbackWorkbenchData("not_configured")`.
- [x] Load Worker data in a client `useEffect` using `NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL` and `NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN`.
- [x] Keep selected device/conversation valid when data changes.
- [x] Pass devices/projects/conversations/assistantThreads into detail components instead of importing mock arrays there.
- [x] Pass `searchRecents` into `SearchDialog`; remove `SearchDialog` direct imports from `mockData`.
- [x] Render a compact datasource status line without exposing token or raw URLs.
- [x] Keep write controls disabled.
- [x] Update tests that assumed mock metadata source if needed.

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected:

- Web tests pass.
- Web typecheck exits `0`.

---

## Task 4: Stage Review, Verification, And Docs

**Files:**

- Modify: `PLAN.md`
- Modify: `docs/superpowers/specs/2026-06-20-web-real-datasource-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-web-real-datasource.md`
- Create: `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`

**Steps:**

- [x] Run focused Web verification.
- [x] Run repository gate.
- [x] Add a deterministic fake Worker smoke server for local browser verification.
- [x] Start fake Worker with a fixed token and Stage 2 read-only responses.
- [x] Start Web with `NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL` and `NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN`.
- [x] Verify API-loaded normal path in Chrome at `http://127.0.0.1:5173`.
- [x] Stop fake Worker or clear token and verify fallback path in Chrome.
- [x] Update `PLAN.md` with Stage 3 completion status, verification, risks, and Stage 4 recommendation.
- [x] Commit the Stage 3 changes.

Commands:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm web:start
```

Chrome checks:

- Workbench renders without layout overlap.
- Datasource status is visible and sanitized.
- API-loaded conversation list is visible with fake Worker data.
- Selecting a conversation changes the main pane.
- Search results point only to active workbench conversations.
- Timeline rows are metadata-only.
- Follow-up composer remains disabled/read-only.

Expected:

- Focused and project-level commands exit `0`.
- Chrome fallback smoke passes.
- API-loaded Chrome smoke passes with the deterministic fake Worker.

## Execution Record

Subagent-driven implementation completed in four tasks:

- Task 1: datasource test scaffold and red tests.
- Task 2: Worker API client and `WorkbenchData` projection.
- Task 3: shell/search/detail wiring to `WorkbenchData`.
- Task 4: fake Worker Chrome smoke, verification, and docs.

Review and fix loop:

- Task 1 review fixed placeholder/test scope issues.
- Task 2 review fixed success state and timeline error handling.
- Task 3 review fixed unsafe Worker error message rendering.
- Task 4 Chrome smoke found browser `fetch` illegal invocation from an unbound native fetch; fixed by binding `globalThis.fetch` in `WorkerApiClient` and adding a regression test.
- Task 4 Chrome smoke also expanded the fake Worker server to include timeline data for both deterministic conversations.

Verification completed:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Chrome verification completed with `chrome:control-chrome`:

- Normal path: fake Worker data rendered `Smoke Worker conversation`, `stage3-smoke`, `loaded`, metadata-only `turn completed`, no fixture fallback, no raw Worker URL, no token.
- Search path: search opened from the sidebar, result for `Smoke complete conversation` was selectable from the active workbench dataset.
- Selection path: selecting `Smoke complete conversation` changed the main pane and stayed `loaded`.
- Fallback path: stopping fake Worker returned to fixture `Worker probe spike` with `request_failure`, no smoke data, no raw Worker URL, no token, and disabled write controls.
