# Worker HTTP Read-Only API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a loopback-only Worker HTTP API for the Stage 2 read-only slice: health, capabilities, probe, conversation list, and conversation timeline.

**Architecture:** `packages/api-contract/openapi.yaml` remains the public API source of truth. Generated contract types feed framework-independent Worker handlers. Hono is only the HTTP boundary. Worker handlers reuse the existing read-only app-server RPC/probe chain and project generated app-server protocol types into generated API contract types.

**Tech Stack:** TypeScript, Node 25 direct TypeScript execution, pnpm, Turborepo, OpenAPI 3.1, `openapi-typescript`, Hono at the HTTP boundary, Node built-in test runner.

## Global Constraints

- Public API shape starts in `packages/api-contract/openapi.yaml`; do not hand-write parallel public DTOs.
- Public TypeScript contract types are `components["schemas"]` aliases exported from `@codex-remote/api-contract`.
- App-server request/response shapes come only from `@codex-remote/codex-protocol`.
- `apps/worker` is the only package allowed to start or call Codex app-server.
- Stage 2 route allowlist is exactly:
  - `GET /v1/worker/health`
  - `GET /v1/worker/capabilities`
  - `GET /v1/worker/probe`
  - `GET /v1/conversations`
  - `GET /v1/conversations/{conversationId}/timeline`
- Do not implement send, follow-up, steer, interrupt, approval, streaming, WebSocket/SSE, Control Plane, DB, or Web datasource migration in this stage.
- Worker HTTP must bind only to loopback hosts.
- All HTTP routes require `Authorization: Bearer <token>`.
- Browser requests with an unexpected `Origin` must be rejected, including `GET`.
- Missing `Origin` is allowed for CLI-style clients when bearer auth is valid.
- `allowedProjectRoot` must be required, existing, and realpath-canonicalized.
- Timeline must prove the conversation belongs to the allowed root before `thread/read`.
- Responses, details, diagnostics, and logs must not include raw app-server URL, raw JSON-RPC, raw upstream errors, stack/cause, prompt text, assistant text, command output, full diff, token, or out-of-root path.
- Direct TypeScript imports in `apps/worker` must include `.ts` extensions.
- Each implementation slice needs fresh focused verification; do not reuse old command results.

---

## Task 1: Add Contract Guard Tests First

Files:

- `packages/api-contract/src/contractGeneration.test.ts`

Steps:

- [ ] Add a test that asserts all five Stage 2 versioned paths exist in `openapi.yaml`.
- [ ] Add a test that asserts each Stage 2 path has documented non-2xx `ErrorEnvelope` responses.
- [ ] Add a test that asserts Stage 2 route allowlist does not include write/stream routes.
- [ ] Add a test that asserts `ErrorEnvelope.details` is allowlist-shaped, not free-form.

Suggested test additions:

```ts
test("when worker read-only http api is maintained, openapi should define versioned stage 2 paths", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const path of [
    "/v1/worker/health:",
    "/v1/worker/capabilities:",
    "/v1/worker/probe:",
    "/v1/conversations:",
    "/v1/conversations/{conversationId}/timeline:",
  ]) {
    assert.match(source, new RegExp(`^  ${path.replaceAll("/", "\\/")}`, "m"));
  }
});

test("when worker read-only http api errors are maintained, routes should use ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const status of ['"400"', '"401"', '"403"', '"408"', '"424"', '"500"']) {
    assert.match(source, new RegExp(`${status}:[\\s\\S]*\\$ref: "#/components/schemas/ErrorEnvelope"`));
  }
});

test("when stage 2 worker routes are implemented, write routes should stay outside the allowlist", () => {
  const source = readFileSync(openApiPath, "utf8");

  assert.doesNotMatch(source, /operationId:\s*workerFollowUpConversation/);
  assert.doesNotMatch(source, /operationId:\s*workerApproval/);
  assert.doesNotMatch(source, /operationId:\s*workerInterrupt/);
  assert.doesNotMatch(source, /operationId:\s*workerSteer/);
});
```

Verification:

```bash
pnpm --filter @codex-remote/api-contract test
```

Expected before Task 2:

- Command fails because the versioned paths and stricter error schema are not yet present.

Expected after Task 2:

- Command exits `0`.
- Node test output reports all api-contract tests passing.

