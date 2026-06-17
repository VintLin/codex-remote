# Documentation Canonicalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce three canonical project documents and move absorbed iteration drafts into `docs/archives`.

**Architecture:** Treat documentation as three bounded artifacts: PRD, technical specification, and implementation plan. Preserve research and external references as evidence sources. Keep all existing unrelated worktree state intact and only stage documentation cleanup paths.

**Tech Stack:** Markdown, Git, shell verification with `find`, `rg`, and `git status`.

---

## File Structure

Create:

- `docs/specs/多设备 Codex 控制台 PRD.md` - canonical product requirements document.
- `docs/specs/多设备 Codex 控制台 技术规格.md` - canonical technical specification.
- `docs/plans/从零到一实施计划.md` - canonical implementation plan.
- `docs/archives/specs/` - archive folder for absorbed PRD/spec drafts.
- `docs/archives/plans/` - archive folder for absorbed plan drafts.

Move:

- `docs/多设备 Codex 控制台 PRD v0.1.md` to `docs/archives/specs/多设备 Codex 控制台 PRD v0.1.md`
- `docs/specs/多设备 Codex 控制台 技术规格 v0.2.md` to `docs/archives/specs/多设备 Codex 控制台 技术规格 v0.2.md`
- `docs/specs/多设备 Codex 控制台 技术规格 v0.3.md` to `docs/archives/specs/多设备 Codex 控制台 技术规格 v0.3.md`
- `docs/plans/从零到一准备计划 v0.1.md` to `docs/archives/plans/从零到一准备计划 v0.1.md`
- `docs/plans/从零到一准备计划 v0.2.md` to `docs/archives/plans/从零到一准备计划 v0.2.md`
- `docs/plans/参考项目架构调研计划 v0.1.md` to `docs/archives/plans/参考项目架构调研计划 v0.1.md`

Leave in place:

- `docs/references/research/参考项目架构调研报告 v0.2.md`
- `docs/references/research/参考项目技术调研 v0.1.md`
- `docs/references/codex-app-server.md`
- `docs/references/openai-codex-app-pages/`
- `docs/references/可参考内容.md`
- `PRODUCT.md`
- `DESIGN.md`
- `docs/superpowers/specs/2026-06-15-app-server-mock-snapshot-assistant-ui-design.md`
- `docs/superpowers/specs/2026-06-15-tool-call-link-detail-workspace-design.md`
- `docs/superpowers/plans/2026-06-15-app-server-snapshot-assistant-ui.md`
- `docs/superpowers/plans/2026-06-15-tool-call-link-detail-workspace.md`
- `docs/Codex 应用首页.png`
- `docs/Codex 搜索弹窗.png`
- `docs/Codex 聊天框.png`
- `docs/代码审核-侧边栏展示.png`
- `docs/链接点击-侧边栏展示.png`
- `docs/工具调用-创建:编辑文件.png`
- `docs/工具调用-操作电脑.png`
- `docs/工具调用-运行命令.png`
- existing application, package, build output, and image files outside this documentation cleanup scope.

## Current Progress Snapshot

As of 2026-06-15, the repository has moved beyond pure planning:

- There are active Web/UI implementation changes in `apps/web`, `packages/ui`, `pnpm-lock.yaml`, and related scripts.
- There are additional product/design planning files under `docs/superpowers/specs/` and `docs/superpowers/plans/` for app-server snapshot assistant UI and tool-call/link detail workspace work.
- There are UI screenshots under `docs/` used as visual reference evidence.
- The documentation cleanup plan itself is untracked until committed.
- The Git index is currently clean, so the documentation cleanup can be staged and committed separately if the implementation only stages the paths listed in Task 6.

This plan must not archive or alter current app/UI plans, screenshots, application source, package files, or scripts. It only canonicalizes the original PRD/spec/plan iteration chain for the multi-device Codex console.

### Canonical PRD Structure

Use this exact section order:

