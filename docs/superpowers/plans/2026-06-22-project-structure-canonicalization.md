# Project Structure Canonicalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Split root roadmap/parity documents into canonical `docs/` facts and remove long-lived root documentation except `AGENTS.md` and `PROJECT_STRUCTURE.md`.

**Architecture:** Keep code and package boundaries unchanged. Treat `docs/README.md`, `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/FEATURE_INDEX.md`, `docs/references/RESEARCH.md`, and `docs/verification/README.md` as the new active fact owners. Archive old mixed-purpose roadmap files after their active facts have owners.

**Tech Stack:** Markdown, pnpm, Node built-in test runner, existing `scripts/product-readiness-check.mjs`.

## Global Constraints

- Keep only `AGENTS.md` and `PROJECT_STRUCTURE.md` as root documentation entrypoints.
- Do not keep `PLAN.md` as `docs/PLAN.md`; split it by responsibility.
- Do not keep `CODEX_APP_PARITY.md` as a new roadmap file; split it by responsibility.
- Move `QUESTIONS.md` to `docs/references/RESEARCH.md`.
- Do not create compatibility copies for old root files.
- Do not create unused `CHANGELOG.md`, `releases/`, or `tests/`.
- Do not change application behavior, API contracts, generated protocol types, UI code, Worker behavior, Control Plane behavior, or package boundaries.
- Do not mass-edit `docs/archives/**`; archived files may preserve historical paths.

---

## File Structure

Files to rename:

- `PRODUCT.md` -> `docs/PRODUCT.md`
- `DESIGN.md` -> `docs/DESIGN.md`
- `QUESTIONS.md` -> `docs/references/RESEARCH.md`
- `PLAN.md` -> `docs/archives/references/2026-06-22-plan-history.md`
- `CODEX_APP_PARITY.md` -> `docs/archives/references/2026-06-22-codex-app-parity-history.md`

Files to modify:

- `AGENTS.md`: point agents to the new source-of-truth paths.
- `PROJECT_STRUCTURE.md`: remove root fact owners and document the strict target shape.
- `docs/README.md`: own source-of-truth priority, current-state entrypoint, and next-step entrypoint.
- `docs/PRODUCT.md`: own product goals, scope, non-goals, architecture principles, and Codex App-like workbench direction.
- `docs/DESIGN.md`: own design tokens, UI support surfaces, and required UI states.
- `docs/FEATURE_INDEX.md`: own current capability status and archived support-matrix source.
- `docs/features/*.md`: replace live `FEATURE_SUPPORT.md` references with the archived support snapshot path.
- `docs/references/README.md`: point active readers to `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/README.md`, and `docs/references/RESEARCH.md`.
- `docs/references/RESEARCH.md`: own research queue, imported-answer index, local verification backlog, and Q29-Q33 adopted guardrails.
- `docs/references/development-context.md`: replace active `CODEX_APP_PARITY.md` path with `docs/PRODUCT.md` and `docs/FEATURE_INDEX.md`.
- `docs/contracts/README.md`: keep contract index language consistent with new docs hierarchy.
- `docs/verification/README.md`: own current verification entrypoints and known real-gaps.
- `scripts/product-readiness-check.mjs`: scan canonical docs under `docs/` instead of deleted root docs.
- `scripts/product-readiness-check.test.mjs`: add a regression test proving canonical docs are scanned.

Files to leave alone unless a direct active reference needs a one-line fix:

- `apps/**`
- `packages/**`
- `docs/archives/**`
- `docs/references/questions/**`
- `docs/references/2026-06-21-feature-support-ui-audit.md`

---

### Task 1: Move Root Facts To Canonical Owners

**Files:**
- Rename: `PRODUCT.md` -> `docs/PRODUCT.md`
- Rename: `DESIGN.md` -> `docs/DESIGN.md`
- Rename: `QUESTIONS.md` -> `docs/references/RESEARCH.md`
- Rename: `PLAN.md` -> `docs/archives/references/2026-06-22-plan-history.md`
- Rename: `CODEX_APP_PARITY.md` -> `docs/archives/references/2026-06-22-codex-app-parity-history.md`

**Interfaces:**
- Consumes: existing root documents.
- Produces: canonical document paths used by Tasks 2-5.

