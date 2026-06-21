# Codex Remote Development Overview

## 总目标

构建一个自托管的多设备 Codex Web 控制台。

核心能力：在一个 Web 工作台中管理多台设备上的 Codex，查看设备状态、项目、对话和输出流，发送 follow-up，中止任务，处理 approval，并把不同设备上的 Codex conversations 关联到任务看板。

当前子目标：在不改变多设备 Control Plane 定位的前提下，把 Web 工作台做成 Codex App-like browser workbench。

```mermaid
flowchart LR
  Web["Web 工作台"]
  CP["Control Plane"]
  Worker["Device Worker"]
  AppServer["Codex app-server"]
  DB["DB / Task Board"]
  IOS["未来 iOS"]

  Web --> CP
  IOS --> CP
  CP --> Worker
  Worker --> AppServer
  CP --> DB
```

## 维护规则

- `PLAN.md` 只保留当前路线、当前状态、活跃阶段和下一步。
- 完成阶段的长证据归档到 `docs/archives/`。
- 阶段细节写入 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`。
- 产品定位以 `PRODUCT.md` 为准；视觉系统以 `DESIGN.md` 为准；目录职责以 `PROJECT_STRUCTURE.md` 为准。
- Codex App-like 能力路线以 `CODEX_APP_PARITY.md` 为准；支持状态以 `FEATURE_SUPPORT.md` 为准。

## 架构原则

- `packages/api-contract/openapi.yaml` 是 Web、Worker、Control Plane、未来 iOS 的唯一 API 事实源。
- `packages/codex-protocol` 是 Codex app-server 协议唯一事实源。
- `packages/db` schema 是持久化字段唯一事实源。
- `apps/worker` 是唯一直接连接 Codex app-server、本机文件系统、Git、Shell 的模块。
- `apps/web` 只能调用 Control Plane-shaped API。
- 每阶段必须有明确目标、non-goals、验证和归档记录。

## 阶段路线

| 阶段 | 目标 | 当前状态 |
| --- | --- | --- |
| 0. 架构底座 | monorepo、包边界、contract/protocol 事实源 | 已完成 |
| 1. Read-only Worker Probe | 验证本机 app-server read-only 主链 | 已完成 |
| 2. Worker HTTP API Read-only | 把 probe 能力变成 Web 可调用 API | 已完成 |
| 3. Web 接真实数据 | Web 从 Worker/Control Plane-shaped API 读取设备、项目、对话、timeline | 已完成 |
| 4. 写操作主链 | start、follow-up、stream 输出 | 已完成 |
| 5. 控制主链 | interrupt、steer、approval request/response | 已完成 |
| 6. Control Plane 多设备 | 多 Worker 注册、路由、状态聚合 | 已完成 |
| 7. 持久化与任务看板 | DB、任务关联、conversation 到任务映射 | 已完成 |
| 8. 产品化与扩展 | self-hosted readiness、运行手册、安全检查、iOS API guardrails | 已完成 |
| 9. 真实本机 Codex 闭环校准 | 用真实 Codex app-server 验证 Stage 3-8 能力 | 已完成；approval decision 留安全 real-gap |
| 10. Isolated Approval Fixture | 隔离验证 approval decision decline/cancel | 已实现 fixture；blocked 于 app-server 未产生 safe pending approval |
| 11. Conversation Workbench Parity | Codex App-like browser workbench | 已重新打开；按新 spec/plan 修正 UI 与验证 |

```mermaid
flowchart TB
  P0["0 Foundation"]
  P1["1 Read-only Probe"]
  P2["2 Worker HTTP API"]
  P3["3 Web Real Datasource"]
  P4["4 Write Path"]
  P5["5 Control Path"]
  P6["6 Multi-device"]
  P7["7 DB + Task Board"]
  P8["8 Product Readiness"]
  P9["9 Real Calibration"]
  P10["10 Approval Fixture"]
  P11["11 Workbench Parity - active"]

  P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8 --> P9 --> P10 --> P11
