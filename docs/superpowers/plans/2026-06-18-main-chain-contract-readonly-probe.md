# Main Chain Contract Readonly Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only main-chain API contract slice and a minimal local Worker CLI probe without adding Web or HTTP integration yet.

**Architecture:** `packages/api-contract/openapi.yaml` remains the only source of truth for Codex Remote API fields. `apps/worker` consumes generated `@codex-remote/api-contract` types and generated `@codex-remote/codex-protocol` upstream types, but the Worker CLI probe owns all projection and diagnostics. The first probe starts or connects to a loopback app-server, runs read-only checks, and reports unsupported upstream methods as `precondition_missing` instead of faking protocol support.

**Tech Stack:** TypeScript, Node built-in test runner, Node built-in `WebSocket`, OpenAPI 3.1, `openapi-typescript`, pnpm, Turborepo, Codex CLI app-server.

## Global Constraints

- `packages/api-contract/openapi.yaml` is the only source of truth for Codex Remote API fields; public TypeScript aliases must be `components["schemas"]` exports.
- `packages/codex-protocol` generated artifacts are the only source for app-server protocol methods and params; do not hand-write missing upstream requests.
- `apps/worker` is the only package in this plan that may start or call Codex app-server.
- app-server transport must bind to `127.0.0.1`; do not expose LAN, public, or `0.0.0.0` listeners.
- This plan is read-only: no send, stream, approval response, steer, interrupt, database, Web data source, or Control Plane server.
- `thread/list` must pass explicit `cwd`, `sourceKinds`, `archived`, and pagination fields instead of relying on app-server defaults.
- `thread/read` must only run after the Worker proves the selected thread belongs to the configured allowed project root.
- Worker security utilities for bearer token, Origin allowlist, and project allowlist are required in this slice even though Worker HTTP routes are out of scope.
- Diagnostic output must not log bearer tokens, app-server auth tokens, OpenAI/ChatGPT/provider credentials, full prompts, or command output.
- Do not add a TypeScript runtime loader dependency for `apps/worker`; use the repository's Node 25 TypeScript execution path.

---

## Scope

This plan implements only:

- Phase 0: main-chain read-only API contract schemas.
- Phase 1a: Worker CLI read-only probe.

This plan does not implement:

- Worker HTTP API.
- Web Worker-backed data source.
- send, stream, approval response, steer, interrupt.
- database or Control Plane.

Current generated app-server protocol exposes `thread/list` and `thread/read`, but this repository's generated `ClientRequest` does not expose `thread/turns/list`. The probe must record that check as `precondition_missing` until upstream generated protocol exposes it. Do not add a hand-written upstream request type.

## File Structure

- Modify `packages/api-contract/openapi.yaml`: add read-only Worker, timeline, event, probe schemas.
- Modify `packages/api-contract/src/index.ts`: re-export new schema aliases from generated OpenAPI types.
- Modify `packages/api-contract/src/contractGeneration.test.ts`: enforce new schemas and generated-alias-only exports.
- Generate `packages/api-contract/src/generated/openapi.ts`: committed generated output.
- Create `apps/worker/package.json`: worker package scripts.
- Create `apps/worker/tsconfig.json`: worker TypeScript config.
- Create `apps/worker/src/index.ts`: public exports for probe modules.
- Create `apps/worker/src/protocol/protocolSurface.test.ts`: type-level protocol surface guard through `@codex-remote/codex-protocol`.
- Create `apps/worker/src/security/workerSecurity.ts`: token, Origin, and project allowlist checks.
- Create `apps/worker/src/security/workerSecurity.test.ts`: security tests.
- Create `apps/worker/src/app-server/appServerProcessService.ts`: loopback app-server process lifecycle and `/readyz`.
- Create `apps/worker/src/app-server/appServerRpcClient.ts`: JSON-RPC over global `WebSocket`.
- Create `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`: maps probe checks to generated app-server protocol calls.
- Create `apps/worker/src/app-server/appServerRpcClient.test.ts`: fake socket tests.
- Create `apps/worker/src/probe/readOnlyProbe.ts`: probe orchestration and summary creation.
- Create `apps/worker/src/probe/readOnlyProbe.test.ts`: probe behavior tests with a fake app-server client.
- Create `apps/worker/src/cli/readOnlyProbeCli.ts`: CLI entrypoint.

## Task 1: Add Failing API Contract Tests

**Files:**
- Modify: `packages/api-contract/src/contractGeneration.test.ts`

- [ ] **Step 1: Add the schema names to the contract test**

Add these entries to `schemaTypeNames`:

```ts
  "AppServerTransport",
  "WorkerConnectionStatus",
  "WorkerHealth",
  "WorkerCapabilities",
  "ConversationRuntimeStatus",
  "LatestTurnStatus",
  "TurnStatus",
  "TimelineItemsView",
  "TimelineSortDirection",
  "ConversationTimelineTurn",
  "ConversationTimeline",
  "ConversationTimelinePage",
  "ConversationEvent",
  "ProbeFailureType",
  "ProbeCheckResult",
  "ProbeMode",
  "WorkerProbeSummary",
```

