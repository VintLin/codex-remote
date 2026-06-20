# Product Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a verifiable local product readiness slice: runbook, readiness command, API/iOS guardrails, safety checks, Chrome smoke, docs, and commit.

**Architecture:** Keep all runtime behavior inside existing app/package boundaries. Add a repo-level readiness script that statically checks local self-hosting invariants. Do not add installers, pairing, keychain, reverse WSS, external deployment, or iOS app code.

**Tech Stack:** TypeScript/JavaScript, pnpm, Turborepo, OpenAPI 3.1, Node built-in test runner, Next.js, Hono, SQLite/Drizzle.

## Global Constraints

- API fields start in `packages/api-contract/openapi.yaml`.
- DB fields start in `packages/db/src/schema.ts`.
- `apps/worker` remains the only Codex app-server caller.
- `apps/web` must not import `packages/db` or `packages/codex-protocol`.
- `apps/control-plane` must not import `packages/codex-protocol` or Worker internals.
- Do not store provider secrets, Codex auth, Worker bearer tokens, raw upstream URLs, raw JSON-RPC, raw prompt, raw command output, full diff, stack/cause, or private paths in repo files, docs examples, scripts, logs, tests, or DB.
- Do not implement OS installers, system services, keychain, pairing, token rotation, revocation, reverse WSS, external deployment, production TLS, full iOS app, automatic task inference, automatic device choice, or multi-tenant hosting.

---

## Task 1: Product Readiness Contract

**Files:**
- Modify: `package.json`
- Create: `scripts/product-readiness-check.mjs`
- Create: `scripts/product-readiness-check.test.mjs`

**Interfaces:**
- Produces:
  - root script `product:check`
  - CLI command `node scripts/product-readiness-check.mjs`

- [x] Add failing tests for the readiness checker using temp fixtures.
- [x] Implement checks for required root scripts and package scripts.
- [x] Implement static loopback checks for Web dev/start scripts and Worker/Control Plane config defaults.
- [x] Implement secret-shape scanning for docs and scripts with placeholder allowlist; scan value shapes, not prose category names.
- [x] Implement OpenAPI checks in `product-readiness-check.mjs` for every `/v1` operationId and public schema `additionalProperties: false` unless explicitly allowlisted.
- [x] Implement boundary/import checks that mirror Stage 8 productization invariants, including `apps/control-plane` not importing `apps/worker` source, Worker package internals, or relative paths that cross into Worker.
- [x] Add root `product:check` script.
- [x] Run `node --test scripts/product-readiness-check.test.mjs && pnpm product:check`.
- [ ] Request task review for safety, false positives, and scope control.

## Task 2: API And Future iOS Guardrails

**Files:**
- Modify: `packages/api-contract/src/contractGeneration.test.ts`
- Modify only if needed: `packages/api-contract/openapi.yaml`
- Generate only if needed: `packages/api-contract/src/generated/openapi.ts`

**Interfaces:**
- Consumes: OpenAPI source of truth.
- Produces: tests that prevent API drift away from future client reuse.

- [x] Add package-level contract tests matching the product readiness OpenAPI checks so API drift is caught both by `pnpm product:check` and `pnpm --filter @codex-remote/api-contract test`.
- [x] Add failing contract tests that every `/v1` operation has a stable `operationId`.
- [x] Add or tighten tests that public component schemas stay closed with `additionalProperties: false`, except explicit allowlist entries.
- [x] Avoid adding iOS-specific DTOs or app code.
- [x] Run `pnpm --filter @codex-remote/api-contract test && pnpm --filter @codex-remote/api-contract build`.
- [ ] Request task review for API source-of-truth, iOS reuse guardrails, and no parallel DTOs.

## Task 3: Local Self-Hosting Runbook

**Files:**
- Create: `docs/references/local-self-hosting.md`
- Modify: `docs/references/development-context.md`
- Modify if needed: `PROJECT_STRUCTURE.md`

**Interfaces:**
- Consumes: existing Worker, Control Plane, Web, and DB runtime contracts.
- Produces: operator-facing local self-hosting guidance.

- [x] Document local topology, ports, startup order, and component responsibilities.
- [x] Document required env vars using only placeholder values such as `REDACTED` or `example-token`.
- [x] Document that real secrets must stay in shell/local secret manager and outside repo files.
- [x] Document validation commands and troubleshooting for unavailable Worker, invalid Control Plane config, and empty DB.
- [x] Document remaining productization limitations without implementing them.
- [x] Run `pnpm product:check`.
- [ ] Request task review for secret safety, operator clarity, and no product overclaim.

