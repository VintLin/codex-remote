# Conversation Workbench Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage 11 conversation workbench parity for open/resume, archive/unarchive, rename, loaded/live badges, snapshot-first timeline events, and approval-card pending/resolved state.

**Architecture:** `packages/api-contract/openapi.yaml` defines the public API first. `apps/worker` maps generated `packages/codex-protocol` lifecycle and loaded-list methods into public shapes; `apps/control-plane` only routes and normalizes device identity; `apps/web` consumes the public Control Plane-shaped API.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Next.js, OpenAPI 3.1, openapi-typescript, Node built-in test runner.

## Global Constraints

- API fields start in `packages/api-contract/openapi.yaml`; generated types update only through `pnpm --filter @codex-remote/api-contract generate`.
- Codex app-server protocol shapes come only from `packages/codex-protocol`.
- DB schema is not changed in Stage 11.
- `apps/worker` is the only app-server/local boundary.
- `apps/control-plane` does not call app-server directly.
- `apps/web` imports only public API contract types, never `packages/codex-protocol`.
- Do not expose token, provider secret, raw app-server URL, raw JSON-RPC, raw prompt, command output, full diff, stack/cause, or private path.
- Do not implement rollback, raw `inject_items`, arbitrary shell/filesystem write, plugin install, account login/logout, realtime voice, Windows setup, feedback upload, or external agent import.
- Do not expose `item/tool/requestUserInput` or `mcpServer/elicitation/request`; Stage 11 approval cards are derived only from the existing approval registry.
- Keep changes scoped to Stage 11 files and tests.

---

