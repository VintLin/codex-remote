# Task 1 Report: Contract First Task API

## Status

DONE_WITH_CONCERNS

Concern: the requested code-review dispatch could not be performed as an external subagent review because this session does not expose a subagent dispatch tool. I still performed the requested local review scope below and left an explicit review request for the coordinator/reviewer.

## Scope

Modified only the Task 1 contract files plus this required report:

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/contractGeneration.test.ts`
- `packages/api-contract/src/generated/openapi.ts`
- `.superpowers/sdd/task-1-report.md`

No DB, Control Plane, Web implementation, Worker, or docs outside the required report were changed.

## TDD Evidence

RED:

- Added contract tests first for:
  - the four Task API operations across versioned `/v1/tasks` routes
  - absence of unversioned task routes
  - `BoardTask.linkedConversations` replacing `linkedConversationIds`
  - public aliases deriving from generated schemas
- Ran `pnpm --filter @codex-remote/api-contract test`
- Expected failure observed: 5 failing tests covering missing task write route whitelist entries, missing `/v1/tasks` paths, old `linkedConversationIds`, and missing public aliases.

GREEN:

- Updated `openapi.yaml` as the source of truth.
- Exported public aliases from `src/index.ts`.
- Regenerated `src/generated/openapi.ts` with `pnpm --filter @codex-remote/api-contract generate`.
- Re-ran focused verification successfully.

## Implemented Contract

Schemas produced:

- `BoardTask`
  - Required: `id`, `title`, `status`, `linkedConversations`
  - `linkedConversations` is an array of `TaskConversationLink`
  - `linkedConversationIds` is no longer part of the schema
- `TaskConversationLink`
  - Required: `deviceId`, `conversationId`
- `CreateTaskInput`
  - Required: `title`
  - Optional: `status`
- `LinkTaskConversationInput`
  - Required: `deviceId`, `conversationId`

Routes produced:

- `GET /v1/tasks`
- `POST /v1/tasks`
- `POST /v1/tasks/{taskId}/conversation-links`
- `DELETE /v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}`

Public aliases exported:

- `TaskConversationLink`
- `CreateTaskInput`
- `LinkTaskConversationInput`

## Design Decisions

Conclusion: task conversation links are device-scoped objects, not bare conversation IDs.

Reason: Stage 6 introduced multi-device routing; conversation identity is not globally safe without `deviceId`.

Risk: later DB implementation must preserve `(taskId, deviceId, conversationId)` uniqueness rather than relying on conversation ID alone.

Next step: DB/Control Plane/Web implementation tasks should consume these generated aliases instead of redefining parallel DTOs.

Conclusion: task write routes use normal resource semantics: `201` for create/link and `204` for unlink.

Reason: unlike Worker command routes returning `CommandAccepted`, these contract paths describe Control Plane task-board resources and do not execute app-server commands.

Risk: if a later implementation chooses asynchronous task persistence, this response shape would need an intentional contract change.

Next step: reviewers should confirm synchronous resource semantics before downstream implementation starts.

## Review Request

Please review this task specifically for:

- Schema source-of-truth: `openapi.yaml` is the only place defining Task API fields, and aliases/generated types derive from it.
- Route versioning: all new task routes are under `/v1`; no unversioned task routes exist.
- Device-scoped conversation links: task links carry both `deviceId` and `conversationId`, and unlink identifies both in the path.

Local review notes:

- `rg` found no production/generated `linkedConversationIds`; it remains only in the negative contract assertion.
- `git diff --check` passed with no whitespace errors.
- Diff was limited to the Task 1 contract files and this required report.

## Verification

Focused command required by brief:

```bash
pnpm --filter @codex-remote/api-contract test && pnpm --filter @codex-remote/api-contract build
```

Result:

- `@codex-remote/api-contract test`: 22 tests, 22 pass, 0 fail.
- `@codex-remote/api-contract build`: `check:generated` passed, `tsc --noEmit --pretty false` passed.

Additional checks:

- `pnpm --filter @codex-remote/api-contract generate`
- `git diff --check`

## Commit

This report is included in the Task 1 commit.
