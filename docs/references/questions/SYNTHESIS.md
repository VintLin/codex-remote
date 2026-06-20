# Research Answer Synthesis

## Scope

This document summarizes the first review pass over imported ChatGPT research answers in `docs/references/questions/`.

The synthesis answers two questions:

- Do the imported answers resolve the original research questions?
- Which conclusions should affect project planning, specs, and implementation rules?

## Coverage

| Question | Coverage | Notes |
| --- | --- | --- |
| Q1 app-server local transport | Answered | Target Worker-owned stdio for product path; keep loopback WebSocket as probe/debug fallback; verify against installed Codex CLI before implementation. |
| Q2 missing `thread/turns/list` | Answered | Treat as experimental/generated-protocol issue; do not handwrite upstream request shape; use `thread/read(includeTurns=true)` for read-only MVP. |
| Q3 Worker HTTP stack | Answered with caveat | Hono is recommended at HTTP boundary; verify Node runtime/version claims before changing runtime policy. |
| Q4 read-only HTTP endpoints | Partial | Five-endpoint MVP is usable, but current OpenAPI paths need contract reconciliation. |
| Q5 streaming events | Answered | Worker must project app-server notifications to stable events and generate `seq/eventId`; Web must reconcile snapshots. |
| Q6 start/resume/turn lifecycle | Answered | Start, follow-up, and steer are distinct user intents; do not collapse app-server `sandbox` / `sandboxPolicy` / `permissions`. |
| Q7 approval lifecycle | Answered | Approval is server-initiated JSON-RPC request/response; Worker needs Registry, CAS, idempotency, and redacted logging. |
| Q8 interrupt/steer races | Partial | Enough to design fail-closed API, but current Codex version needs local integration validation. |
| Q9 device pairing | Answered | Use one-time pairing, Worker-generated identity, reverse connection, token rotation; Control Plane stores public identity only. |
| Q10 DB stack | Answered | Default direction is SQLite + Drizzle in `packages/db`; driver choice still needs Q14. |
| Q11 iOS contract | Partial | Adopt guardrails now; defer Swift generation, full sync, and mobile-specific implementation until iOS phase. |
| Q12 Worker installation | Answered | User-mode Worker first; macOS LaunchAgent / Windows Scheduled Task / Linux systemd user; self-update later. |
| Q13 E2E / Playwright | Answered | Introduce Playwright when the first interactive vertical user flow exists; keep Node/API integration as the main verification layer. |
| Q14 DB driver selection | Answered | Stage 7 default is `better-sqlite3`; keep driver behind `packages/db`; verify native install/build on OS/Node/pnpm matrix. |
| Q15 reverse connection transport | Answered | Default WSS reverse connection; add app-level `msg_id/seq/ack/lease/resume/credit`; SSE+HTTP fallback, gRPC optional. |
| Q16 device-bound token MVP | Partial | DPoP-compatible direction is strong, but MVP scope needs Stage 6 threat model and implementation validation. |
| Q17 secret storage | Answered | Default OS keyring through thin `SecretStore`; explicit POSIX 0600 file fallback for headless; provider secrets excluded. |
| Q18 app-server session lifecycle | Answered | Worker should use initialized long-lived app-server sessions; per-HTTP-request app-server connections are not suitable for approval/control. |
| Q19 public project identity | Answered | Public project ids must be opaque; `allowedProjectRoot`, cwd, basename, and absolute paths are Worker-local implementation details. |
| Q20 Worker-owned app-server transport | Answered | Stage 9 default target is stdio; loopback WebSocket is explicit debug fallback only. |
| Q21 real command/control compatibility | Answered by local verification | Stage 9 real-check records start, follow-up, interrupt, and steer as `real-pass`; steer requires public active-turn proof from a safe independent sample. |
| Q22 safe active turn and pending approval | Partial | Approval pending list is real; Stage 10 isolated fixture exists but current app-server runs still do not emit a safe pending approval, so approval decision remains a documented safety `real-gap`. |
| Q23 `thread/list(cwd)` scope and pagination | Answered by local verification | Current Stage 9 Worker probe proves exact-cwd list and cursor-drain pagination for the configured project root; multi-root/worktree/path-alias matrix remains future scope. |
| Q24 degraded versus empty data | Answered by local verification | Stage 9 fixtures distinguish healthy empty data from dependency failure; all-workers-down and invalid-worker-token do not return `200 []` for conversations. |
| Q25 real Web E2E gate | Answered | Stage 9 needs a minimal browser smoke; HTTP-only `real:check` is not sufficient for Web readiness. |
| Q26 calibration report and secret scanning | Answered | Default real-check artifacts belong in ignored `logs/real-check/`; tracked docs should contain only explicit sanitized evidence. |
| Q27 task link integrity | Answered | Control Plane must validate resources and project ownership before storing verified task links; offline Worker checks may remain pending. |
| Q28 local self-hosted asset policy | Answered | Runtime external font/static asset requests should be disallowed; use system fonts or vendored local assets. |

## Adopted Planning Decisions

