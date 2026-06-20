# Real Local Codex Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the already-built Stage 3-8 capabilities into a verified real local Codex loop through `Web -> Control Plane -> Worker -> Codex app-server`.

**Architecture:** Keep the current package boundaries. Add only the missing project discovery contract needed for real start-conversation, then fix startup, Web fallback clarity, start UI, and real E2E calibration evidence.

**Current gap:** Tasks 1-12 are implemented, but Stage 9 is not complete. `pnpm real:start` now defaults to Worker-owned `stdio` and starts Worker, Control Plane, and Web. Latest `pnpm real:check` records `total=19 realPass=15 fixedPass=0 realGap=4`; start, timeline, follow-up, approval pending list, interrupt, task link, and Q24 degraded-vs-empty fixtures now record `real-pass`. Remaining work is the next vertical slice for steer, approval decision scenario, and Q23 real probes.

**Tech Stack:** TypeScript, pnpm, Turborepo, Next.js, Hono, OpenAPI 3.1, openapi-typescript, Node built-in test runner, SQLite/Drizzle, Codex CLI app-server.

## Global Constraints

- Use the current Mac as the only real device for this stage.
- Run the full local stack: Codex app-server, Worker, Control Plane, Web, and SQLite task DB.
- Preserve package boundaries: Web calls Control Plane-shaped HTTP APIs; Control Plane calls Worker public HTTP APIs; Worker is the only app-server caller.
- Use `packages/api-contract/openapi.yaml` as the public API source of truth.
- Use `packages/codex-protocol` as the generated Codex app-server protocol source of truth.
- No real output streaming in this stage.
- No real multi-device validation in this stage.
- No installer, LaunchAgent, keychain, pairing, token rotation, reverse WSS, external deployment, iOS app, or production auth.
- Do not display or log raw prompt text, command output, full diff, raw JSON-RPC frames, provider secrets, tokens, private paths, or stack traces.
- Do not write raw response bodies, raw request bodies, raw prompt text, raw ids, raw URLs, stack/cause, or private paths into `logs/real-check/*.json` or lifecycle logs; reports use an allowlist schema with counts, statuses, durations, sanitized codes, and short opaque hashes only.
- Calibration conversations and tasks must use a `codex-remote-calibration` prefix.
- Fake Worker results cannot satisfy the real E2E gate.

## Subagent Plan Review

Reviewer: `019ee4e7-23c3-7431-8638-6c631ef2a101`

Result: fix plan before implementation.

Findings addressed in this plan:

- Critical: `real:check` must explicitly prove Q21-Q24 and reject fake Worker readiness; Task 5 now requires app-server transport/version/capability evidence plus cwd scope, pagination, control, approval decision, degraded-vs-empty, and invalid task-link checks.
- Critical: calibration reports and lifecycle logs must not persist raw bodies or raw ids; Task 5 now requires an allowlist report schema, redaction helper, gitignore/readiness guard, and leak scan.
- Important: start UI tests must use opaque `local-project`, not repo basename.
- Important: Control Plane projection must not become a second schema source; Task 1 now requires deriving from `api-contract` where possible or adding a drift guard if the existing projector style is retained.
- Minor: nonfunctional composer controls should be deleted, not hidden behind dead JSX.

Reviewer: `019ee55b-f3dc-7e93-9cdc-6d38edbc925f`

Result: changes requested.

Findings addressed by adding Task 8:

- Critical: current plan cannot move Stage 9 from `real-gap` to verifiable completion until Worker-owned `codex app-server --stdio` lifecycle exists.
- Critical: Task 2 created lifecycle shell commands, but current default behavior is still fail-closed; Task 2 must not be treated as real stdio readiness.
- Important: stdio implementation must use `packages/codex-protocol` generated types or explicit local transport adapters only; do not handwrite upstream protocol DTOs.
- Important: stdio stdout/stderr, raw JSON-RPC frames, initialize responses, local paths, and process output must not be written to lifecycle logs, public health responses, Web UI, or real-check reports.
- Important: add focused tests for newline framing, split chunks, multi-message reads, invalid JSON, close/error cleanup, request timeout, Worker session startup, and health/capabilities proof.

Reviewer: `019ee576-ed95-7d83-9799-8c332e2561fb`

Result: clean after Task 8 implementation.

Residual risks retained for later Stage 9 slices:

- `apps/web/e2e/real-local-smoke.spec.ts` covers real Web start/task flow, but follow-up remains conditional until the post-start readable conversation gap is closed.
- Worker health proves readiness through `client.readyz()` and config-validated transport. Future session abstraction changes must avoid reporting `stdio` when the actual session is not stdio-backed.

Reviewer: `019ee57f-16fb-7d30-a746-c1366f022ef5`

Result: unavailable. The requested subagent review for Task 9 errored with an external usage-limit condition before returning findings. The slice stayed narrow and used existing Control Plane/API/DB boundaries only.

Reviewer: `019ee5f8-7b99-7a23-b630-969d47561bb5`

Result: fix plan before implementing the next slice.

Findings addressed by adding Task 10:

- Critical: Q24 was still a general real-check requirement and did not have a directly executable task for healthy, real-empty, all-workers-down, invalid-worker-token, and partial-worker-failure behavior.
- Critical: endpoint semantics for `/v1/control-plane/health`, `/v1/devices`, and `/v1/conversations` were not pinned tightly enough to prevent all Worker failures from being presented as `200 []`.
- Important: Web/source taxonomy must preserve the distinction between healthy empty data and dependency failure. Task 10 keeps Web changes minimal and only requires degraded/error visibility if the Control Plane returns a dependency error.
- Important: historical Stage 6 wording in `PLAN.md` could be read as allowing all-workers-down to become an empty conversation state; Task 10 updates that wording as fake-smoke-only history, not Stage 9 readiness.

Reviewer: `019ee604-c0ff-7ba2-a6ee-149bdae0a782`

Result: clean enough to execute after scope clarification.

Findings addressed by Task 11:

- Important: Task 11 fixes the Worker write path handshake only. Control-path handshake coverage and post-start readable conversations remain separate Stage 9 gaps unless proven by later real-check evidence.
- Minor: readyz failure tests use mapped sentinel errors such as `app_server_request_timeout`, not generic errors that intentionally map to `worker_internal_error`.
- Minor: readyz failure tests assert the client is closed and business RPCs are not called.

Pre-review root cause evidence for Task 11:

- A direct Worker start request against a fresh stdio app-server session returns sanitized `worker_internal_error`; a direct app-server diagnostic that calls `thread/start` before `initialize` / `initialized` returns `app_server_protocol_error`.
- Q18 requires initialized long-lived Worker-owned sessions before business RPCs.
- Current read health/probe paths call `readyz()` for stdio, which performs the handshake, but write paths can be the first request and currently call `thread/start` / `turn/start` without first proving the handshake.

## Integrated Research Decisions

Q18-Q28 are now imported under `docs/references/questions/`. This plan adopts the answered items as execution constraints and keeps only Q21-Q24 as real-stack verification work.

- Q18: Worker app-server connections must be initialized before business RPCs. Stage 9 should use one initialized long-lived Worker-owned app-server session first; do not create one app-server connection per HTTP request.
- Q19: public project identity must be opaque. `allowedProjectRoot`/`cwd` stays inside Worker; Web and task links must not depend on basename or absolute paths. If the current `RemoteProject.path` field is still required by schema, return an empty or display-safe value and treat the field as compatibility debt, not as an execution path.
- Q20: Worker-owned app-server default target is stdio. Loopback WebSocket is only an explicit local debug fallback and cannot be used as quiet production/readiness evidence.
- Q21-Q24: real command/control compatibility, safe active-turn/approval scenarios, `thread/list(cwd)` scope/pagination, and Control Plane degraded-vs-empty semantics must be proven by the Stage 9 real stack.
- Q25: Stage 9 needs a minimal real Web browser smoke. HTTP-only `real:check` is insufficient for final readiness because it does not prove Web env wiring, fallback banners, start UI, or DOM state.
- Q26: `real:check` writes ignored local artifacts under `logs/real-check/` by default. Tracked docs may contain only explicit sanitized evidence.
- Q27: task links must validate Control Plane-owned resources and project ownership; offline Worker verification can be pending, but arbitrary ids must not become verified links.
- Q28: the local self-hosted Web UI must not make runtime external font/static asset requests. Use system fonts or vendored assets only.

Reviewer: `019ee60e-2bc4-72c2-9c70-12cf2cd54162`

Result: clean enough to execute after safety clarifications.

Findings addressed by Task 12:

- Important: read-before-verify must not become a public oracle for whether an outside-root thread exists. Missing, outside-root, and inaccessible specific conversations must all map to sanitized `conversation_not_found`.
- Important: approval registry entries must not be exposed before the specific conversation verifier passes. If `thread/read` returns outside-root, `listApprovals()` must return `conversation_not_found` even when a matching pending approval exists.
- Important: control paths must receive the same session initialization protection as write paths. Focused tests should prove `readyz -> readThread -> control RPC` order for interrupt/steer/approval decision.

Pre-review evidence for Task 12:

- After Task 11, a real Control Plane start request returns HTTP 202 and a public conversation id.
- The same id is not present in immediate Control Plane or Worker `GET /v1/conversations` aggregate results.
- Timeline and follow-up then fail with sanitized `conversation_not_found`, because specific conversation routes currently require `thread/list(cwd)` to rediscover the id before calling `thread/read` or `turn/start`.
- Protocol evidence from `packages/codex-protocol`: `thread/list` accepts an exact-match `cwd` filter, while `thread/read` accepts a target thread id. Any fix must still verify `thread.cwd` stays inside `allowedProjectRoot` before returning or writing.

---

## File Structure

- `packages/api-contract/openapi.yaml`: add versioned project list endpoints so Web can discover an opaque local project id without guessing from conversations or paths.
- `packages/api-contract/src/generated/openapi.ts`: regenerated by `pnpm --filter @codex-remote/api-contract generate`.
- `apps/worker/src/http/readOnlyHandlers.ts`: add `listProjects()` projection from `allowedProjectRoot` without exposing the raw root.
- `apps/worker/src/app-server/appServerRpcClient.ts`: add stdio-compatible newline JSON-RPC transport support while keeping WebSocket debug fallback.
- `apps/worker/src/app-server/appServerProcessService.ts`: start and stop Worker-owned `codex app-server --stdio` without logging raw frames or process output.
- `apps/worker/src/app-server/readOnlyAppServerSession.ts`: route default Worker-owned sessions through stdio when configured.
- `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`: support sanitized readiness proof for stdio sessions without HTTP readyz.
- `apps/worker/src/http/workerHttpConfig.ts`: allow explicit/default `stdio` startup when `CODEX_REMOTE_START_APP_SERVER=true`, and keep `debug-websocket` explicit only.
- `apps/worker/src/http/writeHandlers.ts`: accept the same opaque local project id when starting conversations.
- `apps/worker/src/http/workerHttpApp.ts`: expose `GET /v1/projects`.
- `apps/worker/src/http/readOnlyHandlers.test.ts`, `apps/worker/src/http/writeHandlers.test.ts`, and `apps/worker/src/http/workerHttpApp.test.ts`: cover project projection, start validation, and route.
- `apps/control-plane/src/client/workerClient.ts`: add upstream `listProjects()`.
- `apps/control-plane/src/http/controlPlaneHttpApp.ts`: expose `GET /v1/projects` and `GET /v1/devices/{deviceId}/projects` without turning Worker failures into empty lists.
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`: cover project aggregation, device-scoped project route, and Worker failure semantics.
- `apps/web/src/data/workerApi/client.ts`: add `listProjects()`.
- `apps/web/src/data/workerApi/workbenchData.ts`: load projects from Control Plane instead of deriving only from conversations.
- `apps/web/src/data/workerApi/workbenchData.test.ts`: cover empty real conversations with real project list.
- `apps/web/src/components/shell/startConversationSubmitController.ts`: new minimal controller for start conversation.
- `apps/web/src/components/shell/startConversationSubmitController.test.ts`: test accepted/failure/no-project behavior.
- `apps/web/src/components/shell/codex-remote-app.tsx`: wire start action and source state.
- `apps/web/src/components/detail/main-panels.tsx`: add minimal start conversation UI, fallback banner, and clearer run-control grouping.
- `apps/web/src/components/conversation/codex-assistant-thread.tsx`: hide or clearly disable nonfunctional future controls.
- `apps/web/src/data/app-server/mockData.ts`: rename fixture-facing labels so examples cannot be mistaken for live data.
- `scripts/start-real-local-stack.sh`, `scripts/stop-real-local-stack.sh`, `scripts/status-real-local-stack.sh`: repeatable local stack lifecycle.
- `scripts/real-local-calibration.mjs`: real HTTP calibration runner that records real-pass/fixed-pass/real-gap outcomes into ignored local artifacts using a sanitized allowlist schema.
- `apps/web/e2e/real-local-smoke.spec.ts`: one Chromium-only browser smoke for the real Web entrypoint.
- `package.json`: add `real:start`, `real:status`, `real:stop`, `real:check`, and `web:e2e:smoke`.
- `docs/references/local-self-hosting.md`: fix Web env variables and document real local stack commands.
- `PLAN.md` and `docs/references/development-context.md`: update status so fake smoke and real E2E evidence are clearly separated.
- `.gitignore`: keep real-check reports, lifecycle logs, pid files, and local SQLite artifacts out of version control.

---

### Task 1: Versioned Project Discovery

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify generated: `packages/api-contract/src/generated/openapi.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/workerHttpApp.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.test.ts`
- Modify: `apps/worker/src/http/writeHandlers.test.ts`
- Modify: `apps/worker/src/http/workerHttpApp.test.ts`
- Modify: `apps/control-plane/src/client/workerClient.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Modify: `apps/web/src/data/workerApi/client.ts`
- Modify: `apps/web/src/data/workerApi/client.test.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`

