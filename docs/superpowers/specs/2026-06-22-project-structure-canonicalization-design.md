# Project Structure Canonicalization Design

Date: 2026-06-22

## Purpose

Align this repository with `/Users/Vint/Memory/references/Project Structure.md` by moving non-code facts into `docs/`, splitting mixed roadmap documents into single-purpose facts, and removing long-lived root roadmap files.

This is a documentation-structure change only. It does not change application behavior, API contracts, generated protocol types, UI code, Worker behavior, Control Plane behavior, or package boundaries.

## Decisions

- Keep only `AGENTS.md` and `PROJECT_STRUCTURE.md` as root documentation entrypoints.
- Do not keep `PLAN.md` as `docs/PLAN.md`; split it by responsibility.
- Do not keep `CODEX_APP_PARITY.md` as a new roadmap file; split it by responsibility.
- Move product, design, feature support, research, contracts, verification, and architecture-decision facts under `docs/`.
- Do not create placeholder `CHANGELOG.md`, `releases/`, or `tests/`.
- Do not create compatibility copies for old root files, because that would create duplicate facts.

## Target Shape

```text
AGENTS.md
PROJECT_STRUCTURE.md

docs/
  README.md
  PRODUCT.md
  DESIGN.md
  FEATURE_INDEX.md
  features/
  adr/
  contracts/
  verification/
  references/
    README.md
    RESEARCH.md
    development-context.md
  superpowers/
    specs/
    plans/
  archives/
    specs/
    plans/
    references/
```

## `PLAN.md` Split

- Move total product goal, current product subgoal, and stable architecture principles into `docs/PRODUCT.md`.
- Move current stage/capability status into `docs/FEATURE_INDEX.md`.
- Move short current-state navigation and next-step entry into `docs/README.md`.
- Move latest verification summary, real-link evidence entrypoints, and known real-gaps into `docs/verification/README.md`.
- Move completed-stage detail, long evidence paragraphs, old roadmap narrative, and historical notes into `docs/archives/references/2026-06-22-plan-history.md`.
- Delete root `PLAN.md` after active facts have a new owner.

## `CODEX_APP_PARITY.md` Split

- Move the Codex App-like browser workbench subgoal, direction, and capability-design rules into `docs/PRODUCT.md`.
- Use `docs/FEATURE_INDEX.md` as the only current support matrix for capability status, stage, feature spec, and test coverage.
- Move UI support surfaces and required UI states into `docs/DESIGN.md`.
- Move Q29-Q33 research links and adopted guardrails into `docs/references/RESEARCH.md`.
- Archive deprecated direction and historical narrative under `docs/archives/references/`.
- Delete root `CODEX_APP_PARITY.md` after active facts have a new owner.

## Other Root Document Moves

- Move `PRODUCT.md` to `docs/PRODUCT.md`.
- Move `DESIGN.md` to `docs/DESIGN.md`.
- Move `QUESTIONS.md` to `docs/references/RESEARCH.md`.
- Move or keep the former `FEATURE_SUPPORT.md` only as archived source material under `docs/archives/references/`; current feature status lives in `docs/FEATURE_INDEX.md`.

## Reference Update Rules

- Update active files and scripts to point at the new locations.
- Do not mass-edit `docs/archives/**`; archived files may preserve historical paths.
- Update `AGENTS.md`, `PROJECT_STRUCTURE.md`, `docs/README.md`, `docs/references/README.md`, and `docs/contracts/README.md` so the source-of-truth hierarchy is internally consistent.
- If a script or test checks root document paths, update it to the new `docs/` paths.

## Non-Goals

- No application source reorganization.
- No package boundary changes.
- No API, DB, generated protocol, or UI behavior changes.
- No feature spec rewrites beyond path/reference corrections needed for this migration.
- No new roadmap directory unless a later stage proves a real need.

## Verification

- `rg` over active files should find no live references to root `PLAN.md`, `PRODUCT.md`, `DESIGN.md`, `CODEX_APP_PARITY.md`, `QUESTIONS.md`, or `FEATURE_SUPPORT.md`.
- `git status --short` should show those old root files removed or renamed, not duplicated.
- `pnpm product:check` should pass after its document path checks are updated.
- Run the smallest relevant test for `scripts/product-readiness-check.mjs`; if package filtering is unavailable, run `pnpm test`.
- Run broader `pnpm lint` and `pnpm typecheck` only if implementation touches TypeScript, package config, or generated contract code.

## Acceptance Criteria

- Root documentation contains only `AGENTS.md` and `PROJECT_STRUCTURE.md`.
- `docs/README.md` explains where to start and owns the source-of-truth priority table.
- `docs/PRODUCT.md` owns product goals, scope, non-goals, and Codex App-like workbench direction.
- `docs/DESIGN.md` owns design tokens, support surfaces, and required UI states.
- `docs/FEATURE_INDEX.md` owns current capability status.
- `docs/references/RESEARCH.md` owns research queue, imported-answer index, and adopted research guardrails.
- `docs/verification/README.md` owns current verification entrypoints and known real-gaps.
- `PLAN.md` and `CODEX_APP_PARITY.md` no longer exist as active files.