```markdown
# 多设备 Codex 控制台 PRD

## 1. 产品定位
## 2. 用户与使用背景
## 3. 产品目标
## 4. 非目标
## 5. 核心场景
## 6. 信息架构
## 7. MVP 功能范围
## 8. MVP 优先级
## 9. 产品体验原则
## 10. 风险与限制
## 11. 产品一句话
```

### Canonical Technical Specification Structure

Use this exact section order:

```markdown
# 多设备 Codex 控制台 技术规格

## 1. 定位
## 2. 第一版目标
## 3. 架构
## 4. 事实源
## 5. 安全边界
## 6. Turborepo 项目结构
## 7. 根配置要求
## 8. 核心数据模型
## 9. Worker 接入体验
## 10. Worker 能力
## 11. 第一阶段 Worker Probe
## 12. Web MVP
## 13. iOS 扩展预留
## 14. 证据来源
## 15. 主要风险
## 16. 延后范围
```

### Canonical Implementation Plan Structure

Use this exact section order:

```markdown
# 从零到一实施计划

## 目标
## 阶段 0：当前状态核对
## 阶段 1：文档与边界固化
## 阶段 2：Turborepo 最小骨架核对
## 阶段 3：Codex Protocol 事实源
## 阶段 4：Worker Probe
## 阶段 5：最小 Worker
## 阶段 6：Control Plane
## 阶段 7：Web MVP
## 阶段 8：iOS 扩展准备
## 第一阶段推荐任务顺序
## 暂不处理
```

## Task 1: Create Canonical PRD

**Files:**

- Create: `docs/specs/多设备 Codex 控制台 PRD.md`
- Read: `docs/多设备 Codex 控制台 PRD v0.1.md`
- Read: `PRODUCT.md`

- [ ] **Step 1: Inspect source headings**

Run:

```bash
rg -n "^#{1,4} " "docs/多设备 Codex 控制台 PRD v0.1.md" PRODUCT.md
```

Expected: headings from both source files are printed. The PRD source includes product background, goals, scenarios, information architecture, MVP scope, priority, risks, and one-sentence positioning. `PRODUCT.md` includes users, purpose, brand personality, anti-references, design principles, and accessibility.

- [ ] **Step 2: Draft the canonical PRD**

Create `docs/specs/多设备 Codex 控制台 PRD.md` with this complete document shape and fill each section from the named source material:

```markdown
# 多设备 Codex 控制台 PRD

## 1. 产品定位

本项目是一个自托管多设备 Codex Web 控制台。它不是新的 Agent、多 Agent 编排平台、provider proxy 或 Codex Desktop clone，而是对多台设备上 Codex 能力的统一入口和任务状态聚合层。

## 2. 用户与使用背景

目标用户是同时使用多台 macOS、Windows、Linux 设备运行 Codex 的高频用户。他们通常在不同机器上进行长时间实现、部署、打包或验证工作，需要一个浏览器入口查看设备是否在线、Codex 对话正在做什么、以及这些对话属于哪个任务。

当前痛点是每台电脑上的 Codex App 相互独立。用户需要远程登录不同电脑、切换窗口、查看任务状态、继续对话或检查部署结果，导致多设备使用成本高。

## 3. 产品目标

- 在一个 Web 页面中查看所有设备状态。
- 快速切换并操作不同设备上的 Codex。
- 查看每台设备上的项目、对话、运行状态、输出流、审批状态和 Git / worktree 信息。
- 支持新建任务、继续对话、输入 follow-up、中止任务和处理 approval。
- 支持任务看板，将不同设备上的 Codex 对话手动关联到同一个任务。
- 为后续移动端操作预留 API 和配对边界。

## 4. 非目标

- 不做多 Agent 协作编排。
- 不做自动任务迁移。
- 不做跨设备上下文无缝转移。
- 不做自动选择空闲设备。
- 不优先支持 OpenCode、MiniMax Code、Claude Code 或 provider 抽象。
- 不做完整远程桌面。
- 不重打包 Codex Desktop。
- 不在 MVP 中实现完整 iOS App。

## 5. 核心场景

### 场景一：统一查看多台电脑上的 Codex 状态

用户打开 Web 控制台，看到所有已接入设备的在线状态、当前运行项目、运行中对话、最近更新时间、模型、sandbox 和 approval 模式。

### 场景二：快速切换到某台设备上的 Codex

用户选择设备后进入该设备的操作区，查看项目列表、对话列表、当前对话输出流、输入框、终端输出、Git 状态和可执行操作。

### 场景三：任务看板查看多设备 Codex 对话

用户在任务看板中查看 Project、Task 和 Linked Codex Conversations，并手动把不同设备、不同项目的 Codex 对话关联到同一个任务。

### 场景四：一键进入远程设备部署任务

用户从任务详情打开目标设备上的部署对话或新建部署对话，快速把部署指令发送给对应机器上的 Codex。

## 6. 信息架构

第一版包含设备视图和任务看板视图。设备视图以电脑为中心，任务看板视图以任务为中心。两个视图都必须清晰显示设备、项目、对话和任务之间的归属关系。

## 7. MVP 功能范围

- 设备管理。
- 设备接入和配对命令。
- 远程项目列表。
- Codex 对话列表。
- Codex 对话读取、follow-up、中止和 approval 处理。
- 输出流查看。
- 任务看板。
- 任务和 Codex conversation 的手动关联。

## 8. MVP 优先级

P0 是设备接入、项目列表、对话列表、对话读取、follow-up、中止、输出流、任务看板和 conversation link。P1 是终端输出、Git diff、worktree 状态、模型切换和更细的状态筛选。P2 是移动端、自动任务迁移、provider 抽象和正式安装包。

## 9. 产品体验原则

- 保持设备、项目、对话和任务归属在操作点可见。
- 先展示运行状态，再要求用户深入详情。
- 明确区分 Control Plane 状态和本机 Codex runtime 状态。
- 使用紧凑、熟悉、可重复操作的控件。
- 任务关联保持手动和轻量。
- 视觉风格克制、技术化、清晰，避免营销页、重装饰和紧急感滥用。

## 10. 风险与限制

- Codex app-server 接口和行为可能随版本变化。
- Windows、macOS 和 Linux 的本机路径、socket、权限和 shell 环境不同。
- approval 和 server request 处理不完整会导致任务卡住。
- 多设备控制必须避免泄露 OpenAI、ChatGPT、Codex 或 provider secrets。

## 11. 产品一句话

一个自托管的多设备 Codex Web 控制台，用来统一查看、操作和关联多台设备上的 Codex 工作。
```

- [ ] **Step 3: Verify PRD avoids technical duplication**

Run:

```bash
rg -n "type Device|type RemoteProject|type CodexConversation|PairingOffer|WorkerLocalConfig|ClientHeartbeat" "docs/specs/多设备 Codex 控制台 PRD.md" || true
```

Expected: no output. The PRD should not define the technical data model.

## Task 2: Create Canonical Technical Specification

**Files:**

- Create: `docs/specs/多设备 Codex 控制台 技术规格.md`
- Read: `docs/specs/多设备 Codex 控制台 技术规格 v0.3.md`
- Read: `docs/references/research/参考项目架构调研报告 v0.2.md`
- Read: `docs/references/openai-codex-app-pages/README.md`
- Read: `docs/references/codex-app-server.md`

- [ ] **Step 1: Inspect source headings**

Run:

```bash
rg -n "^#{1,4} " "docs/specs/多设备 Codex 控制台 技术规格 v0.3.md" "docs/references/research/参考项目架构调研报告 v0.2.md" docs/references/openai-codex-app-pages/README.md docs/references/codex-app-server.md
```

Expected: v0.3 technical sections, research evidence sections, official Codex App page index, and app-server protocol sections are visible.