**Interfaces:**
- Produces Worker handler: `listProjects(context: WorkerReadOnlyHandlerContext): Promise<RemoteProject[]>`
- Produces Worker route: `GET /v1/projects -> RemoteProject[]`
- Produces Control Plane routes:
  - `GET /v1/projects -> RemoteProject[]`
  - `GET /v1/devices/{deviceId}/projects -> RemoteProject[]`
- Produces Web client method: `listProjects(): Promise<RemoteProject[]>`
- Later tasks consume `WorkbenchData.projects` as the authoritative project list.
- Uses one Stage 9 local project id: `local-project`. It is public and opaque; `allowedProjectRoot` remains Worker-local.

- [ ] **Step 1: Add failing API contract tests for versioned project endpoints**

Add assertions to `packages/api-contract/src/contractGeneration.test.ts`:

```ts
test("contract generation: when product Web needs project discovery, should expose versioned project routes", () => {
  const source = readFileSync(openApiPath, "utf8");
  assert.match(source, /^  \/v1\/projects:\n {4}get:\n {6}operationId: listControlPlaneProjects/m);
  assert.match(source, /^  \/v1\/devices\/\{deviceId\}\/projects:\n {4}get:\n {6}operationId: listControlPlaneDeviceProjects/m);
});
```

- [ ] **Step 2: Run contract test and verify failure**

Run:

```bash
pnpm --filter @codex-remote/api-contract test -- --test-name-pattern "project discovery"
```

Expected: FAIL because `/v1/projects` and `/v1/devices/{deviceId}/projects` do not exist yet.

- [ ] **Step 3: Add OpenAPI paths**

In `packages/api-contract/openapi.yaml`, add versioned paths using the existing `RemoteProject` schema:

```yaml
  /v1/projects:
    get:
      operationId: listControlPlaneProjects
      responses:
        "200":
          description: Projects visible through the Control Plane.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/RemoteProject"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "401":
          $ref: "#/components/responses/UnauthorizedError"
        "403":
          $ref: "#/components/responses/ForbiddenError"
        "500":
          $ref: "#/components/responses/InternalWorkerError"
  /v1/devices/{deviceId}/projects:
    get:
      operationId: listControlPlaneDeviceProjects
      parameters:
        - name: deviceId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Projects for a configured device.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/RemoteProject"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "401":
          $ref: "#/components/responses/UnauthorizedError"
        "403":
          $ref: "#/components/responses/ForbiddenError"
        "404":
          $ref: "#/components/responses/DeviceNotFoundError"
        "408":
          $ref: "#/components/responses/RequestTimeoutError"
        "424":
          $ref: "#/components/responses/DeviceUnavailableError"
        "500":
          $ref: "#/components/responses/InternalWorkerError"
```

- [ ] **Step 4: Regenerate API types**

Run:

```bash
pnpm --filter @codex-remote/api-contract generate
```

Expected: `packages/api-contract/src/generated/openapi.ts` changes.

- [ ] **Step 5: Add Worker project projection test**

In `apps/worker/src/http/readOnlyHandlers.test.ts`, add:

```ts
test("worker read-only handlers when listing projects, should expose the allowed project root as one safe project", async () => {
  const allowedRoot = await mkdtemp(join(tmpdir(), "codex-remote-project-"));
  const context = createContext(allowedRoot, createFakeReadOnlyClient({ threads: [] }));

  const projects = await listProjects(context);

  assert.deepEqual(projects, [
    {
      id: "local-project",
      name: basename(allowedRoot),
      deviceId: "local-device",
      path: "",
      branch: "unknown",
      hasChanges: false,
      pinned: false,
      expanded: true,
    },
  ]);
});
```

- [ ] **Step 6: Implement Worker `listProjects()`**

In `apps/worker/src/http/readOnlyHandlers.ts`, import `RemoteProject` and add:

```ts
export function listProjects(context: WorkerReadOnlyHandlerContext): RemoteProject[] {
  const projectName = basename(context.config.allowedProjectRoot);
  return [
    {
      id: "local-project",
      name: projectName,
      deviceId: context.config.deviceId,
      path: "",
      branch: "unknown",
      hasChanges: false,
      pinned: false,
      expanded: true,
    },
  ];
}
```

- [ ] **Step 7: Update Worker write validation, route test, and route**

In `apps/worker/src/http/writeHandlers.test.ts`, replace basename-based `projectId` fixtures with `local-project`.

In `apps/worker/src/http/writeHandlers.ts`, update `validateProjectId()` so start conversation accepts `local-project` and still maps internally to `context.config.allowedProjectRoot` for app-server `cwd`. Do not accept basename or absolute path as public identity.

In `apps/worker/src/http/workerHttpApp.test.ts`, add a route test for `GET /v1/projects` that expects one project with `id === "local-project"` and `path === ""`.

In `apps/worker/src/http/workerHttpApp.ts`, import `listProjects` and add:

```ts
app.get("/v1/projects", (c) => c.json(listProjects(params)));
```

- [ ] **Step 8: Add Control Plane upstream projection**

In `apps/control-plane/src/client/workerClient.ts`, extend `WorkerUpstreamClient`:

```ts
listProjects(device: ConfiguredWorkerDevice): Promise<RemoteProject[]>;
```

Add projection:

```ts
function projectRemoteProject(value: unknown): RemoteProject {
  const body = requireRecord(value);
  assertExactFields(body, ["id", "name", "deviceId", "path", "branch", "hasChanges", "pinned", "expanded"]);
  return {
    id: readString(body, "id"),
    name: readString(body, "name"),
    deviceId: readString(body, "deviceId"),
    path: readString(body, "path"),
    branch: readString(body, "branch"),
    hasChanges: readBoolean(body, "hasChanges"),
    pinned: readBoolean(body, "pinned"),
    expanded: readBoolean(body, "expanded"),
  };
}
```

Prefer a validation helper derived from `@codex-remote/api-contract` if one exists. If the current Control Plane client still uses local exact-field projectors, add a source-of-truth drift test that compares the projector field list with `RemoteProject` schema keys from `packages/api-contract/openapi.yaml`; do not let this field list become an untested second schema source.

Return implementation:

```ts
listProjects: (device) => request<RemoteProject[]>(device, "/v1/projects", { method: "GET", project: (value) => requireArray(value).map(projectRemoteProject) }),
```

- [ ] **Step 9: Add Control Plane project routes and tests**

In `apps/control-plane/src/http/controlPlaneHttpApp.ts`, add:

```ts
app.get("/v1/projects", async (c) => {
  const projects = (await Promise.all(params.config.devices.map((device) => readDeviceProjects(params.workerClient, device)))).flat();
  return c.json(projects);
});

app.get("/v1/devices/:deviceId/projects", async (c) => {
  const device = requireDevice(registry, c.req.param("deviceId"));
  return c.json(await runForDevice(device, "project/list", () => params.workerClient.listProjects(device)));
});
```

Add helper:

```ts
async function readDeviceProjects(client: WorkerUpstreamClient, device: ConfiguredWorkerDevice): Promise<RemoteProject[]> {
  return (await client.listProjects(device)).map((project) => ({ ...project, deviceId: device.id }));
}
```

Add tests that `/v1/projects` aggregates one project, `/v1/devices/device-a/projects` returns only device A, and a required local Worker failure returns an error instead of `200 []`.

- [ ] **Step 10: Load projects directly in Web datasource**

In `apps/web/src/data/workerApi/client.ts`, add:

```ts
public async listProjects(): Promise<RemoteProject[]> {
  return this.request<RemoteProject[]>("/v1/projects");
}
```

In `apps/web/src/data/workerApi/workbenchData.ts`, replace `createProjectsFromConversations(conversations)` in loaded paths with `projects` from `await client.listProjects()`. Keep `createProjectsFromConversations` only as fallback for older tests if a project list request fails together with source failure.

Add a test where `/v1/conversations` returns `[]`, `/v1/projects` returns one project, and `data.source.reason === "loaded"` with `data.projects.length === 1`.

- [ ] **Step 11: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract build
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/web test
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add packages/api-contract/openapi.yaml packages/api-contract/src/generated/openapi.ts apps/worker/src/http apps/control-plane/src apps/web/src/data/workerApi
git commit -m "feat: expose real local project discovery"
```

---

### Task 2: Real Local Stack Lifecycle

**Current result:** complete as lifecycle shell scaffolding only. The command set exists and fails closed for default `stdio`, which is correct until Task 8 lands. Do not treat Task 2 as real app-server readiness evidence.

**Files:**
- Create: `scripts/start-real-local-stack.sh`
- Create: `scripts/stop-real-local-stack.sh`
- Create: `scripts/status-real-local-stack.sh`
- Modify: `package.json`
- Modify: `scripts/product-readiness-check.mjs`
- Modify: `scripts/product-readiness-check.test.mjs`
- Modify: `docs/references/local-self-hosting.md`

**Interfaces:**
- Produces commands:
  - `pnpm real:start`
  - `pnpm real:status`
  - `pnpm real:stop`
- Later E2E scripts assume Worker at `http://127.0.0.1:8787`, Control Plane at `http://127.0.0.1:8786`, Web at `http://127.0.0.1:5173`, and token `example-token` unless overridden.

- [ ] **Step 1: Add readiness tests for real stack scripts**

In `scripts/product-readiness-check.test.mjs`, add a temp package fixture test that fails when `real:start`, `real:status`, or `real:stop` is missing.

Expected assertion:

```js
assert.match(runProductReadinessCheck(root).join("\n"), /package\.json missing script real:start/);
```

- [ ] **Step 2: Run readiness test and verify failure**

Run:

```bash
node --test scripts/product-readiness-check.test.mjs
```

Expected: FAIL because scripts do not exist.

- [ ] **Step 3: Create `start-real-local-stack.sh`**

Create `scripts/start-real-local-stack.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TOKEN="${CODEX_REMOTE_LOCAL_TOKEN:-example-token}"
PROJECT_ROOT="${CODEX_REMOTE_ALLOWED_PROJECT_ROOT:-$ROOT_DIR}"
WORKER_PORT="${CODEX_REMOTE_WORKER_PORT:-8787}"
CONTROL_PLANE_PORT="${CODEX_REMOTE_CONTROL_PLANE_PORT:-8786}"

mkdir -p "$LOG_DIR"

start_background() {
  local name="$1"
  local pid_file="$LOG_DIR/$name.pid"
  shift
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "$name already running: $(cat "$pid_file")"
    return
  fi
  (cd "$ROOT_DIR" && "$@" >"$LOG_DIR/$name.log" 2>&1 & echo $! >"$pid_file")
  echo "$name started: $(cat "$pid_file")"
}

start_background worker env \
  CODEX_REMOTE_WORKER_TOKEN="$TOKEN" \
  CODEX_REMOTE_ALLOWED_ORIGINS="http://127.0.0.1:$CONTROL_PLANE_PORT" \
  CODEX_REMOTE_ALLOWED_PROJECT_ROOT="$PROJECT_ROOT" \
  CODEX_REMOTE_DEVICE_ID="local-device" \
  CODEX_REMOTE_HTTP_PORT="$WORKER_PORT" \
  CODEX_REMOTE_APP_SERVER_TRANSPORT="${CODEX_REMOTE_APP_SERVER_TRANSPORT:-stdio}" \
  CODEX_REMOTE_START_APP_SERVER=true \
  pnpm --filter @codex-remote/worker serve:read

start_background control-plane env \
  CODEX_REMOTE_CONTROL_PLANE_CONFIG="{\"publicToken\":\"$TOKEN\",\"taskDatabasePath\":\"$LOG_DIR/codex-remote-tasks.sqlite\",\"devices\":[{\"id\":\"local-device\",\"name\":\"Local Device\",\"baseUrl\":\"http://127.0.0.1:$WORKER_PORT\",\"token\":\"$TOKEN\"}]}" \
  pnpm --filter @codex-remote/control-plane serve

NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL="http://127.0.0.1:$CONTROL_PLANE_PORT" \
NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN="$TOKEN" \
pnpm web:start
```

