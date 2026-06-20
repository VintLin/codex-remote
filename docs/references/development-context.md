# Development Context Reference

This document stores stage-specific planning context and researched decisions. `AGENTS.md` should stay short and generic; move details here when they are not needed for every edit.

## Product Context

Codex Remote is a self-hosted multi-device Codex Web console.

Long-term product boundaries:

- It does not depend on every device using the same OpenAI / ChatGPT account.
- Each device keeps its own Codex auth, API key, model provider, and local config.
- Control Plane must not store OpenAI / ChatGPT / provider secrets.
- Codex app-server should only bind localhost or a local socket.
- Device Worker is the external bridge for local Codex runtime.
- First product surface is Web; future iOS reuses the Control Plane API contract, not the Web runtime.

## Current Stage Context

Stages 0-8 have completed local verifiable slices. Stage 9 is in progress and currently records real local Codex calibration as `real-gap`, not ready. New work should not assume installer, keychain, pairing, reverse WSS, external deployment, iOS, production multi-tenant capabilities, output streaming, or real stdio app-server readiness exist.

Stage 4 completed context:

- Worker HTTP write boundary is versioned under `/v1`.
- Public write fields start in `packages/api-contract/openapi.yaml`; generated types flow to Web and Worker.
- Legacy unversioned follow-up write contract was removed from the public API.
- Worker remains the only app that maps public write input to generated Codex app-server protocol types.
- `POST /v1/conversations` is implemented and tested at Worker/API level, but Web start UI remains deferred.
- Web-facing Stage 4 scope is existing-conversation follow-up only.
- Post-write observation uses existing read projections; no streaming transport or event log was introduced.
- Process-local idempotency keys are operation plus target plus `clientRequestId`, with same-key different-fingerprint conflict behavior.
- Chrome smoke verified normal accepted and sanitized failure paths with no token, raw Worker URL, prompt echo on success, command output, full diff, stack/cause, or JSON-RPC in UI.

Stage 5 default design input:

- Keep public control operations schema-first in `packages/api-contract/openapi.yaml`.
- Do not collapse follow-up, steer, interrupt, and approval response into one generic write endpoint.
- `apps/worker` remains the only Codex app-server caller; `apps/web` stays on Worker/Control Plane-shaped HTTP contract.
- Require explicit expected ids for control operations where applicable, especially `expectedTurnId` for interrupt/steer.
- Approval handling is an explicit user-decision channel, not an ordinary error or automatic retry.
- Approval responses must be idempotent and fail closed if the pending approval state does not match.
- Do not implement Control Plane multi-device routing, DB persistence, reverse WSS, iOS, pairing, productized auth, or broad task board behavior in Stage 5 unless the Stage 5 spec explicitly narrows one of them as a required control verification dependency.
- Do not expose raw app-server JSON-RPC, raw notification payload, prompt echo, command output, full diff, stack/cause, provider secrets, raw app-server URL, or private paths.

Stage 5 completed context:

- Public control API is versioned under `/v1` and schema-first in `packages/api-contract/openapi.yaml`.
- Implemented control endpoints: interrupt, steer, pending approval list, and approval decision.
- Worker remains the only app-server control caller and JSON-RPC approval responder.
- Web calls only Worker-shaped HTTP APIs and imports only public API contract types.
- Interrupt and steer require `expectedTurnId`; approval decisions require expected conversation, turn, and approval request ids.
- Approval list and approval decision now both prove the conversation is inside `allowedProjectRoot` before exposing or consuming process-local registry state.
- Approval registry exposes only sanitized metadata for command execution, file change, legacy exec, and legacy apply-patch approvals. Permissions approval is intentionally unsupported in Stage 5.
- Approval response completion happens only after `sendApprovalResponse` succeeds; failed sends keep pending approval retryable.
- The HTTP Worker context keeps one shared app-server session for approval observers; lifecycle management remains a later Worker daemon/productization concern.
- Approval unknown start time uses Worker capture time, not Unix epoch.
- Fake Worker supports Stage 5 control endpoints for browser smoke verification.
- Chrome verified loaded, steer, approval accept, interrupt, fallback, and no raw URL/token leakage.

Stage 5 remaining limitations:

- Approval registry and idempotency state are process-local only.
- Approval UI intentionally omits command text, cwd, paths, patch details, permissions grants, policy amendment, and sandbox override.
- Durable approval/idempotency state belongs to Stage 7 or later DB-backed work.

Stage 6 default design input:

