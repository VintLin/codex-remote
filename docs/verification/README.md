# Verification

Verification matrix, regression cases, and real-link calibration records.

Deferred files:

- `feature-test-matrix.md`: deferred until a stage produces an acceptance matrix that maps each `docs/features/*.md` row to a test path.
- `regression-cases.md`: deferred.
- `real-checks.md`: deferred.

Until populated, see:

- `scripts/real-local-calibration.mjs` and its output under `logs/real-check/`
- `scripts/product-readiness-check.mjs` and its output under `logs/`
- `docs/features/<id>-<slug>.md` 中的测试字段，记录每个能力对应的测试路径

## Current Known Real-Gap

Approval decision remains the known real-gap: the isolated approval fixture exists, but the current real app-server run has not produced a safe pending approval sample for decision acceptance. Do not claim approval decision is product-ready until a later stage records real evidence here.

When to populate:

- After Stage 16 lands its first capability, add a `feature-test-matrix.md` row for each new `docs/features/*.md` entry that requires an end-to-end check.
- When Stage 16 introduces a regression scenario, add a `regression-cases.md` entry.
- When real local calibration changes (new evidence file, new `real-gap`), append to `real-checks.md`.