The stack logs are local diagnostics only. Do not write request/response bodies, tokens, raw JSON-RPC, command output, full diffs, stack/cause, or private paths to these logs. If a dependency logs too much by default, reduce log level or redirect that process to a sanitized status-only log before claiming Stage 9 readiness.

If the Worker does not yet support `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio`, Task 6 must add that support or record the remaining loopback WebSocket dependency as a Stage 9 readiness gap. Do not silently fall back from stdio to WebSocket.

- [ ] **Step 4: Create stop and status scripts**

Create `scripts/stop-real-local-stack.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

pnpm web:stop >/dev/null 2>&1 || true

for name in control-plane worker; do
  pid_file="$LOG_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid"
      echo "$name stopped: $pid"
    fi
    rm -f "$pid_file"
  fi
done
```

Create `scripts/status-real-local-stack.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

for name in worker control-plane web-dev; do
  pid_file="$LOG_DIR/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "$name: running pid=$(cat "$pid_file")"
  else
    echo "$name: stopped"
  fi
done

for port in 5173 8786 8787; do
  printf ":%s " "$port"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true
done
```

- [ ] **Step 5: Wire package scripts and readiness check**

In `package.json`, add:

```json
"real:start": "bash scripts/start-real-local-stack.sh",
"real:status": "bash scripts/status-real-local-stack.sh",
"real:stop": "bash scripts/stop-real-local-stack.sh"
```

In `scripts/product-readiness-check.mjs`, add these scripts to `requiredScripts`.

- [ ] **Step 6: Fix runbook Web env variables**

In `docs/references/local-self-hosting.md`, replace Web startup env with:

```bash
NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL=http://127.0.0.1:8786 \
NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN=example-token \
pnpm web:start
```

Add:

```bash
pnpm real:start
pnpm real:status
pnpm real:stop
```

- [ ] **Step 7: Run checks**

Run:

```bash
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/start-real-local-stack.sh scripts/stop-real-local-stack.sh scripts/status-real-local-stack.sh scripts/product-readiness-check.mjs scripts/product-readiness-check.test.mjs docs/references/local-self-hosting.md
git commit -m "feat: add real local stack lifecycle"
```

---

### Task 3: Honest Fallback And Example UI

**Files:**
- Modify: `apps/web/src/data/app-server/mockData.ts`
- Modify: `apps/web/src/data/app-server/mockData.test.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.ts`
- Modify: `apps/web/src/data/workerApi/workbenchData.test.ts`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/conversation/codex-assistant-thread.tsx`
- Modify: `apps/web/src/components/sidebar/sidebarHeaderLayout.test.ts`

**Interfaces:**
- Produces visible UI rule: when `source.reason !== "loaded"`, render a clear example/fallback banner.
- Later tasks rely on users being able to distinguish real data from fixture data.

- [ ] **Step 1: Add failing datasource/UI source tests**

In `apps/web/src/data/workerApi/workbenchData.test.ts`, add:

```ts
test("workbench datasource when fallback is returned, should label source as not real data", async () => {
  const data = createFallbackWorkbenchData("not_configured");
  assert.equal(data.source.reason, "not_configured");
  assert.equal(data.conversations.every((conversation) => conversation.title.startsWith("Example ")), true);
});
```

In `apps/web/src/components/sidebar/sidebarHeaderLayout.test.ts`, add source checks:

```ts
test("conversation main when source is not loaded, should render explicit example data copy", () => {
  const source = readWebSource("components/detail/main-panels.tsx");
  assert.match(source, /示例数据/);
  assert.match(source, /未连接真实 Control Plane/);
});
```

- [ ] **Step 2: Run focused Web tests and verify failure**

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fallback|source is not loaded"
```

Expected: FAIL because labels are not present yet.

- [ ] **Step 3: Rename fixture labels**

In `apps/web/src/data/app-server/mockData.ts`, change fixture names to obvious examples:

```ts
name: "Example MacBook",
currentProject: "Example project",
title: "Example worker probe",
projectName: "Example project",
summary: "Example fixture data shown while no real Control Plane is connected",
```

Keep ids stable unless tests require title-only updates.

- [ ] **Step 4: Add source banner**

In `apps/web/src/components/detail/main-panels.tsx`, inside `ConversationMain`, derive:

```ts
const isExampleData = source.reason !== "loaded";
```

Render before `ConversationControlStrip`:

```tsx
{isExampleData ? (
  <section className="conversation-source-banner" aria-label="数据源状态">
    <strong>未连接真实 Control Plane</strong>
    <span>当前显示示例数据 · {datasourceStatus.join(" · ")}</span>
  </section>
) : null}
```

- [ ] **Step 5: Delete nonfunctional composer controls**

In `apps/web/src/components/conversation/codex-assistant-thread.tsx`, delete disabled future controls that are not implemented. Do not leave dead JSX such as `{false ? (...) : null}`. Keep only the follow-up input and send button.

- [ ] **Step 6: Add minimal CSS if needed**

Use existing style file for `.conversation-source-banner`. Keep it plain:

```css
.conversation-source-banner {
  border-bottom: var(--cr-stroke);
  color: var(--cr-muted);
  display: flex;
  gap: 8px;
  padding: 10px 16px;
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/data/app-server apps/web/src/data/workerApi apps/web/src/components
git commit -m "fix: make fallback data explicit"
```

---

### Task 4: Minimal Start Conversation UI

**Files:**
- Create: `apps/web/src/components/shell/startConversationSubmitController.ts`
- Create: `apps/web/src/components/shell/startConversationSubmitController.test.ts`
- Modify: `apps/web/src/components/shell/codex-remote-app.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts`

**Interfaces:**
- Produces controller:
  - `submitStartConversation(options: StartConversationSubmitOptions): Promise<"accepted" | "failed">`
- Consumes:
  - `WorkerApiClientLike.startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted>`
  - `RemoteProject` from `WorkbenchData.projects`

- [ ] **Step 1: Add failing controller tests**

Create `apps/web/src/components/shell/startConversationSubmitController.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { submitStartConversation } from "./startConversationSubmitController.ts";

test("start conversation submit: when project and token exist, should call startConversation and refresh selected conversation", async () => {
  const events: string[] = [];
  const result = await submitStartConversation({
    createClientRequestId: () => "client-start-1",
    deviceId: "local-device",
    message: "codex-remote-calibration start",
    projectId: "local-project",
    refreshWorkbenchData: async (conversationKey) => events.push(`refresh:${conversationKey}`),
    setStatus: (status) => events.push(`status:${status}`),
    workerClient: {
      startConversation: async (deviceId, input) => {
        events.push(`${deviceId}:${input.projectId}:${input.message}:${input.clientRequestId}`);
        return { id: "accepted-1", conversationId: "thread-1", turnId: "turn-1", acceptedAt: "2026-06-20T00:00:00.000Z" };
      },
    },
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, [
    "status:submitting",
    "local-device:local-project:codex-remote-calibration start:client-start-1",
    "status:accepted",
    "refresh:local-device\u001fthread-1",
  ]);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "start conversation submit"
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement controller**

Create `apps/web/src/components/shell/startConversationSubmitController.ts`:

```ts
import type { CommandAccepted, StartConversationInput } from "@codex-remote/api-contract";

export type StartConversationSubmitStatus = "accepted" | "failed" | "idle" | "submitting";

export interface StartConversationSubmitOptions {
  createClientRequestId(): string;
  deviceId: string | null;
  message: string;
  projectId: string | null;
  refreshWorkbenchData(conversationKey: string | null): Promise<void>;
  setStatus(status: StartConversationSubmitStatus): void;
  workerClient: {
    startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted>;
  };
}

export async function submitStartConversation(options: StartConversationSubmitOptions): Promise<"accepted" | "failed"> {
  const message = options.message.trim();
  if (!options.deviceId || !options.projectId || !message) {
    options.setStatus("failed");
    return "failed";
  }

  options.setStatus("submitting");
  try {
    const accepted = await options.workerClient.startConversation(options.deviceId, {
      projectId: options.projectId,
      message,
      clientRequestId: options.createClientRequestId(),
    });
    options.setStatus("accepted");
    await options.refreshWorkbenchData(`${options.deviceId}\u001f${accepted.conversationId}`);
    return "accepted";
  } catch {
    options.setStatus("failed");
    return "failed";
  }
}
```

- [ ] **Step 4: Wire shell state**

In `apps/web/src/components/shell/codex-remote-app.tsx`, import the controller and add:

```ts
const [startStatus, setStartStatus] = useState<StartConversationSubmitStatus>("idle");
const selectedProject = projects.find((project) => project.deviceId === selectedDeviceId) ?? projects[0] ?? null;
```

Add callback:

```ts
const submitStart = useCallback(async (message: string) => submitStartConversation({
  createClientRequestId: () => crypto.randomUUID(),
  deviceId: selectedProject?.deviceId ?? selectedDeviceId ?? null,
  message,
  projectId: selectedProject?.id ?? null,
  refreshWorkbenchData,
  setStatus: setStartStatus,
  workerClient,
}), [refreshWorkbenchData, selectedDeviceId, selectedProject?.deviceId, selectedProject?.id, workerClient]);
```

Pass `onSubmitStart`, `startStatus`, and `canStartConversation={source.reason === "loaded" && Boolean(controlPlaneToken) && selectedProject !== null}` into `ConversationMain`.

- [ ] **Step 5: Add minimal start UI**

In `apps/web/src/components/detail/main-panels.tsx`, extend `ConversationMainProps`:

```ts
canStartConversation: boolean;
onSubmitStart: (message: string) => Promise<"accepted" | "failed">;
startStatus: "accepted" | "failed" | "idle" | "submitting";
```

Add a compact form above the timeline:

```tsx
<StartConversationStrip canStart={canStartConversation} onSubmitStart={onSubmitStart} startStatus={startStatus} />
```

Implement:

```tsx
function StartConversationStrip(props: {
  canStart: boolean;
  onSubmitStart: (message: string) => Promise<"accepted" | "failed">;
  startStatus: "accepted" | "failed" | "idle" | "submitting";
}) {
  const [draft, setDraft] = useState("");
  const disabled = !props.canStart || props.startStatus === "submitting";
  return (
    <form className="conversation-control-row" onSubmit={(event) => {
      event.preventDefault();
      const message = draft.trim();
      if (!message || disabled) return;
      void props.onSubmitStart(message).then((result) => {
        if (result === "accepted") setDraft("");
      });
    }}>
      <input aria-label="Start new conversation" className="conversation-control-input" disabled={disabled} onChange={(event) => setDraft(event.target.value)} value={draft} />
      <button className="button secondary conversation-control-button" disabled={disabled || !draft.trim()} type="submit">Start</button>
      <span className="conversation-control-meta">{props.startStatus}</span>
    </form>
  );
}
```

- [ ] **Step 6: Update source tests**

Update `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts` so it no longer asserts that `startConversation` is absent. Replace with:

```ts
assert.match(`${shellSource}\n${controllerSource}`, /startConversation/);
assert.match(shellSource, /selectedProject/);
```

- [ ] **Step 7: Run Web tests**

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/shell apps/web/src/components/detail/main-panels.tsx
git commit -m "feat: add minimal start conversation UI"
```

---

### Task 5: Real Local Calibration Runner

**Files:**
- Create: `scripts/real-local-calibration.mjs`
- Modify: `package.json`
- Modify: `scripts/product-readiness-check.mjs`
- Modify: `scripts/product-readiness-check.test.mjs`
- Modify: `.gitignore`
- Create ignored runtime artifacts: `logs/real-check/<timestamp>.json` and `logs/real-check/latest.json`
- Create only if explicitly exporting evidence: `docs/references/real-local-calibration-evidence.md`

