# Codex Remote Research Queue

## Purpose

`QUESTIONS.md` tracks open research questions only. Completed prompts and imported answers live under `docs/references/questions/`.

When new research changes architecture, update:

- `PLAN.md` for roadmap, risks, and stage status.
- `PROJECT_STRUCTURE.md` when directory ownership or dependency direction changes.
- `docs/references/questions/SYNTHESIS.md` for research conclusions.
- Relevant Superpowers spec/plan before implementation.

## Current Status

Q1-Q17 are complete enough for the earlier architecture stages.

Stage 9 reopened a narrower research queue: the unresolved questions are not broad product research, but real local verification and technical-choice checks required before claiming `Web -> Control Plane -> Worker -> Codex app-server` is operational.

## Imported Answers

| Question | Answer file | Status |
| --- | --- | --- |
| Q1 | `docs/references/questions/q01-codex-app-server-local-transport.md` | answered |
| Q2 | `docs/references/questions/q02-thread-turns-list-protocol-gap.md` | answered |
| Q3 | `docs/archives/references/questions/q03-worker-http-api-stack.md` | answered; archived, verify runtime claims before implementation |
| Q4 | `docs/references/questions/q04-worker-readonly-http-api-endpoints.md` | partial; reconcile with API contract during Stage 2 spec |
| Q5 | `docs/references/questions/q05-app-server-streaming-events.md` | answered |
| Q6 | `docs/references/questions/q06-thread-start-resume-turn-start.md` | answered |
| Q7 | `docs/references/questions/q07-approval-request-lifecycle.md` | answered |
| Q8 | `docs/archives/references/questions/q08-turn-interrupt-steer-races.md` | partial; archived, local integration validation needed |
| Q9 | `docs/references/questions/q09-control-plane-auth-device-pairing.md` | answered |
| Q10 | `docs/archives/references/questions/q10-db-stack-selection.md` | answered; archived, superseded by Q14 driver detail |
| Q11 | `docs/references/questions/q11-ios-api-contract-constraints.md` | partial adopt; guardrails now, iOS implementation later |
| Q12 | `docs/references/questions/q12-device-worker-installation-management.md` | answered |
| Q13 | `docs/archives/references/questions/q13-e2e-playwright-introduction.md` | answered; archived, timing absorbed into PLAN |
| Q14 | `docs/references/questions/q14-db-driver-selection.md` | answered |
| Q15 | `docs/references/questions/q15-control-plane-reverse-connection-transport.md` | answered |
| Q16 | `docs/references/questions/q16-device-bound-token-mvp.md` | partial/adopt with caution; Stage 6 threat model required |
| Q17 | `docs/references/questions/q17-cross-platform-secret-storage.md` | answered |

## Open Stage 9 Research Questions

### Q18. Worker app-server session lifecycle and initialization

- Context: Real app-server requests may require an `initialize` / `initialized` handshake before `thread/list`, `thread/start`, or `turn/start`.
- Reason: Current Worker sessions connect and then issue requests; approval observers also need a stable session.
- Direction: Prefer local Codex CLI/app-server behavior, current `codex app-server --help`, and generated protocol types over older notes.
- Desired result: Decide whether Worker owns one initialized long-lived session, initializes per HTTP request, or uses a small session pool.
- Blocks: Worker runtime design, reconnect behavior, approval listening, and real-read/write calibration.

### Q19. Public project identity and project discovery

- Context: Web needs a project before starting a conversation, but current Web derives projects from conversations and real Worker projection may omit `projectId`.
- Reason: Empty real conversation lists cannot support start-conversation unless `/v1/projects` exists and exposes a stable project id.
- Direction: Verify whether `projectId` should be an opaque id, basename, app-server `cwd`, or another safe value; avoid exposing private paths unless explicitly required.
- Desired result: Define `RemoteProject.id`, `RemoteProject.path`, conversation `projectId`, and task-link project semantics from one source of truth.
- Blocks: `/v1/projects`, start conversation UI, task linking, and future multi-root support.

### Q20. Owned app-server transport choice

- Context: Project docs point to stdio as the target/default direction, while current Worker self-start uses loopback WebSocket.
- Reason: WebSocket is documented as experimental, but stdio changes lifecycle, logging, and process supervision.
- Direction: Spike list/start/follow-up over stdio and loopback WebSocket with the installed Codex CLI.
- Desired result: Pick the Worker-owned transport for Stage 9 and document the fallback/debug posture.
- Blocks: local stack scripts, productization path, installer/service design, and failure recovery.

### Q21. Real command/control protocol compatibility

- Context: Stage 3-8 contract, Worker, Control Plane, and Web paths exist, but real Codex E2E is not proven.
- Reason: `thread/start`, `turn/start`, `turn/interrupt`, and `turn/steer` may have runtime constraints or protocol drift not caught by fake Worker smoke.
- Direction: Run the full local stack with `codex-remote-calibration` prompts and record `real-pass`, `fixed-pass`, or `real-gap`.
- Desired result: Confirm which start/follow-up/interrupt/steer capabilities can be exposed as real operations.
- Blocks: Web command controls, Stage 9 completion criteria, and roadmap wording.