---

## Task 2: Reconcile OpenAPI As The Public Source Of Truth

Files:

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/generated/openapi.ts`
- `packages/api-contract/src/index.ts` only if a new schema alias is added

Steps:

- [ ] Add the five versioned Stage 2 paths to `paths`.
- [ ] Use existing public schemas where possible:
  - `WorkerHealth`
  - `WorkerCapabilities`
  - `WorkerProbeSummary`
  - `CodexConversation`
  - `ConversationTimeline`
  - `ErrorEnvelope`
- [ ] Define non-2xx responses with `ErrorEnvelope` for every versioned path.
- [ ] Include `404` on `GET /v1/conversations/{conversationId}/timeline`.
- [ ] Keep existing unversioned paths only as legacy contract surface for fixtures; do not create Worker implementation acceptance criteria for them.
- [ ] Tighten `ErrorEnvelope.details` to allowlisted keys.
- [ ] Do not implement or extend `ConversationEvent` or `ConversationTimelinePage` in this task.
- [ ] Regenerate `packages/api-contract/src/generated/openapi.ts`.

OpenAPI shape to add:

```yaml
  /v1/worker/health:
    get:
      operationId: getWorkerHealth
      responses:
        "200":
          description: Worker and app-server readiness.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WorkerHealth"
        "401":
          $ref: "#/components/responses/UnauthorizedError"
        "403":
          $ref: "#/components/responses/ForbiddenError"
        "424":
          $ref: "#/components/responses/AppServerUnavailableError"
        "500":
          $ref: "#/components/responses/InternalWorkerError"
```

Recommended component response pattern:

```yaml
components:
  responses:
    UnauthorizedError:
      description: Missing or invalid bearer token.
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorEnvelope"
```

`ErrorEnvelope.details` should become explicitly allowlisted:

```yaml
    ErrorEnvelope:
      type: object
      additionalProperties: false
      required:
        - code
        - message
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
          additionalProperties: false
          properties:
            operation:
              type: string
            retryable:
              type: boolean
            diagnosticId:
              type: string
            reason:
              type: string
            field:
              type: string
            limit:
              type: number
        requestId:
          type: string
```

Commands:

```bash
pnpm --filter @codex-remote/api-contract generate
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract typecheck
```

Expected output:

- `generate` updates only generated contract artifacts.
- `test` exits `0`.
- `typecheck` exits `0`.

---

## Task 3: Add Worker HTTP Dependency And Scripts

Files:

- `apps/worker/package.json`
- `pnpm-lock.yaml`

Steps:

- [ ] Add Hono through pnpm, not by guessing a package version by hand.
- [ ] Add a read-only HTTP server script.
- [ ] Keep existing `probe:read` script.

Command:

```bash
pnpm --filter @codex-remote/worker add hono
```

Script addition:

```json
{
  "scripts": {
    "serve:read": "node src/cli/readOnlyHttpServerCli.ts"
  }
}
```

Verification:

```bash
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Command exits `0` after the new CLI file is added in a later task.
- If run immediately after the script edit and before the CLI exists, the script itself is not executed; typecheck should still be unaffected.

---

## Task 4: Add Fail-Closed Worker HTTP Runtime Config

Files:

- `apps/worker/src/http/workerHttpConfig.ts`
- `apps/worker/src/http/workerHttpConfig.test.ts`

Steps:

- [ ] Create internal config input and validated config types.
- [ ] Parse environment variables into a config input.
- [ ] Validate token, origins, bind host, project root, and timeouts.
- [ ] Realpath-canonicalize `allowedProjectRoot`.
- [ ] Reject wildcard origins and substring/suffix origin matching.
- [ ] Reject `0.0.0.0` and other non-loopback bind hosts.
- [ ] Do not include token, raw app-server URL, or out-of-root paths in thrown error messages.

Environment variables:

```text
CODEX_REMOTE_DEVICE_ID
CODEX_REMOTE_WORKER_TOKEN
CODEX_REMOTE_ALLOWED_ORIGINS
CODEX_REMOTE_ALLOWED_PROJECT_ROOT
CODEX_REMOTE_HTTP_HOST
CODEX_REMOTE_HTTP_PORT
CODEX_APP_SERVER_URL
CODEX_REMOTE_START_APP_SERVER
CODEX_REMOTE_CONNECT_TIMEOUT_MS
CODEX_REMOTE_REQUEST_TIMEOUT_MS
```