**Interfaces:**
- Produces command: `pnpm real:check`
- Produces report format with statuses: `real-pass`, `fixed-pass`, `real-gap`.
- Writes full local reports to ignored `logs/real-check/`; stdout prints only a short summary and report path.
- Report detail schema is allowlisted: `status`, `durationMs`, `count`, `sanitizedCode`, `reasonCode`, `transport`, `appServerConnected`, `codexVersion`, `protocolGeneratedAt`, and short opaque hashes. It must not include raw request/response bodies, prompt text, raw ids, raw URLs, raw JSON-RPC, command output, full diff, token, private path, stack, or cause.
- Consumes the real stack from Task 2.

Required real evidence:

- `real:check` must fail closed unless Worker health/capabilities prove the real Stage 9 app-server path: app-server connected, transport recorded as `stdio`, Codex version present when available, and protocol generation metadata present. `debug-websocket` may be recorded as sanitized debug evidence only; it must be `real-gap` for readiness proof.
- A Control Plane-compatible fake Worker must not be enough for `real-pass`.
- Q21 coverage: start, follow-up, interrupt, steer, and approval decision each record `real-pass`, `fixed-pass`, or `real-gap`.
- Q22 coverage: active-turn and pending-approval scenarios record safe-trigger outcome or sanitized `real-gap`; destructive or broad approvals are not accepted.
- Q23 coverage: `thread/list(cwd)` scope and pagination record counts/cursor/page metadata only, not paths.
- Q24 coverage: all-workers-down and invalid-worker-token scenarios return degraded/error evidence, not `200 []`.
- Task link coverage: valid real conversation link passes; invalid device/project/conversation ids do not create verified links.

- [ ] **Step 1: Add readiness test for `real:check`**

In `scripts/product-readiness-check.test.mjs`, add:

```js
test("product readiness check: when real calibration command is missing, should fail", () => {
  const root = createTempRepoFixture();
  const packageJson = readFixturePackageJson(root);
  delete packageJson.scripts["real:check"];
  writeFixturePackageJson(root, packageJson);
  assert.match(runProductReadinessCheck(root).join("\n"), /package\.json missing script real:check/);
});
```

- [ ] **Step 2: Create calibration script**

Create `scripts/real-local-calibration.mjs`:

```js
#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const reportDir = join(root, "logs/real-check");
const baseUrl = process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786";
const token = process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.CODEX_REMOTE_LOCAL_TOKEN ?? "example-token";
const headers = { accept: "application/json", authorization: `Bearer ${token}` };
const report = [];

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

function hashRef(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return `ref-${Buffer.from(value).toString("base64url").slice(0, 10)}`;
}

function safeDetail(detail) {
  return Object.fromEntries(
    Object.entries(detail).filter(([key]) =>
      ["status", "durationMs", "count", "turns", "sanitizedCode", "reasonCode", "transport", "appServerConnected", "codexVersion", "protocolGeneratedAt", "conversationRef", "turnRef", "taskRef"].includes(key),
    ),
  );
}

function record(name, status, detail) {
  if (!["real-pass", "fixed-pass", "real-gap"].includes(status)) throw new Error(`invalid real-check status: ${status}`);
  if (JSON.stringify(detail).match(/codex-remote-calibration|Bearer|\/Users\/|raw|stack|cause/i)) throw new Error(`unsafe real-check detail for ${name}`);
  report.push({ name, status, detail: safeDetail(detail) });
}

function checkRequiredNames() {
  const required = [
    "control-plane health",
    "worker app-server proof",
    "devices",
    "projects",
    "conversations",
    "thread/list cwd scope",
    "thread/list pagination",
    "start conversation",
    "timeline",
    "follow-up",
    "interrupt",
    "steer",
    "approval pending scenario",
    "approval decision",
    "control-plane all-workers-down",
    "control-plane invalid-worker-token",
    "task create",
    "task link",
    "task link invalid ids",
  ];
  for (const name of required) {
    if (!report.some((item) => item.name === name)) throw new Error(`missing real-check coverage: ${name}`);
  }
}

const health = await request("/v1/control-plane/health");
record("control-plane health", health.response.ok ? "real-pass" : "real-gap", { status: health.response.status });

const workerProof = await request("/v1/devices/local-device/worker/health");
const workerTransport = workerProof.body?.transport === "stdio" || workerProof.body?.transport === "debug-websocket"
  ? workerProof.body.transport
  : "unknown";
record("worker app-server proof", workerProof.body?.appServerConnected === true && workerTransport === "stdio" ? "real-pass" : "real-gap", {
  status: workerProof.response.status,
  appServerConnected: workerProof.body?.appServerConnected === true,
  transport: workerTransport,
  reasonCode: workerTransport === "debug-websocket" ? "debug_transport_not_readiness" : undefined,
  codexVersion: typeof workerProof.body?.codexVersion === "string" ? workerProof.body.codexVersion : "unknown",
  protocolGeneratedAt: typeof workerProof.body?.protocolGeneratedAt === "string" ? workerProof.body.protocolGeneratedAt : "unknown",
});

const devices = await request("/v1/devices");
record("devices", devices.response.ok && Array.isArray(devices.body) ? "real-pass" : "real-gap", { status: devices.response.status, count: Array.isArray(devices.body) ? devices.body.length : 0 });

const projects = await request("/v1/projects");
record("projects", projects.response.ok && Array.isArray(projects.body) && projects.body.length > 0 ? "real-pass" : "real-gap", { status: projects.response.status, count: Array.isArray(projects.body) ? projects.body.length : 0 });

const conversations = await request("/v1/conversations");
record("conversations", conversations.response.ok && Array.isArray(conversations.body) ? "real-pass" : "real-gap", { status: conversations.response.status, count: Array.isArray(conversations.body) ? conversations.body.length : 0 });

// Implement these against real Worker/app-server behavior before accepting the script.
record("thread/list cwd scope", "real-gap", { reasonCode: "not_implemented" });
record("thread/list pagination", "real-gap", { reasonCode: "not_implemented" });

let conversationId = Array.isArray(conversations.body) ? conversations.body[0]?.id : null;
let deviceId = Array.isArray(devices.body) ? devices.body[0]?.id : null;
let projectId = Array.isArray(projects.body) ? projects.body[0]?.id : null;

if (deviceId && projectId) {
  const started = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations`, {
    method: "POST",
    body: JSON.stringify({
      projectId,
      message: "codex-remote-calibration start: reply with one short sentence.",
      clientRequestId: `codex-remote-calibration-${Date.now()}`,
    }),
  });
  conversationId = started.body?.conversationId ?? conversationId;
  record("start conversation", started.response.status === 202 ? "real-pass" : "real-gap", { status: started.response.status, conversationRef: hashRef(conversationId) });
}

if (deviceId && conversationId) {
  const timeline = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/timeline`);
  record("timeline", timeline.response.ok ? "real-pass" : "real-gap", { status: timeline.response.status, turns: timeline.body?.turns?.length ?? 0 });

  const followUp = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/follow-up`, {
    method: "POST",
    body: JSON.stringify({
      message: "codex-remote-calibration follow-up: acknowledge briefly.",
      clientRequestId: `codex-remote-calibration-follow-up-${Date.now()}`,
      expectedConversationId: conversationId,
    }),
  });
  record("follow-up", followUp.response.status === 202 ? "real-pass" : "real-gap", { status: followUp.response.status, turnRef: hashRef(followUp.body?.turnId) });

  const approvals = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals`);
  record("approval pending scenario", approvals.response.ok ? "real-pass" : "real-gap", { status: approvals.response.status, count: Array.isArray(approvals.body) ? approvals.body.length : 0 });
  record("approval decision", "real-gap", { reasonCode: "no_safe_pending_approval" });
} else {
  record("timeline", "real-gap", { reasonCode: "no_conversation_id" });
  record("follow-up", "real-gap", { reasonCode: "no_conversation_id" });
  record("approval pending scenario", "real-gap", { reasonCode: "no_conversation_id" });
  record("approval decision", "real-gap", { reasonCode: "no_conversation_id" });
}

record("interrupt", "real-gap", { reasonCode: "no_safe_active_turn" });
record("steer", "real-gap", { reasonCode: "no_safe_active_turn" });

const task = await request("/v1/tasks", {
  method: "POST",
  body: JSON.stringify({ title: `codex-remote-calibration ${new Date().toISOString()}`, clientRequestId: `task-${Date.now()}` }),
});
record("task create", task.response.status === 201 ? "real-pass" : "real-gap", { status: task.response.status, taskRef: hashRef(task.body?.id) });

if (task.body?.id && deviceId && conversationId && projectId) {
  const link = await request(`/v1/tasks/${encodeURIComponent(task.body.id)}/conversation-links`, {
    method: "POST",
    body: JSON.stringify({ deviceId, conversationId, projectId }),
  });
  record("task link", link.response.status === 201 ? "real-pass" : "real-gap", { status: link.response.status });
}

record("control-plane all-workers-down", "real-gap", { reasonCode: "not_implemented" });
record("control-plane invalid-worker-token", "real-gap", { reasonCode: "not_implemented" });
record("task link invalid ids", "real-gap", { reasonCode: "not_implemented" });

const generatedAt = new Date().toISOString();
const payload = { schemaVersion: "real-check-report/v1", generatedAt, checks: report };
const reportPath = join(reportDir, `${generatedAt.replaceAll(":", "-")}.json`);

mkdirSync(reportDir, { recursive: true });
checkRequiredNames();
writeFileSync(reportPath, JSON.stringify(payload, null, 2));
writeFileSync(join(reportDir, "latest.json"), JSON.stringify(payload, null, 2));
console.log(`real:check ${report.every((item) => item.status !== "real-gap") ? "PASS" : "GAP"} report=${reportPath}`);
```

- [ ] **Step 3: Wire package script and readiness check**

In `package.json`, add:

```json
"real:check": "node scripts/real-local-calibration.mjs"
```

Add `real:check` to `requiredScripts` in `scripts/product-readiness-check.mjs`.

- [ ] **Step 4: Ignore and scan local runtime artifacts**

In `.gitignore`, ensure these paths are ignored:

```gitignore
logs/*.log
logs/*.pid
logs/*.sqlite
logs/*.sqlite-*
logs/real-check/
```

In `scripts/product-readiness-check.mjs`, add a guard that fails when `.gitignore` does not ignore `logs/real-check/`, `logs/*.log`, `logs/*.pid`, and local SQLite artifacts.

Add a focused leak check for `logs/real-check/latest.json` after `pnpm real:check`: it must reject raw prompt text, raw command output, full diff, raw JSON-RPC frames, bearer/token values, private paths, stack/cause, and raw response/request body keys.

- [ ] **Step 5: Run static checks**

Run:

```bash
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

Expected: pass.

- [ ] **Step 6: Run real calibration manually with stack running**

Run:

```bash
pnpm real:start
pnpm real:check
pnpm real:status
```

Expected:

- `control-plane health`: `real-pass`
- `devices`: `real-pass`
- `projects`: `real-pass`
- `conversations`: `real-pass` or real empty state before start
- `thread/list cwd scope`: `real-pass` or `real-gap` with exact sanitized cwd-scope reason
- `thread/list pagination`: `real-pass` or `real-gap` with page/cursor count only
- `start conversation`: `real-pass` or a concrete sanitized protocol failure to fix
- `follow-up`: `real-pass` or a concrete sanitized protocol failure to fix
- `interrupt`: `real-pass`, `fixed-pass`, or `real-gap` with safe active-turn reason
- `steer`: `real-pass`, `fixed-pass`, or `real-gap` with safe active-turn reason
- `approval pending scenario`: `real-pass`, `fixed-pass`, or `real-gap`; do not trigger destructive approvals
- `control-plane all-workers-down`: non-200 error, not `200 []`
- `control-plane invalid-worker-token`: auth/dependency error, not empty data
- `task create`: `real-pass`
- `task link`: `real-pass` when a conversation id exists
- `task link invalid ids`: missing device/project/conversation should not create a verified link
- `logs/real-check/latest.json` exists and contains no raw prompt text, raw command output, full diff, raw JSON-RPC frames, token, private path, or stack trace.

- [ ] **Step 7: Add minimal Web E2E smoke**

Add a Chromium-only Playwright smoke as a separate command, not part of broad unit tests:

```json
"web:e2e:smoke": "playwright test apps/web/e2e/real-local-smoke.spec.ts --project=chromium"
```

The smoke must run against `pnpm real:start` and assert:

- Web root loads with Control Plane env variables.
- fallback/example banner is absent when real data is loaded.
- start conversation UI is visible and can submit a `codex-remote-calibration` prompt.
- the browser observes an accepted start/follow-up network response and corresponding DOM state.
- no runtime requests go to external font/static asset hosts.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json scripts/real-local-calibration.mjs scripts/product-readiness-check.mjs scripts/product-readiness-check.test.mjs apps/web/e2e
git commit -m "feat: add real local calibration runner"
```