- [ ] **Step 2: Add a field-floor test**

Append this test:

```ts
test("when read-only main-chain schemas are maintained, openapi should define the field floor", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const schemaName of [
    "WorkerHealth:",
    "WorkerCapabilities:",
    "ConversationTimeline:",
    "ConversationTimelinePage:",
    "ConversationEvent:",
    "WorkerProbeSummary:",
    "ProbeCheckResult:",
  ]) {
    assert.match(source, new RegExp(`^    ${schemaName}`, "m"));
  }

  for (const fieldName of [
    "deviceId:",
    "conversationId:",
    "readStartedAt:",
    "readCompletedAt:",
    "snapshotRevision:",
    "runtimeStatus:",
    "latestTurnStatus:",
    "nextCursor:",
    "backwardsCursor:",
    "eventId:",
    "upstreamMethod:",
    "connectionId:",
    "sequence:",
    "checks:",
  ]) {
    assert.match(source, new RegExp(`^        ${fieldName}`, "m"));
  }
});
```

- [ ] **Step 3: Run the failing package test**

Run:

```bash
pnpm --filter @codex-remote/api-contract test
```

Expected: fail because the new schemas are not in `openapi.yaml`.

## Task 2: Add Read-Only Main-Chain OpenAPI Schemas

**Files:**
- Modify: `packages/api-contract/openapi.yaml`
- Modify: `packages/api-contract/src/index.ts`
- Generate: `packages/api-contract/src/generated/openapi.ts`

- [ ] **Step 1: Add enums and schemas to `openapi.yaml`**

Add these component schemas under `components.schemas`:

```yaml
    AppServerTransport:
      type: string
      enum:
        - loopbackWebSocket
        - stdio
        - unixSocket
    WorkerConnectionStatus:
      type: string
      enum:
        - connected
        - disconnected
        - degraded
        - unknown
    ConversationRuntimeStatus:
      type: string
      enum:
        - not_loaded
        - idle
        - running
        - waiting_approval
        - waiting_input
        - unknown
    LatestTurnStatus:
      type: string
      enum:
        - completed
        - interrupted
        - failed
        - unknown
    TurnStatus:
      type: string
      enum:
        - completed
        - interrupted
        - failed
        - unknown
    TimelineItemsView:
      type: string
      enum:
        - summary
        - full
    TimelineSortDirection:
      type: string
      enum:
        - asc
        - desc
    ProbeFailureType:
      type: string
      enum:
        - skipped
        - precondition_missing
        - env_not_configured
        - assertion_failed
        - opt_in_required
        - approval_unavailable
    ProbeMode:
      type: string
      enum:
        - readOnly
        - full
    WorkerHealth:
      type: object
      additionalProperties: false
      required:
        - deviceId
        - status
        - checkedAt
        - codexVersion
        - appServer
      properties:
        deviceId:
          type: string
        status:
          $ref: "#/components/schemas/WorkerConnectionStatus"
        checkedAt:
          type: string
        codexVersion:
          type:
            - string
            - "null"
        appServer:
          type: object
          additionalProperties: false
          required:
            - transport
            - readyz
          properties:
            transport:
              $ref: "#/components/schemas/AppServerTransport"
            readyz:
              type: boolean
    WorkerCapabilities:
      type: object
      additionalProperties: false
      required:
        - deviceId
        - canReadProjects
        - canReadConversations
        - canReadTimeline
        - canRunReadOnlyProbe
        - appServerTransport
        - supportedSourceKinds
      properties:
        deviceId:
          type: string
        canReadProjects:
          type: boolean
        canReadConversations:
          type: boolean
        canReadTimeline:
          type: boolean
        canRunReadOnlyProbe:
          type: boolean
        appServerTransport:
          $ref: "#/components/schemas/AppServerTransport"
        supportedSourceKinds:
          type: array
          items:
            type: string
    ConversationTimelineTurn:
      type: object
      additionalProperties: false
      required:
        - id
        - status
        - startedAt
        - completedAt
        - durationMs
      properties:
        id:
          type: string
        status:
          $ref: "#/components/schemas/TurnStatus"
        startedAt:
          type:
            - number
            - "null"
        completedAt:
          type:
            - number
            - "null"
        durationMs:
          type:
            - number
            - "null"
    ConversationTimeline:
      type: object
      additionalProperties: false
      required:
        - deviceId
        - conversationId
        - readStartedAt
        - readCompletedAt
        - snapshotRevision
        - runtimeStatus
        - latestTurnStatus
        - turns
      properties:
        deviceId:
          type: string
        conversationId:
          type: string
        projectId:
          type: string
        readStartedAt:
          type: string
        readCompletedAt:
          type: string
        snapshotRevision:
          type: string
        runtimeStatus:
          $ref: "#/components/schemas/ConversationRuntimeStatus"
        latestTurnStatus:
          $ref: "#/components/schemas/LatestTurnStatus"
        turns:
          type: array
          items:
            $ref: "#/components/schemas/ConversationTimelineTurn"
    ConversationTimelinePage:
      type: object
      additionalProperties: false
      required:
        - deviceId
        - conversationId
        - itemsView
        - sortDirection
        - nextCursor
        - backwardsCursor
        - turns
      properties:
        deviceId:
          type: string
        conversationId:
          type: string
        itemsView:
          $ref: "#/components/schemas/TimelineItemsView"
        sortDirection:
          $ref: "#/components/schemas/TimelineSortDirection"
        nextCursor:
          type:
            - string
            - "null"
        backwardsCursor:
          type:
            - string
            - "null"
        turns:
          type: array
          items:
            $ref: "#/components/schemas/ConversationTimelineTurn"
    ConversationEvent:
      type: object
      additionalProperties: false
      required:
        - eventId
        - deviceId
        - timestamp
        - upstreamMethod
        - connectionId
        - sequence
        - conversationId
      properties:
        eventId:
          type: string
        deviceId:
          type: string
        timestamp:
          type: string
        upstreamMethod:
          type: string
        connectionId:
          type: string
        sequence:
          type: number
        conversationId:
          type: string
        projectId:
          type: string
        turnId:
          type: string
    ProbeCheckResult:
      type: object
      additionalProperties: false
      required:
        - name
        - ok
        - durationMs
      properties:
        name:
          type: string
        ok:
          type: boolean
        durationMs:
          type: number
        failureType:
          $ref: "#/components/schemas/ProbeFailureType"
        errorKind:
          type: string
        diagnosticId:
          type: string
        skippedReason:
          type: string
    WorkerProbeSummary:
      type: object
      additionalProperties: false
      required:
        - schemaVersion
        - startedAt
        - completedAt
        - ok
        - mode
        - deviceId
        - codexVersion
        - appServer
        - checks
      properties:
        schemaVersion:
          type: number
        startedAt:
          type: string
        completedAt:
          type: string
        ok:
          type: boolean
        mode:
          $ref: "#/components/schemas/ProbeMode"
        deviceId:
          type: string
        codexVersion:
          type:
            - string
            - "null"
        appServer:
          type: object
          additionalProperties: false
          required:
            - transport
            - startedByWorker
            - readyz
          properties:
            transport:
              $ref: "#/components/schemas/AppServerTransport"
            startedByWorker:
              type: boolean
            readyz:
              type: boolean
        checks:
          type: array
          items:
            $ref: "#/components/schemas/ProbeCheckResult"
```

