# Stage 11 Task 2 Report

## Status

Implemented Control Plane pass-through and Web workbench UI/data wiring for conversation lifecycle actions and lifecycle state display.

## RED Evidence

- `pnpm --filter @codex-remote/control-plane test`
  - Failed as expected:
    - `client.openConversation is not a function`
    - lifecycle route returned `404` instead of `200`
- `pnpm --filter @codex-remote/web test`
  - Failed as expected:
    - `client.openConversation is not a function`
    - selected conversation source test had no `openConversation`
    - lifecycle badges/actions were absent
    - `data.approvalCards` was undefined for timeline event projection

## GREEN Tests

- `pnpm --filter @codex-remote/control-plane test`
  - `41/41` pass
- `pnpm --filter @codex-remote/web test`
  - `106/106` pass
- `pnpm --filter @codex-remote/worker test`
  - `185/185` pass after reviewer fixes
- `pnpm typecheck`
  - `11/11` Turborepo tasks successful

## Changed Files

- `apps/control-plane/src/client/workerClient.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- `apps/control-plane/src/client/workerClient.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/worker/src/http/readOnlyHandlers.ts`
- `apps/worker/src/http/readOnlyHandlers.test.ts`
- `apps/web/src/data/workerApi/client.ts`
- `apps/web/src/data/workerApi/workbenchData.ts`
- `apps/web/src/data/workerApi/client.test.ts`
- `apps/web/src/data/workerApi/workbenchData.test.ts`
- `apps/web/src/components/shell/codex-remote-app.tsx`
- `apps/web/src/components/shell/codexRemoteAppWriteFlow.test.ts`
- `apps/web/src/components/detail/main-panels.tsx`
- `apps/web/src/components/sidebar/sidebar.tsx`
- `apps/web/src/components/sidebar/action-menu.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/domain/layout/appLayout.test.ts`

## Concerns

- `apps/web/src/domain/layout/appLayout.test.ts` was adjusted because its old source-shape assertion required a no-prop header `ActionMenu`, which conflicts with Task 2 lifecycle header actions. The assertion still checks the simplified header/title-menu/layout-action contract.
- Approval decision buttons still use the existing pending approvals endpoint. Timeline `approvalCards` are rendered as pending/resolved state cards; cards without a matching pending approval are display-only.
- Existing Task 1 / API contract files were already modified in the worktree and were not changed by this task.

## Review Fixes

- Fixed Worker snapshot timeline projection so pending/resolved approval cards remain visible after the Web open -> refresh flow.
- Fixed Control Plane timeline normalization so nested workbench events use the configured public `deviceId`.
- Fixed Web approval-card reconciliation so duplicate/late events collapse by approval identity and keep the latest resolved state.