---

### Task 6: Real Runtime Fixes For Command And Control

**Files:**
- Modify as discovered: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify as discovered: `apps/worker/src/app-server/readOnlyAppServerSession.ts`
- Modify as discovered: `apps/worker/src/http/writeHandlers.ts`
- Modify as discovered: `apps/worker/src/http/controlHandlers.ts`
- Modify as discovered: `apps/worker/src/http/approvalRegistry.ts`
- Modify relevant tests beside changed files.

**Interfaces:**
- Consumes `pnpm real:check` from Task 5.
- Produces either fixed real-pass behavior or explicit `real-gap` entries in `logs/real-check/latest.json`.

- [ ] **Step 1: Run focused real check**

Run:

```bash
pnpm real:start
pnpm real:check
```

Expected: read the report and identify the first failing real operation.

- [ ] **Step 2: If start or follow-up fails, write a failing Worker unit test**

For a `thread/start` or `turn/start` protocol mismatch, add the smallest failing test to `apps/worker/src/http/writeHandlers.test.ts`. Example shape:

```ts
test("worker write handlers when real app-server turn start shape is required, should send generated protocol params", async () => {
  const calls: unknown[] = [];
  const context = createContext(paths.allowedRoot, {
    ...createFakeWorkerClient(paths.allowedRoot),
    startThread: async (params) => {
      calls.push({ method: "thread/start", params });
      return createThreadStartResponse("thread-real", paths.allowedRoot);
    },
    startTurn: async (params) => {
      calls.push({ method: "turn/start", params });
      return createTurnStartResponse("turn-real");
    },
  });

  const result = await startConversation(context, {
    projectId: "local-project",
    message: "codex-remote-calibration",
    clientRequestId: "client-real",
  });

  assert.equal(result.conversationId, "thread-real");
  assert.equal(result.turnId, "turn-real");
  assert.deepEqual(calls.map((call) => (call as { method: string }).method), ["thread/start", "turn/start"]);
});
```

- [ ] **Step 3: Apply the minimal Worker fix**

Fix only the protocol/session mapping that failed. Keep:

- `allowedProjectRoot` as Worker-owned `cwd`
- `local-project` as the public project id for Stage 9
- one initialized long-lived app-server session as the default Worker path
- public input sanitized
- no raw app-server response in HTTP output
- idempotency behavior unchanged
- stdio as the target Worker-owned transport; loopback WebSocket only as an explicit debug fallback

- [ ] **Step 4: Repeat for interrupt, steer, and approval**

For each real failure:

1. Add one failing unit test beside the owning Worker handler.
2. Fix the handler or approval registry.
3. Run the focused test.
4. Run `pnpm real:check` again.

If a capability cannot be safely triggered against real Codex in this stage, record `real-gap` in `logs/real-check/latest.json` with a sanitized reason.

- [ ] **Step 5: Run Worker and real checks**

Run:

```bash
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
pnpm real:check
```

Expected: unit tests pass; report contains real-pass/fixed-pass/real-gap for every required operation.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src
git commit -m "fix: calibrate worker against real app-server"
```

---

### Task 7: Documentation And Roadmap Reconciliation

**Files:**
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/references/local-self-hosting.md`
- Create if exporting tracked evidence: `docs/references/real-local-calibration-evidence.md`
- Modify: `docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md` if implementation discovers a scoped correction.

**Interfaces:**
- Consumes final `logs/real-check/latest.json`.
- Produces accurate roadmap status and operator guidance.

- [ ] **Step 1: Update PLAN stage status**

In `PLAN.md`, add a new current stage row after Stage 8:

```md
| 9. 真实本机 Codex 闭环校准 | 用真实 Codex app-server 验证 Stage 3-8 已声明能力 | 已完成真实本机校准 |
```

If implementation is still in progress, use:

```md
| 9. 真实本机 Codex 闭环校准 | 用真实 Codex app-server 验证 Stage 3-8 已声明能力 | 进行中 |
```

Add bullets separating:

- fake Worker smoke evidence
- real app-server E2E evidence
- output streaming remaining out of scope

- [ ] **Step 2: Update development context**

In `docs/references/development-context.md`, add:

```md
Stage 9 completed context:

- Real local stack uses Worker, Control Plane, Web, SQLite task DB, and Codex app-server on one Mac.
- Fake Worker smoke no longer satisfies real readiness claims.
- Real calibration report lives in ignored local artifacts under `logs/real-check/`; tracked docs contain only sanitized evidence summaries.
- Output streaming remains a separate stage.
```

Use `in-progress context` instead of `completed context` if not all verification has passed.

- [ ] **Step 3: Update runbook**

In `docs/references/local-self-hosting.md`, include:

```bash
pnpm real:start
pnpm real:check
pnpm real:status
pnpm real:stop
```

State that Web must use `NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL` and `NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN`.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm real:check
pnpm web:e2e:smoke
```

Expected: static gate passes; `pnpm real:check` records real-pass/fixed-pass/real-gap without fake Worker evidence; `pnpm web:e2e:smoke` proves the real Web entrypoint.

- [ ] **Step 5: Commit**

```bash
git add PLAN.md docs/references/development-context.md docs/references/local-self-hosting.md docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md
# Add docs/references/real-local-calibration-evidence.md only if a sanitized tracked evidence summary was generated.
git commit -m "docs: reconcile real local calibration status"
```

---

### Task 8: Worker-Owned Stdio App-Server Lifecycle

**Files:**
- Modify: `apps/worker/src/app-server/appServerRpcClient.ts`
- Modify: `apps/worker/src/app-server/appServerRpcClient.test.ts`
- Modify: `apps/worker/src/app-server/appServerProcessService.ts`
- Modify: `apps/worker/src/app-server/appServerProcessService.test.ts`
- Modify: `apps/worker/src/app-server/readOnlyAppServerSession.ts`
- Modify: `apps/worker/src/app-server/readOnlyAppServerSession.test.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.test.ts`
- Modify: `apps/worker/src/http/workerHttpConfig.ts`
- Modify: `apps/worker/src/http/workerHttpConfig.test.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.test.ts`
- Modify: `scripts/start-real-local-stack.sh`
- Modify: `scripts/product-readiness-check.mjs` and `scripts/product-readiness-check.test.mjs` only if readiness wording or guardrails change.
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/references/local-self-hosting.md`
- Modify: `docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md`

**Interfaces:**
- Produces Worker-owned process path: `codex app-server --stdio`.
- Produces newline-delimited JSON-RPC transport compatible with `AppServerRpcClient`.
- Keeps loopback WebSocket as `debug-websocket` fallback only.
- Allows default `pnpm real:start` to start Worker, Control Plane, and Web with `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio` and `CODEX_REMOTE_START_APP_SERVER=true`.
- Produces sanitized Worker health proof: app-server connected, `appServer.transport === "stdio"`, ready true, and a safe version/capability value when available.
- Does not expose app-server URL, raw JSON-RPC frames, raw prompts, raw command output, stderr/stdout, `codexHome`, cwd, `allowedProjectRoot`, private paths, stack/cause, or provider secrets.

**Source-of-truth rules:**
- Use `packages/codex-protocol` generated types for app-server methods and notifications.
- The stdio adapter may own local transport framing, buffering, and child-process lifecycle only; it must not define a parallel upstream protocol schema.
- If generated protocol types are missing required fields, stop and record `real-gap` or regenerate protocol artifacts with the approved generation command; do not handwrite missing upstream DTOs.

- [x] **Step 1: Add failing stdio transport tests**

In `apps/worker/src/app-server/appServerRpcClient.test.ts`, add focused tests for a stdio socket adapter:

- `send()` writes one JSON string followed by `\n`.
- split chunks are buffered until newline before emitting a message.
- multiple newline-delimited JSON messages in one chunk emit separately.
- invalid JSON line rejects pending requests with `app_server_protocol_error`.
- child close/error rejects pending requests.
- request timeout clears pending state.

Run:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "stdio|AppServerRpcClient"
```

Expected: FAIL before implementation.

- [x] **Step 2: Implement stdio process and transport**

In `apps/worker/src/app-server/appServerProcessService.ts`, add a Worker-owned stdio starter that spawns:

```bash
codex app-server --stdio
```

Use `stdio: ["pipe", "pipe", "pipe"]`. The process service may hold stderr for lifecycle failure detection in memory only, but it must not write stderr/stdout or raw frames to logs or public responses.

In `apps/worker/src/app-server/appServerRpcClient.ts`, add a local adapter that implements the existing `SocketLike` boundary:

- `send(data)` writes `${data}\n` to child stdin.
- stdout bytes are decoded as UTF-8 and split on `\n`.
- each complete line emits a `message` event with the raw line string.
- close/error events map to existing connection errors.
- `close()` terminates the child and closes stdin.

Keep `connectAppServerRpcClient(url)` for loopback WebSocket debug fallback. Add a separate factory such as `connectStdioAppServerRpcClient(handle, options)` rather than overloading public URL semantics.

- [x] **Step 3: Initialize and prove stdio sessions without HTTP readyz**

In `apps/worker/src/app-server/readOnlyAppServerSession.ts`, add transport-aware session opening:

- If `configuredUrl` exists, keep loopback WebSocket path.
- If `appServerTransport === "stdio"` and `startAppServer === true`, start `codex app-server --stdio` and connect with the stdio transport.
- If `appServerTransport === "debug-websocket"` and `startAppServer === true`, keep existing loopback WebSocket debug fallback.
- Do not silently fall back from stdio to WebSocket.

In `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`, support readiness for stdio by doing a safe initialized protocol handshake instead of HTTP `/readyz`:

- call `initialize` with generated `InitializeParams` shape, including required `clientInfo` fields;
- send `initialized`;
- retain only sanitized proof values such as safe user-agent/version text when available;
- do not expose or persist `codexHome`, cwd, raw response, raw notification, stderr, stdout, or private paths.

- [x] **Step 4: Update Worker config semantics**

In `apps/worker/src/http/workerHttpConfig.ts`, replace the temporary fail-closed rule:

- default no URL with `CODEX_REMOTE_START_APP_SERVER=true` should resolve to `appServerTransport: "stdio"` and `startAppServer: true`.
- explicit `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio` with `CODEX_REMOTE_START_APP_SERVER=true` should be valid.
- explicit `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio` with `CODEX_APP_SERVER_URL` should remain invalid.
- `CODEX_REMOTE_APP_SERVER_TRANSPORT=debug-websocket` remains explicit local debug fallback.

Update `apps/worker/src/http/workerHttpConfig.test.ts` to cover all four cases and to prevent fake stdio reporting when a session actually uses loopback WebSocket.

- [x] **Step 5: Update health proof**

In `apps/worker/src/http/readOnlyHandlers.ts`, make `getHealth()` prove the actual app-server path:

- for stdio sessions, `readyz()` must exercise the stdio RPC handshake;
- return `appServer.transport` from the actual configured/session transport;
- return `appServer.readyz: true` only after the real check succeeds;
- return `codexVersion` only from a sanitized version/user-agent value if available, otherwise keep `null` and make `real:check` record a sanitized `real-gap` for version proof rather than fabricating a value.

Update tests so fake clients cannot satisfy stdio readiness without the stdio proof path.

- [x] **Step 6: Update real stack startup**

In `scripts/start-real-local-stack.sh`:

- remove the default `stdio` fail-closed branch;
- start the Worker with `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio` and `CODEX_REMOTE_START_APP_SERVER=true` by default;
- keep `CODEX_REMOTE_APP_SERVER_TRANSPORT=debug-websocket` as an explicit debug branch with warning text;
- keep lifecycle logs status-only and do not write tokens, raw URLs, raw frames, prompts, command output, stderr/stdout, stack/cause, or private paths.

Update product readiness tests only if they currently require the temporary fail-closed text.

- [x] **Step 7: Run focused verification**

Run:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "stdio|app-server transport|app-server session|worker http config|health"
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

Expected: all pass.

- [x] **Step 8: Run real runtime verification**

Run:

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
```

Expected:

- `pnpm real:start` starts Worker, Control Plane, and Web by default.
- `pnpm real:status` shows Worker, Control Plane, and Web running on the expected loopback ports.
- `pnpm real:check` records real stdio app-server evidence as `real-pass` or `fixed-pass`; remaining Q21-Q24 items may stay `real-gap` only with sanitized reasons.
- `pnpm web:e2e:smoke` runs against the real stack and cannot pass through fake Worker evidence.
- `logs/real-check/latest.json` remains ignored and contains no raw prompt, command output, raw JSON-RPC, token, private path, stack/cause, raw ids, raw URLs, or full diff.