## Task 4: Chrome Product Smoke

**Files:**
- Modify if needed: existing fake Worker or Web tests only.
- Modify: `docs/superpowers/plans/2026-06-20-product-readiness.md`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: Chrome smoke evidence.

- [x] List Stage 8 feature points and normal/boundary cases before browser verification.
- [x] Start fake Workers, Control Plane with temp DB, and Web.
- [x] Use `chrome:control-chrome` to verify Web loads Control Plane-backed devices/conversations/tasks.
- [x] Verify task board remains usable through Control Plane.
- [x] Verify unavailable Control Plane shows sanitized failure or fallback state without raw URL/token/path/stack/cause/raw JSON-RPC/prompt/command output/full diff.
- [x] Stop all local smoke processes and confirm ports are free.
- [x] Record Chrome evidence in this plan.

Chrome evidence:

- Normal path loaded Control Plane-backed data: `Smoke A`, `Project A`, and `Project B` appeared; mock-only `MacBook Pro M4` / `Example worker` did not appear.
- Task board path created `Stage 8 smoke task`, then linked the selected conversation; Web showed `1 links` and `Smoke complete conversation · smoke-device-a`.
- Unavailable Control Plane path showed fallback plus `request_failure`; DOM did not include token, raw Worker URL/ports, private path, raw JSON-RPC, prompt, command output, full diff, or stack trace.
- Smoke processes were stopped and ports `5173`, `8786`, `8791`, and `8792` were free after cleanup.

## Task 5: Final Verification, Docs, Commit

**Files:**
- Modify: `PLAN.md`
- Modify: `PROJECT_STRUCTURE.md` if Stage 8 adds or changes file ownership.
- Modify: `docs/references/development-context.md`
- Modify: `docs/superpowers/specs/2026-06-20-product-readiness-design.md`
- Modify: `docs/superpowers/plans/2026-06-20-product-readiness.md`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: final Stage 8 evidence and commit.

- [ ] Run focused checks:
  - `node --test scripts/product-readiness-check.test.mjs`
  - `pnpm product:check`
  - `pnpm --filter @codex-remote/api-contract test`
  - relevant app/package tests touched by the implementation
- [ ] Run project gate:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- [ ] Request final broad implementation review from architecture boundary, unique source of truth, DRY, modularity, security, tests, maintainability, and roadmap alignment.
- [ ] Fix Critical/Important review findings and rerun affected tests.
- [ ] Update Stage 8 docs, `PLAN.md`, and references with verification and remaining risks.
- [ ] Commit Stage 8 on `main`; do not push.

## Plan Self-Review

- Spec coverage: tasks cover readiness command, API/iOS guardrails, runbook, Chrome smoke, docs, and commit.
- Placeholder scan: no TBD/TODO placeholders.
- Scope control: no installers, keychain, pairing, reverse WSS, external deployment, production auth, or iOS app code.
- Source-of-truth control: no parallel DTOs; checks and docs consume existing contracts.

## Architecture Review Prompt

```text
你作为架构师思考需要审核的维度，指派 subagent 审核该计划。

审核 docs/superpowers/specs/2026-06-20-product-readiness-design.md 和 docs/superpowers/plans/2026-06-20-product-readiness.md。

请从架构边界、唯一事实源、DRY、模块化、安全、测试充分性、后续可维护性和是否偏离总目标等维度审核。特别检查：
- Stage 8 是否把产品化收敛为本地 self-hosted readiness，而不是提前实现 installer、keychain、pairing、reverse WSS、external deployment 或 iOS app；
- API 字段是否仍以 packages/api-contract/openapi.yaml 为唯一事实源；
- DB 字段是否仍以 packages/db/src/schema.ts 为唯一事实源；
- apps/worker 是否仍是唯一 app-server 调用者；
- apps/web 是否不依赖 DB 或 codex-protocol；
- apps/control-plane 是否不依赖 codex-protocol 或 Worker internals；
- readiness check 是否能发现 secret-shaped docs/scripts、非 loopback 默认、缺失本地启动脚本和 API operationId drift；
- runbook 是否只使用 REDACTED/example-token placeholder，不写真实 token、raw URL、raw JSON-RPC、prompt、command output、full diff、stack/cause 或 private path；
- Chrome smoke 是否覆盖本地 self-hosted 正常路径和不可用 Control Plane 的安全失败路径。

输出 APPROVE 或 REQUEST_CHANGES；如需修改，请给出阻塞项、原因和建议修复。
```