### Q22. Safe active turn and pending approval scenarios

- Context: Interrupt, steer, and approval require a real active turn or pending approval.
- Reason: The project must not trigger destructive, file-changing, private-data, or broad permission approvals just to test UI.
- Direction: Use a disposable local repo and low-risk prompts; observe or reject approvals unless a safe accept path is explicitly proven.
- Desired result: Define the repeatable scenarios for active turn and pending approval, or mark them `real-gap`.
- Blocks: approval UI enablement, run-control visibility, and calibration report status.

### Q23. `thread/list(cwd=...)` scope and pagination behavior

- Context: Worker uses app-server `thread/list` with `cwd=allowedProjectRoot` and a bounded page scan.
- Reason: If app-server treats `cwd` as exact path only, child directory/worktree conversations may disappear; bounded scans may hide older real conversations.
- Direction: Create safe conversations in repo root, a subdirectory, and a worktree; query by each cwd and with enough pagination.
- Desired result: Decide exact cwd matching rules, page limits, and whether project discovery needs multiple roots.
- Blocks: read-only inventory, follow-up/control authorization, and project sidebar accuracy.

### Q24. Control Plane degraded versus empty-data semantics

- Context: Control Plane currently can aggregate Worker failures into empty lists.
- Reason: Web must distinguish "real empty project" from "Worker unavailable" and from fallback/example data.
- Direction: Run with healthy, unreachable, and invalid-token Workers; compare `/v1/control-plane/health`, `/v1/devices`, and `/v1/conversations`.
- Desired result: Define response/error semantics for all-workers-down and partial-device failure.
- Blocks: Web source taxonomy, fallback banner, empty states, and multi-device readiness.

### Q25. Real Web E2E gate and Playwright decision

- Context: An HTTP-only `real:check` can prove Control Plane endpoints but not Web env wiring, fallback banners, start UI, or DOM states.
- Reason: The Stage 9 goal includes Web behavior, and manual Chrome smoke is easy to stale.
- Direction: Compare a minimal Playwright smoke against a no-new-dependency browser check; only add Playwright if it materially reduces false readiness.
- Desired result: Decide whether `pnpm real:check` includes a Web E2E smoke and which tool owns it.
- Blocks: final Stage 9 verification and product readiness wording.

### Q26. Calibration report destination and secret scanning

- Context: A real calibration report may include local ids, sanitized errors, and timestamps.
- Reason: Writing reports into tracked docs can dirty the worktree and may bypass current secret/leak scanning if scan paths are too narrow.
- Direction: Run one sanitized report into `logs/` and one into docs in a scratch branch; inspect contents and product-readiness scan coverage.
- Desired result: Decide whether real reports default to `logs/`, stdout, or tracked `docs/references/`, and update scan scope accordingly.
- Blocks: `pnpm real:check` side effects, commit hygiene, and leakage controls.

### Q27. Task link integrity checks

- Context: Web guards task linking with selected conversation metadata, but API clients can still submit arbitrary ids unless Control Plane validates them.
- Reason: Task board persistence should not silently store links to nonexistent device/conversation/project triples.
- Direction: Call task-link APIs with missing device, missing conversation, missing project, and stale conversation ids.
- Desired result: Decide whether Control Plane must validate links against Worker/project discovery or intentionally allow external references.
- Blocks: task board data integrity, future iOS/API behavior, and calibration task-link pass criteria.

### Q28. Local self-hosted external asset policy

- Context: UI styling currently may load external font assets.
- Reason: A local self-hosted control surface should have a clear offline/external-request posture.
- Direction: Run Web offline or with network blocked and inspect font/asset requests.
- Desired result: Decide whether to vendor fonts, use system fonts, or allow documented external font requests.
- Blocks: product readiness claims and self-hosted security posture.

Summary and adopted decisions:

- `docs/references/questions/SYNTHESIS.md`
- `docs/references/development-context.md`
- `PLAN.md`

Archived process material:

- `docs/archives/references/questions/research-prompts-archive.md`
- `docs/archives/references/questions/import*.json`

## Local Verification Backlog

These are not broad research questions. Stage 9-critical items have been promoted to Q18-Q28 above; keep the remaining items with their later stage specs before coding:

- Verify whether generated protocol and local runtime support `thread/turns/list`.
- Verify Node runtime and Hono assumptions for the Worker HTTP boundary.
- Verify official Codex App Windows sandbox, worktree, and local environment behavior against this project's target platforms.
- Reconcile Stage 2 read-only endpoint design with `packages/api-contract/openapi.yaml`.
- Validate `better-sqlite3` native install/build matrix before Stage 7 DB commitment.
- Validate OS keyring and Linux/headless fallback behavior before Worker productization.
- Define Stage 6 threat model before implementing device-bound token.

## Adding New Questions

Add a new question only when local verification or phase design cannot answer it.

Each new question must include:

- Context: enough project background to be understood standalone.
- Reason: what decision the answer will unblock.
- Direction: preferred source types, ideally official docs/source/release notes.
- Desired result: the exact decision or artifact expected from the research.
