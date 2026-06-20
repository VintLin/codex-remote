# Task 3 Report: Honest Fallback And Example UI

## Status

Implemented.

## Changes

- Labeled fallback fixture-facing device, project, conversation, projectName, and summary copy as Example data.
- Added explicit `source.reason !== "loaded"` banner in `ConversationMain`:
  - `未连接真实 Control Plane`
  - `当前显示示例数据`
- Removed nonfunctional future composer controls from the assistant composer:
  - attachment button
  - approval/access mode menu
  - model selector
  - voice input button
- Added compact `.conversation-source-banner` styling in the shared UI stylesheet.
- Updated datasource and source-code tests to make fallback/example behavior explicit.

## Scope Boundaries

- Did not implement start UI.
- Did not implement `real:check`.
- Did not change runtime scripts.
- Did not change Worker or Control Plane behavior.
- Did not introduce app-server, protocol, or DB imports into Web.

## Verification

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fallback|source is not loaded"
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

All commands passed in this task run.

## Concerns

- Existing unrelated Stage 9 documentation changes were present before Task 3 and were not staged.

## Review Fix: Task Fallback Explicitness

Status: implemented.

Fix details:

- Passed `workbenchData.source` into `TaskBoardPage`.
- Reused the existing restrained `conversation-source-banner` treatment in Tasks when `source.reason !== "loaded"`.
- Added Tasks-specific copy: `未连接真实 Control Plane` and `当前显示示例任务数据`.
- Labeled fallback task fixture titles with an `Example ` prefix.

RED evidence:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fallback|source is not loaded|task"
```

Failed as expected before implementation:

- `task board when source is not loaded, should render explicit example data copy`
- `when fixture tasks are used, should label them as examples`

GREEN evidence:

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "fallback|source is not loaded|task"
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

All three commands passed after the fix.