- Start with a Control Plane spec and threat model before implementation.
- Keep provider/Codex secrets on Worker devices; Control Plane may store device identity, token hash/cert metadata, routing/status/audit, and revocation state.
- Web should move toward Control Plane-shaped API calls, but Worker remains the only app-server caller.
- Reverse connection default direction is Worker outbound WSS, but WSS send is not durable completion. If implemented, define `msg_id/seq/ack/lease/resume/credit`, backpressure, generation fencing, replay, and reconnect semantics.
- Keep Stage 6 to a local multi-Worker verifiable slice unless the Stage 6 spec explicitly narrows a small state store. Do not prebuild the Stage 7 task board.

Stage 6 completed context:

- Control Plane is a local configured multi-Worker router under `apps/control-plane`.
- Public Control Plane fields remain schema-first in `packages/api-contract/openapi.yaml`.
- Web now consumes Control Plane-shaped endpoints: `/v1/devices`, `/v1/conversations`, and `/v1/devices/{deviceId}/...`.
- Worker remains the only app-server caller; Control Plane calls only Worker public HTTP APIs.
- Control Plane keeps upstream Worker URLs/tokens only in runtime config/process memory and never persists provider/Codex secrets.
- Known device-bearing Worker shapes are normalized to the configured Control Plane `deviceId`.
- Upstream responses are projected to public contract shapes and fail closed on extra fields or invalid JSON.
- Web uses a local `conversationKey` derived from `deviceId + conversationId` so duplicate conversation ids across devices do not route timeline/control/approval operations to the wrong device.
- Web sidebar uses a local `projectKey` derived from `deviceId + projectId` so duplicate project ids across devices do not merge project groups.
- Fake Worker smoke support can run two parameterized Worker instances for local multi-device Chrome verification.
- Chrome verified two-device aggregation, duplicate `shared-thread` routing to the selected device, device-scoped steer and approval decision, single-Worker degradation, all-Worker empty remote state, and no upstream Worker port/token leakage.
- Regression coverage records that a successful remote empty conversations response is a loaded empty state, not mock fallback, and that duplicate project ids are device-scoped in Web grouping.

Stage 6 remaining limitations:

- No DB, pairing, reverse WSS, token rotation, revocation, durable audit, iOS, or productized auth.
- Local Control Plane bearer auth is a development posture, not device-bound auth.
- Device registry and Worker upstream tokens come from local runtime config; production secret storage belongs to productization.

Stage 7 completed context:

- `packages/db` is the local persistence boundary for the task board.
- DB schema fields start in `packages/db/src/schema.ts`; migrations are generated under `packages/db/drizzle/`.
- Stage 7 uses SQLite + Drizzle + `better-sqlite3`; driver details stay inside `packages/db`.
- Public task API fields start in `packages/api-contract/openapi.yaml`; generated OpenAPI types flow to Control Plane and Web.
- `BoardTask` includes `createdAt` and `updatedAt`; task lists order by `updatedAt desc`.
- `TaskConversationLink` is device-scoped and includes required `deviceId`, `conversationId`, `projectId`, and `linkedAt`.
- `apps/control-plane` imports `@codex-remote/db` for task persistence and still does not import `packages/codex-protocol`.
- `apps/web` consumes Control Plane task routes only and still does not import DB or app-server protocol packages.
- Web task linking requires a selected conversation with `projectId`; missing project identity fails closed instead of writing a partial link.
- Task API failures render a task datasource failure state and do not fallback to mock persisted tasks.
- Chrome verified empty task state, task creation, same `conversationId` linked from two `deviceId` values, refresh persistence, and no sensitive DOM hits.

Stage 7 remaining limitations:

- SQLite is local single-node persistence; no multi-writer, remote sync, PostgreSQL/libSQL, or cloud deployment support is promised.
- Task board is manual only; no automatic task inference, automatic device choice, or task migration.
- DB does not yet own device registry, token hashes, pairing, revocation, audit log, approval registry, or idempotency durable state.
- Product/runtime native dependency support matrix remains a Stage 8/productization concern.

Stage 8 completed context:

- Stage 8 productization was intentionally narrowed to local self-hosted readiness, not real packaging or cloud/product launch.
- `docs/references/local-self-hosting.md` is the operator runbook for local topology, startup order, placeholders, validation commands, troubleshooting, and known limitations.
- `pnpm product:check` is the static readiness guardrail. It checks local scripts, loopback defaults, OpenAPI operationId stability, public object schema closedness, import boundaries, and sensitive-shaped values in active docs, package scripts, readiness scripts, and local self-hosting references.
- API/iOS reuse guardrails live in `packages/api-contract/src/contractGeneration.test.ts`; future iOS types must still derive from `packages/api-contract/openapi.yaml`.
- Secret-shaped scanning covers provider key shapes, bearer/token assignment shapes, credential-bearing URLs, private local paths, and stack-trace-shaped values while allowing documented placeholders such as `REDACTED` and `example-token`.
- Web Chrome smoke verified Control Plane-backed device/conversation/task data, task linking through the Control Plane-backed task board, and sanitized unavailable Control Plane fallback.