- [ ] **Step 2: Create the canonical technical spec from v0.3**

Copy the v0.3 content into `docs/specs/多设备 Codex 控制台 技术规格.md`, remove `v0.3` from the title, and keep the v0.3 section content for architecture, fact sources, security, project structure, root config, data models, Worker access, Worker API, app-server mapping, Worker Probe, Web MVP, iOS extension, risks, and delayed scope.

Run:

```bash
cp "docs/specs/多设备 Codex 控制台 技术规格 v0.3.md" "docs/specs/多设备 Codex 控制台 技术规格.md"
python3 - <<'PY'
from pathlib import Path
path = Path("docs/specs/多设备 Codex 控制台 技术规格.md")
text = path.read_text(encoding="utf-8")
text = text.replace("# 多设备 Codex 控制台 技术规格 v0.3", "# 多设备 Codex 控制台 技术规格", 1)
text = text.replace("## 14. 主要风险", "## 14. 证据来源\n\n- 参考项目架构调研报告：`docs/references/research/参考项目架构调研报告 v0.2.md`\n- 参考项目技术调研：`docs/references/research/参考项目技术调研 v0.1.md`\n- Codex app-server 协议参考：`docs/references/codex-app-server.md`\n- OpenAI Codex App 页面快照：`docs/references/openai-codex-app-pages/README.md`\n\n## 15. 主要风险", 1)
text = text.replace("## 15. 延后范围", "## 16. 延后范围", 1)
path.write_text(text, encoding="utf-8")
PY
```

Expected: the canonical technical spec exists, has no version suffix in its title, and includes an evidence section before risks.

- [ ] **Step 3: Verify technical spec contains the source-of-truth sections**

Run:

```bash
rg -n "## 4\\. 事实源|packages/codex-protocol|packages/api-contract|packages/db|## 14\\. 证据来源|docs/references/codex-app-server.md|docs/references/openai-codex-app-pages/README.md" "docs/specs/多设备 Codex 控制台 技术规格.md"
```

Expected: matches for fact-source sections and evidence links.

## Task 3: Create Canonical Implementation Plan

**Files:**

- Create: `docs/plans/从零到一实施计划.md`
- Read: `docs/plans/从零到一准备计划 v0.2.md`
- Read: `docs/superpowers/specs/2026-06-15-docs-canonicalization-design.md`

- [ ] **Step 1: Inspect source headings**

Run:

```bash
rg -n "^#{1,4} " "docs/plans/从零到一准备计划 v0.2.md" docs/superpowers/specs/2026-06-15-docs-canonicalization-design.md
```

Expected: v0.2 implementation stages and the canonicalization design requirements are visible.

- [ ] **Step 2: Create the canonical implementation plan**

Copy v0.2 into `docs/plans/从零到一实施计划.md`, rename the title, and add a current-state verification stage before document finalization.

Run:

