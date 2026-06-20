# Stage 11 Task 1 Report

Status: DONE

## Changed Files

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/generated/openapi.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/contractGeneration.test.ts`
- `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- `apps/worker/src/http/projections.ts`
- `apps/worker/src/http/readOnlyHandlers.ts`
- `apps/worker/src/http/controlHandlers.ts`
- `apps/worker/src/http/workerHttpApp.ts`
- `apps/worker/src/http/boundary.test.ts`
- `apps/worker/src/http/projections.test.ts`
- `apps/worker/src/http/readOnlyHandlers.test.ts`
- `apps/worker/src/http/controlHandlers.test.ts`
- `apps/worker/src/http/workerHttpApp.test.ts`

## RED Verification

- `pnpm --filter @codex-remote/api-contract test`
  - Failed as expected before implementation.
  - Summary: 24 pass, 3 fail.
  - Failure themes: Stage 11 lifecycle paths missing, `CodexConversation` missing `archived`/`loaded`/`live`, Control Plane device-scoped lifecycle paths missing.
- `pnpm --filter @codex-remote/worker test`
  - Failed as expected before implementation.
  - Summary: 160 pass, 6 fail.
  - Failure themes: lifecycle handler exports/routes missing, timeline `events`/flags missing, archived list pass missing, CORS missing `PATCH`.

## GREEN Verification

- `pnpm --filter @codex-remote/api-contract generate`
  - Passed; regenerated `packages/api-contract/src/generated/openapi.ts`.
- `pnpm --filter @codex-remote/api-contract test`
  - Passed: 27 tests, 0 failures.
- `pnpm --filter @codex-remote/worker test`
  - Passed: 179 tests, 0 failures.
- `pnpm typecheck`
  - Passed: 11 tasks successful, 0 failures.

## Concerns

- Stage 11 new fields are present in the public schemas and Worker responses, but are optional in OpenAPI to avoid forcing Web fixture/UI changes in Task 1. Task 2 can make stronger Web assumptions when Control Plane and Web are implemented.
- Control Plane and Web lifecycle behavior are intentionally not implemented in this task.
- Full `pnpm lint`, `pnpm test`, and `pnpm build` were not run; focused Task 1 tests plus full typecheck were run.

## Reviewer Fixes - 2026-06-21

Changed files:

- `apps/worker/src/http/projections.ts`
- `apps/worker/src/http/projections.test.ts`
- `apps/worker/src/http/approvalRegistry.ts`
- `apps/worker/src/http/approvalRegistry.test.ts`
- `apps/worker/src/http/controlHandlers.ts`
- `apps/worker/src/http/controlHandlers.test.ts`
- `apps/worker/src/app-server/appServerRpcClient.ts`
- `apps/worker/src/app-server/appServerRpcClient.test.ts`
- `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- `.superpowers/sdd/task-1-report.md`

Fix summary:

- Conversation projection now uses trimmed sanitized `thread.name` as public `conversation.title` when present, falls back to the allowed project basename, and never uses `thread.preview`.
- Approval registry now retains bounded sanitized resolved approval records with `resolvedAt`; timeline projection emits `approval_resolved` events/cards while public approval list remains pending-only. `mcpServer/elicitation/request` remains unsupported and does not become a public approval card.
- Stage 11 lifecycle app-server methods are in the typed `WorkerAppServerMethod` allowlist. `AppServerWorkerClient` now calls `this.rpc.request(...)` directly and the untyped escape helper was removed.
- Archive and rename now read the allowed thread again after the write before projection. Archive keeps the public archived override true.

RED verification:

- `pnpm --filter @codex-remote/worker test`
  - Failed as expected before implementation.
  - Summary: 184 tests, 178 pass, 6 fail.
  - Failure themes: missing resolved approval registry/projection, stale archive/rename projection, and title still falling back instead of using trimmed `thread.name`.

GREEN verification:

- `pnpm --filter @codex-remote/worker test`
  - Passed: 184 tests, 0 failures.
- `pnpm typecheck`
  - Passed: 11 tasks successful, 0 failures.

Concerns:

- `pnpm --filter @codex-remote/api-contract test` was not rerun because this fix did not touch OpenAPI schemas or generated api-contract types.
