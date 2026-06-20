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

Stage 9 reopened a narrower research queue for real local verification. Q21, Q23, and Q24 are now answered by local Stage 9 evidence; Q22 remains partial because the Stage 10 isolated approval fixture exists but current real app-server runs still do not emit a pending approval for the safe fixture prompt.

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
| Q18 | `docs/references/questions/q18-worker-app-server-session-lifecycle.md` | answered |
| Q19 | `docs/references/questions/q19-public-project-identity-and-discovery.md` | answered |
| Q20 | `docs/references/questions/q20-owned-app-server-transport-choice.md` | answered |
| Q21 | `docs/references/questions/q21-real-command-control-protocol-compatibility.md` | answered by local Stage 9 verification |
| Q22 | `docs/references/questions/q22-safe-active-turn-and-pending-approval-scenarios.md` | partial |
| Q23 | `docs/references/questions/q23-thread-list-cwd-scope-and-pagination-behavior.md` | answered by local Stage 9 verification |
| Q24 | `docs/references/questions/q24-control-plane-degraded-versus-empty-data-semantics.md` | answered by local Stage 9 verification |
| Q25 | `docs/references/questions/q25-real-web-e2e-gate-and-playwright-decision.md` | answered |
| Q26 | `docs/references/questions/q26-calibration-report-destination-and-secret-scanning.md` | answered |
| Q27 | `docs/references/questions/q27-task-link-integrity-checks.md` | answered |
| Q28 | `docs/references/questions/q28-local-self-hosted-external-asset-policy.md` | answered |
| Q29 | `docs/references/questions/q29-q33-codex-app-parity-research-answers/001-Q29-Codex-App-官方产品能力面.md` | answered |
| Q30 | `docs/references/questions/q29-q33-codex-app-parity-research-answers/002-Q30-app-server-notifications-能否支撑-Web-timeline-stream.md` | answered |
| Q31 | `docs/references/questions/q29-q33-codex-app-parity-research-answers/003-Q31-conversation-lifecycle-方法的用户语义.md` | answered |
| Q32 | `docs/references/questions/q29-q33-codex-app-parity-research-answers/004-Q32-文件-Shell-Git-Review-MCP-插件-Skills-的-UI-放置.md` | answered |
| Q33 | `docs/references/questions/q29-q33-codex-app-parity-research-answers/005-Q33-高级和平台特定能力优先级.md` | answered |

## Current Open Research Questions

Q18-Q21、Q23-Q28 已闭环并可作为实现约束。当前未闭环的是 Q22：approval pending list 已有真实证据，Stage 10 isolated fixture 已实现但仍未观察到安全 pending approval sample，approval decision 保留为 documented safety `real-gap`。下一步路线先按 `CODEX_APP_PARITY.md` 做 Codex App-like 能力对齐。

Codex App-like browser 子目标的窄范围官方资料调研已完成。Q29-Q33 的提问任务、会话清单、回答和汇总分别位于：

- `docs/references/questions/q29-q33-codex-app-parity-research-tasks.json`
- `docs/references/questions/q29-q33-codex-app-parity-research-conversations.json`
- `docs/references/questions/q29-q33-codex-app-parity-research-answers/`
- `docs/references/questions/q29-q33-codex-app-parity-research-answers/summary.json`

### Q21. Real command/control protocol compatibility

- Context: Stage 3-8 contract, Worker, Control Plane, and Web paths exist, but real Codex E2E is not proven.
- Reason: `thread/start`, `turn/start`, `turn/interrupt`, and `turn/steer` may have runtime constraints or protocol drift not caught by fake Worker smoke.
- Direction: Run the full local stack with `codex-remote-calibration` prompts and record `real-pass`, `fixed-pass`, or `real-gap`.
- Desired result: Confirm which start/follow-up/interrupt/steer capabilities can be exposed as real operations.
- Blocks: Web command controls, Stage 9 completion criteria, and roadmap wording.
- Status: Locally verified in Stage 9. `pnpm real:check` records start, follow-up, interrupt, and steer as `real-pass`; steer uses a safe independent active-turn sample and requires public active-turn proof.

### Q22. Safe active turn and pending approval scenarios

