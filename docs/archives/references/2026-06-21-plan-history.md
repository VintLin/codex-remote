# PLAN.md Archived Stage History

Date: 2026-06-21

This archive captures historical material removed from the root `PLAN.md` cleanup. Root `PLAN.md` should stay a live route/status document; detailed completed-stage evidence belongs in archives, stage specs/plans, or reference docs.

## Archived Stage Evidence

### Stage 9: Real Local Codex Calibration

- Fake Worker smoke was kept only as UI/contract/fallback evidence, not real readiness.
- Worker-owned `stdio` app-server lifecycle became the default real path.
- `pnpm real:start`, `pnpm real:status`, `pnpm real:check`, and `pnpm web:e2e:smoke` provided real local evidence for the Web -> Control Plane -> Worker -> app-server chain.
- `real:check` reached `total=19 realPass=18 fixedPass=0 realGap=1`.
- Fixed areas included invalid task link rejection, degraded-vs-empty behavior, Worker-specific conversation proof, safer steer/interrupt samples, cwd scope/pagination probes, and prompt-preview redaction.
- Remaining documented safety gap: approval decision had no safe real pending approval. Approval accept, policy amendment, and production approval model stayed out of scope.
- Output streaming stayed out of scope.

Primary archived docs:

- `docs/archives/specs/2026-06-20-real-local-codex-calibration-design.md`
- `docs/archives/plans/2026-06-20-real-local-codex-calibration.md`

### Stage 10: Isolated Approval Fixture

- Implemented Worker calibration runtime flag, isolated approval fixture process orchestration, sanitized fixture checks, and decline-only decision path without public contract changes.
- Real stack and web smoke passed, but `approval decision` remained `real-gap` because the fixture did not produce a safe pending approval within the bounded window.
- Tested safer variants including workspace-write/on-request, read-only/on-request, read-only/untrusted, stdout-only command prompt, and generated-protocol `approvalsReviewer: "user"`.
- Retained read-only/on-request with user-routed approvals.
- Did not add automatic accept, `acceptForSession`, policy amendment, production approval model, user-layer rules edit, or auth-copying path.

Primary archived docs:

- `docs/archives/specs/2026-06-21-isolated-approval-fixture-design.md`
- `docs/archives/plans/2026-06-21-isolated-approval-fixture.md`

### Stage 11 Pre-Consensus Attempt

- Pre-consensus Stage 11 added lifecycle/API work for open/resume, archive/unarchive, rename, loaded/live, timeline events, and approval cards.
- Product review found the UI shape was wrong: debug-like Start/Interrupt/Steer strips, archived rows in normal sidebar, missing message action row, incomplete timeline content, and unconfirmed permission behavior.
- The work is now reference evidence only, not completion evidence.

Primary archived docs:

- `docs/archives/specs/2026-06-21-conversation-workbench-parity-design-pre-consensus.md`
- `docs/archives/plans/2026-06-21-conversation-workbench-parity-pre-consensus.md`
- `docs/references/2026-06-21-feature-support-ui-audit.md`

## Archived Research Summary

Earlier root `PLAN.md` carried Q1-Q33 research rows inline. The active source is now `docs/references/questions/`.

Retained conclusions:

- Q1-Q4: Worker HTTP read-only MVP used Hono, read-only endpoints, and `stdio` target transport.
- Q5-Q8: write/control paths separated start, follow-up, steer, interrupt, stream envelope, and approval registry concerns.
- Q9-Q17: multi-device, DB, iOS, reverse connection, device auth, and secret storage decisions informed later stages.
- Q18-Q28: real local calibration required `stdio` proof, opaque project ids, cwd isolation, real-check evidence, browser smoke, task-link validation, and no external runtime assets.
- Q29-Q33: Codex App-like roadmap prioritizes conversation workbench parity, then read-only local tools, then controlled actions, then runtime/extension management.

## Removed Stale Root Next-Step Note

The old root `PLAN.md` ended with completed Stage 4-8 evidence and outdated next-step notes. Current next step is Stage 11 plan Task 0 reconciliation.
