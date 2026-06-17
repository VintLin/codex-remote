# Documentation Canonicalization Design

## Goal

Create a clean documentation surface for the Codex Remote project by keeping three current, canonical documents and archiving prior iteration drafts.

The final structure should make it clear which documents are authoritative for product intent, technical design, and implementation sequencing, while preserving historical versions for traceability.

## Current Context

The repository currently contains several overlapping documentation generations:

- Product intent lives mainly in `docs/多设备 Codex 控制台 PRD v0.1.md`.
- The most complete technical specification is `docs/specs/多设备 Codex 控制台 技术规格 v0.3.md`.
- The most complete implementation plan is `docs/plans/从零到一准备计划 v0.2.md`.
- Earlier plan and spec versions remain in active folders.
- Research evidence lives under `docs/references/research/`.
- Official OpenAI Codex App reference pages are stored under `docs/references/openai-codex-app-pages/`.
- `PRODUCT.md` and `DESIGN.md` exist at the repository root as untracked product/design source material.

## Canonical Documents

The organized documentation set will keep three authoritative documents:

1. `docs/specs/多设备 Codex 控制台 PRD.md`
2. `docs/specs/多设备 Codex 控制台 技术规格.md`
3. `docs/plans/从零到一实施计划.md`

The PRD describes product intent, users, goals, non-goals, scenarios, MVP scope, and priority.

The technical specification describes system boundaries, facts sources, architecture, package dependency direction, security boundaries, data model, Worker connection flow, Worker API, app-server mapping, Web MVP requirements, iOS extension boundaries, and risks.

The implementation plan describes the staged delivery sequence, validation criteria, and the current-state checks needed before treating existing untracked scaffold files as usable project foundation.

## Source Mapping

### PRD

Use `docs/多设备 Codex 控制台 PRD v0.1.md` as the primary source.

Use `PRODUCT.md` for product purpose, target users, brand personality, anti-references, and design principles.

The final PRD should keep product-facing material and avoid duplicating detailed TypeScript-like data models that belong in the technical specification.

### Technical Specification

Use `docs/specs/多设备 Codex 控制台 技术规格 v0.3.md` as the primary source.

Keep v0.3 decisions around:

- Control Plane, Worker, Web, DB, and Codex app-server boundaries.
- `packages/codex-protocol`, `packages/api-contract`, and `packages/db` as separate fact sources.
- Secrets and network exposure constraints.
- Pairing, Worker local config, heartbeat, audit log, and app-server method mapping.
- Worker probe and Web MVP acceptance criteria.

Add a short evidence section linking to research and official reference sources instead of copying their contents into the spec.

### Implementation Plan

Use `docs/plans/从零到一准备计划 v0.2.md` as the primary source.

Keep the stage order, but include a first current-state verification step because the repository now has untracked Turborepo, Web, and UI files. The plan must not assume those files are valid until verification runs.

## Archive Plan

Move absorbed iteration drafts into archive folders:

- `docs/多设备 Codex 控制台 PRD v0.1.md` to `docs/archives/specs/多设备 Codex 控制台 PRD v0.1.md`
- `docs/specs/多设备 Codex 控制台 技术规格 v0.2.md` to `docs/archives/specs/多设备 Codex 控制台 技术规格 v0.2.md`
- `docs/specs/多设备 Codex 控制台 技术规格 v0.3.md` to `docs/archives/specs/多设备 Codex 控制台 技术规格 v0.3.md`
- `docs/plans/从零到一准备计划 v0.1.md` to `docs/archives/plans/从零到一准备计划 v0.1.md`
- `docs/plans/从零到一准备计划 v0.2.md` to `docs/archives/plans/从零到一准备计划 v0.2.md`
- `docs/plans/参考项目架构调研计划 v0.1.md` to `docs/archives/plans/参考项目架构调研计划 v0.1.md`

Do not archive research or external reference material:

- `docs/references/research/参考项目架构调研报告 v0.2.md`
- `docs/references/research/参考项目技术调研 v0.1.md`
- `docs/references/codex-app-server.md`
- `docs/references/openai-codex-app-pages/`
- `docs/references/可参考内容.md`

## Non-Goals

This work does not implement application code, refactor packages, change build tooling, or validate the current untracked scaffold.

This work does not delete `PRODUCT.md` or `DESIGN.md`. They are input material only unless a later implementation plan explicitly decides where they belong.

This work does not resolve unrelated dirty worktree state such as deleted generated HTML, `.turbo/`, `node_modules/`, or untracked application files.

## Validation

After the documentation cleanup is implemented:

- `docs/specs/` contains only the canonical PRD and technical specification.
- `docs/plans/` contains only the canonical implementation plan.
- `docs/archives/specs/` contains absorbed historical PRD/spec versions.
- `docs/archives/plans/` contains absorbed historical plan versions.
- References remain under `docs/references/`.
- The three canonical documents reference each other without duplicating the same data model or architecture text.
- A search for old active-version document titles under `docs/specs` and `docs/plans` does not find obsolete active files.
- `git status --short` clearly separates documentation cleanup changes from pre-existing unrelated worktree state.

## Risks

Root-level `PRODUCT.md` and `DESIGN.md` are untracked. The cleanup must avoid moving or deleting them until the user explicitly approves that scope.

Existing untracked implementation files may already represent progress beyond the old plan. The canonical implementation plan should call for verification before marking any stage complete.

Moving historical documents can break direct links to their old paths. The canonical documents should provide stable new entry points.
