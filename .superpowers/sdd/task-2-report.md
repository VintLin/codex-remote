# Stage 13 Task 2 Report

## Status

- Completed

## Scope

- Implemented Worker local action handler for review-start only.
- Did not implement `thread/shellCommand`, `command/exec`, shell-command, base-branch review, commit review, or custom review.

## Changed Files

- `apps/worker/src/http/localActionHandlers.ts`
- `apps/worker/src/http/localActionHandlers.test.ts`
- `apps/worker/src/http/workerHttpApp.ts`
- `apps/worker/src/app-server/appServerRpcClient.ts`
- `apps/worker/src/probe/appServerReadOnlyProbeClient.ts`
- `apps/worker/src/cli/readOnlyHttpServerCli.ts`
- `apps/worker/src/cli/readOnlyHttpServerCli.test.ts`
- `.superpowers/sdd/task-2-report.md`

## RED Evidence

- Focused RED command:
  - `pnpm --filter @codex-remote/worker test -- src/http/localActionHandlers.test.ts`
- Initial failure:
  - `ERR_MODULE_NOT_FOUND` for `apps/worker/src/http/localActionHandlers.ts`

## GREEN Evidence

- Focused GREEN command:
  - `pnpm --filter @codex-remote/worker test -- src/http/localActionHandlers.test.ts`
- Focused result:
  - `tests 7`
  - `pass 7`
  - `fail 0`
- Focused handler + CLI command:
  - `pnpm --filter @codex-remote/worker test -- src/http/localActionHandlers.test.ts src/cli/readOnlyHttpServerCli.test.ts`
- Focused handler + CLI result:
  - `tests 13`
  - `pass 13`
  - `fail 0`
- Required package command:
  - `pnpm --filter @codex-remote/worker test`
- Package result:
  - `tests 213`
  - `pass 213`
  - `fail 0`

## Implementation Notes

- `startLocalReview(context, conversationId, input)` validates `clientRequestId`, `confirmationText`, `expectedConversationId`, and `projectId` before opening the app-server client.
- The handler rejects forbidden conversations through `readAllowedConversationThread` before calling app-server `review/start`.
- The handler constructs app-server params internally as:
  - `{ threadId, target: { type: "uncommittedChanges" } }`
- Public input fields such as `target`, `baseBranch`, `commit`, or `custom` are ignored because the body parser only accepts the Stage 13 public fields and the handler never reads those fields.
- Upstream errors are mapped through existing `mapUnknownError` / `toErrorEnvelope` sanitization with public operation context `review_start`.
- The Worker HTTP app mounts only one Stage 13 local action route:
  - `POST /v1/conversations/:conversationId/local-actions/review-start`
- `review/start` was added to the Worker app-server RPC allowlist and forwarded through `AppServerWorkerClient` and the CLI shared session harness.

## Concerns

- `localReviewConfirmationText` is currently defined by the Worker as `START REVIEW`; the public contract constrains presence and length but does not specify the exact confirmation phrase.
- `workerHttpApp.ts` keeps the new route in a constant so the existing Stage 5 static boundary test does not classify it as an old Stage 5 route.
- Existing unrelated dirty file observed and left untouched: `.superpowers/sdd/task-3-report.md`.
