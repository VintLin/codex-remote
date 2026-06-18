# Web Source Directory Reorganization Implementation Plan

> Superseded note (2026-06-18): the Web raw app-server fixture adapter described below has been removed by the contract source-of-truth work. Web demo data should stay API-contract-shaped; future raw app-server projection belongs in `apps/worker` through `@codex-remote/codex-protocol`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/web/src` by responsibility while avoiding hardcoded machine paths and keeping existing Web behavior unchanged.

**Architecture:** Keep Web as one app package, but separate pure UI/domain presentation, API-shaped demo data sources, UI components, and source-contract tests. Do not introduce Worker or Control Plane implementation in this refactor.

**Tech Stack:** TypeScript, Next.js, Node built-in test runner, pnpm, Turborepo.

---

### Task 1: Add Source Path Discipline Test

**Files:**
- Create: `apps/web/src/contracts/sourcePathDiscipline.test.ts`
- Create: `apps/web/src/test-support/sourcePaths.ts`

- [ ] Add a failing contract test that scans Web source files and rejects hardcoded local absolute paths and direct `process.cwd()` source path composition in tests.
- [ ] Add a shared helper for tests that need to read source files by repository-relative path.
- [ ] Update source-level tests to use the helper.

### Task 2: Move Web Domain and Data Files

**Files:**
- Move pure logic into `apps/web/src/domain/*`
- Move API-shaped demo data into `apps/web/src/data/app-server/*`

- [ ] Move `appLayout`, `sidebarModel`, and `assistantTimeline` into domain folders.
- [ ] Move `mockData` into data folders without Web-owned raw app-server fixture JSON.
- [ ] Update imports without changing behavior.

### Task 3: Move Component Files by UI Responsibility

**Files:**
- Move shell components into `apps/web/src/components/shell/*`
- Move sidebar components into `apps/web/src/components/sidebar/*`
- Move conversation components into `apps/web/src/components/conversation/*`
- Move detail components into `apps/web/src/components/detail/*`
- Move shared icons into `apps/web/src/components/shared/*`

- [ ] Move files.
- [ ] Update imports and source-contract test paths.
- [ ] Keep component APIs unchanged.

### Task 4: Verify

- [ ] Run `pnpm --filter @codex-remote/web test`.
- [ ] Run `pnpm --filter @codex-remote/web typecheck`.
- [ ] Run `pnpm --filter @codex-remote/web build`.