- [x] **Step 9: Update docs and roadmap**

Update:

- `PLAN.md`: replace “real:start default stdio fail-closed” with the latest real runtime evidence.
- `docs/references/development-context.md`: move Stage 9 context from stdio missing to current stdio behavior and remaining gaps.
- `docs/references/local-self-hosting.md`: remove “stdio lifecycle is not implemented yet” after the implementation passes.
- `docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md`: keep stdio lifecycle and safety constraints aligned with implementation.

- [ ] **Step 10: Commit**

```bash
git add apps/worker/src scripts/start-real-local-stack.sh scripts/product-readiness-check.mjs scripts/product-readiness-check.test.mjs PLAN.md docs/references/development-context.md docs/references/local-self-hosting.md docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md
git commit -m "feat: add worker stdio app-server lifecycle"
```

---

### Task 9: Reject Invalid Task Conversation Links

**Files:**
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Modify: `scripts/real-local-calibration.mjs` only if status wording needs to distinguish fixed-pass.
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`

**Interfaces:**
- Keeps existing public API schema and DB schema.
- Uses current Control Plane routes and Worker client methods to prove `deviceId`, `projectId`, and `conversationId` before storing a task link.
- Returns a sanitized 4xx error for unknown device, project, or conversation ids.
- Leaves offline Worker verification as a later gap; this slice only prevents arbitrary ids from becoming verified links while the Worker is reachable.

**Non-goals:**
- No task-link schema changes.
- No new persistent project binding table.
- No Web UI changes.
- No real multi-device fixture.

- [x] **Step 1: Add failing Control Plane tests**

In `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`, add focused tests:

- unknown `deviceId` in `POST /v1/tasks/{taskId}/conversation-links` returns sanitized 404/4xx and does not persist a link;
- known device with unknown `projectId` returns sanitized 404/4xx and does not persist a link;
- known device/project with unknown `conversationId` returns sanitized 404/4xx and does not persist a link;
- existing valid link still returns 201.

- [x] **Step 2: Implement minimal validation**

In `apps/control-plane/src/http/controlPlaneHttpApp.ts`, before `repository.linkConversation()`:

- resolve `input.deviceId` through the existing registry;
- read that device's projects and require `input.projectId`;
- read that device's conversations and require `input.conversationId`;
- require the conversation's `projectId` to equal `input.projectId`;
- throw `ControlPlaneHttpError` with safe `project_not_found` / `conversation_not_found` style codes.

- [x] **Step 3: Run focused verification**

```bash
pnpm --filter @codex-remote/control-plane test -- --test-name-pattern "conversation link"
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

- [x] **Step 4: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
```

Expected: `task link invalid ids` becomes `real-pass` or `fixed-pass`; no raw ids, URLs, paths, prompts, command output, stack/cause, or full diffs enter tracked docs.

- [x] **Step 5: Update docs and commit**

Update `PLAN.md`, `docs/references/development-context.md`, and this plan with sanitized evidence counts, then commit:

```bash
git add apps/control-plane/src/http/controlPlaneHttpApp.ts apps/control-plane/src/http/controlPlaneHttpApp.test.ts scripts/real-local-calibration.mjs PLAN.md docs/references/development-context.md docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md
git commit -m "fix: reject invalid task conversation links"
```

---

### Task 10: Control Plane Degraded Vs Empty-Data Semantics

**Files:**
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- Modify: `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- Modify: `scripts/real-local-calibration.mjs`
- Modify: `docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keeps `packages/api-contract/openapi.yaml` and DB schema unchanged.
- Keeps Web -> Control Plane -> Worker boundaries unchanged.
- Keeps `/v1/control-plane/health` as a `200` status summary endpoint:
  - `status: "ok"` only when every configured Worker health check is connected.
  - `status: "degraded"` when one or more configured Workers fail health.
- Keeps `/v1/devices` as a `200` device inventory endpoint:
  - connected Workers remain available;
  - unavailable Workers are projected as not connected with sanitized public fields only.
- Changes `/v1/conversations` aggregation semantics:
  - if at least one Worker conversation read succeeds, return `200` with the successful Workers' conversations, even if the result is an empty array;
  - if every configured Worker conversation read fails, return a sanitized `424 device_unavailable` style dependency error, not `200 []`.
- Extends `pnpm real:check` Q24 probes so `control-plane all-workers-down` and `control-plane invalid-worker-token` use temporary real Control Plane fixtures and record `real-pass`, `fixed-pass`, or `real-gap` in `logs/real-check/latest.json`.

**Non-goals:**
- No Q21/Q22 closure for post-start readable conversations, follow-up, approval, interrupt, or steer.
- No Q23 `thread/list(cwd)` scope or pagination work.
- No OpenAPI schema change unless an existing generated type check proves it is required.
- No Web UI redesign; only preserve existing degraded/error visibility through the current datasource behavior.
- No DB schema, task-link, pairing, token rotation, reverse WSS, installer, iOS, or production auth work.
- No raw Worker URL, token, raw JSON-RPC, raw prompt, command output, full diff, stack/cause, response body, or private path in reports, logs, docs, or tests.

- [x] **Step 1: Add focused failing Control Plane tests**

In `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`, add tests for:

- partial Worker conversation failure keeps successful conversations as `200`;
- all configured Worker conversation reads failing returns sanitized `424`, not `200 []`;
- response bodies do not expose upstream Worker tokens, loopback ports, upstream device ids, stack/cause, or raw internal errors.

- [x] **Step 2: Implement minimal aggregation change**

In `apps/control-plane/src/http/controlPlaneHttpApp.ts`, keep `readDeviceConversations()` behavior for `/v1/devices` so device inventory remains resilient.

For `/v1/conversations`, aggregate each device result explicitly:

- normalize successful device conversations with configured `device.id`;
- keep partial successes;
- if every device failed, throw `ControlPlaneHttpError(424, "device_unavailable", "Device is unavailable.", { operation: "conversation/list", retryable: true })` or the existing equivalent sanitized dependency error.

- [x] **Step 3: Add real-check Q24 fixtures**

In `scripts/real-local-calibration.mjs`, replace the fixed `no_all_workers_down_fixture` and `no_invalid_worker_token_fixture` records with temporary Control Plane fixtures:

- all-workers-down fixture: configured Worker points at an unused loopback port;
- invalid-worker-token fixture: configured Worker points at the real local Worker but uses a derived invalid Worker bearer value;
- both fixtures call `/v1/control-plane/health`, `/v1/devices`, and `/v1/conversations`;
- both fixtures record only status, duration, sanitized code, counts, and reason code;
- both fixtures shut down their temporary Control Plane process before report write.

Expected Q24 pass criteria:

- `/v1/control-plane/health` is `200` and degraded when the fixture Worker cannot authenticate or cannot be reached;
- `/v1/devices` is `200` and reports a not connected device;
- `/v1/conversations` is a non-200 sanitized dependency error, not `200 []`;
- `logs/real-check/latest.json` records `control-plane all-workers-down` and `control-plane invalid-worker-token` as `real-pass` or `fixed-pass` after the implementation.

- [x] **Step 4: Run focused verification**

```bash
pnpm --filter @codex-remote/control-plane test -- --test-name-pattern "conversations are listed|all configured worker|partial worker"
pnpm --filter @codex-remote/control-plane typecheck
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

- [x] **Step 5: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: Q24 fixtures no longer use fake Worker evidence and no raw URLs, tokens, paths, prompts, command output, raw JSON-RPC, stack/cause, raw ids, response bodies, or full diffs enter `logs/real-check/latest.json` or tracked docs.

- [x] **Step 6: Run full gates**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [x] **Step 7: Update docs and commit**

Update `PLAN.md`, `docs/references/development-context.md`, and this plan with sanitized Q24 evidence counts, then commit:

```bash
git add apps/control-plane/src/http/controlPlaneHttpApp.ts apps/control-plane/src/http/controlPlaneHttpApp.test.ts scripts/real-local-calibration.mjs PLAN.md docs/references/development-context.md docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md
git commit -m "fix: distinguish degraded control plane reads"
```

---

### Task 11: Initialize Worker Sessions Before Write RPCs

**Files:**
- Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/writeHandlers.test.ts`
- Modify: `scripts/real-local-calibration.mjs` only if status wording needs a sanitized reason update.
- Modify: `docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keeps the public API and DB schema unchanged.
- Uses the existing Worker client `readyz()` method as the single app-server handshake gate. For stdio sessions, `readyz()` already maps to `initialize()` + `initialized()`.
- Ensures `startConversation()` and `followUpConversation()` call the handshake before write-path business RPCs.
- Keeps `apps/worker` as the only app-server caller; Control Plane and Web remain unchanged.

**Non-goals:**
- No Q23 cwd-scope or pagination work.
- No approval, interrupt, or steer scenario construction.
- No control-path handshake changes.
- No post-start readable-conversation fix.
- No protocol generation or handwritten app-server DTOs.
- No timeout tuning unless the post-handshake real check still proves timeout is the remaining root cause.
- No raw app-server response, raw prompt, raw JSON-RPC, command output, full diff, stack/cause, token, raw URL, or private path in logs, reports, tests, or docs.

- [x] **Step 1: Add failing Worker write tests**

In `apps/worker/src/http/writeHandlers.test.ts`, extend the fake write client to record `readyz()` calls and add focused tests:

- start conversation calls `readyz()` before `thread/start`;
- follow-up calls `readyz()` before `thread/list` / `turn/start`;
- if `readyz()` fails, write handlers return sanitized `app_server_timeout` / `app_server_unavailable` mapping through existing `mapUnknownError` and do not call business RPCs.

- [x] **Step 2: Implement minimal handshake gate**

In `apps/worker/src/http/writeHandlers.ts`, update `withWriteClient()`:

- after `context.openClient()` succeeds, call `await client.readyz()` before running the write operation;
- keep the existing close behavior and error mapping;
- do not add a new session abstraction.

- [x] **Step 3: Run focused verification**

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "starting a conversation|following up|readyz"
pnpm --filter @codex-remote/worker typecheck
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

- [x] **Step 4: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: start conversation and follow-up improve to `real-pass` or move to a narrower sanitized `real-gap`; no fake Worker evidence is counted.

Observed after the Worker write handshake fix:

- `pnpm real:start` and `pnpm real:status` start and report Worker, Control Plane, and Web running on the real stdio path.
- `pnpm real:check` records `total=19 realPass=11 fixedPass=0 realGap=8`.
- `start conversation` records `real-pass` with HTTP 202, proving the direct write no longer fails before `thread/start`.
- `timeline`, `follow-up`, and approval pending scenario now fail with sanitized `conversation_not_found` for the newly accepted conversation. This is the next Stage 9 gap: post-start readable conversation through Control Plane/Worker, not write-session initialization.

- [x] **Step 5: Run full gates**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [x] **Step 6: Update docs and commit**

Update `PLAN.md`, `docs/references/development-context.md`, and this plan with sanitized evidence, then commit:

```bash
git add apps/worker/src/http/writeHandlers.ts apps/worker/src/http/writeHandlers.test.ts PLAN.md docs/references/development-context.md docs/superpowers/specs/2026-06-20-real-local-codex-calibration-design.md docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md
git commit -m "fix: initialize worker writes before rpc"
```

---

### Task 12: Prove Specific Conversation Access By Read-Then-Verify