- [ ] **Step 2: Generate TypeScript**

Run:

```bash
pnpm --filter @codex-remote/api-contract generate
```

Expected: `packages/api-contract/src/generated/openapi.ts` updates.

- [ ] **Step 3: Export generated aliases**

Append to `packages/api-contract/src/index.ts`:

```ts
export type AppServerTransport = components["schemas"]["AppServerTransport"];
export type WorkerConnectionStatus = components["schemas"]["WorkerConnectionStatus"];
export type WorkerHealth = components["schemas"]["WorkerHealth"];
export type WorkerCapabilities = components["schemas"]["WorkerCapabilities"];
export type ConversationRuntimeStatus = components["schemas"]["ConversationRuntimeStatus"];
export type LatestTurnStatus = components["schemas"]["LatestTurnStatus"];
export type TurnStatus = components["schemas"]["TurnStatus"];
export type TimelineItemsView = components["schemas"]["TimelineItemsView"];
export type TimelineSortDirection = components["schemas"]["TimelineSortDirection"];
export type ConversationTimelineTurn = components["schemas"]["ConversationTimelineTurn"];
export type ConversationTimeline = components["schemas"]["ConversationTimeline"];
export type ConversationTimelinePage = components["schemas"]["ConversationTimelinePage"];
export type ConversationEvent = components["schemas"]["ConversationEvent"];
export type ProbeFailureType = components["schemas"]["ProbeFailureType"];
export type ProbeCheckResult = components["schemas"]["ProbeCheckResult"];
export type ProbeMode = components["schemas"]["ProbeMode"];
export type WorkerProbeSummary = components["schemas"]["WorkerProbeSummary"];
```

- [ ] **Step 4: Verify API contract**

Run:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit Phase 0**

Run:

```bash
git add packages/api-contract/openapi.yaml packages/api-contract/src/generated/openapi.ts packages/api-contract/src/index.ts packages/api-contract/src/contractGeneration.test.ts
git commit -m "feat: add read-only main chain contract"
```