- [x] **Step 1: Inspect current status before moving files**

Run:

```bash
git status --short --untracked-files=all
```

Expected: existing user/doc-structure changes may be present. Do not revert them.

- [x] **Step 2: Move root fact files**

Run:

```bash
git mv PRODUCT.md docs/PRODUCT.md
git mv DESIGN.md docs/DESIGN.md
git mv QUESTIONS.md docs/references/RESEARCH.md
git mv PLAN.md docs/archives/references/2026-06-22-plan-history.md
git mv CODEX_APP_PARITY.md docs/archives/references/2026-06-22-codex-app-parity-history.md
```

Expected: all five commands succeed. If `FEATURE_SUPPORT.md` already moved to `docs/archives/references/2026-06-22-feature-support-matrix-snapshot.md`, leave it there.

- [x] **Step 3: Verify root files no longer exist**

Run:

```bash
test ! -e PLAN.md && test ! -e PRODUCT.md && test ! -e DESIGN.md && test ! -e QUESTIONS.md && test ! -e CODEX_APP_PARITY.md
```

Expected: command exits `0`.

- [x] **Step 4: Verify canonical files exist**

Run:

```bash
test -f docs/PRODUCT.md
test -f docs/DESIGN.md
test -f docs/references/RESEARCH.md
test -f docs/archives/references/2026-06-22-plan-history.md
test -f docs/archives/references/2026-06-22-codex-app-parity-history.md
```

Expected: all commands exit `0`.

- [x] **Step 5: Commit the file moves**

Run:

```bash
git add PRODUCT.md DESIGN.md QUESTIONS.md PLAN.md CODEX_APP_PARITY.md docs/PRODUCT.md docs/DESIGN.md docs/references/RESEARCH.md docs/archives/references/2026-06-22-plan-history.md docs/archives/references/2026-06-22-codex-app-parity-history.md
git commit -m "Move root docs into canonical structure"
```

Expected: commit succeeds. If unrelated existing changes are staged, stop and unstage only those unrelated paths before committing.

---

### Task 2: Consolidate Active Facts Into New Documents

**Files:**
- Modify: `docs/PRODUCT.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/references/RESEARCH.md`
- Modify: `docs/README.md`
- Modify: `docs/verification/README.md`

**Interfaces:**
- Consumes: archived `docs/archives/references/2026-06-22-plan-history.md` and `docs/archives/references/2026-06-22-codex-app-parity-history.md`.
- Produces: active fact owners that later reference updates point to.

- [x] **Step 1: Add product-level architecture and Codex App-like direction to `docs/PRODUCT.md`**

Edit `docs/PRODUCT.md` so it contains these sections after `Product Purpose`:

````markdown
## Current Product Direction

Codex Remote remains a self-hosted multi-device Codex control plane. The current product direction is to make the Web workbench feel as close as practical to Codex App while preserving Codex Remote's primary goal: controlling multiple Codex instances across multiple computers.

## Architecture Boundaries

- `packages/api-contract/openapi.yaml` is the public API source of truth for Web, Worker, Control Plane, and future iOS-shaped clients.
- `packages/codex-protocol` is the generated Codex app-server protocol source of truth.
- `packages/db` schema is the persistence source of truth.
- `apps/worker` is the only app that directly connects to Codex app-server, local filesystem, Git, shell, and terminal capabilities.
- `apps/web` consumes only Control Plane-shaped public APIs.

## Codex App-like Workbench Direction

Each Codex App-like capability is designed as a product capability, not as a raw app-server method pass-through:

```text
Capability goal
  -> public API contract
  -> Control Plane routing/state
  -> Worker app-server/local adapter
  -> Web datasource
  -> Web domain model
  -> Web UI surface
  -> real local verification
```

Web and Control Plane do not pass through raw JSON-RPC, raw prompts, raw command output, raw diffs, raw local paths, provider secrets, or app-server URLs.
````

Expected: `docs/PRODUCT.md` owns product goals, scope, non-goals, architecture boundaries, and parity direction.

- [x] **Step 2: Add UI support surfaces to `docs/DESIGN.md`**

Append this section after the current component/support-surface discussion:

```markdown
## Product Support Surfaces

Every supported capability declares which Web support surface it uses before implementation.

| UI support surface | Use |
| --- | --- |
| Sidebar / Navigator | Device, project, conversation, task, or capability navigation |
| Main Conversation | Conversation timeline, follow-up, steer, interrupt, request cards |
| Right Detail Pane | Files, Git, approvals, runtime state, extension detail, account detail |
| Tool Surface | Shell, file browser, search, review, MCP tools, plugin management |
| Status Strip / Badges | Device, model, account, permission, connection, degraded, running, waiting states |
| Modal / Popover | Small choices, confirmations, configuration, and one-shot decisions |

Minimum UI states for every supported capability:

- Loading
- Loaded empty
- Loaded with data
- Degraded dependency
- Action pending
- Action accepted
- Action failed with sanitized error

Unsupported capabilities should be absent or explicitly disabled. Confirmed future affordances may remain visible as disabled controls, but they must not appear as clickable no-op controls.
```

Expected: `docs/DESIGN.md` owns UI surfaces and state requirements.

- [x] **Step 3: Convert `docs/references/RESEARCH.md` from old question queue to research index**

Edit the top of `docs/references/RESEARCH.md` to start with:

```markdown
# Research

## Purpose

This file tracks active research questions, imported-answer indexes, adopted research guardrails, and local verification backlog. Research is evidence, not product/API fact. When research changes product scope, update `docs/PRODUCT.md`, `docs/FEATURE_INDEX.md`, relevant `docs/features/*.md`, or a stage spec before implementation.
```

Add this section near the Q29-Q33 summary:

```markdown
## Codex App-like Research Guardrails

- Notifications are runtime stream inputs, not durable history. Worker projections need `seq`, `eventId`, redaction, replay/gap handling, and snapshot reconciliation before Web consumes them as live timeline.
- Conversation lifecycle UI uses user intent names such as open/continue, fork, archive, restore, rename, goal, compact, and rollback preview. It must not expose raw `thread/*` method names as product actions.
- Local tools enter as read-only evidence first. Arbitrary filesystem write, arbitrary shell, plugin install, MCP config edit, and destructive external app actions require separate controlled-action stages.
- Account capability starts as sanitized device auth status. Login/logout, externally supplied tokens, usage/rate detail, and feedback upload are not near-term Web actions.
- Realtime voice stays experimental/watch until a proven protocol path and product experience exist.
```

Expected: `docs/references/RESEARCH.md` owns Q29-Q33 links and adopted guardrails.

- [x] **Step 4: Rewrite `docs/README.md` source-of-truth priority**

Replace the old root-document entries with:

```markdown
# Source of Truth Priority

When documents in this repository conflict, use this priority order. Higher items override lower items.

1. **Active contract files**
   - `packages/api-contract/openapi.yaml`
   - `packages/codex-protocol/schema/app-server.schema.json`

2. **Current feature specs**
   - `docs/features/*.md`
   - `docs/FEATURE_INDEX.md`

3. **Architecture decisions**
   - `docs/adr/*.md`

4. **Tests and verification**
   - Package tests under `apps/*/src/**/*.test.ts` and `packages/*/src/**/*.test.ts`
   - `apps/web/e2e/*.spec.ts`
   - `docs/verification/**`

5. **Product and design facts**
   - `docs/PRODUCT.md`
   - `docs/DESIGN.md`
   - `PROJECT_STRUCTURE.md`

6. **Active implementation workflow**
   - `docs/superpowers/specs/*`
   - `docs/superpowers/plans/*`

7. **References**
   - `docs/references/**`

8. **Archives**
   - `docs/archives/**`

Archived files and references are not current source of truth.
```

Add a short current entrypoint:

```markdown
## Current Project State

Codex Remote has completed the first Stage 15 Advanced App-like Platform readiness slice. The latest support state is tracked in `docs/FEATURE_INDEX.md`; known verification entrypoints and real-gaps are tracked in `docs/verification/README.md`. New Stage 16 work starts with a spec in `docs/superpowers/specs/`.
```

Expected: `docs/README.md` no longer points readers to root `PLAN.md`, `PRODUCT.md`, `DESIGN.md`, `CODEX_APP_PARITY.md`, or `QUESTIONS.md`.

- [x] **Step 5: Update `docs/verification/README.md` with current real-gap ownership**

Ensure `docs/verification/README.md` includes:

```markdown
## Current Known Real-Gap

Approval decision remains the known real-gap: the isolated approval fixture exists, but the current real app-server run has not produced a safe pending approval sample for decision acceptance. Do not claim approval decision is product-ready until a later stage records real evidence here.
```

Expected: verification entrypoints and the current approval gap have one active owner.

- [x] **Step 6: Run a local reference check for the new active owners**

Run:

```bash
rg -n "\b(PLAN|PRODUCT|DESIGN|CODEX_APP_PARITY|QUESTIONS|FEATURE_SUPPORT)\.md\b" docs/README.md docs/PRODUCT.md docs/DESIGN.md docs/references/RESEARCH.md docs/verification/README.md
```

Expected: no references to deleted root paths. References to canonical `docs/PRODUCT.md` or `docs/DESIGN.md` are acceptable.

- [x] **Step 7: Commit active fact consolidation**

Run:

```bash
git add docs/PRODUCT.md docs/DESIGN.md docs/references/RESEARCH.md docs/README.md docs/verification/README.md
git commit -m "Consolidate canonical docs facts"
```

Expected: commit succeeds.

---

### Task 3: Update Structure Rules And Feature References

**Files:**
- Modify: `AGENTS.md`
- Modify: `PROJECT_STRUCTURE.md`
- Modify: `docs/references/README.md`
- Modify: `docs/references/development-context.md`
- Modify: `docs/contracts/README.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/features/*.md`

**Interfaces:**
- Consumes: canonical paths produced by Task 2.
- Produces: active docs with no live references to deleted root facts.

- [x] **Step 1: Update `AGENTS.md` source-of-truth section**

Replace the root fact list with:

```markdown
事实源文档：

- `docs/README.md`：事实源优先级、当前状态入口和阶段工作流入口。
- `docs/PRODUCT.md`：产品定位、目标用户、MVP/P1/P2 范围、体验原则、非目标和 Codex App-like workbench 方向。
- `docs/DESIGN.md`：视觉系统、设计 token、组件风格、UI support surfaces 和前端设计约束。
- `PROJECT_STRUCTURE.md`：目录职责、依赖方向和新增文件规则。
- `docs/references/RESEARCH.md`：调研问题、导入回答索引、local verification backlog 和 adopted research guardrails。
- `docs/features/*.md`：每个产品能力一份当前有效的功能规格。
- `docs/FEATURE_INDEX.md`：当前功能索引和能力支持状态。
- `docs/adr/*.md`：架构决策记录。
- `docs/contracts/README.md`：契约索引。
- `docs/verification/README.md`：验证入口和当前 real-gap。
```

Update the development rule from "read `PLAN.md`" to:

```markdown
- 每个阶段开始前先读 `docs/README.md`、`docs/PRODUCT.md`、`docs/FEATURE_INDEX.md` 和相关 `docs/features/*.md`，确认当前状态、non-goals、风险和调研状态。
```

Expected: `AGENTS.md` no longer points to deleted root documents.

- [x] **Step 2: Update `PROJECT_STRUCTURE.md` document ownership**

Replace root document ownership bullets with:

```markdown
### Root Documents

- `AGENTS.md`: execution rules for agents working in this repo.
- `PROJECT_STRUCTURE.md`: directory ownership and dependency boundaries.

Root documentation should not grow beyond these two files. Product, design, roadmap, research, feature, verification, and contract facts live under `docs/`.
```

Update `docs/` ownership bullets to include:

```markdown
- `docs/README.md`: source-of-truth priority, current project state entrypoint, and stage workflow entrypoint.
- `docs/PRODUCT.md`: product positioning, users, MVP/P1/P2 scope, principles, non-goals, architecture boundaries, and Codex App-like workbench direction.
- `docs/DESIGN.md`: visual system, design tokens, component style, UI support surfaces, and frontend constraints.
- `docs/FEATURE_INDEX.md`: current capability index, support status, stage, feature spec path, and test coverage.
- `docs/references/RESEARCH.md`: research queue, imported-answer index, local verification backlog, and adopted research guardrails.
```

Expected: `PROJECT_STRUCTURE.md` matches the strict target structure.

- [x] **Step 3: Update `docs/references/README.md`**

Replace old active-decision bullets with:

```markdown
Use active fact documents for current decisions:

- `docs/PRODUCT.md`: product positioning, MVP/P1/P2 scope, users, non-goals, architecture boundaries, and Codex App-like workbench direction.
- `docs/DESIGN.md`: visual system, frontend style, UI support surfaces, and required states.
- `docs/README.md`: source-of-truth priority, current project state, and workflow entrypoint.
- `PROJECT_STRUCTURE.md`: directory ownership and dependency direction.
- `docs/references/RESEARCH.md`: research queue, imported-answer index, and local verification backlog.
```

Expected: reference README no longer points to old root facts.

- [x] **Step 4: Update active feature-support wording**

Run:

```bash
rg -l "FEATURE_SUPPORT\.md" docs/FEATURE_INDEX.md docs/features | xargs perl -0pi -e 's/FEATURE_SUPPORT\.md/docs\/archives\/references\/2026-06-22-feature-support-matrix-snapshot.md/g'
```

Expected: current feature docs refer to the archived support snapshot, not a deleted root `FEATURE_SUPPORT.md`.

- [x] **Step 5: Update `docs/references/development-context.md` active parity reference**

Replace the first paragraph's parity sentence with:

```markdown
Codex Remote is a self-hosted multi-device Codex Web console. The current subgoal is practical Codex App-like browser workbench parity; `docs/PRODUCT.md` owns the product direction and `docs/FEATURE_INDEX.md` owns current capability support state.
```

Expected: no live dependency on `CODEX_APP_PARITY.md`.

- [x] **Step 6: Run active-reference scan**

Run:

```bash
rg -n "\b(PLAN|PRODUCT|DESIGN|CODEX_APP_PARITY|QUESTIONS|FEATURE_SUPPORT)\.md\b" \
  AGENTS.md PROJECT_STRUCTURE.md docs/README.md docs/PRODUCT.md docs/DESIGN.md docs/FEATURE_INDEX.md docs/features docs/verification docs/references/README.md docs/references/RESEARCH.md docs/references/development-context.md docs/contracts/README.md \
  -g '!docs/archives/**' -g '!docs/superpowers/**'
```

Expected: no references to deleted root files. References that include `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/FEATURE_INDEX.md`, or archived support snapshot paths are acceptable.

- [x] **Step 7: Commit structure and feature reference updates**

Run:

```bash
git add AGENTS.md PROJECT_STRUCTURE.md docs/references/README.md docs/references/development-context.md docs/contracts/README.md docs/FEATURE_INDEX.md docs/features
git commit -m "Update docs source of truth references"
```

Expected: commit succeeds.

---

### Task 4: Update Product Readiness Checks

**Files:**
- Modify: `scripts/product-readiness-check.mjs`
- Modify: `scripts/product-readiness-check.test.mjs`

**Interfaces:**
- Consumes: canonical docs paths from Tasks 1-3.
- Produces: product readiness check that scans the active docs and no longer depends on deleted root docs.

- [x] **Step 1: Update sensitive-shape scan document list**

In `scripts/product-readiness-check.mjs`, replace the root doc list in `checkSensitiveShapes` with:

```javascript
  const scannedFiles = [
    ...[
      "AGENTS.md",
      "PROJECT_STRUCTURE.md",
      "docs/README.md",
      "docs/PRODUCT.md",
      "docs/DESIGN.md",
      "docs/FEATURE_INDEX.md",
      "docs/references/RESEARCH.md",
      "docs/verification/README.md",
    ].filter((file) => existsSync(join(root, file))),
    ...packageJsonFiles,
    ...listFiles(root, ["docs/superpowers", "scripts"], [".md", ".mjs", ".sh"]).filter((file) => !file.endsWith(".test.mjs")),
    ...listFiles(root, ["docs/references"], [".md"]).filter(
      (file) =>
        file === "docs/references/README.md" ||
        file === "docs/references/local-self-hosting.md" ||
        file.includes("/product-readiness-fixtures/"),
    ),
  ];
```

Expected: deleted root `PLAN.md`, `PRODUCT.md`, and `DESIGN.md` are not scanned as root files.

- [x] **Step 2: Add regression test for canonical docs scanning**

Append this test near the existing sensitive-shape tests in `scripts/product-readiness-check.test.mjs`:

```javascript
test("product readiness check scans canonical docs for sensitive-shaped values", () => {
  const root = createFixture();
  try {
    writeFileSync(join(root, "docs/PRODUCT.md"), "token=example-token\n");
    writeFileSync(join(root, "docs/references/RESEARCH.md"), "OPENAI_API_TOKEN=example-token\n");
    const failures = runProductReadinessCheck(root).join("\n");
    assert.match(failures, /docs\/PRODUCT\.md contains sensitive-shaped value/);
    assert.match(failures, /docs\/references\/RESEARCH\.md contains sensitive-shaped value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Expected: test proves the new canonical docs are scanned.

- [x] **Step 3: Run the focused script test**

Run:

```bash
node --test scripts/product-readiness-check.test.mjs
```

Expected: all tests in `scripts/product-readiness-check.test.mjs` pass.

- [x] **Step 4: Run product readiness check**

Run:

```bash
pnpm product:check
```

Expected: command exits `0` and prints no failures.

- [x] **Step 5: Commit readiness check update**

Run:

```bash
git add scripts/product-readiness-check.mjs scripts/product-readiness-check.test.mjs
git commit -m "Update product readiness docs scan"
```

Expected: commit succeeds.

---

### Task 5: Final Verification And Cleanup

**Files:**
- Verify: `AGENTS.md`
- Verify: `PROJECT_STRUCTURE.md`
- Verify: `docs/**`
- Verify: `scripts/product-readiness-check.mjs`
- Verify: `scripts/product-readiness-check.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: verified migration ready for review.

- [x] **Step 1: Verify old root docs are absent**

Run:

```bash
for file in PLAN.md PRODUCT.md DESIGN.md QUESTIONS.md CODEX_APP_PARITY.md FEATURE_SUPPORT.md; do
  test ! -e "$file" || { echo "$file still exists"; exit 1; }
done
```

Expected: command exits `0`.

- [x] **Step 2: Verify active references use canonical paths**

Run:

```bash
rg -n "\b(PLAN|PRODUCT|DESIGN|CODEX_APP_PARITY|QUESTIONS|FEATURE_SUPPORT)\.md\b" \
  AGENTS.md PROJECT_STRUCTURE.md docs/README.md docs/PRODUCT.md docs/DESIGN.md docs/FEATURE_INDEX.md docs/features docs/verification docs/references/README.md docs/references/RESEARCH.md docs/references/development-context.md docs/contracts/README.md scripts \
  -g '!docs/archives/**' -g '!docs/superpowers/**'
```

Expected: no references to deleted root files. If output contains canonical paths such as `docs/PRODUCT.md`, confirm they are not bare root references.

- [x] **Step 3: Verify root documentation shape**

Run:

```bash
find . -maxdepth 1 -type f -name '*.md' -print | sort
```

Expected:

```text
./AGENTS.md
./PROJECT_STRUCTURE.md
```

- [x] **Step 4: Run focused tests**

Run:

```bash
node --test scripts/product-readiness-check.test.mjs
```

Expected: all tests pass.

- [x] **Step 5: Run product check**

Run:

```bash
pnpm product:check
```

Expected: command exits `0`.

- [x] **Step 6: Run broader checks only if TypeScript or package config changed**

If implementation touched only Markdown plus `scripts/product-readiness-check.mjs`, skip `pnpm lint` and `pnpm typecheck`. If implementation touched TypeScript, package config, or generated code, run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit `0` when run.

- [x] **Step 7: Review final diff**

Run:

```bash
git status --short --untracked-files=all
git diff --stat HEAD
```

Expected: only task-scoped documentation and readiness-check files remain uncommitted.

- [x] **Step 8: Commit final cleanup if needed**

Run:

```bash
git add AGENTS.md PROJECT_STRUCTURE.md docs scripts/product-readiness-check.mjs scripts/product-readiness-check.test.mjs
git commit -m "Canonicalize project documentation structure"
```

Expected: commit succeeds, unless previous tasks already committed every change.
