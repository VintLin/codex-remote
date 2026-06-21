# Task 3 Report: Control Plane Routing

## Status

Implemented and verified.

## Changed Files

- `apps/control-plane/src/client/workerClient.ts`
- `apps/control-plane/src/client/workerClient.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `.superpowers/sdd/task-3-report.md`

## Scope

- Added Control Plane route: `POST /v1/devices/{deviceId}/conversations/{conversationId}/local-actions/review-start`.
- Added Worker upstream client method: `startReview(device, conversationId, input)`.
- Worker upstream path is `/v1/conversations/{conversationId}/local-actions/review-start`.
- Request body uses `StartReviewInput` from `@codex-remote/api-contract`: `projectId`, `expectedConversationId`, `clientRequestId`, `confirmationText`.
- Control Plane only routes to the selected configured device and performs route-vs-`expectedConversationId` stale guard.
- Project ownership/stale `projectId` verification remains Worker-owned; Control Plane preserves sanitized Worker failure.

## RED Evidence

Worker client focused RED:

```bash
pnpm --filter @codex-remote/control-plane test -- src/client/workerClient.test.ts
```

Expected failures before implementation:

- `TypeError: client.startReview is not a function`
- 16 passed, 2 failed.

Control Plane HTTP focused RED:

```bash
pnpm --filter @codex-remote/control-plane test -- src/http/controlPlaneHttpApp.test.ts
```

Expected failures before implementation:

- Review-start route returned `404` instead of `202`.
- Stale `expectedConversationId` route returned `404` instead of `409`.
- Upstream unavailable path returned route `404` instead of sanitized `424`.
- 32 passed, 4 failed.

## GREEN Evidence

Focused GREEN:

```bash
pnpm --filter @codex-remote/control-plane test -- src/client/workerClient.test.ts
pnpm --filter @codex-remote/control-plane test -- src/http/controlPlaneHttpApp.test.ts
```

Results:

- Worker client: 18 passed, 0 failed.
- Control Plane HTTP: 36 passed, 0 failed.

Package verification:

```bash
pnpm --filter @codex-remote/control-plane test
```

Result:

- 62 passed, 0 failed.

## Boundary Checks

```bash
rg -n "@codex-remote/codex-protocol|apps/worker|../worker|worker/src" \
  apps/control-plane/src/client/workerClient.ts \
  apps/control-plane/src/http/controlPlaneHttpApp.ts \
  apps/control-plane/src/client/workerClient.test.ts \
  apps/control-plane/src/http/controlPlaneHttpApp.test.ts
```

Result:

- No `@codex-remote/codex-protocol`, Worker internals, or Worker source imports were introduced.
- Matches were only existing public Worker HTTP route/test URL strings and local `workerClient` imports.

## Concerns

- Only the requested Control Plane package test was run. Repo-wide `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` were not run for this task slice.