```bash
cp "docs/plans/从零到一准备计划 v0.2.md" "docs/plans/从零到一实施计划.md"
python3 - <<'PY'
from pathlib import Path
path = Path("docs/plans/从零到一实施计划.md")
text = path.read_text(encoding="utf-8")
text = text.replace("# 从零到一准备计划 v0.2", "# 从零到一实施计划", 1)
insert = """## 阶段 0：当前状态核对\n\n目的：\n\n确认当前未跟踪和已修改的工程文件是否属于可继续使用的项目骨架，避免把未验证的 scaffold 当作已完成基础设施。\n\n任务：\n\n1. 查看 `git status --short`，记录与文档整理无关的既有状态。\n2. 记录当前已有 Web/UI 工作：`apps/web`、`packages/ui`、`pnpm-lock.yaml`、`scripts/`、UI 截图和新的 superpowers specs/plans。\n3. 检查 `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`apps/web/package.json`、`packages/ui/package.json` 是否与技术规格一致。\n4. 检查 `apps/web/.next/`、`.turbo/`、`node_modules/` 是否应被 `.gitignore` 排除。\n5. 运行已建立的验证命令；若命令尚未建立，在执行结果中明确记录。\n6. 不在本阶段清理、回滚或提交与文档整理无关的文件。\n\n验收：\n\n- 当前工程骨架状态有明确记录。\n- 文档整理提交只包含 canonical docs 和 archives 路径。\n- 未验证的工程文件不会被实施计划标记为已完成。\n\n"""
text = text.replace("## 阶段 0：文档与边界固化", insert + "## 阶段 1：文档与边界固化", 1)
text = text.replace("## 阶段 1：Turborepo 最小骨架", "## 阶段 2：Turborepo 最小骨架核对", 1)
text = text.replace("## 阶段 2：Codex Protocol 事实源", "## 阶段 3：Codex Protocol 事实源", 1)
text = text.replace("## 阶段 3：Worker Probe", "## 阶段 4：Worker Probe", 1)
text = text.replace("## 阶段 4：最小 Worker", "## 阶段 5：最小 Worker", 1)
text = text.replace("## 阶段 5：Control Plane", "## 阶段 6：Control Plane", 1)
text = text.replace("## 阶段 6：Web MVP", "## 阶段 7：Web MVP", 1)
text = text.replace("## 阶段 7：iOS 扩展准备", "## 阶段 8：iOS 扩展准备", 1)
text = text.replace("`docs/specs/多设备 Codex 控制台 技术规格 v0.3.md`", "`docs/specs/多设备 Codex 控制台 技术规格.md`")
text = text.replace("`docs/plans/参考项目架构调研计划 v0.1.md`", "`docs/archives/plans/参考项目架构调研计划 v0.1.md`")
path.write_text(text, encoding="utf-8")
PY
```

Expected: the canonical plan exists, has no version suffix in the title, and begins with a current-state verification stage.

- [ ] **Step 3: Verify implementation plan stage numbering**

Run:

```bash
rg -n "^## 阶段 [0-8]：" "docs/plans/从零到一实施计划.md"
```

Expected: stages 0 through 8 are listed in order.

## Task 4: Archive Absorbed Iteration Drafts

**Files:**

- Create: `docs/archives/specs/`
- Create: `docs/archives/plans/`
- Move: absorbed iteration draft files listed in the File Structure section.

- [ ] **Step 1: Create archive folders**

Run:

```bash
mkdir -p docs/archives/specs docs/archives/plans
```

Expected: both archive folders exist.

- [ ] **Step 2: Move absorbed spec drafts**

Run:

```bash
git mv "docs/多设备 Codex 控制台 PRD v0.1.md" "docs/archives/specs/多设备 Codex 控制台 PRD v0.1.md"
git mv "docs/specs/多设备 Codex 控制台 技术规格 v0.2.md" "docs/archives/specs/多设备 Codex 控制台 技术规格 v0.2.md"
git mv "docs/specs/多设备 Codex 控制台 技术规格 v0.3.md" "docs/archives/specs/多设备 Codex 控制台 技术规格 v0.3.md"
```

Expected: the three absorbed spec drafts are staged as renames into `docs/archives/specs/`.

- [ ] **Step 3: Move absorbed plan drafts**

Run:

```bash
git mv "docs/plans/从零到一准备计划 v0.1.md" "docs/archives/plans/从零到一准备计划 v0.1.md"
git mv "docs/plans/从零到一准备计划 v0.2.md" "docs/archives/plans/从零到一准备计划 v0.2.md"
git mv "docs/plans/参考项目架构调研计划 v0.1.md" "docs/archives/plans/参考项目架构调研计划 v0.1.md"
```

Expected: the three absorbed plan drafts are staged as renames into `docs/archives/plans/`.

- [ ] **Step 4: Verify references remain in place**

Run:

```bash
test -f "docs/references/research/参考项目架构调研报告 v0.2.md"
test -f "docs/references/research/参考项目技术调研 v0.1.md"
test -f docs/references/codex-app-server.md
test -f docs/references/openai-codex-app-pages/README.md
test -f docs/references/可参考内容.md
```

Expected: all commands exit successfully.

## Task 5: Validate Documentation Surface

**Files:**

- Check: `docs/specs/`
- Check: `docs/plans/`
- Check: `docs/archives/`
- Check: `docs/references/`

- [ ] **Step 1: List active specs and plans**

Run:

```bash
find docs/specs docs/plans -maxdepth 1 -type f | sort
```

Expected:

```text
docs/plans/从零到一实施计划.md
docs/specs/多设备 Codex 控制台 PRD.md
docs/specs/多设备 Codex 控制台 技术规格.md
```

- [ ] **Step 2: List archived drafts**

Run:

```bash
find docs/archives -maxdepth 2 -type f | sort
```

Expected:

```text
docs/archives/plans/从零到一准备计划 v0.1.md
docs/archives/plans/从零到一准备计划 v0.2.md
docs/archives/plans/参考项目架构调研计划 v0.1.md
docs/archives/specs/多设备 Codex 控制台 PRD v0.1.md
docs/archives/specs/多设备 Codex 控制台 技术规格 v0.2.md
docs/archives/specs/多设备 Codex 控制台 技术规格 v0.3.md
```

- [ ] **Step 3: Check old active version titles are absent**

Run:

```bash
rg -n "PRD v0\\.1|技术规格 v0\\.[23]|准备计划 v0\\.[12]|参考项目架构调研计划 v0\\.1" docs/specs docs/plans || true
```

Expected: no output.

- [ ] **Step 4: Check canonical docs have the required top-level titles**

Run:

```bash
rg -n "^# 多设备 Codex 控制台 PRD$|^# 多设备 Codex 控制台 技术规格$|^# 从零到一实施计划$" "docs/specs/多设备 Codex 控制台 PRD.md" "docs/specs/多设备 Codex 控制台 技术规格.md" "docs/plans/从零到一实施计划.md"
```

Expected: one title match from each canonical document.

- [ ] **Step 5: Check git status for documentation cleanup scope**

Run:

```bash
git status --short docs/specs docs/plans docs/archives docs/superpowers/plans
```

Expected: output is limited to canonical docs, archived drafts, and this implementation plan. If unrelated files appear, do not stage them for the documentation cleanup commit.

## Task 6: Commit Documentation Cleanup

**Files:**

- Stage: `docs/specs/`
- Stage: `docs/plans/`
- Stage: `docs/archives/`
- Stage: `docs/superpowers/plans/2026-06-15-docs-canonicalization.md`
- Do not stage: unrelated application files, build output, root design source files, existing reference imports, or unrelated dirty state.

- [ ] **Step 1: Stage only documentation cleanup paths**

Run:

```bash
git add docs/specs docs/plans docs/archives docs/superpowers/plans/2026-06-15-docs-canonicalization.md
```

Expected: only documentation cleanup files are staged by this command.

- [ ] **Step 2: Inspect staged diff**

Run:

```bash
git diff --cached --stat -- docs/specs docs/plans docs/archives docs/superpowers/plans/2026-06-15-docs-canonicalization.md
```

Expected: the staged diff includes three canonical documents, archived drafts, and the implementation plan. It does not include application source, build artifacts, package files, screenshots, root `PRODUCT.md`, or root `DESIGN.md`.

- [ ] **Step 3: Commit documentation cleanup**

Run:

```bash
git commit -m "docs: canonicalize project documentation"
```

Expected: commit succeeds and includes only the documentation cleanup scope.

- [ ] **Step 4: Report remaining unrelated worktree state**

Run:

```bash
git status --short
```

Expected: any remaining entries are unrelated pre-existing worktree state or files intentionally left out of this documentation cleanup.