## Task 3: Add Worker Package Skeleton

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/probe/readOnlyProbe.ts`
- Test: `apps/worker/src/probe/readOnlyProbe.test.ts`

- [ ] **Step 1: Create package metadata**

Create `apps/worker/package.json`:

```json
{
  "name": "@codex-remote/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit --pretty false && mkdir -p dist && touch dist/.build",
    "typecheck": "tsc --noEmit --pretty false",
    "test": "node --test",
    "lint": "tsc --noEmit --pretty false",
    "probe:read": "node src/cli/readOnlyProbeCli.ts"
  },
  "dependencies": {
    "@codex-remote/api-contract": "workspace:*",
    "@codex-remote/codex-protocol": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^25.9.3",
    "typescript": "^5.8.3"
  }
}
```

The CLI uses Node 25's built-in TypeScript execution path already used by the repository's `node --test` TypeScript tests. Do not add a separate TypeScript runtime loader for this package.

- [ ] **Step 2: Create TypeScript config**

Create `apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"],
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 3: Add minimal public export**

Create `apps/worker/src/index.ts`:

```ts
export { runReadOnlyProbe } from "./probe/readOnlyProbe.ts";
```

- [ ] **Step 4: Add a minimal typed probe module**

Create `apps/worker/src/probe/readOnlyProbe.ts`:

```ts
import type { WorkerProbeSummary } from "@codex-remote/api-contract";

export async function runReadOnlyProbe(): Promise<WorkerProbeSummary> {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    startedAt: now,
    completedAt: now,
    ok: false,
    mode: "readOnly",
    deviceId: "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: false,
      readyz: false,
    },
    checks: [
      {
        name: "probe.client",
        ok: false,
        durationMs: 0,
        failureType: "env_not_configured",
        skippedReason: "No app-server client was provided.",
      },
    ],
  };
}
```

- [ ] **Step 5: Add a minimal probe test**

Create `apps/worker/src/probe/readOnlyProbe.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { runReadOnlyProbe } from "./readOnlyProbe.ts";

test("when read-only probe has no app-server client, should return env_not_configured", async () => {
  const summary = await runReadOnlyProbe();

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.mode, "readOnly");
  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.failureType, "env_not_configured");
});
```

- [ ] **Step 6: Install dependencies and run worker test**

Run:

```bash
pnpm install
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit worker package foundation**

Run:

```bash
git add apps/worker pnpm-lock.yaml
git commit -m "feat: add worker package foundation"
```

## Task 4: Add Protocol Surface Guard

**Files:**
- Test: `apps/worker/src/protocol/protocolSurface.test.ts`

- [ ] **Step 1: Add a type-level generated protocol guard**

Create `apps/worker/src/protocol/protocolSurface.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { ClientRequest } from "@codex-remote/codex-protocol";

const readOnlyProtocolMethods = [
  "initialize",
  "model/list",
  "thread/list",
  "thread/read",
] as const satisfies readonly ClientRequest["method"][];

test("when checking read-only protocol methods, generated ClientRequest should expose supported methods", () => {
  assert.deepEqual([...readOnlyProtocolMethods], ["initialize", "model/list", "thread/list", "thread/read"]);
});

// @ts-expect-error Current generated protocol does not expose thread/turns/list.
const missingThreadTurnsList: ClientRequest["method"] = "thread/turns/list";

void missingThreadTurnsList;
```

- [ ] **Step 2: Run worker tests**

Run:

```bash
pnpm --filter @codex-remote/worker test
```

Expected: pass and document that `thread/turns/list` is absent in the current generated protocol.

- [ ] **Step 3: Commit protocol guard**

Run:

```bash
git add apps/worker/src/protocol
git commit -m "test: guard worker read-only protocol surface"
```

## Task 5: Add Security Boundary Utilities

**Files:**
- Create: `apps/worker/src/security/workerSecurity.ts`
- Test: `apps/worker/src/security/workerSecurity.test.ts`

- [ ] **Step 1: Add security helpers**

Create `apps/worker/src/security/workerSecurity.ts`:

```ts
import { relative, resolve } from "node:path";

export function isBearerTokenAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!expectedToken.trim()) {
    return false;
  }

  return header === `Bearer ${expectedToken}`;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function isPathInsideRoot(path: string, root: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const pathFromRoot = relative(normalizedRoot, normalizedPath);

  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/"));
}

export function canReadThreadPath(threadCwd: string | null, allowedRoot: string): boolean {
  if (!threadCwd) {
    return false;
  }

  return isPathInsideRoot(threadCwd, allowedRoot);
}
```

- [ ] **Step 2: Add security tests**

Create `apps/worker/src/security/workerSecurity.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { canReadThreadPath, isBearerTokenAuthorized, isOriginAllowed, isPathInsideRoot } from "./workerSecurity.ts";