Internal type shape:

```ts
import type { AppServerTransport } from "@codex-remote/api-contract";

export interface WorkerHttpConfig {
  deviceId: string;
  workerToken: string;
  allowedOrigins: readonly string[];
  allowedProjectRoot: string;
  bindHost: string;
  port: number;
  appServerUrl: string | null;
  startAppServer: boolean;
  appServerTransport: AppServerTransport;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}
```

Core validation helpers:

```ts
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function parsePositiveBoundedInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 60_000) {
    throw new Error("worker_config_invalid");
  }

  return parsed;
}
```

Tests:

- [ ] Empty `CODEX_REMOTE_WORKER_TOKEN` rejects.
- [ ] Missing `CODEX_REMOTE_ALLOWED_PROJECT_ROOT` rejects.
- [ ] Non-existing project root rejects.
- [ ] `CODEX_REMOTE_ALLOWED_ORIGINS=*` rejects.
- [ ] `CODEX_REMOTE_HTTP_HOST=0.0.0.0` rejects.
- [ ] Timeout `0`, negative, non-number, and very large values reject.
- [ ] Valid config returns canonical `allowedProjectRoot`.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker http config"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused config tests pass.
- Typecheck exits `0`.

---

## Task 5: Standardize Sanitized HTTP Errors

Files:

- `apps/worker/src/http/errors.ts`
- `apps/worker/src/http/errors.test.ts`

Steps:

- [ ] Add a fixed internal error-code union.
- [ ] Add `WorkerHttpError` with `status`, `code`, and sanitized `details`.
- [ ] Add `toErrorEnvelope(error, requestId)` returning `ErrorEnvelope`.
- [ ] Add `mapUnknownError(error, operation)` that classifies upstream-safe error kinds.
- [ ] Enforce details allowlist in runtime code even though OpenAPI also constrains it.
- [ ] Never pass arbitrary upstream `Error.message` into public `message` or `details`.

Error code shape:

```ts
export type WorkerHttpErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "origin_forbidden"
  | "project_forbidden"
  | "conversation_not_found"
  | "app_server_timeout"
  | "app_server_unavailable"
  | "worker_config_invalid"
  | "worker_internal_error";
```

Details allowlist:

```ts
const allowedDetailKeys = new Set([
  "operation",
  "retryable",
  "diagnosticId",
  "reason",
  "field",
  "limit",
] as const);
```

Mapping rules:

```ts
export function mapUnknownError(error: unknown, operation: string): WorkerHttpError {
  if (error instanceof WorkerHttpError) {
    return error;
  }

  if (error instanceof Error && error.message === "app_server_request_timeout") {
    return new WorkerHttpError(408, "app_server_timeout", "App-server request timed out.", {
      operation,
      retryable: true,
    });
  }

  if (
    error instanceof Error &&
    [
      "app_server_connection_error",
      "app_server_connection_timeout",
      "app_server_spawn_failed",
      "app_server_websocket_unavailable",
    ].includes(error.message)
  ) {
    return new WorkerHttpError(424, "app_server_unavailable", "Codex app-server is unavailable.", {
      operation,
      retryable: true,
    });
  }

  return new WorkerHttpError(500, "worker_internal_error", "Worker request failed.", {
    operation,
    retryable: false,
  });
}
```

Tests:

- [ ] Timeout maps to `408` and `app_server_timeout`.
- [ ] Connection/spawn/WebSocket failures map to `424`.
- [ ] Unexpected error maps to sanitized `500`.
- [ ] Details with forbidden keys are dropped.
- [ ] Raw URL, token, stack, cause, prompt, command output, and full diff strings do not appear in envelopes.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker http errors"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused error tests pass.
- Typecheck exits `0`.

---

## Task 6: Extract Shared Read-Only App-Server Session

Files:

- `apps/worker/src/app-server/readOnlyAppServerSession.ts`
- `apps/worker/src/app-server/readOnlyAppServerSession.test.ts`
- `apps/worker/src/cli/readOnlyProbeCli.ts`
- `apps/worker/src/cli/readOnlyProbeCli.test.ts`

Steps:

- [ ] Move duplicated app-server URL selection, optional spawn, readyz waiting, RPC connect, and probe client creation into one shared internal session factory.
- [ ] Update `readOnlyProbeCli.ts` to use the shared factory.
- [ ] Keep CLI behavior unchanged: no app-server URL and no opt-in spawn still returns structured `WorkerProbeSummary`, not a crash.
- [ ] Make session close idempotent so probe and HTTP callers can safely clean up.
- [ ] Keep raw app-server URL internal; never expose it through summary or HTTP errors.

Session API:

```ts
import { AppServerReadOnlyProbeClient } from "../probe/appServerReadOnlyProbeClient.ts";

export interface OpenReadOnlyAppServerSessionOptions {
  configuredUrl: string | null;
  startAppServer: boolean;
  allowedProjectRoot: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  readyzTimeoutMs?: number;
}

export interface ReadOnlyAppServerSession {
  client: AppServerReadOnlyProbeClient;
  startedByWorker: boolean;
  close(): void;
}

export async function openReadOnlyAppServerSession(
  options: OpenReadOnlyAppServerSessionOptions,
): Promise<ReadOnlyAppServerSession> {
  // Choose loopback URL, optionally spawn codex app-server, wait for readyz,
  // connect RPC, and return an AppServerReadOnlyProbeClient.
}
```

Tests:

- [ ] Configured non-loopback URL rejects with safe error kind.
- [ ] No configured URL and `startAppServer=false` rejects with safe env-not-configured path for CLI.
- [ ] Spawn error is converted into `app_server_spawn_failed`.
- [ ] Session close can be called twice without throwing.
- [ ] CLI still prints structured failure JSON for missing app-server config.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "read-only app-server session|read-only probe cli"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused session and CLI tests pass.
- Typecheck exits `0`.

---

## Task 7: Add Contract Projections For Conversations And Timeline

Files:

- `apps/worker/src/http/projections.ts`
- `apps/worker/src/http/projections.test.ts`

Steps:

- [ ] Project `v2.Thread` into `CodexConversation`.
- [ ] Project `v2.Thread` with turns into `ConversationTimeline`.
- [ ] Project `v2.Turn` into `ConversationTimelineTurn`.
- [ ] Map unknown app-server statuses to public `unknown`, never to completed.
- [ ] Use ISO seconds-to-date conversion for app-server Unix timestamps.
- [ ] Keep timeline metadata-only; do not read or return `turn.items`.
- [ ] Add tests that prove prompt text, assistant text, command output, full diff, raw tool args, raw item payload, and out-of-root path are absent from projected payloads.

Projection signatures:

```ts
import type {
  CodexConversation,
  ConversationTimeline,
  ConversationTimelineTurn,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

export interface ConversationProjectionContext {
  deviceId: string;
  allowedProjectRoot: string;
  projectName: string;
  readStartedAt?: string;
  readCompletedAt?: string;
}

export function projectThreadToConversation(
  thread: v2.Thread,
  context: ConversationProjectionContext,
): CodexConversation {
  // Map only safe fields from thread into the OpenAPI contract type.
}

export function projectThreadToTimeline(
  thread: v2.Thread,
  context: Required<Pick<ConversationProjectionContext, "deviceId" | "readStartedAt" | "readCompletedAt">> &
    Pick<ConversationProjectionContext, "allowedProjectRoot">,
): ConversationTimeline {
  // Include only turn metadata, not turn item content.
}

export function projectTurnToTimelineTurn(turn: v2.Turn): ConversationTimelineTurn {
  // Map id, status, startedAt, completedAt, durationMs.
}
```

Status mapping:

```ts
function mapTurnStatus(status: string): ConversationTimelineTurn["status"] {
  if (status === "in_progress" || status === "completed" || status === "interrupted" || status === "failed") {
    return status;
  }

  return "unknown";
}
```

Tests:

- [ ] Conversation `title` uses `thread.name`, then `thread.preview`, then project basename, then `"Untitled conversation"`.
- [ ] Conversation `summary` uses safe preview or `""`.
- [ ] `updatedAt` uses `thread.updatedAt` converted to ISO.
- [ ] Timeline `snapshotRevision` is deterministic from `conversationId` and `readCompletedAt`.
- [ ] Unknown thread status maps to `unknown`.
- [ ] Unknown turn status maps to `unknown`.
- [ ] Turn items are ignored even when they contain leak marker strings.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker http projections"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused projection tests pass.
- Typecheck exits `0`.