- Context: Interrupt, steer, and approval require a real active turn or pending approval.
- Reason: The project must not trigger destructive, file-changing, private-data, or broad permission approvals just to test UI.
- Direction: Use a disposable local repo and low-risk prompts; observe or reject approvals unless a safe accept path is explicitly proven.
- Desired result: Define the repeatable scenarios for active turn and pending approval, or mark them `real-gap`.
- Blocks: approval UI enablement, run-control visibility, and calibration report status.
- Status: Partial. Approval pending list records `real-pass`; Stage 10 isolated fixture currently records `approval decision` as `real-gap` with `reasonCode=approval_fixture_no_pending_request` after read-only/on-request, stdout-only command probing, and explicit `approvalsReviewer: "user"`. Automatic accept, persistent policy amendment, user-layer rules edits, auth-copying paths, and production approval safety model remain out of scope.

### Q23. `thread/list(cwd=...)` scope and pagination behavior

- Context: Worker uses app-server `thread/list` with `cwd=allowedProjectRoot` and a bounded page scan.
- Reason: If app-server treats `cwd` as exact path only, child directory/worktree conversations may disappear; bounded scans may hide older real conversations.
- Direction: Create safe conversations in repo root, a subdirectory, and a worktree; query by each cwd and with enough pagination.
- Desired result: Decide exact cwd matching rules, page limits, and whether project discovery needs multiple roots.
- Status: Locally verified for the current Stage 9 project root through a Control Plane device-scoped Worker probe. The current readiness evidence proves exact-cwd listing and cursor-drain pagination for the configured root; worktree, symlink alias, Windows/WSL alias, sourceKinds/archive/provider matrix, and persistent multi-root discovery remain future scope, not Stage 9 blockers.

### Q24. Control Plane degraded versus empty-data semantics

- Context: Control Plane currently can aggregate Worker failures into empty lists.
- Reason: Web must distinguish "real empty project" from "Worker unavailable" and from fallback/example data.
- Direction: Run with healthy, unreachable, and invalid-token Workers; compare `/v1/control-plane/health`, `/v1/devices`, and `/v1/conversations`.
- Desired result: Define response/error semantics for all-workers-down and partial-device failure.
- Blocks: Web source taxonomy, fallback banner, empty states, and multi-device readiness.
- Status: Locally verified in Stage 9. Healthy empty data stays distinct from dependency failure; all-workers-down and invalid-worker-token make `/v1/conversations` return a sanitized dependency error instead of `200 []`, while health/devices can still expose sanitized degraded inventory.

### Q29. Codex App official product capability surface

- Context: `CODEX_APP_PARITY.md` defines a Codex App-like browser sub-roadmap, but app-server protocol methods are not the same thing as official Codex App product behavior.
- Reason: Before splitting future stages, the project needs to know which capabilities should be treated as Codex App parity targets versus Codex Remote-specific additions or future-only experiments.
- Direction: Use web search with official OpenAI/Codex sources first. Compare official Codex App pages/docs/release notes with the generated app-server protocol categories already listed in `FEATURE_SUPPORT.md`.
- Desired result: A capability table that classifies conversation lifecycle, timeline, approvals/input, files, shell, Git/review, search, models/config, skills/plugins/MCP/apps, account, realtime voice, and Windows sandbox as current parity target, remote-only target, future/experimental, or not supported.
- Status: Answered. See `docs/references/questions/q29-q33-codex-app-parity-research-answers/001-Q29-Codex-App-官方产品能力面.md`.

### Q30. App-server notifications as Web timeline source

- Context: The generated protocol exposes many `ServerNotification` variants, while Codex Remote currently reads snapshots rather than a durable live stream.
- Reason: The next realtime stage needs to know whether app-server notifications are stable enough as stream inputs, and where Worker must add `seq/eventId`, replay, and snapshot reconciliation.
- Direction: Use official docs/source/release notes when available, plus local generated notification names from `packages/codex-protocol`. Do not assume notifications are durable event log entries.
- Desired result: A recommendation for which notification groups can feed Web timeline, which must stay internal, which require snapshot fallback, and which need separate verification.
- Status: Answered. See `docs/references/questions/q29-q33-codex-app-parity-research-answers/002-Q30-app-server-notifications-能否支撑-Web-timeline-stream.md`.