Stage 8 remaining limitations:

- Product readiness checks are static guardrails; they are not a substitute for runtime penetration testing, production threat modeling, installer testing, or OS keychain validation.
- Loopback checks still use text sentinels over current config sources; future config refactors should move these checks to structured parser/fixture tests.
- Local bearer token auth remains a development posture. Pairing, token rotation, revocation, sender-constrained device auth, OS keychain storage, audit log, reverse WSS, external deployment, iOS app, and auto-update remain post-MVP work.

Stage 9 in-progress context:

- Task 5/6 implemented the real calibration runner and smoke gate; fake Worker smoke no longer satisfies real readiness claims.
- Worker-owned `stdio` app-server lifecycle is implemented and is the default `pnpm real:start` path.
- The local real stack uses Worker, Control Plane, Web, SQLite task DB, and Codex app-server on one Mac; `pnpm real:start` starts all three HTTP surfaces and `pnpm real:status` reports them running.
- `pnpm real:check` writes ignored local artifacts under `logs/real-check/`; current `logs/real-check/latest.json` summary is `total=19 realPass=18 fixedPass=0 realGap=1`.
- Worker app-server readiness evidence requires `appServerConnected=true`, `transport=stdio`, and sanitized version metadata; `debug-websocket` does not satisfy readiness.
- `pnpm web:e2e:smoke` now passes against the real stack and checks that Web does not make runtime external asset requests.
- Task link invalid ids are now rejected before persistence, and both `task link` and `task link invalid ids` record `real-pass`.
- Q24 Control Plane degraded-vs-empty fixtures now record `real-pass`: all-workers-down and invalid-worker-token return a sanitized dependency error for `/v1/conversations` instead of `200 []`.
- Worker write paths initialize the stdio app-server session before `thread/start` / `turn/start`; Worker specific conversation routes prove access with `thread/read` followed by Worker-local realpath verification.
- The real calibration runner waits briefly for post-start timeline visibility and uses separate steer/interrupt samples where available; same-turn steer-before-interrupt was tested and rejected because it regressed earlier evidence.
- `steer` readiness is now guarded by public active-turn proof; without that proof, `real:check` records sanitized `active-turn-gap` instead of a generic Worker error or product-ready pass.
- Q23 cwd scope and pagination now use a Control Plane device-scoped Worker probe. `thread/list cwd scope` and `thread/list pagination` record `real-pass` with `exactCwdListProven=true`, `completedUntilNextCursorNull=true`, and sanitized page/count evidence.
- `steer` now uses an independent safe steer-only sample and records `real-pass` with `activeTurnProven=true` plus accepted public steer status.
- Start, timeline, follow-up, approval pending list, and interrupt now record `real-pass`.
- Documented safety gap: approval decision lacks a safe pending approval in the current real project stack. Approval pending list is real, but approval decision is excluded from product-ready claims until a separate isolated approval fixture proves at least decline/cancel; automatic accept, persistent policy amendment, and production approval safety model are out of Stage 9.
- Q24 Task 10 semantics are now implemented for the current slice: `/v1/control-plane/health` and `/v1/devices` may return sanitized degraded state, partial Worker conversation failures keep reachable conversations available, and all-workers-down or invalid-worker-token makes `/v1/conversations` return a sanitized dependency error instead of `200 []`.
- `debug-websocket` is an explicit local debug fallback only. `real:check` and readiness accept only `stdio` proof.
- Tracked docs may contain only sanitized evidence summaries; raw ids, prompts, command output, raw JSON-RPC, tokens, private paths, stack/cause, and full diffs stay out of tracked files.
- Output streaming remains a separate out-of-scope stage.

## App-Server Integration Notes

`docs/references/codex-app-server.md` is an explanatory protocol reference. It is not the type source of truth; `packages/codex-protocol` generated artifacts are.

Adopted integration assumptions:

- Worker owns app-server lifecycle and transport.
- Product direction prefers Worker-owned `stdio` where available; loopback WebSocket remains useful for probe/debug fallback.
- Unix socket is a later local-daemon optimization for macOS/Linux.
- WebSocket app-server transport must stay loopback-only unless upstream auth is explicitly configured and verified.
- JSON-RPC setup must preserve `initialize` then `initialized` ordering.
- Worker RPC client must enforce request timeouts, pending-request cleanup, close/error rejection, and bounded queue/backpressure behavior.
- `thread/list(cwd=...)` is the read-list entry point for project-scoped conversations.
- `thread/read(includeTurns=true)` is the timeline MVP fallback.
- Approval server requests are explicit user-decision state, not ordinary errors.
- App-server notifications are stream signals, not a durable event log; Web-facing events still need Worker-generated `seq/eventId` and snapshot reconciliation.

## Current Frontend Context