**Files:**
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/writeHandlers.ts`
- Modify: `apps/worker/src/http/controlHandlers.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.test.ts`
- Modify: `apps/worker/src/http/writeHandlers.test.ts`
- Modify: `apps/worker/src/http/controlHandlers.test.ts`
- Modify: `apps/worker/src/http/workerHttpApp.test.ts` only if route-level behavior needs coverage.
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keeps public API, DB schema, and Codex protocol generated types unchanged.
- Keeps aggregate conversation list behavior on `thread/list(cwd)`.
- For specific conversation routes, uses `thread/read({ threadId, includeTurns: true })` followed by `isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)` as the allowlist proof.
- Keeps `allowedProjectRoot` and `cwd` inside Worker only; public errors remain sanitized.

**Non-goals:**
- No Q23 cwd-scope or pagination probe implementation.
- No approval scenario construction.
- No interrupt/steer active-turn scenario construction.
- No Web UI changes unless focused real smoke proves a Web-only regression.
- No persistence of started conversation ids in Control Plane or DB.
- No raw app-server response, real raw ids, prompt text, command output, full diff, raw JSON-RPC, token, raw URL, stack/cause, or private path in docs/logs/tests. Synthetic ids in tests are allowed.

- [x] **Step 1: Add failing Worker tests**

Add tests proving:

- timeline reads a newly started/specific conversation when `thread/list(cwd)` does not include it, as long as `thread/read` returns a cwd inside `allowedProjectRoot`;
- follow-up starts a turn for the same case after read-then-verify;
- approval listing, `decideApproval()`, and control allowlist paths use the same read-then-verify helper before exposing approvals or sending control RPCs;
- if `thread/read` returns a cwd outside `allowedProjectRoot`, public output is sanitized and no write/control RPC is called;
- if `thread/read` returns a cwd outside `allowedProjectRoot`, approval registry entries for the same synthetic id are not exposed;
- control paths initialize the session before `thread/read`, then call the control RPC only after verification.

- [x] **Step 2: Implement one shared Worker-local verifier**

Refactor Worker HTTP handlers to use a small internal verifier for specific conversation ids:

- call `client.readThread({ threadId: conversationId, includeTurns: true })`;
- verify `thread.cwd` is inside `allowedProjectRoot`;
- return the thread for timeline projection or allow follow-up/control to proceed;
- map missing, outside-root, and inaccessible conversations to sanitized `conversation_not_found`; do not expose a distinct forbidden response that would prove an outside-root id exists;
- call `readyz()` before specific-conversation reads on write/control paths when the client may be the first request against a stdio session.

- [x] **Step 3: Run focused verification**

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "specific conversation|following up|approvals|interrupting|steering"
pnpm --filter @codex-remote/worker typecheck
```

- [x] **Step 4: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: timeline and follow-up for the newly accepted start conversation become `real-pass` or move to a narrower sanitized gap. Fake Worker evidence remains excluded.

Observed after the read-then-verify fix:

- `pnpm real:check` records `total=19 realPass=15 fixedPass=0 realGap=4`.
- `timeline` records `real-pass` with HTTP 200 and a nonzero turn count for the newly accepted start conversation.
- `follow-up` records `real-pass` with HTTP 202.
- `approval pending scenario` records `real-pass` with HTTP 200 and safe count metadata.
- `interrupt` records `real-pass` with HTTP 202.
- Remaining gaps are `thread/list cwd scope`, `thread/list pagination`, `approval decision` with `no_safe_pending_approval`, and `steer` with sanitized `worker_internal_error`.

- [x] **Step 5: Run full gates and commit**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git commit -m "fix: verify specific worker conversations by read"
```

---

### Task 13: Stabilize Control Calibration Samples

**Files:**
- Modify: `scripts/real-local-calibration.mjs`
- Add or modify: `scripts/real-local-calibration.test.mjs`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.test.ts`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keeps public API, DB schema, Worker handlers, and Codex protocol generated types unchanged.
- Changes only the calibration runner sampling/wait behavior and Worker-specific inaccessible-read mapping.
- Keeps report schema and allowed detail keys unchanged.

**Non-goals:**
- No Worker control implementation changes.
- No approval decision scenario construction.
- No Q23 cwd-scope or pagination probe implementation.
- No raw ids, prompts, command output, raw JSON-RPC, token, raw URL, stack/cause, or private path in reports/docs.

**Pre-review evidence:**
- Latest real-check records `interrupt` as `real-pass` but `steer` as sanitized `worker_internal_error`.
- `recordActiveTurnControls()` currently sends `turn/interrupt` before `turn/steer` against the same active turn id.
- Interrupting the active turn first can invalidate the active turn for the subsequent steer probe, so this does not prove product steer readiness.
- A same-turn steer-before-interrupt attempt made post-start timeline/follow-up evidence unstable, so Task 13 must not force both controls against one active turn.

Reviewer: `019ee615-1abc-7633-b400-64a4f339c5c4`

Result: clean enough to execute.

Findings addressed by Task 13:

- Important: This is a reasonable evidence-first calibration slice before changing Worker product logic.
- Important: If steer-first makes interrupt or earlier timeline evidence stop passing, do not force success on the same turn; escalate to independent active-turn samples.
- Important: Post-start timeline visibility can be eventually consistent; the calibration runner may wait briefly, but must still record only sanitized final evidence.

- [x] **Step 1: Add failing calibration runner test**

Add focused tests that read `scripts/real-local-calibration.mjs` and prove:

- active-turn controls use independent steer and interrupt samples when possible;
- post-start timeline reads wait briefly for visibility before recording a final safe result.

- [x] **Step 2: Stabilize calibration sampling**

In `scripts/real-local-calibration.mjs`:

- use the follow-up accepted turn id as the steer sample;
- use the timeline active turn id as the interrupt sample;
- wait briefly for post-start timeline visibility;
- keep sanitized report fields unchanged;
- do not add raw ids, raw bodies, or fake Worker evidence.

In `apps/worker/src/http/readOnlyHandlers.ts`:

- map inaccessible `thread/read` protocol errors for specific conversation verification to sanitized `conversation_not_found`;
- keep timeout/unavailable errors as dependency errors.

- [x] **Step 3: Run focused verification**

```bash
node --test scripts/real-local-calibration.test.mjs
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

- [x] **Step 4: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Observed:

- A same-turn steer-before-interrupt attempt regressed post-start timeline/follow-up evidence and was not kept.
- Independent turn sampling plus timeline wait restores `pnpm real:check` to `total=19 realPass=15 fixedPass=0 realGap=4`.
- `steer` still records sanitized `worker_internal_error`; this remains a real Worker/app-server control gap for the next slice.
- `interrupt` remains `real-pass`; fake Worker evidence remains excluded.

- [x] **Step 5: Run full gates and commit**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git commit -m "fix: stabilize real control calibration"
```

---

### Task 14: Build A Safe Real Steer Probe

**Files:**
- Modify: `scripts/real-local-calibration.mjs`
- Modify: `scripts/real-local-calibration.test.mjs`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keeps public API, DB schema, Worker handlers, and Codex protocol generated types unchanged unless real evidence proves the Worker payload shape is wrong.
- Uses only Control Plane-shaped public APIs for the calibration runner.
- Keeps Worker as the only app-server caller.
- Keeps report schema allowlisted and sanitized.

**Non-goals:**
- No approval decision scenario construction.
- No Q23 cwd-scope or pagination probe implementation.
- No unsafe `thread/shellCommand`, no bypass approvals/sandbox, no host UI automation, no external services.
- No raw ids, prompts, command output, raw JSON-RPC, token, raw URL, stack/cause, or private path in reports/docs.
- No direct app-server event subscription from the calibration runner.
- No steer sample from interrupted, completed, stored-only, read-only, approval-consumed, or interrupt-consumed turns.

**Pre-review evidence:**
- Latest real-check records `steer` as sanitized `worker_internal_error` while start, timeline, follow-up, approval pending list, and interrupt record `real-pass`.
- Q21/Q22 say `turn/steer` only works on a currently in-flight regular turn and must use `expectedTurnId`.
- The current runner steers a normal accepted follow-up turn without proving it is still in-flight or steerable.
- Q22 recommends a fresh long-running safe turn and records `steer-rpc-gap` if `turn/steer` is rejected.

Reviewer: `019ee61e-02d4-75d3-9d2b-3ab77ea489b1`

Result: clean enough to execute after safety/readiness guard clarifications.

Findings addressed by Task 14:

- Important: Do not fix Worker steer payload or error mapping until the runner proves it is calling steer on a still in-flight regular turn.
- Important: The calibration runner must not directly subscribe to app-server events; that would bypass Web -> Control Plane -> Worker readiness evidence.
- Important: Steer fixture prompts must be allowlisted safe calibration prompts. They must not ask Codex to read or write files, run commands, access network, print environment, reveal paths, reveal tokens, or print command output.
- Important: `steer` may record `real-pass` only when public timeline proof shows the target turn is active and the public steer route returns accepted. `worker_internal_error`, `active-turn-gap`, and `steer-rpc-gap` remain `real-gap`.

- [x] **Step 1: Add failing calibration probe tests**

Extend `scripts/real-local-calibration.test.mjs` to prove the runner:

- does not use `thread/shellCommand`, bypass flags, host UI automation, or raw output capture for steer;
- starts or selects a fresh steer sample instead of reusing an interrupted turn;
- waits for a safe active turn before attempting steer, or records a specific `active-turn-gap` / `steer-rpc-gap` reason instead of generic `steer_not_accepted`.
- uses only safe allowlisted calibration prompts for steer samples;
- cannot mark steer `real-pass` unless active-turn proof and accepted steer response are both present.

- [x] **Step 2: Implement safe steer probe**

In `scripts/real-local-calibration.mjs`:

- create a steer-specific calibration conversation/turn through existing public start/follow-up APIs;
- wait for timeline evidence that the target turn is still active before calling steer;
- if no active turn appears, record `active-turn-gap`;
- if steer returns a sanitized failure, record `steer-rpc-gap` or another specific allowlisted reason, not a generic readiness claim;
- keep `steer-rpc-gap` details limited to safe fields such as `status`, `durationMs`, `sanitizedCode`, `reasonCode`, and opaque refs;
- do not store or emit raw prompt, command output, raw ids, or raw response bodies.

- [x] **Step 3: Run focused verification**

```bash
node --test scripts/real-local-calibration.test.mjs
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
```

- [x] **Step 4: Run real runtime verification**

```bash
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: `steer` becomes `real-pass` or a narrower `real-gap` such as `active-turn-gap` / `steer-rpc-gap`; fake Worker evidence remains excluded.

Actual: `pnpm real:check` generated `logs/real-check/latest.json` with `total=19 realPass=15 fixedPass=0 realGap=4`. `steer` is now a narrower `real-gap` with `activeTurnProven=false` and `reasonCode=active-turn-gap`; it is no longer a generic Worker error and is not counted as readiness.

- [x] **Step 5: Run full gates and commit**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git commit -m "fix: add safe real steer probe"
```

---

Task 14 implementation notes:

- `scripts/real-local-calibration.mjs` now waits for public timeline proof that the follow-up turn is still active before calling the public steer route.
- `steer` can only be recorded as `real-pass` after both active-turn proof and an accepted public steer response.
- If the active proof is missing, the runner records a sanitized `active-turn-gap` with only opaque refs and allowlisted booleans.
- `scripts/product-readiness-check.mjs` rejects any `steer` `real-pass` in `logs/real-check/latest.json` that lacks `activeTurnProven=true` and accepted status.
- Focused verification passed: `node --test scripts/real-local-calibration.test.mjs`, `node --test scripts/product-readiness-check.test.mjs`, and `pnpm product:check`.
- Real runtime verification passed for stack lifecycle and Web smoke: `pnpm real:start`, `pnpm real:status`, `pnpm real:check`, `pnpm web:e2e:smoke`, `pnpm real:stop`, `pnpm real:status`.
- Full gates passed: `pnpm product:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

### Task 15: Probe Q23 Cwd Scope And Pagination

**Files:**
- Modify: `scripts/real-local-calibration.mjs`
- Modify: `scripts/real-local-calibration.test.mjs`
- Modify: `scripts/product-readiness-check.mjs`
- Modify: `scripts/product-readiness-check.test.mjs`
- Modify: `packages/api-contract/openapi.yaml`
- Generate: `packages/api-contract/src/generated/openapi.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.ts`
- Modify: `apps/worker/src/http/readOnlyHandlers.test.ts`
- Modify: `apps/worker/src/probe/readOnlyProbe.ts`
- Modify: `apps/worker/src/probe/readOnlyProbe.test.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Modify: `apps/worker/src/probe/appServerReadOnlyProbeClient.test.ts`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Use `packages/api-contract/openapi.yaml` as the source for any new Worker probe evidence fields, then regenerate API types.
- Keep DB schema and Codex protocol generated files unchanged.
- Keep `apps/web` out of this slice; Q23 is a calibration/readiness probe, not a UI change.
- Keep Worker as the only app-server caller.
- `real-local-calibration.mjs` must call the Worker-owned probe endpoint through Control Plane/Worker-shaped HTTP and consume only sanitized contract fields.

**Non-goals:**
- No persistent multi-root/project binding table.
- No git worktree discovery implementation.
- No symlink, Windows/WSL path alias, sourceKinds, archived inventory, or provider matrix implementation.
- No broad conversation inventory UI change.
- No deletion or mutation of Codex conversation history.
- No raw cwd, allowedProjectRoot, local path, raw ids, raw prompts, raw JSON-RPC, command output, stack/cause, or token in reports/docs.

