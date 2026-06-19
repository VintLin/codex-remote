# Codex Remote Research Queue

## Purpose

`QUESTIONS.md` tracks open research questions only. Completed prompts and imported answers live under `docs/references/questions/`.

When new research changes architecture, update:

- `PLAN.md` for roadmap, risks, and stage status.
- `PROJECT_STRUCTURE.md` when directory ownership or dependency direction changes.
- `docs/references/questions/SYNTHESIS.md` for research conclusions.
- Relevant Superpowers spec/plan before implementation.

## Current Status

No new web research questions are open.

The previous Q1-Q17 research set is complete enough for the next architecture step. Remaining uncertainty should be handled as local verification inside the relevant stage spec, not as broad web research.

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

Summary and adopted decisions:

- `docs/references/questions/SYNTHESIS.md`
- `docs/references/development-context.md`
- `PLAN.md`

Archived process material:

- `docs/archives/references/questions/research-prompts-archive.md`
- `docs/archives/references/questions/import*.json`

## Local Verification Backlog

These are not broad research questions. Carry them into the appropriate stage spec before coding:

- Verify installed Codex CLI app-server transport behavior.
- Verify current Codex CLI transport/auth/approval/events behavior against `docs/references/codex-app-server.md`.
- Verify whether generated protocol and local runtime support `thread/turns/list`.
- Verify Node runtime and Hono assumptions for the Worker HTTP boundary.
- Verify official Codex App Windows sandbox, worktree, and local environment behavior against this project's target platforms.
- Reconcile Stage 2 read-only endpoint design with `packages/api-contract/openapi.yaml`.
- Validate interrupt / steer race behavior against a local app-server before implementing control APIs.
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
