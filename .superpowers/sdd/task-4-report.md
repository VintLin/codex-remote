# Stage 15 Task 4 Report: Web Settings UI

## RED

Command:

```bash
pnpm --filter @codex-remote/web test
```

Failure summary:

- `WorkerApiClient advanced platform readiness...`: failed because `getAdvancedPlatformReadinessSummary` did not exist.
- `fake Worker smoke server...advanced platform...`: failed because `/v1/projects/{projectId}/advanced-platform-readiness` returned `404` instead of loaded/degraded/project guard responses.
- `workbench datasource...advanced platform...`: failed because `WorkbenchData.advancedPlatform` was undefined.
- `advanced platform Web source...`: failed because Settings/client/workbench source did not yet expose `AdvancedPlatformReadinessSummary`, `getAdvancedPlatformReadinessSummary`, `AdvancedPlatformPanel`, or the advanced route.
- One RED fixture used literal local path strings and triggered the existing source-path discipline test; the fixture was corrected to construct path-like unsafe values without hardcoded absolute paths.

## GREEN

Commands:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Passing summary:

- `pnpm --filter @codex-remote/web test`: `144/144` tests passed.
- `pnpm --filter @codex-remote/web typecheck`: `tsc --noEmit --pretty false` completed with exit code 0.

## Modified Files

- `apps/web/src/data/workerApi/client.ts`
- `apps/web/src/data/workerApi/client.test.ts`
- `apps/web/src/data/workerApi/fakeWorkerSmokeServer.ts`
- `apps/web/src/data/workerApi/fakeWorkerSmokeServer.test.ts`
- `apps/web/src/data/workerApi/workbenchData.ts`
- `apps/web/src/data/workerApi/workbenchData.test.ts`
- `apps/web/src/components/detail/main-panels.tsx`
- `apps/web/src/components/shell/codex-remote-app.tsx`
- `apps/web/src/components/shell/localWorkbenchBoundary.test.ts`
- `.superpowers/sdd/task-4-report.md`

## Concerns

- `apps/web/src/app/globals.css` was not modified because the existing Runtime & Settings grid/card/row CSS was sufficient for the requested minimal panel.
- This task intentionally did not run full repo gates, browser smoke, commit, or push; user scope requested Task 4 Web work only and explicitly said not to submit or push.
