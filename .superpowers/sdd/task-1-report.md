# Stage 15 Task 1 Public Contract Report

Status: DONE

## Scope

- Added public read route:
  - `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`
- Added public schemas:
  - `AdvancedPlatformReadinessSummary`
  - `AdvancedPlatformReadinessSection`
  - `AdvancedPlatformWatchlistItem`
- Kept the contract read-only:
  - no request body
  - no advanced write routes
  - no DB changes
  - no Worker, Control Plane, or Web implementation changes

## RED Verification

- Command: `pnpm --filter @codex-remote/api-contract test`
- Result: failed as expected before implementation.
- Summary:
  - 46 tests total
  - 40 passed
  - 6 failed
- Expected failure themes:
  - Stage 15 project-scoped route missing from `openapi.yaml`
  - Stage 15 public schemas missing from `openapi.yaml`
  - Stage 15 readiness/watchlist enum separation missing
  - Stage 15 advanced write-route guard missing its only allowed read route
  - Stage 15 aliases missing from `packages/api-contract/src/index.ts`

## GREEN Verification

- Command: `pnpm --filter @codex-remote/api-contract generate`
  - Result: passed.
  - Summary: regenerated `packages/api-contract/src/generated/openapi.ts` from `openapi.yaml`.
- Command: `pnpm --filter @codex-remote/api-contract test`
  - Result: passed.
  - Summary:
    - 46 tests total
    - 46 passed
    - 0 failed

## Modified Files

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/contractGeneration.test.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/generated/openapi.ts`
- `.superpowers/sdd/task-1-report.md`

## Contract Details

- Route:
  - `GET /v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness`
- Operation:
  - `getControlPlaneDeviceProjectAdvancedPlatformReadiness`
- Response:
  - `200`: `AdvancedPlatformReadinessSummary`
  - `400`: `BadRequestError`
  - `401`: `UnauthorizedError`
  - `404`: `DeviceNotFoundError`
  - `424`: `DeviceUnavailableError`
  - `500`: `InternalWorkerError`
- Summary schema fields:
  - `deviceId`
  - `projectId`
  - `readAt`
  - `platform`
  - `readinessSections`
  - `watchlistItems`
- Readiness status enum:
  - `ready`
  - `not_applicable`
  - `degraded`
  - `unavailable`
- Watchlist support enum:
  - `not_supported`
  - `deferred`

## Safety Checks

- Added tests proving Stage 15 object schemas are closed with `additionalProperties: false`.
- Added tests proving Stage 15 arrays are bounded.
- Added tests proving readiness and watchlist states use separate enums.
- Added tests proving watchlist items do not expose `ready`, action fields, input fields, migration fields, or home-scan fields.
- Added tests proving Stage 15 schemas do not expose forbidden leak fields including tokens, secrets, app-server URLs, raw JSON-RPC, local paths, logs, prompts, command output, stack/cause, full diff, environment variables, hostnames, usernames, migration items, and uploaded-file metadata.
- Added tests proving no Stage 15 request body or advanced write routes are exposed.

## Concerns

- None.
