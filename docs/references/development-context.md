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

The next planned stage is Worker HTTP API Read-only MVP.

Stage 2 default design input:

- HTTP boundary may use Hono.
- Hono must stay at the HTTP boundary; business handlers stay framework-independent.
- Candidate endpoints:
  - `GET /v1/worker/health`
  - `GET /v1/worker/capabilities`
  - `GET /v1/worker/probe`
  - `GET /v1/conversations`
  - `GET /v1/conversations/{conversationId}/timeline`
- Timeline MVP defaults to `thread/read(includeTurns=true)`.
- `thread/turns/list` remains optional experimental capability until generated protocol and runtime support are verified.
- Do not expose raw app-server JSON-RPC.
- Do not bind Web to app-server method names.
- Do not create empty `apps/control-plane`, `packages/db`, or `packages/shared`; wait until the relevant stage needs real files.
- Playwright should not be introduced broadly yet; add a small smoke suite when Web + fake Worker datasource can run the first interactive vertical user flow.

## Current Frontend Context

The first Web UI should be a workbench, not a landing page.

- Default layout direction: device / task navigation, list or board, conversation operation area.
- Controls should serve high-frequency operations: open conversation, send follow-up, interrupt, associate task.
- Status should be visible and unambiguous: online/offline, running, waiting approval, waiting input, interrupted, failed, done.

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
- Stage 6 must define threat model before implementing device-bound auth.

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

## Reference Projects

Reference projects live under `project_referenecs/`. Before using them, read:

- `docs/references/research/参考项目技术调研 v0.1.md`

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
- `better-sqlite3` native install/build matrix.
- OS keyring and Linux/headless fallback behavior.
- WSS reverse connection through self-hosted proxy/topology.