```

## 当前状态

- Web -> Control Plane -> Worker -> Codex app-server 的本机主链已有 real evidence。
- Approval decision 仍没有稳定真实 pending approval，不能宣称 product-ready。
- Stage 11 已因 UI parity review 重新打开。旧实现证据只能作为协议/API 参考，不能作为 UI parity 完成证据。
- Stage 11A app-server output calibration 已完成只读设计核对；当前 dirty draft 的实现处理仍未开始。

## Active Stage 11

Active docs:

- `docs/superpowers/specs/2026-06-21-conversation-workbench-parity-design.md`
- `docs/superpowers/plans/2026-06-21-conversation-workbench-parity.md`
- `docs/references/2026-06-21-feature-support-ui-audit.md`
- `docs/references/2026-06-21-app-server-protocol-inventory.md`

Stage 11 当前方向：

- Start/follow-up/interrupt/steer/queue 收敛到 composer。
- Archive 立即从正常侧边栏消失，恢复入口在 Settings -> 已归档对话。
- Timeline 显示安全的 app-like conversation content，不以 metadata-only 作为最终 UX。
- Request cards 进入 timeline/workbench flow。
- Assistant message action row 保留 copy、thumbs up/down、fork/派生、hooks、timestamp，占位必须 disabled/TODO。
- Permission menu 保留 UI，但必须从 app-server 协议反推，不得添加未确认行为。

Stage 11A reconciliation 结论：

- `ConversationTimelineNode` public model 方向可保留，但必须补 `Turn.itemsView` / partial snapshot 状态、生成类型和 redaction tests。
- Worker `ThreadItem` projection 必须重写为显式安全投影；禁止暴露 raw command、cwd、aggregated output、full diff、MCP arguments/results、collab prompt、image path、raw reasoning。
- Web 只能渲染 public timeline node；不能把 unknown tool 或 command/image 映射成 file-change UI。
- Permission menu 只能作为 disabled/protocol-derived placeholder，直到 OpenAPI 定义 public permission model。
- `local-project` 作为当前单项目边界可暂留，但必须记录为 deferred multi-project discovery。

Stage 11 non-goals：

- rollback、raw `inject_items`、任意 shell/filesystem 写、plugin install、account login/logout、realtime voice、Windows setup、feedback upload、external agent import、production approval safety model。

## Stage 11+ Draft Roadmap

1. Stage 11：Conversation Workbench Parity。Codex App-like browser workbench：open/resume、archive/unarchive、rename、loaded/live badge、snapshot-first timeline 内容展示、Worker-projected live/request events、approval/request pending/resolved cards、composer 内 start/follow-up/interrupt/steer/queue、Settings -> 已归档对话、assistant message action row、protocol-derived permission menu placeholder。
2. Stage 12：Local Work Tools Read-only。项目文件树/metadata/preview、command history/output、turn diff/working tree diff、review findings、fuzzy search、MCP status/resources/tools list、plugin/skills/hooks/apps list。
3. Stage 13：Controlled Local Actions。显式用户 shell command、allowlisted project actions、review start、stage/unstage/revert hunk/file、enable/disable skill、OAuth/login-like flows with local confirmation。
4. Stage 14：Runtime And Extension Management。模型/profile、sanitized account/read、device platform/sandbox/auth projection、config read-only、skills/plugins/MCP/apps richer management。
5. Stage 15+：Advanced Platform Watchlist。realtime voice、Windows sandbox setup/readiness、feedback upload、external agent config import、remote GUI/computer use、automations。

## 当前技术栈

- TypeScript
- pnpm
- Turborepo
- Next.js Web
- OpenAPI 3.1
- openapi-typescript
- Node built-in test runner
- Node `fetch` / `WebSocket`
- Codex CLI app-server
- `packages/api-contract`
- `packages/codex-protocol`
- `apps/worker`

## 每阶段交付标准

- `docs/superpowers/specs/YYYY-MM-DD-xxx-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-xxx.md`
- subagent 审核记录
- focused tests
- `pnpm product:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Chrome 网页验证结果
- 阶段总结和归档记录

## 已归档内容

- Stage 2-10 spec/plan：`docs/archives/specs/` 与 `docs/archives/plans/`
- Stage 11 pre-consensus spec/plan：`docs/archives/specs/2026-06-21-conversation-workbench-parity-design-pre-consensus.md` 与 `docs/archives/plans/2026-06-21-conversation-workbench-parity-pre-consensus.md`
- Root `PLAN.md` 历史证据摘要：`docs/archives/references/2026-06-21-plan-history.md`
- 调研回答：`docs/references/questions/`

## 下一步

下一步执行 Stage 11A 的最小实现动作：先修 contract/tests，再按 public model 重写 Worker projection 和 Web rendering。