---

## Task 8: Add Framework-Independent Read-Only Handlers

Files:

- `apps/worker/src/http/readOnlyHandlers.ts`
- `apps/worker/src/http/readOnlyHandlers.test.ts`

Steps:

- [ ] Define an internal `WorkerReadOnlyAppServerClient` abstraction for tests and handlers.
- [ ] Implement `getHealth`.
- [ ] Implement `getCapabilities`.
- [ ] Implement `runProbe`.
- [ ] Implement `listConversations`.
- [ ] Implement `readConversationTimeline`.
- [ ] Use app-server `thread/list` with explicit `cwd`, `sourceKinds`, `archived`, `limit`, `sortDirection`, and internal `cursor`.
- [ ] Enforce realpath allowed-root filtering before list projection.
- [ ] Prove requested timeline id through allowed-root `thread/list` before `thread/read`.
- [ ] Re-check `thread/read` result with realpath allowlist before projection.
- [ ] Return empty list when no allowed conversations exist.
- [ ] Map not found to sanitized `404`.

Internal client abstraction:

```ts
export interface WorkerReadOnlyAppServerClient {
  readyz(): Promise<void>;
  initialize(): Promise<void>;
  initialized(): Promise<void>;
  listThreads(params: {
    cwd: string;
    sourceKinds: readonly ["cli", "vscode", "appServer"];
    archived: false;
    limit: number;
    sortDirection: "desc";
    cursor: string | null;
  }): Promise<v2.ThreadListResponse>;
  readThread(params: { threadId: string; includeTurns: true }): Promise<v2.ThreadReadResponse>;
  close(): void;
}
```

Handler signatures:

```ts
export interface WorkerReadOnlyHandlerContext {
  config: WorkerHttpConfig;
  openClient(): Promise<WorkerReadOnlyAppServerClient>;
  now(): string;
}

export async function listConversations(
  context: WorkerReadOnlyHandlerContext,
): Promise<CodexConversation[]> {
  // Open client, list bounded pages, realpath-filter, project, close client.
}

export async function readConversationTimeline(
  context: WorkerReadOnlyHandlerContext,
  conversationId: string,
): Promise<ConversationTimeline> {
  // Prove id with list, read thread, re-check root, project metadata-only timeline.
}
```

Tests:

- [ ] List passes explicit `thread/list` params.
- [ ] List filters out-of-root threads using realpath checks.
- [ ] List returns `[]` for no allowed conversations.
- [ ] Timeline does not call `readThread` when id is absent from allowed list.
- [ ] Timeline maps absent id to `conversation_not_found`.
- [ ] Timeline maps out-of-root read result to `project_forbidden` without leaking path.
- [ ] Handler closes client on success and failure.
- [ ] Handler maps app-server timeout and unavailable errors through `errors.ts`.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker read-only handlers"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused handler tests pass.
- Typecheck exits `0`.

---

## Task 9: Add Hono HTTP Boundary

Files:

- `apps/worker/src/http/workerHttpApp.ts`
- `apps/worker/src/http/workerHttpApp.test.ts`

Steps:

- [ ] Create `createWorkerHttpApp(context)` returning a Hono app.
- [ ] Add auth middleware using `isBearerTokenAuthorized`.
- [ ] Add Origin middleware using `isOriginAllowed`.
- [ ] Add request id generation.
- [ ] Mount exactly the five Stage 2 `GET` routes.
- [ ] Convert handler errors through `toErrorEnvelope`.
- [ ] Return JSON with contract-shaped payloads.
- [ ] Do not pass Hono `Context` into projections or app-server logic.
- [ ] Ensure unversioned paths and write paths return `404`.

Boundary shape:

```ts
import { Hono } from "hono";

export function createWorkerHttpApp(context: WorkerReadOnlyHandlerContext): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!isBearerTokenAuthorized(authHeader, context.config.workerToken)) {
      throw new WorkerHttpError(401, "unauthorized", "Missing or invalid bearer token.");
    }

    const origin = c.req.header("origin");
    if (!isOriginAllowed(origin, context.config.allowedOrigins)) {
      throw new WorkerHttpError(403, "origin_forbidden", "Origin is not allowed.");
    }

    await next();
  });

  app.get("/v1/worker/health", async (c) => c.json(await getHealth(context)));
  app.get("/v1/worker/capabilities", async (c) => c.json(await getCapabilities(context)));
  app.get("/v1/worker/probe", async (c) => c.json(await runProbe(context)));
  app.get("/v1/conversations", async (c) => c.json(await listConversations(context)));
  app.get("/v1/conversations/:conversationId/timeline", async (c) =>
    c.json(await readConversationTimeline(context, c.req.param("conversationId"))),
  );

  return app;
}
```

Tests:

- [ ] Missing bearer token returns `401`.
- [ ] Invalid bearer token returns `401`.
- [ ] Valid token with unexpected browser `Origin` returns `403`.
- [ ] Valid token with no `Origin` succeeds.
- [ ] Valid token with allowlisted `Origin` succeeds.
- [ ] `/v1/conversations/{id}/timeline` returns `ConversationTimeline`.
- [ ] `/conversations/{id}/follow-up` returns `404` or `405`, not implemented behavior.
- [ ] Response body for errors is an `ErrorEnvelope`.
- [ ] Error body does not include raw app-server URL, token, stack, prompt, command output, or full diff marker strings.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker http app"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused HTTP app tests pass.
- Typecheck exits `0`.

---

## Task 10: Add Loopback HTTP Server CLI

Files:

- `apps/worker/src/cli/readOnlyHttpServerCli.ts`
- `apps/worker/src/cli/readOnlyHttpServerCli.test.ts`
- `apps/worker/package.json`

Steps:

- [ ] Parse and validate Worker HTTP config from environment.
- [ ] Reject invalid config before binding.
- [ ] Bind with `node:http` using `serve` from Hono adapter or the standard Hono Node server package chosen during implementation.
- [ ] Use only configured loopback host.
- [ ] Print a minimal startup line without token or raw app-server URL.
- [ ] Keep process alive until terminated.
- [ ] Make tests cover config failure without starting a long-running server.

CLI entry:

```ts
import { serve } from "@hono/node-server";
import { parseWorkerHttpConfig } from "../http/workerHttpConfig.ts";
import { createWorkerHttpApp } from "../http/workerHttpApp.ts";

const config = await parseWorkerHttpConfig(process.env);
const app = createWorkerHttpApp(createDefaultWorkerReadOnlyHandlerContext(config));

serve({
  fetch: app.fetch,
  hostname: config.bindHost,
  port: config.port,
});

process.stdout.write(`codex-remote worker http listening on ${config.bindHost}:${config.port}\n`);
```

Dependency note:

- If Hono's Node server adapter requires `@hono/node-server`, add it with pnpm:

```bash
pnpm --filter @codex-remote/worker add @hono/node-server
```

Tests:

- [ ] Invalid token/root/origin/bind config exits through sanitized error handling.
- [ ] Startup output includes host and port only.
- [ ] Startup output does not include token or app-server URL.

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "read-only http server cli"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Focused CLI tests pass.
- Typecheck exits `0`.

---

## Task 11: Add Architecture Boundary Tests

Files:

- `apps/worker/src/http/boundary.test.ts`
- `apps/web/src/contracts/packageBoundary.test.ts` if an existing test is the better location

Steps:

- [ ] Assert only `apps/worker` imports `@codex-remote/codex-protocol`.
- [ ] Assert `apps/web` does not import `@codex-remote/codex-protocol`.
- [ ] Assert Worker HTTP modules do not import Web code.
- [ ] Assert public API schemas are consumed from `@codex-remote/api-contract`.
- [ ] Assert no Worker route handler names or path constants include write/stream/approval/interrupt/steer in Stage 2.

Suggested filesystem test:

```ts
const forbiddenOutsideWorker = collectTypeScriptFiles(repoRoot)
  .filter((filePath) => !filePath.includes("/apps/worker/"))
  .filter((filePath) => readFileSync(filePath, "utf8").includes("@codex-remote/codex-protocol"));

assert.deepEqual(forbiddenOutsideWorker, []);
```

Verification:

```bash
pnpm --filter @codex-remote/worker test -- --test-name-pattern "worker architecture boundary"
pnpm --filter @codex-remote/web test -- --test-name-pattern "package boundary"
pnpm --filter @codex-remote/worker typecheck
```

Expected output:

- Boundary tests pass.
- Typecheck exits `0`.

---

## Task 12: End-To-End Local Worker HTTP Smoke Test

Files:

- No committed source file required unless a tiny script is clearly useful.

Steps:

- [ ] Start Worker HTTP with explicit safe environment.
- [ ] Call `/v1/worker/capabilities` with bearer token and no `Origin`.
- [ ] Call `/v1/worker/health` with bearer token and no `Origin`.
- [ ] If local Codex app-server preconditions are unavailable, confirm errors are structured and sanitized.
- [ ] Stop the server.

Manual smoke commands:

```bash
CODEX_REMOTE_WORKER_TOKEN=example-token \
CODEX_REMOTE_ALLOWED_PROJECT_ROOT="$PWD" \
CODEX_REMOTE_ALLOWED_ORIGINS=http://127.0.0.1:5173 \
CODEX_REMOTE_HTTP_HOST=127.0.0.1 \
CODEX_REMOTE_HTTP_PORT=8787 \
pnpm --filter @codex-remote/worker serve:read
```

In another terminal:

```bash
curl -sS \
  -H "Authorization: Bearer example-token" \
  http://127.0.0.1:8787/v1/worker/capabilities
```

Expected output:

- JSON matches `WorkerCapabilities`.
- No token, app-server URL, stack, raw RPC, prompt, command output, or full diff appears.

---

## Task 13: Full Verification And Review Package

Files:

- `PLAN.md`
- `.git/sdd/progress.md` if subagent-driven execution is used

Steps:

- [ ] Run focused package verification.
- [ ] Run repository verification.
- [ ] Update `PLAN.md` Stage 2 status and next step.
- [ ] If using subagent-driven execution, update `.git/sdd/progress.md`.
- [ ] Request final architecture/code review with these dimensions:
  - Source of truth and generated types.
  - Worker-only app-server boundary.
  - Route allowlist and non-goals.
  - Auth, Origin, loopback binding, and project realpath allowlist.
  - Error sanitization and details allowlist.
  - Timeline metadata-only leak prevention.
  - Runtime timeout and non-hanging behavior.
  - Test sufficiency.

Commands:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/api-contract typecheck
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/worker typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected output:

- Every command exits `0`.
- Any local app-server limitation is represented as a structured, sanitized Worker result, not a crash or leaked upstream error.

---

## Subagent Execution Slices

Recommended split for `superpowers:subagent-driven-development`:

1. **Contract agent:** Tasks 1-2. Owns OpenAPI paths, `ErrorEnvelope`, generated types, and contract tests.
2. **Runtime safety agent:** Tasks 4-6. Owns config validation, sanitized errors, shared app-server session, and CLI compatibility.
3. **Projection/handler agent:** Tasks 7-8. Owns app-server-to-contract mapping, allowed-root proof, and metadata-only timeline behavior.
4. **HTTP boundary agent:** Tasks 9-11. Owns Hono app, auth/origin middleware, server CLI, and architecture boundary tests.
5. **Integrator/reviewer:** Tasks 12-13. Runs smoke tests, full verification, `PLAN.md` updates, and final review.

Use sequential checkpoints between slices because Tasks 7-11 depend on contract names and runtime error helpers.

## Plan Self-Review

- Spec coverage: The plan covers all five Stage 2 routes, contract-first changes, config fail-closed behavior, auth/origin enforcement, project allowlist, probe reuse, conversation list, metadata-only timeline, sanitized errors, and full verification.
- Non-goals: The plan explicitly excludes Web datasource migration, Control Plane, DB, writes, approvals, interrupt/steer, streaming, and raw JSON-RPC.
- Unique source of truth: Public fields stay in OpenAPI; public TypeScript types stay generated aliases; app-server shapes stay generated protocol types.
- Redundancy control: The plan extracts shared app-server session setup instead of duplicating CLI and HTTP startup logic.
- Main risk: Hono Node adapter dependency may require `@hono/node-server`; Task 10 handles this through pnpm rather than guessed semver.
- Local risk: App-server may be unavailable in the current environment; completion accepts structured sanitized failure for probe/health, not a raw crash.
