# Stage 13 Task 1 Public Contract Report

Status: DONE

## Scope

- Added the first Stage 13 public local action contract:
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/local-actions/review-start`
- Added the public request schema:
  - `StartReviewInput`
- Reused the existing response schema:
  - `CommandAccepted`
- Kept the first slice fixed-target only:
  - no `ReviewTarget`
  - no `baseBranch`
  - no `commit`
  - no `custom`
  - no `shell-command`
  - no `thread/shellCommand`
  - no `command/exec`

## Changed Files

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/contractGeneration.test.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/generated/openapi.ts`
- `.superpowers/sdd/task-1-report.md`

## RED Verification

- `pnpm --filter @codex-remote/api-contract test`
  - Failed before implementation as expected.
  - Summary: 32 pass, 4 fail.
  - Expected failure themes:
    - review-start route missing from the write-route allowlist
    - review-start route missing from `openapi.yaml`
    - `StartReviewInput` schema missing
    - `StartReviewInput` alias missing from `src/index.ts`

## GREEN Verification

- `pnpm --filter @codex-remote/api-contract generate`
  - Passed.
  - Regenerated `packages/api-contract/src/generated/openapi.ts`.
- `pnpm --filter @codex-remote/api-contract test`
  - Passed: 36 tests, 0 failures.

## Contract Details

- Route:
  - `POST /v1/devices/{deviceId}/conversations/{conversationId}/local-actions/review-start`
- Operation:
  - `startControlPlaneDeviceReview`
- Request:
  - `StartReviewInput`
  - required fields: `projectId`, `expectedConversationId`, `clientRequestId`, `confirmationText`
  - closed object with `additionalProperties: false`
- Responses:
  - `202`: `CommandAccepted`
  - `400`: `BadRequestError`
  - `401`: `UnauthorizedError`
  - `404`: `ConversationNotFoundError`
  - `424`: `DeviceUnavailableError`
  - `500`: `InternalWorkerError`

## Safety Checks

- Added contract tests proving `StartReviewInput` does not expose:
  - `rawOutput`, `stdout`, `stderr`, `fullDiff`, `jsonRpc`, `appServerUrl`, `stack`, `cause`, `token`, `secret`, `absolutePath`, `cwd`
- Added contract tests proving the first Stage 13 public contract does not expose:
  - `ReviewTarget`, `baseBranch`, `commit`, `custom`, `shell-command`, `shellCommand`, `command/exec`
- Added route allowlist coverage proving only the fixed-target review-start local action is present for this slice.

## Concerns

- Runtime Worker, Control Plane, and Web implementations are intentionally pending in later Stage 13 tasks.