**Pre-review evidence:**
- Q23 imported answer says `thread/list(cwd)` is exact-after-normalization, not prefix/subtree.
- Q23 says pagination must continue until `nextCursor:null`; fixed page count is not valid readiness evidence.
- Current real-check records `thread/list cwd scope` and `thread/list pagination` as explicit gaps with `no_control_plane_cwd_scope_probe` and `no_control_plane_pagination_probe`.
- Worker now uses `thread/read` plus Worker-local realpath verification for specific conversation authorization, so list gaps should be handled as inventory/readiness evidence rather than reintroducing list-only authorization.

Reviewer: `019ee628-15be-7b21-8d67-162914f80e7b`

Result: needs changes; plan updated to use an OpenAPI-first Worker-owned probe instead of weak conversation counts or direct app-server access.

Findings addressed by Task 15:

- High: File scope now includes Worker probe/read-only code, Worker tests, OpenAPI source, and generated API types.
- High: Q23 evidence fields will be added to `packages/api-contract/openapi.yaml` before implementation; no non-contract fields are allowed on `/v1/worker/probe`.
- Medium: Q23 `real-pass` must come from Worker probe exact-cwd and cursor-drain evidence, not `/v1/conversations` count.
- Medium: Hitting any page cap while `nextCursor` remains non-null is `pagination_probe_incomplete`, not readiness.

Review focus:

- Does this slice need a Worker-only probe endpoint, or can `real-local-calibration.mjs` prove Q23 through existing public endpoints without violating Worker-only app-server ownership?
- What is the smallest safe real evidence that can turn Q23 from generic `no_*_probe` into `real-pass` or a narrower `real-gap`?
- Are report details sufficiently sanitized if they include only `pageCount`, `cursorCount`, `count`, booleans, and reason codes?
- Does the plan avoid claiming subtree/worktree support that Stage 9 does not implement?

- [x] **Step 1: Add focused Q23 tests**

Extend calibration/readiness tests to require:

- no generic `no_control_plane_cwd_scope_probe` / `no_control_plane_pagination_probe` after the probe exists;
- pagination evidence records at least `pageCount`, `cursorCount`, `count`, and a specific reason when incomplete;
- cwd-scope evidence records only booleans/counts/reason codes, not raw cwd or local paths;
- product readiness rejects Q23 `real-pass` without Worker probe fields `exactCwdListProven=true`, `completedUntilNextCursorNull=true`, `pageCount`, `cursorCount`, and `count`.

- [x] **Step 2: Update OpenAPI and generated contract types**

Add sanitized Q23 evidence fields to the Worker probe response schema:

- `exactCwdListProven`: boolean
- `completedUntilNextCursorNull`: boolean
- `pageCount`: number
- `cursorCount`: number
- `count`: number
- `reasonCode`: controlled string when incomplete

Then run the package generation command so implementation imports generated types instead of hand-writing parallel DTOs.

- [x] **Step 3: Implement Worker-owned Q23 evidence path**

Implement the smallest Worker-owned evidence path that can safely answer:

- whether the current configured project root exact-cwd `thread/list` query succeeds;
- whether paginated inventory follows cursors until completion for the current filter, or records a specific sanitized incomplete reason;
- whether the report can distinguish exact-cwd proof from subtree/worktree support not implemented in this slice.

The Worker probe may use bounded defense-in-depth limits for runtime safety, but if it stops before `nextCursor:null`, it must report `pagination_probe_incomplete` and cannot mark pagination `real-pass`.

- [x] **Step 4: Update readiness guard**

Ensure `pnpm product:check` fails if future `logs/real-check/latest.json` claims Q23 `real-pass` with only weak conversation-count evidence, generic gap reasons, fixed one-page assumptions, or missing Worker probe proof fields.

- [x] **Step 5: Run focused and real verification**

```bash
pnpm --filter @codex-remote/api-contract check:generated
pnpm --filter @codex-remote/worker test
node --test scripts/real-local-calibration.test.mjs
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: Q23 checks become `real-pass` if exact-cwd and full pagination are proven through Worker-owned evidence; otherwise they become narrower `real-gap` records such as `cwd_scope_probe_incomplete` or `pagination_probe_incomplete`.

Actual: `pnpm real:check` generated `logs/real-check/latest.json` with `total=19 realPass=17 fixedPass=0 realGap=2`. Both Q23 checks are `real-pass` with Worker probe fields `exactCwdListProven=true`, `completedUntilNextCursorNull=true`, `pageCount=1`, `cursorCount=0`, and `count=17`. The remaining gaps are `approval decision` with `no_safe_pending_approval` and `steer` with `active-turn-gap`.

- [x] **Step 6: Run full gates and commit**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git commit -m "fix: probe real thread list inventory"
```

Task 15 implementation notes:

- Added device-scoped Control Plane route `/v1/devices/{deviceId}/worker/probe` to the OpenAPI source and regenerated API types.
- Extended `ProbeCheckResult` with sanitized Q23 evidence fields.
- Worker probe now drains `thread/list` cursors until `nextCursor:null` or records `pagination_probe_incomplete`; it no longer treats a fixed page count as readiness.
- Worker conversation inventory follows cursors instead of stopping at the previous three-page cap.
- `scripts/real-local-calibration.mjs` records Q23 from the Control Plane device-scoped Worker probe, not from `/v1/conversations` count.
- Focused verification passed: `pnpm --filter @codex-remote/api-contract check:generated`, `pnpm --filter @codex-remote/api-contract test`, `pnpm --filter @codex-remote/worker test`, `pnpm --filter @codex-remote/worker typecheck`, `pnpm --filter @codex-remote/control-plane test`, `pnpm --filter @codex-remote/control-plane typecheck`, `node --test scripts/real-local-calibration.test.mjs scripts/product-readiness-check.test.mjs`, and `pnpm product:check`.
- Real runtime verification passed: `pnpm real:start`, `pnpm real:status`, `pnpm real:check`, `pnpm web:e2e:smoke`, `pnpm real:stop`, and `pnpm real:status`.
- Full gates passed: `pnpm product:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

### Task 16: Create Safe Public Active-Turn Steer Sample

**Files:**
- Modify: `scripts/real-local-calibration.mjs`
- Modify: `scripts/real-local-calibration.test.mjs`
- Modify: `docs/superpowers/plans/2026-06-20-real-local-codex-calibration.md`
- Modify: `PLAN.md`
- Modify: `docs/references/development-context.md`

**Interfaces:**
- Keep public API, OpenAPI, DB schema, Worker handlers, Control Plane routes, and Codex protocol generated files unchanged unless real evidence proves a route/payload bug.
- Use only Control Plane public routes from the runner, including device-scoped Worker-shaped routes exposed through Control Plane.
- Keep Worker as the only app-server caller.
- Keep report schema allowlisted and sanitized.

**Non-goals:**
- No approval decision scenario construction.
- No shell command, file read/write, network, tool use, bypass flags, provider secrets, raw prompt logging, raw ids, raw app-server frames, command output, stack/cause, or private path.
- No direct app-server event subscription from the calibration runner.
- No long-running external service, host UI automation, or destructive action.
- No UI change.

**Pre-review evidence:**
- Current `logs/real-check/latest.json` records `steer` as `real-gap` with `active-turn-gap`.
- Task 14 already prevents `steer` `real-pass` unless public timeline proves the target turn is active and public steer returns accepted.
- The current follow-up sample asks for a brief acknowledgement, so the target turn often completes before timeline can prove it active.
- Exact allowlisted steer sample prompt: `codex-remote-calibration steer sample: wait ten seconds, then reply with OK.`

Reviewer: `019ee635-5587-77c3-9566-1bfc76fcdd58`

Result: needs changes; plan updated to require an exact allowlisted prompt, an independent steer-only sample, and direct readiness guard tests.

Findings addressed by Task 16:

- High: The steer sample prompt is now exact and must be tested as a constant.
- High: The delayed steer sample must be an independent steer-only conversation/turn; it must not replace the existing start/follow-up/interrupt evidence chain.
- Medium: Focused verification now includes `scripts/product-readiness-check.test.mjs`.
- Low: Runner route wording now requires Control Plane public routes, including device-scoped Worker-shaped routes exposed through Control Plane.

Review focus:

- Is a text-only delayed response sample safe enough for Stage 9 calibration?
- Does the plan keep the runner on public Control Plane/Worker-shaped APIs?
- Does it avoid weakening Task 14’s active-turn proof guard?
- Does it preserve existing follow-up and interrupt evidence if steer remains a real gap?

- [x] **Step 1: Add focused steer sample tests**

Extend `scripts/real-local-calibration.test.mjs` to require:

- the steer sample prompt is a separate named safe prompt;
- the prompt equals `codex-remote-calibration steer sample: wait ten seconds, then reply with OK.`;
- the prompt does not mention files, commands, network, environment/env, tokens, paths, output, tools, approvals, sandbox, shell, terminal, bash, run, or execute;
- the steer sample is independent from the existing follow-up and interrupt evidence chain;
- the runner waits for public active-turn proof before steer;
- `steer` still records `active-turn-gap` or `steer-rpc-gap` instead of `real-pass` if active proof or RPC acceptance is missing;
- `steer` `real-pass` still requires `activeTurnProven=true` and an accepted public steer response.

- [x] **Step 2: Implement safe delayed steer sample**

Update the real-check runner to create a separate steer-only calibration conversation/turn with the exact allowlisted prompt. Keep the existing start, follow-up, approval, and interrupt probing unchanged. If this causes start/follow-up/interrupt evidence to regress, treat the slice as failed and split the steer sample further instead of accepting the regression.

- [x] **Step 3: Run focused and real verification**

```bash
node --test scripts/real-local-calibration.test.mjs
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
pnpm real:start
pnpm real:status
pnpm real:check
pnpm web:e2e:smoke
pnpm real:stop
pnpm real:status
```

Expected: `steer` becomes `real-pass` if the delayed steer-only turn is publicly active and steer is accepted; otherwise it remains a narrower sanitized `real-gap`. Existing start, follow-up, and interrupt evidence must not regress.

Actual: `pnpm real:check` generated `logs/real-check/latest.json` with `total=19 realPass=18 fixedPass=0 realGap=1`. `steer` is now `real-pass` with `activeTurnProven=true` and accepted public steer status. Existing start, follow-up, and interrupt remained `real-pass`.

- [x] **Step 4: Run full gates and commit**

```bash
pnpm product:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git commit -m "fix: calibrate safe real steer sample"
```

Task 16 implementation notes:

- Added an exact allowlisted steer sample prompt: `codex-remote-calibration steer sample: wait ten seconds, then reply with OK.`
- The runner now creates a separate steer-only calibration conversation/turn before attempting steer.
- The runner still requires public active-turn proof and accepted public steer response before recording `steer` as `real-pass`.
- Focused verification passed: `node --test scripts/real-local-calibration.test.mjs`, `node --test scripts/product-readiness-check.test.mjs`, and `pnpm product:check`.
- Real runtime verification passed: `pnpm real:start`, `pnpm real:status`, `pnpm real:check`, `pnpm web:e2e:smoke`, `pnpm real:stop`, and `pnpm real:status`.
- Full gates passed: `pnpm product:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Final Acceptance Checklist

- [x] `pnpm real:start` starts Worker, Control Plane, and Web.
- [x] `pnpm real:status` shows ports `5173`, `8786`, and `8787` listening.
- [x] Web uses `NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_*`.
- [ ] Web marks fallback/example data clearly.
- [x] Web can discover the real local project even when there are zero conversations.
- [x] Web does not display absolute local project paths from `allowedProjectRoot`.
- [x] Web has a minimal start conversation entrypoint.
- [x] `pnpm real:check` creates or uses a `codex-remote-calibration` real conversation.
- [x] Real read/timeline/start/follow-up/task-link are `real-pass` or `fixed-pass`.
- [x] Real interrupt/steer/approval are `real-pass`, `fixed-pass`, or documented `real-gap` with sanitized reasons.
- [x] `pnpm web:e2e:smoke` passes against the real local stack.
- [x] Web makes no runtime external font/static asset requests.
- [x] Q24 all-workers-down is visible as a sanitized dependency error for `/v1/conversations`, not empty real data.
- [x] Q24 invalid-worker-token is visible as a sanitized dependency error for `/v1/conversations`, not empty real data.
- [x] Q24 partial Worker failure keeps reachable Worker conversations available while marking health/devices degraded.
- [ ] Output streaming is explicitly out of scope and listed as the next separate stage.
- [x] Fake Worker smoke is no longer described as real product readiness.