test("when checking bearer token, should require exact bearer header", () => {
  assert.equal(isBearerTokenAuthorized("Bearer dev-token", "dev-token"), true);
  assert.equal(isBearerTokenAuthorized("dev-token", "dev-token"), false);
  assert.equal(isBearerTokenAuthorized(undefined, "dev-token"), false);
  assert.equal(isBearerTokenAuthorized("Bearer ", ""), false);
});

test("when checking browser origin, should allow configured origins and non-browser requests", () => {
  assert.equal(isOriginAllowed(undefined, ["http://127.0.0.1:5173"]), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:5173", ["http://127.0.0.1:5173"]), true);
  assert.equal(isOriginAllowed("http://evil.example", ["http://127.0.0.1:5173"]), false);
});

test("when checking project allowlist, should reject sibling and unknown thread paths", () => {
  assert.equal(isPathInsideRoot("/repo/project", "/repo/project"), true);
  assert.equal(isPathInsideRoot("/repo/project/sub", "/repo/project"), true);
  assert.equal(isPathInsideRoot("/repo/project-other", "/repo/project"), false);
  assert.equal(canReadThreadPath(null, "/repo/project"), false);
});
```

- [ ] **Step 3: Run worker tests**

Run:

```bash
pnpm --filter @codex-remote/worker test
```

Expected: pass.

- [ ] **Step 4: Commit security utilities**

Run:

```bash
git add apps/worker/src/security
git commit -m "feat: add worker security boundary checks"
```

## Task 6: Add App-Server Process And RPC Client

**Files:**
- Create: `apps/worker/src/app-server/appServerProcessService.ts`
- Create: `apps/worker/src/app-server/appServerRpcClient.ts`
- Test: `apps/worker/src/app-server/appServerRpcClient.test.ts`

- [ ] **Step 1: Add loopback process service**

Create `apps/worker/src/app-server/appServerProcessService.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";

export interface AppServerProcessHandle {
  child: ChildProcessWithoutNullStreams;
  url: string;
  readyzUrl: string;
  startedByWorker: true;
}

export function assertLoopbackWebSocketUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.port
  ) {
    throw new Error("app_server_url_not_loopback");
  }

  return url.toString();
}

export async function chooseLoopbackPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) {
          resolvePromise(address.port);
          return;
        }
        reject(new Error("Unable to allocate loopback port"));
      });
    });
  });
}

export function toReadyzUrl(appServerUrl: string): string {
  const url = new URL(assertLoopbackWebSocketUrl(appServerUrl));
  url.protocol = "http:";
  url.pathname = "/readyz";
  url.search = "";
  url.hash = "";

  return url.toString();
}

export async function waitForReadyz(readyzUrl: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyzUrl);
      if (response.ok) {
        return;
      }
      lastError = new Error(`readyz returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError instanceof Error ? lastError : new Error("app-server /readyz timed out");
}

export function startLoopbackAppServer(port: number): AppServerProcessHandle {
  const url = `ws://127.0.0.1:${port}`;
  const child = spawn("codex", ["app-server", "--listen", url], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return { child, url, readyzUrl: toReadyzUrl(url), startedByWorker: true };
}

export function stopAppServer(handle: AppServerProcessHandle): void {
  handle.child.kill("SIGTERM");
}
```

- [ ] **Step 2: Add WebSocket RPC client**

Create `apps/worker/src/app-server/appServerRpcClient.ts`:

```ts
import type { ClientNotification, ClientRequest, ServerNotification } from "@codex-remote/codex-protocol";

interface RpcResponse {
  id: string | number;
  result?: unknown;
  error?: unknown;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(event: "message", handler: (event: { data: unknown }) => void): void;
  addEventListener(event: "open", handler: () => void): void;
  addEventListener(event: "error", handler: () => void): void;
}

export async function connectAppServerRpcClient(url: string): Promise<AppServerRpcClient> {
  if (typeof WebSocket !== "function") {
    throw new Error("global WebSocket is not available in this Node runtime");
  }

  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("failed to connect to app-server WebSocket")), {
      once: true,
    });
  });

  return new AppServerRpcClient(socket);
}

