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

The next planned stage is Stage 5: control main chain for interrupt, steer, and approval request/response.

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

- Stage 7 default direction: SQLite + Drizzle + `better-sqlite3`.
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
