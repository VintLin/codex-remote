# Task 2 Report: DB Package

## Status

DONE_WITH_CONCERNS

Concern: the requested task review could not be dispatched to an external reviewer because this session does not expose a subagent dispatch tool. I left the review request and scope below for the coordinator/reviewer.

## Scope

Changed only the DB package, dependency metadata, lockfile, and this required report:

- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/drizzle.config.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/client.ts`
- `packages/db/src/taskRepository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/taskRepository.test.ts`
- `packages/db/drizzle/0000_lumpy_dark_beast.sql`
- `packages/db/drizzle/meta/0000_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- `pnpm-lock.yaml`
- `.superpowers/sdd/task-2-report.md`

No Control Plane, Web, Worker, API contract, protocol package, or product docs were modified.

## TDD Evidence

RED:

- Added repository and boundary tests before implementation.
- Ran `pnpm --filter @codex-remote/db test`.
- Expected red state observed after making the test file runnable: failure was `ERR_MODULE_NOT_FOUND` for missing `packages/db/src/index.ts`.

GREEN:

- Added Drizzle schema, SQLite client, migration, and minimal `TaskRepository`.
- Ran `pnpm --filter @codex-remote/db test`.
- The unlink test first caught an implementation bug where chained `.where()` calls did not combine the task/device/conversation predicates.
- Fixed that by using one `and(...)` predicate.

## Implemented Behavior

- `openTaskDatabase(path: string): TaskDatabase`
  - opens a `better-sqlite3` database
  - enables foreign keys
  - applies committed Drizzle migrations
  - exposes `tasks: TaskRepository`
  - closes the underlying connection via `close()`
- `TaskRepository.listTasks(): BoardTask[]`
- `TaskRepository.createTask(input: CreateTaskInput): BoardTask`
  - generates task IDs with `crypto.randomUUID()`
  - defaults missing status to `in_progress`
- `TaskRepository.linkConversation(taskId, input): BoardTask`
  - persists `(taskId, deviceId, conversationId)`
  - allows the same `conversationId` for different `deviceId` values
  - ignores duplicate identical links
- `TaskRepository.unlinkConversation(taskId, deviceId, conversationId): BoardTask`
  - removes only the exact device-scoped link

All public task shapes consume generated aliases from `@codex-remote/api-contract`; no parallel DTOs were introduced.

## Schema And Migration

Drizzle schema source:

- `tasks`
  - `id text primary key not null`
  - `title text(200) not null`
  - `status text default 'in_progress' not null`
- `task_conversation_links`
  - `task_id text not null references tasks(id) on delete cascade`
  - `device_id text not null`
  - `conversation_id text not null`
  - primary key: `(task_id, device_id, conversation_id)`

Generated migration:

- `packages/db/drizzle/0000_lumpy_dark_beast.sql`

## Design Decisions

Conclusion: DB stores task conversation links with a composite primary key on `(task_id, device_id, conversation_id)`.

Reason: Stage 7 task links are device-scoped; Task 1 contract requires `TaskConversationLink` objects with both `deviceId` and `conversationId`.

Risk: no separate ordering column exists yet, so repository output orders tasks and links by stable persisted identifiers. If board ordering becomes product behavior, it should start with contract/schema changes.

Next step: reviewer should confirm the composite key and absence of global conversation uniqueness.

Conclusion: DB package applies committed migrations on `openTaskDatabase`.

Reason: focused repository tests use temp SQLite files and need the package to initialize its own persistence boundary.

Risk: later service startup may need explicit migration control or observability, but that is outside this task's minimal package boundary.

Next step: later Control Plane integration can decide whether to call `openTaskDatabase` directly or wrap migration startup.

Conclusion: repository does not persist prompts, command output, raw JSON-RPC frames, diffs, URLs, tokens, provider secrets, or auth material.

Reason: current `BoardTask` contract only requires task title/status and device-scoped conversation links.

Risk: future task metadata must be reviewed for secret-free persistence before schema expansion.

Next step: reviewer should inspect schema/migration for secret-free fields.

## Review Request

Please review this task specifically for:

- DB schema source-of-truth: Drizzle schema is the only persisted field definition, and migration was generated from it.
- Migration correctness: initial SQL matches the schema and includes the composite link primary key plus `on delete cascade`.
- Persistence behavior: temp SQLite tests cover create/list, reopen persistence, duplicate conversation IDs across devices, and exact unlink semantics.
- Secret-free fields: no prompt, command output, raw protocol frame, diff, token, provider secret, auth file, or raw URL is persisted.
- Package boundary: `packages/db` imports `@codex-remote/api-contract` and does not import Web, Worker, Control Plane, or `codex-protocol`.

Local review notes:

- `git diff --check` passed.
- Boundary test passed against current `packages/db/src/*.ts` sources.

## Verification

Focused command required by brief:

```bash
pnpm --filter @codex-remote/db test && pnpm --filter @codex-remote/db build
```

Result:

- `@codex-remote/db test`: 5 tests, 5 pass, 0 fail.
- `@codex-remote/db build`: `tsc --noEmit --pretty false` passed.

Additional checks:

- `pnpm install`
- `pnpm --filter @codex-remote/db generate`
- `git diff --check`

## Commit

This report is included in the Task 2 commit.
