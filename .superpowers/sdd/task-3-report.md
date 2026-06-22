# Task 3 Report: Control Plane Routing

## RED

Command:

```bash
pnpm --filter @codex-remote/control-plane test
```

Failure summary:

- 76 tests ran: 70 passed, 6 failed.
- Worker client advanced platform readiness tests failed because `client.getAdvancedPlatformReadinessSummary is not a function`.
- Control Plane route tests failed because `/v1/devices/{deviceId}/projects/{projectId}/advanced-platform-readiness` was not mounted yet, returning `404` instead of the expected selected-device route behavior.

## GREEN

Command:

```bash
pnpm --filter @codex-remote/control-plane test
```

Passing summary:

- 76 tests ran: 76 passed, 0 failed.
- Verified Worker upstream client calls `GET /v1/projects/{projectId}/advanced-platform-readiness` with bearer auth.
- Verified Control Plane route calls only the selected configured device, forwards the public `projectId`, normalizes top-level public `deviceId` and `projectId` to the selected route values, and preserves readiness sections/watchlist items.
- Verified unknown device and upstream failure return sanitized `404` and `424`.
- Verified hostile upstream extra fields such as `cwd`, `appServerUrl`, `logs`, `stack`, `actionId`, and input fields fail closed or are not serialized.

## Modified Files

- `apps/control-plane/src/client/workerClient.ts`
- `apps/control-plane/src/client/workerClient.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `.superpowers/sdd/task-3-report.md`

## Concerns

- Full Stage 15 verification is still pending in later tasks; this task only ran the required focused Control Plane test command.
- Existing Task 1 api-contract and Task 2 Worker changes were already present and uncommitted before this task; they were not reverted or modified by this task.