### Task 1: Public Contract And Worker Lifecycle

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Generate: `packages/api-contract/src/generated/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/http/projections.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/controlHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Test: `packages/api-contract/src/*.test.ts`
- Test: `apps/worker/src/http/*.test.ts`

**Interfaces:**
- Consumes generated `v2.ThreadResumeParams`, `v2.ThreadArchiveParams`, `v2.ThreadUnarchiveParams`, `v2.ThreadSetNameParams`, `v2.ThreadLoadedListParams`, and `v2.ThreadLoadedListResponse`.
- Produces public `OpenConversationResult`, `ConversationLifecycleInput`, `RenameConversationInput`, `ConversationWorkbenchEvent`, and `ConversationApprovalCard`.

- [ ] **Step 1: Write failing contract and Worker tests**

Add tests proving:

- `CodexConversation` accepts `archived`, `loaded`, and `live`; `title` remains the only public display title.
- `ConversationTimeline` accepts `events`, `loaded`, `live`, `archived`.
- `ConversationWorkbenchEvent` requires `eventId`, monotonic `seq`, `deviceId`, `conversationId`, `kind`, `createdAt`, and `source`, and supports optional `gap`.
- Worker list includes loaded/live flags from loaded-list and active status.
- Worker conversation list includes archived rows by default with `archived: true`, so restore is discoverable.
- Worker open calls resume and returns sanitized conversation/timeline result.
- Worker archive/unarchive/rename validate ownership before app-server write.
- Worker rejects overlong or blank rename title.
- Worker approval cards never include raw command output, raw prompt, raw paths, or JSON-RPC frames.

Run:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/worker test
```

Expected: tests fail because schemas/routes/methods do not exist yet.

- [ ] **Step 2: Update OpenAPI and generate types**

Add the minimal schemas and routes named in the spec. Reuse existing `CommandAccepted`, `ErrorEnvelope`, and conversation/timeline schemas where possible. Then run:

```bash
pnpm --filter @codex-remote/api-contract generate
pnpm --filter @codex-remote/api-contract test
```

Expected: contract generation succeeds; contract tests pass or move to Worker failures.

- [ ] **Step 3: Implement Worker app-server lifecycle methods**

Add methods to `AppServerWorkerClient`:

```ts
async resumeThread(params: v2.ThreadResumeParams): Promise<v2.ThreadResumeResponse> {
  return (await this.rpc.request("thread/resume", params)) as v2.ThreadResumeResponse;
}

async archiveThread(params: v2.ThreadArchiveParams): Promise<v2.ThreadArchiveResponse> {
  return (await this.rpc.request("thread/archive", params)) as v2.ThreadArchiveResponse;
}

async unarchiveThread(params: v2.ThreadUnarchiveParams): Promise<v2.ThreadUnarchiveResponse> {
  return (await this.rpc.request("thread/unarchive", params)) as v2.ThreadUnarchiveResponse;
}

async setThreadName(params: v2.ThreadSetNameParams): Promise<v2.ThreadSetNameResponse> {
  return (await this.rpc.request("thread/name/set", params)) as v2.ThreadSetNameResponse;
}

async listLoadedThreads(params: v2.ThreadLoadedListParams): Promise<v2.ThreadLoadedListResponse> {
  return (await this.rpc.request("thread/loaded/list", params)) as v2.ThreadLoadedListResponse;
}
```

- [ ] **Step 4: Implement Worker projections and routes**

Add lifecycle handlers in `controlHandlers.ts` and route parsing in `workerHttpApp.ts`.

Implementation rules:

- Validate ownership with `readAllowedConversationThread` before lifecycle writes.
- Use `thread/read` after write where a response lacks full thread data.
- Use `thread/loaded/list` as a best-effort flag source; if it fails, return `loaded: false`, `live: false` without leaking details.
- `archive` returns the same lifecycle result shape as `open` and `unarchive`; list responses continue to include the archived row with `archived: true`.
- `rename` limits title length to 120 and strips surrounding whitespace.

Run:

```bash
pnpm --filter @codex-remote/worker test
```

Expected: Worker tests pass.

### Task 2: Control Plane Routing And Web Workbench UI

**Files:**
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Test: `apps/control-plane/src/client/workerClient.test.ts`
- Test: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/sidebar/sidebar.tsx`
- Modify: `apps/web/src/components/sidebar/action-menu.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/data/workerApi/client.test.ts`
- Test: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Test: `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts`

**Interfaces:**
- Consumes Task 1 public API types and Worker routes.
- Produces visible Web open/rename/archive/restore and loaded/live/request-card state.

- [ ] **Step 1: Write failing Control Plane and Web tests**

Add tests proving:

- Control Plane routes lifecycle calls to the configured Worker and normalizes returned `deviceId`.
- Web client calls the device-scoped lifecycle endpoints with expected JSON.
- Selecting a conversation triggers `openConversation` before refresh.
- Sidebar/header display loaded/live/archived badges.
- Rename/archive/restore actions show accepted/failed state and refresh.
- Approval cards show pending/resolved state and keep failure copy sanitized.
- Web domain tests cover duplicate event suppression, late event ordering, `snapshot_reset`, and snapshot-before-live reconciliation.

Run:

```bash
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/web test
```

Expected: tests fail because routes/client/UI methods do not exist yet.

- [ ] **Step 2: Implement Control Plane pass-through**

Add `WorkerUpstreamClient` methods:

- `openConversation`
- `archiveConversation`
- `unarchiveConversation`
- `renameConversation`

Add Hono routes under `/v1/devices/:deviceId/conversations/:conversationId/...` and map `PATCH` support into CORS methods.

- [ ] **Step 3: Implement Web API client and controllers**

Add methods to `WorkerApiClientLike` and `WorkerApiClient`. Keep lifecycle submit logic in existing shell controller style or inline only if used once.

Ponytail rule: if a submit path is used only once and has no branchy logic, keep it inline in `CodexRemoteApp`; extract only if tests need it.

- [ ] **Step 4: Implement Web UI state**

Add compact controls:

- Conversation row trailing badges for loaded/live/archived.
- Header status badges.
- Rename prompt or compact inline input with native browser primitives; no modal framework.
- Archive/Restore buttons in existing action menu/header actions.
- Approval cards inside `ConversationControlStrip`, reusing pending approvals and resolved lifecycle state.

Run:

```bash
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/web test
```

Expected: tests pass.

### Task 3: Verification, Real Chrome Check, And Stage Docs

**Files:**
- Modify: `PLAN.md`
- Modify: `FEATURE_SUPPORT.md`
- Modify: `CODEX_APP_PARITY.md` only if support status wording changes
- Modify: `docs/superpowers/specs/2026-06-21-conversation-workbench-parity-design.md`
- Modify: `docs/superpowers/plans/2026-06-21-conversation-workbench-parity.md`

**Interfaces:**
- Consumes implementation evidence from Tasks 1-2.
- Produces Stage 11 status, verification evidence, and known risks.

- [ ] **Step 1: Run focused checks**

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/web test
```

- [ ] **Step 2: Run full checks**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 3: Run real stack and Chrome verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
```

Then use Chrome to verify:

- open/resume normal path;
- archive/unarchive normal path;
- rename normal path;
- loaded/live badge;
- snapshot-first timeline before request/live state;
- approval cards pending/resolved where safe evidence exists;
- failure/degraded route with sanitized copy;
- no visible or network-exposed sensitive strings.

- [ ] **Step 4: Update docs and commit**

Update `PLAN.md` and support docs with:

- completed Stage 11 items;
- focused/full verification commands and results;
- Chrome verification results;
- fixed issues;
- remaining risks or real gaps.

Commit:

```bash
git add packages apps docs PLAN.md FEATURE_SUPPORT.md CODEX_APP_PARITY.md
git commit -m "feat: add conversation workbench parity"
```

## Current Stage Status

- Spec and plan written.
- Plan review completed as approve-with-fixes; findings addressed by narrowing request cards to approval cards, defining event identity/order/gap/source fields, keeping archived rows discoverable, and using `title` as the only public display title.
- Task 1 implementation reviewed; fixes applied for public title rename, resolved approval events, typed lifecycle RPC methods, and read-after-write lifecycle projection.
- Task 2 implementation reviewed; fixes applied for snapshot timeline approval cards, nested event `deviceId` normalization, and approval-card reconciliation by approval identity.
- Focused verification passed: api-contract 27/27, worker 185/185, control-plane 41/41, web 106/106, `pnpm typecheck` 11/11.
- Full verification passed: `pnpm product:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Real stack verification passed with caveats: `pnpm real:start`, `pnpm real:status`, `pnpm web:e2e:smoke`, and Stage 11 lifecycle API checks passed; `pnpm real:check` records `total=19 realPass=17 fixedPass=0 realGap=2`.
- Chrome verification is blocked by the Chrome control tool, not by product code: Node-backed Chrome control fails with missing sandbox metadata after retry. Stage 11 remains open until @chrome browser verification is completed.