The first Web UI should be a workbench, not a landing page.

- Default layout direction: device / task navigation, list or board, conversation operation area.
- Controls should serve high-frequency operations: open conversation, send follow-up, interrupt, associate task.
- Status should be visible and unambiguous: online/offline, running, waiting approval, waiting input, interrupted, failed, done.

Product UX guardrails from official Codex App references:

- Codex Remote should model Device / Project / Conversation / Task ownership explicitly; it is not a single-thread chat clone.
- Worktree and review concepts are product behaviors, but MVP should only expose them when the underlying Git state is available through stable boundaries.
- In-app browser, Chrome extension, computer use, automations, and local environments are future capability areas with separate safety boundaries; do not fold them into the read-only or first write slice.
- Official App page snapshots in `docs/references/openai-codex-app-pages/pages/` are product behavior references, not API schema sources.

## Current Testing Focus

Boundary tests are more important than coverage numbers in the current architecture.

- `api-contract` remains the API source of truth.
- Web does not directly import app-server protocol.
- Worker is the only app-server caller.
- app-server stays loopback-only or local-socket-only.
- token, path, raw error, prompt, command output, raw JSON-RPC frame, and full diff do not leak.
- read/write/approval boundaries fail closed.
- Future DB tests should run the same migrations against memory/temp DB.
- Pairing, device token, and workspace permission boundaries need early coverage when implemented.

## Future Stage Context

### Streaming / Control

- Streaming events should be projected by Worker into stable Web-facing events.
- Worker should generate stable `seq/eventId`.
- Web timeline reducer should handle duplicates, late events, and snapshot reconciliation.
- Approval is an explicit user decision channel; it should use a Worker registry with CAS/idempotency.
- Interrupt and steer should require `expectedTurnId`.
- Interrupt/steer should be serialized per thread and fail closed.

### Multi-Device Control Plane

- Control Plane should store device public identity, token hash/cert metadata, routing/status/audit, not provider secrets.
- Reverse connection default direction: Worker outbound WSS.
- WSS is not durable delivery by itself; stage spec must define `msg_id/seq/ack/lease/resume/credit`, generation fencing, replay, and backpressure.
- Device-bound auth long-term direction: DPoP-compatible sender-constrained token.
- Plain bearer token plus rotation is only a fallback/development posture, not a device-bound-token design.
- Stage 6 must define threat model before implementing device-bound auth.
- Stage 6 should explicitly model pairing session, device heartbeat, connection status, token rotation, revocation, and audit boundaries.

### DB / Persistence

- Stage 7 implemented SQLite + Drizzle + `better-sqlite3` for task board persistence.
- Driver details stay behind `packages/db`.
- `@libsql/client` waits for real remote/sync/libSQL requirements.
- Productization must validate native install/build matrix before committing support promises.

### Worker Productization

- Worker device identity secrets default to OS keyring.
- Linux/headless file fallback must be explicit opt-in and permission-checked.
- User-mode Worker first:
  - macOS LaunchAgent.
  - Windows Scheduled Task.
  - Linux systemd user.
- System service and auto-update are later stages.

### iOS

- Future iOS App connects only to Control Plane API.
- iOS does not directly connect Codex app-server.
- iOS does not save OpenAI / Codex secrets.
- iOS types derive from API contract.
- Pairing should prefer QR / one-time token / trusted device flow.
- Current stage should only keep API guardrails; do not implement full mobile sync/artifact APIs now.
- API schemas should keep stable `operationId`, explicit `additionalProperties`, opaque cursors, unknown enum tolerance, and a standard problem/error shape where practical.

## Reference Projects

Reference projects live under `project_referenecs/`. Before using them, read:

- `docs/references/research/参考项目架构调研报告 v0.2.md`

Prefer:

- `Sunwood-ai-labs-codex-remote-control-lab`: localhost app-server + token bridge.
- `friuns2-codex-mobile`: browser-first app-server UI and CLI wrapper.
- `getpaseo-paseo`: daemon + clients + mobile/desktop/CLI long-term structure.
- `openai-codex`: app-server protocol source.

Do not copy into MVP:

- Multi-agent orchestration.
- Provider proxy.
- Codex Desktop repackaging.
- Telegram / tunnel / mobile-first extensions.

## Verification Notes

Stage-specific researched decisions still need local verification before implementation:

- Installed Codex CLI app-server behavior.
- Experimental `thread/turns/list` support.
- Node runtime and Hono assumptions.
- Current Codex CLI transport/auth/approval/events behavior against `docs/references/codex-app-server.md`.
- Official Codex App Windows sandbox, worktree, and local environment behavior against this project's target platforms.
- `better-sqlite3` native install/build matrix.
- OS keyring and Linux/headless fallback behavior.
- WSS reverse connection through self-hosted proxy/topology.
