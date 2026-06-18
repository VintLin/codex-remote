# Web Source Directory Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/web/src` by responsibility while avoiding hardcoded machine paths and keeping existing Web behavior unchanged.

**Architecture:** Keep Web as one app package, but separate pure domain projection, demo data sources, UI components, and source-contract tests. Do not introduce Worker or Control Plane implementation in this refactor.

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
- Move demo data and fixture adapter into `apps/web/src/data/app-server/*`
- Keep fixture JSON under `apps/web/src/data/app-server/fixtures/*`

- [ ] Move `appLayout`, `sidebarModel`, `assistantTimeline`, and app-server snapshot types into domain folders.
- [ ] Move `appServerMockAdapter`, `mockData`, and app-server fixture JSON into data folders.
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
