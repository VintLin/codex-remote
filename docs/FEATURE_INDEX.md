# 功能索引

> 本索引按用户任务组织，而不是按代码模块、接口数量或 app-server method 组织。  
> 编号采用金字塔层级：`100`、`200` 是能力组；`101`、`102` 是能力组内的可验收子能力；子能力不再拆成独立薄文件，而是落到对应能力文档的章节里。

## 0. 结论

Codex Remote 当前的产品需求应收敛为 7 个能力文档：对话工作台、审批与请求、任务看板、本地只读工作台、受控本地动作、运行时/账号/配置、高级平台能力。

旧版把每个 protocol row 拆成独立文件，导致需求过散、缺少流程和状态。新版只为用户可理解的能力组建文档；具体动作作为同一工作流的子能力写入流程、状态、UI 表现和验收。

## 1. 文件粒度规则

一个 feature 文件必须能回答完整产品问题：

- 用户为什么需要这个能力？
- 用户从哪里进入？
- 系统经过哪些状态？
- UI 如何表现 loading、empty、running、degraded、failed、disabled？
- 哪些数据可以公开，哪些必须留在 Worker 或 archive？
- 如何验收？

不为以下内容单独建 feature 文件：

- 单个按钮、字段、组件、hook、service、helper。
- 单个 app-server method。
- 只有状态标签、没有用户流程的能力点。

## 2. 状态口径

| 状态 | 含义 |
|---|---|
| `active` | Web -> Control Plane -> Worker 主链已开放，并有当前测试或真实证据。 |
| `active-internal` | 已实现但只作为内部能力，不直接作为 Web 控件暴露。 |
| `partial` | 代码或边界存在，但产品路径、真实证据或 UI 状态仍不完整。 |
| `not-supported` | protocol 可能存在，但 Codex Remote 当前明确不作为产品能力开放。 |
| `codex-remote-only` | Codex Remote 自有能力，不直接对应 app-server protocol。 |

## 3. 能力索引

| ID | 能力 | 状态 | 用户入口 | 规格 | 子能力 |
|---|---|---|---|---|---|
| `100` | 对话工作台 | `active` | Web 工作台 / Sidebar / Main Conversation / Composer | `docs/features/100-conversation-workbench.md` | `101` 启动对话；`102` 打开/恢复；`103` follow-up；`104` interrupt；`105` steer；`106` archive/unarchive；`107` rename；`108` Loaded/Live；`109` timeline read；`110` snapshot events；`111` list pagination；`112` directory isolation；`113` degraded vs empty；`114` realtime stream deferred |
| `200` | 审批与请求 | `partial` | Timeline request cards | `docs/features/200-approval-requests.md` | `201` approval capture；`202` approval decision；`203` auto cleanup |
| `300` | 任务看板 | `active` | Task board / Control Plane | `docs/features/300-task-board.md` | `301` task link validation |
| `400` | 本地只读工作台 | `active` | Local Tools / Settings | `docs/features/400-local-readonly-workbench.md` | `401` filesystem readonly；`402` Git diff summary；`403` fuzzy search；`404` MCP readonly；`405` skills/hooks inventory；`406` plugin/app inventory |
| `500` | 受控本地动作 | `active` | Local Tools confirmed actions | `docs/features/500-controlled-local-actions.md` | `501` review start；`502` shell execution deferred |
| `600` | 运行时、账号与配置 | `not-supported` | Settings（未开放） | `docs/features/600-runtime-account-config.md` | `601` model list deferred；`602` config management deferred；`603` account authentication deferred |
| `700` | 高级平台能力 | `partial` | Settings -> Advanced Platform | `docs/features/700-advanced-platform.md` | `701` Windows Sandbox readiness；`702` advanced watchlist；`703` realtime voice deferred |

## 4. 来源与边界

- 来源快照：`docs/archives/references/2026-06-22-feature-support-matrix-snapshot.md`。
- Public API 字段以 `packages/api-contract/openapi.yaml` 为唯一事实源。
- Codex app-server protocol 以 `packages/codex-protocol` 生成物为唯一事实源。
- 本索引只记录产品能力，不拆 app-server Client Requests / Server Requests / Notifications 的协议覆盖表。

## 5. 更新规则

- 新增或改变产品能力时，优先更新对应能力组文档，而不是新增小文件。
- 只有出现新的独立用户目标、独立入口、独立状态机时，才新增 feature 文件。
- 能力停用时保留索引行，把状态改为 `not-supported`，并在对应文档说明原因。
- 若能力引入不可轻易反转的架构决策，新增 `docs/adr/<id>.md`。