Stage 2 Worker HTTP API Read-only MVP:

- Use Hono only at the HTTP boundary.
- Keep handlers framework-independent.
- Do not expose raw app-server JSON-RPC.
- Use these candidate endpoints:
  - `GET /v1/worker/health`
  - `GET /v1/worker/capabilities`
  - `GET /v1/worker/probe`
  - `GET /v1/conversations`
  - `GET /v1/conversations/{conversationId}/timeline`
- Use `thread/read(includeTurns=true)` for timeline MVP.
- Treat `thread/turns/list` as optional experimental capability until generated protocol and runtime support are verified.
- Keep stage non-goals: no DB, stream, write operations, approval, or multi-device routing.

Future write / stream / control stages:

- Worker generates stable `seq/eventId` for Web-facing events.
- Web timeline reducer must handle duplicate, late, and snapshot events.
- Start conversation and follow-up are separate contract operations.
- Steer is not follow-up and must require `expectedTurnId`.
- Approval must go through a Worker registry with CAS/idempotency.
- Interrupt/steer must be serialized per thread and fail closed.

Future multi-device / DB / productization stages:

- Pairing uses short-lived one-time code / QR flow and Worker-generated device identity.
- Worker connects outbound to Control Plane; avoid exposing Worker inbound ports.
- Control Plane stores public device identity, routing/status/audit, and token/cert metadata only.
- DB default direction is SQLite + Drizzle; schema lives under `packages/db/src/schema`.
- Worker productization starts with user-mode service; system service and auto-update are later.
- iOS constraints are API guardrails now, not an implementation scope expansion.
- Playwright should start as a small smoke suite at the first interactive vertical slice, not as a broad UI test suite now.
- Stage 7 DB driver default is `better-sqlite3`, isolated behind `packages/db`; `@libsql/client` waits for real remote/sync/libSQL needs.
- Stage 6 reverse connection default is Worker outbound WSS plus application-level ack/lease/resume/backpressure.
- Device-bound auth should be sender-constrained and DPoP-compatible as a long-term direction, but Stage 6 must first define a threat model.
- Worker device identity secrets default to OS keyring; Linux/headless file fallback must be explicit opt-in and permission-checked.

Stage 9 real local calibration:

- Use one initialized long-lived app-server session first; split read pools only if measured contention appears.
- Project discovery must not depend on existing conversations and must not expose raw local paths.
- The Stage 9 single-project id may be a simple opaque local id such as `local-project`; future multi-root support needs a persistent project binding table.
- Control Plane must not catch Worker failures and return `200 []` for required local project/conversation data.
- `pnpm real:check` must record Q21-Q24 results as `real-pass`, `fixed-pass`, or `real-gap`.
- Q23 readiness evidence must come from the Control Plane device-scoped Worker probe. `thread/list cwd scope` requires `exactCwdListProven=true`; `thread/list pagination` requires `completedUntilNextCursorNull=true` plus sanitized page/count evidence.
- Q22 approval decision remains excluded from product-ready claims. Stage 10 added an isolated fixture, but latest real evidence still records `approval_fixture_no_pending_request`; automatic accept, persistent policy amendment, and production approval safety model remain out of scope.
- Add a minimal browser smoke to prove Web env wiring, source banners, start UI, network accept, and DOM transition.
- Store full real-check artifacts in ignored `logs/real-check/`; only sanitized evidence summaries may enter tracked docs.
- Web readiness includes no runtime external font/static asset requests.

## Source Gaps And Local Verification Needed

- Imported answers are ChatGPT exports. Critical conclusions must be verified against first sources before implementation.
- Codex app-server behavior must be verified against the exact Codex CLI version used by this project.
- `thread/turns/list` experimental support requires generated protocol and runtime opt-in validation.
- Q8 interrupt/steer race behavior needs local integration tests.
- Hono recommendation does not require a new global stack rule; it is only approved for Worker HTTP boundary.
- Q11 should not expand current OpenAPI into full mobile sync/artifact APIs.
- `better-sqlite3` and keyring backends are native/platform-sensitive and need OS/Node/pnpm CI validation before productization.
- WSS transport does not provide durable delivery by itself; the project must define message ack, lease, generation fencing, replay, and backpressure.
- DPoP-like auth must not be half-implemented; partial custom signing can be worse than a simpler bearer-token MVP with clear limitations.
- Linux Secret Service/headless behavior must be verified locally; file fallback is a conscious security tradeoff, not a default.
- Q21, Q23, and Q24 are locally verified for the current Stage 9 stack. Q22 remains partial: approval pending list is real, while approval decision is a documented safety `real-gap`; the Stage 10 isolated fixture currently does not receive a pending approval from app-server.
- If the Worker still depends on loopback WebSocket for self-started app-server, that is a Stage 9 readiness gap unless it is explicitly marked as debug fallback.
- Current `RemoteProject.path` compatibility must not be used to expose `allowedProjectRoot`; schema cleanup should be scheduled if implementation still requires the field.

## New Research Questions

None. Remaining work belongs in phase specs and local verification checklists.