export class AppServerRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly socket: SocketLike) {
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  async request<M extends ClientRequest["method"]>(
    method: M,
    params: Extract<ClientRequest, { method: M }>["params"],
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const request = { id, method, params } as Extract<ClientRequest, { method: M }>;
    this.socket.send(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(notification: ClientNotification): void {
    this.socket.send(JSON.stringify(notification));
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(data: unknown): void {
    const message = JSON.parse(String(data)) as RpcResponse | ServerNotification;
    if (!("id" in message)) {
      return;
    }

    const pending = this.pending.get(Number(message.id));
    if (!pending) {
      return;
    }

    this.pending.delete(Number(message.id));
    if ("error" in message && message.error) {
      pending.reject(new Error("app_server_protocol_error"));
      return;
    }

    pending.resolve(message.result);
  }
}
```

- [ ] **Step 3: Add fake socket test**

Create `apps/worker/src/app-server/appServerRpcClient.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { AppServerRpcClient } from "./appServerRpcClient.ts";

class FakeSocket {
  sent: string[] = [];
  private messageHandler: ((event: { data: unknown }) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  addEventListener(event: "message" | "open" | "error", handler: ((event: { data: unknown }) => void) | (() => void)): void {
    if (event === "message") {
      this.messageHandler = handler as (event: { data: unknown }) => void;
    }
  }

  receive(data: unknown): void {
    this.messageHandler?.({ data });
  }
}

test("when sending a request, should resolve matching response id", async () => {
  const socket = new FakeSocket();
  const client = new AppServerRpcClient(socket);
  const response = client.request("model/list", {});

  assert.match(socket.sent[0] ?? "", /"method":"model\/list"/);
  socket.receive(JSON.stringify({ id: 1, result: { data: [], nextCursor: null } }));

  assert.deepEqual(await response, { data: [], nextCursor: null });
});
```

- [ ] **Step 4: Run worker typecheck and tests**

Run:

```bash
pnpm --filter @codex-remote/worker typecheck
pnpm --filter @codex-remote/worker test
```

Expected: both pass.

- [ ] **Step 5: Commit app-server client**

Run:

```bash
git add apps/worker/src/app-server
git commit -m "feat: add worker app-server rpc client"
```

## Task 7: Wire Read-Only Probe CLI

**Files:**
- Modify: `apps/worker/src/probe/readOnlyProbe.ts`
- Create: `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- Create: `apps/worker/src/cli/readOnlyProbeCli.ts`
- Test: `apps/worker/src/probe/readOnlyProbe.test.ts`

- [ ] **Step 1: Replace minimal probe with check runner**

Replace `apps/worker/src/probe/readOnlyProbe.ts` with:

```ts
import type { ProbeCheckResult, WorkerProbeSummary } from "@codex-remote/api-contract";

export interface ReadOnlyProbeClient {
  readyz(): Promise<void>;
  initialize(): Promise<void>;
  initialized(): Promise<void>;
  listModels(): Promise<unknown>;
  listThreads(): Promise<unknown>;
  readFirstAllowedThread(): Promise<unknown>;
  close(): void;
}

export interface RunReadOnlyProbeOptions {
  client?: ReadOnlyProbeClient;
  startedByWorker?: boolean;
  deviceId?: string;
}

export interface ProbeFailureSummaryOptions {
  checkName: string;
  failureType?: ProbeCheckResult["failureType"];
  errorKind?: string;
  startedByWorker?: boolean;
  deviceId?: string;
}

export class PreconditionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreconditionMissingError";
  }
}

function safeErrorKind(error: unknown): string {
  if (error instanceof PreconditionMissingError) {
    return "precondition_missing";
  }
  if (error instanceof Error && error.message === "app_server_protocol_error") {
    return "app_server_protocol_error";
  }

  return "probe_check_failed";
}

export function createReadOnlyProbeFailureSummary(options: ProbeFailureSummaryOptions): WorkerProbeSummary {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    startedAt: now,
    completedAt: now,
    ok: false,
    mode: "readOnly",
    deviceId: options.deviceId ?? "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: options.startedByWorker ?? false,
      readyz: false,
    },
    checks: [
      {
        name: options.checkName,
        ok: false,
        durationMs: 0,
        failureType: options.failureType ?? "assertion_failed",
        errorKind: options.errorKind ?? "probe_check_failed",
      },
    ],
  };
}

async function runCheck(name: string, run: () => Promise<void>): Promise<ProbeCheckResult> {
  const startedAt = Date.now();
  try {
    await run();
    return { name, ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof PreconditionMissingError) {
      return {
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        failureType: "precondition_missing",
        skippedReason: error.message,
      };
    }

    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      failureType: "assertion_failed",
      errorKind: safeErrorKind(error),
    };
  }
}

export async function runReadOnlyProbe(options: RunReadOnlyProbeOptions = {}): Promise<WorkerProbeSummary> {
  const startedAt = new Date().toISOString();
  const checks: ProbeCheckResult[] = [];

  const { client } = options;
  if (!client) {
    const completedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      startedAt,
      completedAt,
      ok: false,
      mode: "readOnly",
      deviceId: options.deviceId ?? "local",
      codexVersion: null,
      appServer: {
        transport: "loopbackWebSocket",
        startedByWorker: options.startedByWorker ?? false,
        readyz: false,
      },
      checks: [
        {
          name: "probe.client",
          ok: false,
          durationMs: 0,
          failureType: "env_not_configured",
          skippedReason: "No app-server client was provided.",
        },
      ],
    };
  }

  try {
    checks.push(await runCheck("readyz", () => client.readyz()));
    checks.push(await runCheck("initialize", () => client.initialize()));
    checks.push(await runCheck("initialized", () => client.initialized()));
    checks.push(await runCheck("model/list", async () => void (await client.listModels())));
    checks.push(await runCheck("thread/list", async () => void (await client.listThreads())));
    checks.push(await runCheck("thread/read", async () => void (await client.readFirstAllowedThread())));
    checks.push({
      name: "thread/turns/list",
      ok: false,
      durationMs: 0,
      failureType: "precondition_missing",
      skippedReason: "Current generated codex-protocol ClientRequest does not expose thread/turns/list.",
    });
  } finally {
    client.close();
  }

  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    startedAt,
    completedAt,
    ok: checks.every((check) => check.ok || check.failureType === "precondition_missing"),
    mode: "readOnly",
    deviceId: options.deviceId ?? "local",
    codexVersion: null,
    appServer: {
      transport: "loopbackWebSocket",
      startedByWorker: options.startedByWorker ?? false,
      readyz: checks.some((check) => check.name === "readyz" && check.ok),
    },
    checks,
  };
}
```

- [ ] **Step 2: Add app-server-backed probe client**

Create `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`:

```ts
import type { v2 } from "@codex-remote/codex-protocol";

import { AppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { isPathInsideRoot } from "../security/workerSecurity.ts";
import { PreconditionMissingError, type ReadOnlyProbeClient } from "./readOnlyProbe.ts";

export class AppServerReadOnlyProbeClient implements ReadOnlyProbeClient {
  private firstAllowedThreadId: string | null = null;
  private readonly maxPages = 3;

  constructor(
    private readonly rpc: AppServerRpcClient,
    private readonly readyzUrl: string,
    private readonly allowedProjectRoot: string,
  ) {}

  async readyz(): Promise<void> {
    const response = await fetch(this.readyzUrl);
    if (!response.ok) {
      throw new Error(`readyz returned ${response.status}`);
    }
  }

  async initialize(): Promise<void> {
    await this.rpc.request("initialize", {
      clientInfo: {
        name: "codex-remote-worker",
        title: "Codex Remote Worker",
        version: "0.0.0",
      },
      capabilities: null,
    });
  }

  async initialized(): Promise<void> {
    this.rpc.notify({ method: "initialized" });
  }

  async listModels(): Promise<unknown> {
    return this.rpc.request("model/list", {
      limit: 25,
      includeHidden: false,
    });
  }

  async listThreads(): Promise<unknown> {
    let cursor: string | null = null;
    let lastResponse: v2.ThreadListResponse | null = null;

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = (await this.rpc.request("thread/list", {
        cwd: this.allowedProjectRoot,
        sourceKinds: ["cli", "vscode", "appServer"],
        archived: false,
        limit: 25,
        sortDirection: "desc",
        cursor,
      })) as v2.ThreadListResponse;

      lastResponse = response;
      const firstAllowedThread = response.data.find((thread) => isPathInsideRoot(thread.cwd, this.allowedProjectRoot));
      if (firstAllowedThread) {
        this.firstAllowedThreadId = firstAllowedThread.id;
        break;
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }

    return lastResponse;
  }

  async readFirstAllowedThread(): Promise<unknown> {
    if (!this.firstAllowedThreadId) {
      throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
    }

    const response = (await this.rpc.request("thread/read", {
      threadId: this.firstAllowedThreadId,
      includeTurns: true,
    })) as v2.ThreadReadResponse;

    if (!isPathInsideRoot(response.thread.cwd, this.allowedProjectRoot)) {
      throw new Error("thread/read returned a thread outside the allowed project root");
    }

    return response;
  }

  close(): void {
    this.rpc.close();
  }
}
```

- [ ] **Step 3: Update probe tests**

Replace `apps/worker/src/probe/readOnlyProbe.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { PreconditionMissingError, runReadOnlyProbe, type ReadOnlyProbeClient } from "./readOnlyProbe.ts";

const passingClient: ReadOnlyProbeClient = {
  async readyz() {},
  async initialize() {},
  async initialized() {},
  async listModels() {},
  async listThreads() {},
  async readFirstAllowedThread() {},
  close() {},
};

const noAllowedThreadClient: ReadOnlyProbeClient = {
  ...passingClient,
  async readFirstAllowedThread() {
    throw new PreconditionMissingError("thread/list returned no thread inside the allowed project root");
  },
};

test("when no client is supplied, should return env_not_configured", async () => {
  const summary = await runReadOnlyProbe();

  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.failureType, "env_not_configured");
});

test("when read-only checks pass, should mark missing turns list as explicit precondition", async () => {
  const summary = await runReadOnlyProbe({
    client: passingClient,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.appServer.readyz, true);
  assert.equal(summary.checks.some((check) => check.name === "thread/turns/list"), true);
  assert.equal(summary.checks.at(-1)?.failureType, "precondition_missing");
});

test("when no allowed thread exists, should skip thread/read as a precondition", async () => {
  const summary = await runReadOnlyProbe({ client: noAllowedThreadClient });
  const readCheck = summary.checks.find((check) => check.name === "thread/read");

  assert.equal(summary.ok, true);
  assert.equal(readCheck?.failureType, "precondition_missing");
});
```

- [ ] **Step 4: Add CLI entrypoint**

Create `apps/worker/src/cli/readOnlyProbeCli.ts`:

```ts
import {
  assertLoopbackWebSocketUrl,
  chooseLoopbackPort,
  startLoopbackAppServer,
  stopAppServer,
  toReadyzUrl,
  waitForReadyz,
  type AppServerProcessHandle,
} from "../app-server/appServerProcessService.ts";
import { connectAppServerRpcClient } from "../app-server/appServerRpcClient.ts";
import { AppServerReadOnlyProbeClient } from "../probe/appServerReadOnlyProbeClient.ts";
import { createReadOnlyProbeFailureSummary, runReadOnlyProbe } from "../probe/readOnlyProbe.ts";

async function main(): Promise<number> {
  const allowedProjectRoot = process.env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT ?? process.cwd();
  const configuredUrl = process.env.CODEX_APP_SERVER_URL;
  const shouldStartAppServer = process.env.CODEX_REMOTE_START_APP_SERVER === "1";
  let appServer: AppServerProcessHandle | null = null;

  try {
    const appServerUrl = configuredUrl
      ? assertLoopbackWebSocketUrl(configuredUrl)
      : shouldStartAppServer
        ? `ws://127.0.0.1:${await chooseLoopbackPort()}`
        : null;

    if (!appServerUrl) {
      const summary = await runReadOnlyProbe();
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 1;
    }

    if (!configuredUrl) {
      appServer = startLoopbackAppServer(Number(new URL(appServerUrl).port));
      await waitForReadyz(appServer.readyzUrl);
    }

    const readyzUrl = appServer?.readyzUrl ?? toReadyzUrl(appServerUrl);
    const rpc = await connectAppServerRpcClient(appServerUrl);
    const client = new AppServerReadOnlyProbeClient(rpc, readyzUrl, allowedProjectRoot);
    const summary = await runReadOnlyProbe({
      client,
      startedByWorker: Boolean(appServer),
    });

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.ok ? 0 : 1;
  } catch (error) {
    const summary = createReadOnlyProbeFailureSummary({
      checkName: error instanceof Error && error.message === "app_server_url_not_loopback"
        ? "app-server.url"
        : "app-server.connect",
      failureType: error instanceof Error && error.message === "app_server_url_not_loopback"
        ? "env_not_configured"
        : "assertion_failed",
      errorKind: error instanceof Error && error.message === "app_server_url_not_loopback"
        ? "app_server_url_not_loopback"
        : "app_server_connect_failed",
      startedByWorker: Boolean(appServer),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 1;
  } finally {
    if (appServer) {
      stopAppServer(appServer);
    }
  }
}

process.exitCode = await main();
```

- [ ] **Step 5: Run worker checks**

Run:

```bash
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
pnpm --filter @codex-remote/worker probe:read
CODEX_REMOTE_START_APP_SERVER=1 CODEX_REMOTE_ALLOWED_PROJECT_ROOT="$PWD" pnpm --filter @codex-remote/worker probe:read
```

Expected:

- test and typecheck pass.
- `probe:read` without `CODEX_APP_SERVER_URL` or `CODEX_REMOTE_START_APP_SERVER=1` exits non-zero with `env_not_configured`.
- The opt-in probe starts loopback app-server, checks `/readyz`, runs `initialize`, `initialized`, `model/list`, `thread/list`, and `thread/read` when at least one allowed thread exists.
- `thread/turns/list` is reported as `precondition_missing` because the generated upstream protocol does not expose that client method.

- [ ] **Step 6: Commit probe runner**

Run:

```bash
git add apps/worker/src/probe apps/worker/src/cli
git commit -m "feat: add worker read-only probe summary"
```

## Task 8: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full workspace verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Inspect git state**

Run:

```bash
git status --short --branch
git log --oneline --decorate --max-count=8
```

Expected: clean worktree on `main`, with commits from the tasks above ahead of `origin/main` if not pushed.

## Self-Review

- Spec coverage: Phase 0 schemas are covered by Tasks 1-2. Phase 1a Worker CLI read-only probe is covered by Tasks 3-7. HTTP API and Web source are intentionally out of scope.
- Unique source of truth: API fields are added only to `openapi.yaml`, then exported as generated aliases. Upstream protocol types are consumed only from `@codex-remote/codex-protocol`.
- Protocol mismatch: current generated protocol does not expose `thread/turns/list`; Task 4 makes that explicit and Task 7 reports `precondition_missing`.
- Verification: Task 8 runs the existing repo gate.