### Q31. Conversation lifecycle user semantics

- Context: The generated protocol exposes `thread/resume`, `fork`, `archive`, `unarchive`, `name/set`, `goal/*`, `compact/start`, and `rollback`, but Codex Remote currently productizes only start/list/read and turn control.
- Reason: The conversation workbench should model user intent correctly instead of exposing raw methods.
- Direction: Use web search with official Codex App behavior/docs and compare against generated app-server method names.
- Desired result: A method-to-user-intent table that explains what each lifecycle action means, which UI surface should own it, what data is needed, and what should remain deferred.
- Status: Answered. See `docs/references/questions/q29-q33-codex-app-parity-research-answers/003-Q31-conversation-lifecycle-方法的用户语义.md`.

### Q32. Local tool UI placement for files, shell, Git, review, MCP, plugins, and skills

- Context: `DESIGN.md` now defines Sidebar, Main Conversation, Right Detail Pane, Tool Surface, Status, and Modal/Popover support surfaces.
- Reason: Local tool capabilities should not all be squeezed into the conversation shell or exposed as raw API buttons.
- Direction: Use official Codex App product references and official docs to infer where these tools appear in the experience. Cross-check against app-server method groups.
- Desired result: A UI placement matrix for files, shell/commands, Git diff, review, fuzzy search, MCP, plugins/marketplace, skills/hooks, and apps, including required empty/degraded/action states.
- Status: Answered. See `docs/references/questions/q29-q33-codex-app-parity-research-answers/004-Q32-文件-Shell-Git-Review-MCP-插件-Skills-的-UI-放置.md`.

### Q33. Advanced and platform-specific capability priority

- Context: The protocol exposes realtime voice, Windows sandbox, account login/status/usage, feedback upload, and external agent config/import, but these may be platform-specific, experimental, or not relevant to the near-term browser workbench.
- Reason: The roadmap should not promote advanced protocol surfaces into near-term stages without evidence.
- Direction: Use official OpenAI/Codex sources and local generated protocol names to classify each capability by maturity and roadmap priority.
- Desired result: A priority table that marks each advanced capability as near-term, later, experimental/watch, or not a Codex Remote target, with reasoning and source links.
- Status: Answered. See `docs/references/questions/q29-q33-codex-app-parity-research-answers/005-Q33-高级和平台特定能力优先级.md`.

Summary and adopted decisions:

- `docs/references/questions/SYNTHESIS.md`
- `docs/references/development-context.md`
- `PLAN.md`

Archived process material:

- `docs/archives/references/questions/research-prompts-archive.md`
- `docs/archives/references/questions/import*.json`

## Local Verification Backlog

These are not broad research questions. Q21, Q23, and Q24 are answered by Stage 9 local evidence; Q22 remains partial and belongs to the approval/input capability area in the Codex App parity roadmap. Keep the remaining items with their later stage specs before coding:

- Verify whether generated protocol and local runtime support `thread/turns/list`.
- Verify Node runtime and Hono assumptions for the Worker HTTP boundary.
- Verify official Codex App Windows sandbox, worktree, and local environment behavior against this project's target platforms.
- Reconcile Stage 2 read-only endpoint design with `packages/api-contract/openapi.yaml`.
- Validate `better-sqlite3` native install/build matrix before Stage 7 DB commitment.
- Validate OS keyring and Linux/headless fallback behavior before Worker productization.
- Define Stage 6 threat model before implementing device-bound token.

## Adding New Questions

Add a new question only when local verification or phase design cannot answer it.

当前基于 Q18-Q28 复核结果，未发现新的独立研究问题；新增问题只在以下场景触发：

- 出现版本漂移导致现有协议/行为在实机上与已有研究结论冲突；
- 或出现新的阶段性目标（例如 Stage 10 之后的 streaming/审批生产化）要求新增边界定义。

Each new question must include:

- Context: enough project background to be understood standalone.
- Reason: what decision the answer will unblock.
- Direction: preferred source types, ideally official docs/source/release notes.
- Desired result: the exact decision or artifact expected from the research.
