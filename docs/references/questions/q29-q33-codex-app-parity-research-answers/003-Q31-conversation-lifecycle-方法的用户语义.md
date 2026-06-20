---
title: "Q31：conversation lifecycle 方法的用户语义"
source_url: "https://chatgpt.com/c/6a36fb76-9118-83ee-95ff-24ed23a703a3"
exported_at: "2026-06-21T04:59:29"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

这些方法不应一一暴露为按钮。Codex Remote 应把它们归并成 6 类用户语义：**继续/打开、分支、整理、命名、长期目标、维护/恢复**。其中近期最适合产品化的是：`resume`、`archive/unarchive`、`name/set`、`loaded/list` 状态投影；可以进入下一阶段的是 `fork`、`goal`、`compact`；`rollback` 和 `inject_items` 应先做本地验证和内部封装，不建议直接开放给普通用户。

官方产品层面，Codex App 被定义为一个面向多项目、多线程并行工作的 desktop command center，支持 project sidebar、active thread、review pane、worktrees、automations、Git 功能、远程连接、sidebar/artifacts 等体验。官方 app-server 文档则明确 app-server 是给 rich clients 使用的协议层，覆盖 authentication、conversation history、approvals、streamed agent events，并通过 JSON-RPC 暴露 thread lifecycle。也就是说：**App UX 是产品语义源，app-server method 是实现细节源**。([OpenAI Developers][1])

---

## 1. 方法到用户意图的映射表

| app-server 方法          | 官方/协议明示行为                                                                                                                         | Codex Remote 用户语义                                               | 推荐用户可见文案              | 事实层级               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- | ------------------ |
| `thread/resume`        | 重新打开已有 thread，使后续 `turn/start` 追加到该 thread；可返回 turn history 或只返回 metadata，并可用 `initialTurnsPage` 分页加载初始历史。([GitHub][2])           | 打开一个历史 conversation，并让它进入可继续、可接收 follow-up、可接收 live events 的状态。 | “继续对话”“打开线程”          | **官方明示 + 产品推断**    |
| `thread/fork`          | 从已有 thread 复制历史并创建新 thread id；若源 thread 正在运行，会记录类似 interrupt 的 marker；返回 `forkedFromId`；可 `ephemeral`。([GitHub][2])               | 从当前上下文创建一个分支，用于尝试另一条方案，不污染原 conversation。                       | “从这里分支”“试另一种方案”“创建副本” | **官方明示 + 产品推断**    |
| `thread/archive`       | 将 persisted rollout 移到 archived sessions 目录，并尝试移动 descendant thread rollouts；成功后不再出现在默认 `thread/list`，除非请求 archived。([GitHub][2]) | 从主列表隐藏 conversation，但不删除；用于清理 sidebar/inbox。                    | “归档”                  | **官方明示**           |
| `thread/unarchive`     | 将 archived rollout 移回 sessions 目录，返回 restored `thread`，发出 `thread/unarchived`。([GitHub][2])                                       | 从归档区恢复 conversation，使其重新出现在原项目/线程列表。                            | “取消归档”“恢复到列表”         | **官方明示**           |
| `thread/name/set`      | 设置或更新 user-facing thread name；可作用于 loaded 或 persisted rollout；名称不要求唯一。([GitHub][2])                                               | 给 conversation 改标题；标题只是显示名，不能作为稳定身份。                            | “重命名”                 | **官方明示**           |
| `thread/goal/set`      | 创建或更新 materialized thread 的单一 persisted goal；可设置 objective、tokenBudget、status；返回当前 goal 并发出 update。([GitHub][2])                  | 让 Codex 围绕长期目标持续推进；适合“修到测试通过”“持续优化直到指标达标”。                      | “设置目标”“Goal mode”     | **官方明示 + 产品推断**    |
| `thread/goal/get`      | 读取当前 persisted goal；无 goal 时返回 `goal: null`。([GitHub][2])                                                                         | 展示该 conversation 是否处于 Goal mode，以及目标、预算、状态、进度。                  | “查看目标”                | **官方明示**           |
| `thread/goal/clear`    | 清除当前 persisted goal；返回 `cleared`，状态变化时发出 cleared notification。([GitHub][2])                                                       | 停止以长期目标方式推进，但不删除 conversation。                                  | “清除目标”“停止目标模式”        | **官方明示 + 产品推断**    |
| `thread/compact/start` | 触发手动历史压缩；请求立即返回 `{}`，进度通过标准 `turn/*` 和 `item/*` 通知流出；运行时 thread 等同处于 turn 中。([GitHub][2])                                         | 压缩/总结长上下文，让后续继续可用；属于维护动作，不是普通聊天动作。                              | “压缩上下文”“整理历史以继续”      | **官方明示 + 产品推断**    |
| `thread/rollback`      | 从 agent 的 in-memory context 删除最后 N 个 turns，并在 rollout 中持久化 rollback marker；成功返回更新后的 thread。([GitHub][2])                          | 回退 conversation 上下文到较早状态；不是 Git revert，也不应暗示会撤销文件系统改动。          | “回退对话上下文”             | **协议明示；产品语义需验证**   |
| `thread/loaded/list`   | 返回当前内存中 loaded 的 thread ids；用于检查哪些 sessions 活跃，无需扫描磁盘 rollouts。([GitHub][2])                                                      | 后端状态探针，用于给 sidebar 打 live/active badge；不是用户操作。                  | 不直接展示为按钮              | **官方明示 + 内部实现推断**  |
| `thread/inject_items`  | 向 loaded thread 的 model-visible history 追加 raw Responses API items，不启动 user turn；items 会持久化并进入后续 model requests。([GitHub][2])     | 内部上下文注入、迁移、自动化结果写入；不应让用户提交 raw items。                           | 不暴露；最多包装成“添加上下文”      | **协议明示；产品语义高风险推断** |

---

## 2. 每项建议 UI 支持面

| 能力                 | Sidebar / Navigator                          | Main Conversation                                | Right Detail Pane                             | Tool Surface                             | Status / Badge                                | Modal / Popover                        | 近期实现建议        |
| ------------------ | -------------------------------------------- | ------------------------------------------------ | --------------------------------------------- | ---------------------------------------- | --------------------------------------------- | -------------------------------------- | ------------- |
| Resume / Continue  | 点击 conversation row 打开；支持最近/项目/状态过滤          | 加载历史，composer 可继续发送 follow-up                    | 显示 thread metadata、model、mode、项目、最近活动         | 可放入 Command Palette：“Open recent thread” | `active` / `idle` / `not loaded` / `error`    | 仅错误时弹 toast/detail                     | **立即做**       |
| Fork / Branch      | row 菜单：“Branch from here”                    | 可从某条消息或当前末尾分支                                    | 显示 `forkedFromId` 对应的来源 conversation          | Command Palette；消息菜单                     | “branched” / “from …”                         | 模态选择：Local / Worktree、标题、是否立即追加 prompt | **下一阶段**      |
| Archive            | row 菜单；批量选择                                  | 当前打开的 thread 被归档后跳转列表或显示 archived banner         | archived 状态只读详情                               | Command Palette：“Archive current thread” | “Archived”                                    | 归档确认，说明不是删除                            | **立即做**       |
| Unarchive          | Archived filter / Settings-like archive view | 恢复后可打开并继续                                        | 显示恢复位置和项目                                     | Command Palette                          | “Restored”                                    | 简单确认或 toast                            | **立即做**       |
| Rename             | row inline edit；row menu                     | 标题可编辑                                            | metadata 区可编辑                                 | Command Palette                          | 无需 badge                                      | 小 popover 输入标题                         | **立即做**       |
| Goal set/get/clear | row 上显示 goal icon；可按 goal 状态过滤               | composer shortcut：`/goal` 或“Set goal”；目标消息可固定在顶部 | Goal card：objective、status、budget、tokens、time | Goal panel / Command Palette             | `goal: active/blocked/budget/usage/completed` | 设置/编辑/清除目标的 modal                      | **下一阶段，小心灰度** |
| Compact            | 不建议放 row 主操作；可在长线程警告里出现                      | Timeline 中显示“Compacting context…” item           | Context health / token usage 卡片               | Command Palette：“Compact context”        | `compacting`                                  | 确认弹窗：说明会整理历史，不会改代码                     | **下一阶段，先状态化** |
| Rollback           | 不放 sidebar 主菜单；可在 advanced menu              | 从 turn/message 的 “Rewind to here” 触发             | 预览将移除哪些 turns；显示文件改动不会自动回滚                    | Advanced tools only                      | `rolled back` marker                          | 必须有 preview + confirm；建议默认先 fork       | **暂缓**        |
| Loaded list        | 用于装饰 row 是否 live/loaded                      | 无直接 UI                                           | Debug detail 可显示 loaded session               | Worker diagnostics                       | `live` / `active` badge                       | 无                                      | **立即做，内部能力**  |
| Inject items       | 不展示                                          | 不直接插入用户可见消息，除非转换为普通 system/context note          | Debug/automation detail 可记录 redacted summary  | Internal API only                        | `context updated` 可选内部 event                  | 不给普通用户 raw item modal                  | **暂缓，仅内部**    |

产品依据：Codex App 官方文档已经把核心界面描述为 project sidebar、active thread、review pane、task sidebar/artifacts、Git diff/review pane、integrated terminal、worktrees、automations 等组合；其中 thread 管理可以包括 find、continue、pin、archive，task sidebar 用于跟踪 plan、sources、artifacts、summary 并让用户 steer。([OpenAI Developers][1])

---

## 3. 公开 API 输入/输出字段类型建议

### 3.1 公共类型

不要把 app-server 的 `threadId`、`cwd`、`path`、rollout path、worktree path 暴露给 Web。公开 id 应由 Control Plane/Worker 投影为 opaque id；Worker 本地维护映射。app-server 文档示例中会出现 `thread.path`、`instructionSources`、absolute path、`cwd` 等本机路径概念，Remote Web API 必须隔离这些字段。([GitHub][2])

```ts
type OpaqueId = string;

type DeviceId = OpaqueId;
type ProjectId = OpaqueId;
type ConversationId = OpaqueId;
type TurnId = OpaqueId;
type OperationId = OpaqueId;
type ISODateTime = string;

type ConversationStatus =
  | "not_loaded"
  | "idle"
  | "active"
  | "system_error"
  | "archived"
  | "unknown";

type ConversationMode =
  | "local"
  | "worktree"
  | "cloud"
  | "remote"
  | "unknown";

type ConversationSummary = {
  id: ConversationId;
  deviceId: DeviceId;
  projectId: ProjectId;
  title: string | null;
  preview: string | null;
  status: ConversationStatus;
  mode: ConversationMode;
  archived: boolean;
  forkedFromId?: ConversationId | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  lastActivityAt?: ISODateTime | null;
  unread?: boolean;
  badges?: Array<"active" | "goal" | "compacting" | "archived" | "error">;
};

type ConversationGoal = {
  conversationId: ConversationId;
  objective: string;
  status:
    | "active"
    | "blocked"
    | "budget_limited"
    | "usage_limited"
    | "completed"
    | "unknown";
  tokenBudget?: number | null;
  tokensUsed?: number | null;
  timeUsedSeconds?: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type PageRequest = {
  limit?: number;
  cursor?: string | null;
  sortDirection?: "asc" | "desc";
};

type Page<T> = {
  data: T[];
  nextCursor: string | null;
  backwardsCursor?: string | null;
};
```

app-server 明确 thread status 可能是 `notLoaded`、`idle`、`systemError`、`active`，且 `active` 表示正在运行；Remote 应把这些转成稳定的 Web-facing enum。([GitHub][2])

### 3.2 Lifecycle API shape

| 用户语义                | 建议公开 API                                                                                | 输入                                                                                                                                                    | 输出                                                                                                                             | 说明                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 打开/继续 conversation  | `POST /v1/conversations/{conversationId}/open`                                          | `{ projectId?: ProjectId; initialTurnsPage?: PageRequest; live?: boolean }`                                                                           | `{ conversation: ConversationSummary; turns?: Page<TurnSummary>; stream?: { snapshotVersion: string; nextEventId?: string } }` | 内部可调用 `thread/resume`；Web 只表达“open/continue”。                                            |
| 从当前 conversation 分支 | `POST /v1/conversations/{conversationId}/branches`                                      | `{ title?: string; mode?: "local" \| "worktree"; fromTurnId?: TurnId; startPrompt?: TurnInput[]; ephemeral?: boolean }`                               | `{ conversation: ConversationSummary; forkedFromId: ConversationId }`                                                          | 内部可调用 `thread/fork`，但不要暴露 `ephemeral` 给普通用户，除非做临时试验会话。                                   |
| 归档                  | `POST /v1/conversations/{conversationId}/archive`                                       | `{}` 或 `{ includeDescendants?: boolean }`                                                                                                             | `{ conversationId: ConversationId; archived: true; affectedConversationIds?: ConversationId[] }`                               | 协议会尝试处理 descendant rollouts；公开 API 可返回 affected list，但不能泄露 rollout path。                 |
| 取消归档                | `POST /v1/conversations/{conversationId}/unarchive`                                     | `{}`                                                                                                                                                  | `{ conversation: ConversationSummary }`                                                                                        | 可回到原项目位置；若项目不可用，返回 degraded restore 状态。                                                  |
| 重命名                 | `PATCH /v1/conversations/{conversationId}`                                              | `{ title: string }`                                                                                                                                   | `{ conversation: ConversationSummary }`                                                                                        | title 非唯一；所有后续操作仍以 opaque id 为准。                                                         |
| 读取 goal             | `GET /v1/conversations/{conversationId}/goal`                                           | none                                                                                                                                                  | `{ goal: ConversationGoal \| null }`                                                                                           | 对应 `thread/goal/get`。                                                                    |
| 设置/更新 goal          | `PUT /v1/conversations/{conversationId}/goal`                                           | `{ objective?: string; tokenBudget?: number \| null; status?: ConversationGoal["status"] }`                                                           | `{ goal: ConversationGoal }`                                                                                                   | `objective` 和 status 更新要分权限：普通用户改 objective，系统可写 `blocked/budget_limited/usage_limited`。 |
| 清除 goal             | `DELETE /v1/conversations/{conversationId}/goal`                                        | none                                                                                                                                                  | `{ cleared: boolean }`                                                                                                         | 对应 `thread/goal/clear`。                                                                  |
| 压缩上下文               | `POST /v1/conversations/{conversationId}/compact`                                       | `{ reason?: "manual" \| "near_context_limit"; clientMutationId?: string }`                                                                            | `{ operationId: OperationId; status: "accepted"; conversation: ConversationSummary }`                                          | 后续通过 lifecycle/timeline events 发 `compacting_started/completed/failed`。                  |
| rollback preview    | `POST /v1/conversations/{conversationId}/rollback-preview`                              | `{ toTurnId?: TurnId; dropLastTurns?: number }`                                                                                                       | `{ removableTurns: TurnSummary[]; warning: string; affectedFiles?: FileChangeSummary[] }`                                      | 先 preview，避免用户误以为会回滚文件。                                                                  |
| rollback apply      | `POST /v1/conversations/{conversationId}/rollback`                                      | `{ toTurnId?: TurnId; dropLastTurns?: number; createSafetyFork?: boolean; reason?: string }`                                                          | `{ conversation: ConversationSummary; rollbackMarkerId?: string; forkedConversation?: ConversationSummary }`                   | 默认建议 `createSafetyFork: true`。                                                           |
| 活跃 conversation 列表  | `GET /v1/conversations?loaded=true` 或 `GET /v1/devices/{deviceId}/loaded-conversations` | query only                                                                                                                                            | `{ data: Array<{ conversationId: ConversationId; status: ConversationStatus; activeFlags?: string[] }> }`                      | 内部用 `thread/loaded/list`；用于 badge/reconciliation。                                        |
| 内部上下文注入             | `POST /internal/conversations/{conversationId}/context-items`                           | `{ source: "migration" \| "automation" \| "reconciliation"; redactedSummary: string; itemsRef: string; visibility: "model_only" \| "timeline_note" }` | `{ accepted: true; operationId: OperationId }`                                                                                 | 不开放给普通 Web 客户端；不要允许 raw Responses item 从浏览器直达 Worker。                                    |

Turn 输入可继续沿用你现有 Control Plane-shaped API 的 `input: Array<{type:"text"; text:string} | {type:"image"; assetId:string} | {type:"file"; assetId:string}>`，不要把 app-server `localImage.path`、absolute path 或 plugin path 直接公开。app-server turn input 支持 text/image/localImage 等，但 Remote 应把本地路径转换为 Worker 内部引用。([GitHub][2])

---

## 4. 每项风险与近期实现判断

| 能力                   | 主要风险                                                                                                                                                                                                                                                      | 近期建议                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `resume`             | 归档 thread 可能不能 resume/fork；path/cwd/worktree 不一致可能导致恢复失败；大历史加载会卡 UI；live subscription 与 snapshot reconciliation 容易重复事件。官方 changelog 明确 archived sessions 在恢复前受 resume/fork 保护，app-server 也支持 `excludeTurns` 和 `initialTurnsPage`。([OpenAI Developers][3]) | **实现**。用“打开 conversation”语义，默认分页加载 turns，resume 只由 Worker 做。    |
| `fork`               | 用户可能误解为 Git branch/worktree；从 active thread fork 的语义复杂；fork 后文件系统隔离需要和 worktree mode 对齐；title 继承曾有 bug。([GitHub][2])                                                                                                                                      | **下一阶段**。先支持 completed/idle thread 的 fork，再支持 active fork。      |
| `archive/unarchive`  | archive 可能影响 descendants；unarchive 时原 project/worktree 可能不存在；归档不是删除，UI 要避免误导。官方 troubleshooting 说明 archived threads 在 Settings 中找到，unarchive 后回到 sidebar 原位置。([OpenAI Developers][4])                                                                     | **实现**。放在 row menu + archived filter。                           |
| `name/set`           | 名称不唯一，不能作为 routing key；多端同时改名会有最后写入问题；fork/rename 继承细节需测。([GitHub][2])                                                                                                                                                                                    | **实现**。只做 display title，ID 始终 opaque。                           |
| `goal/set/get/clear` | Goal 会驱动长期任务，可能产生费用、持续 turns、approval 等；状态枚举与自动继续逻辑会变化；ephemeral/materialized thread 差异要测。官方 release 说明 Goal mode 已不再 experimental，可让 Codex 朝目标推进数小时甚至数天。([OpenAI Developers][3])                                                                         | **下一阶段灰度**。先做只读 goal card + 手动 set/clear，不先做自动继续策略。             |
| `compact/start`      | compaction 期间 thread 等同 active turn；会影响 timeline event ordering；失败恢复和用户可解释性重要；用户可能误解为删除历史。([GitHub][2])                                                                                                                                                   | **下一阶段**。先自动/半自动触发，并在 timeline 显示 maintenance item。             |
| `rollback`           | 最大风险：它只回退 agent context/rollout，不等于回滚 Git diff 或文件系统；可能让 transcript、diff、workspace 状态不一致。([GitHub][2])                                                                                                                                                    | **暂缓**。先做 preview + safety fork + local validation。             |
| `loaded/list`        | loaded 不等于 running；loaded thread 会在无 subscriber/无活动 30 分钟后关闭，不能当成持久在线 truth。([GitHub][2])                                                                                                                                                                 | **实现为内部状态源**。只用于 badge/reconciliation，不做按钮。                     |
| `inject_items`       | 可直接污染 model-visible history；raw Responses items schema 变化、权限、审计、脱敏风险高；浏览器直传 raw item 是危险接口。([GitHub][2])                                                                                                                                                  | **暂缓，只做内部**。用户可见“添加上下文”应走普通 turn/file/mention，不走 raw injection。 |

---

## 5. 必须本地 app-server 验证的语义

官方资料足以确认方法存在和大体行为，但不足以确认你要暴露给 Web 的产品语义。以下必须本机验证：

1. **Resume 与 archived/project path 的边界**：archived thread 是否完全拒绝 resume/fork、错误码如何；project root 不存在、worktree 被删、symlink realpath 不一致时的错误形态；`excludeTurns` + `initialTurnsPage` 的分页稳定性。官方只说明 archived sessions 受保护、resume 支持分页，不能替代你的 Worker guard 验证。([OpenAI Developers][3])

2. **Fork 的 active turn 行为**：协议说明 active source 会记录 interruption marker，但 UI 是否应显示“从中断点分支”、fork 后是否继承 title/model/permissions/goal/worktree，需要本地验证。([GitHub][2])

3. **Archive descendant 行为**：`thread/archive` 会尝试移动 spawned descendant rollouts，但 public API 是否返回 affected descendants、`thread/list` 是否仍可按 parent 查询到 archived children，需要验证。([GitHub][2])

4. **Rename 的并发与通知**：协议说 name 非唯一，并会发 `thread/name/updated`；多端/多 Worker 同步时应验证 event ordering、read/list 何时反映新 title。([GitHub][2])

5. **Goal 的 materialized/ephemeral 限制**：协议说 goal 作用于 materialized thread；release notes 又显示 goal workflows、mobile `/goal`、remote app-server sessions 仍在快速变化。需要验证 ephemeral fork、archived thread、active turn、usage limit、blocked 状态的真实行为。([GitHub][2])

6. **Compact 与 active turn 互斥**：协议说 compaction running 时 thread effectively in a turn；需要验证 active turn 中能否 compact、compact 是否可 interrupt、事件是否包含稳定 `contextCompaction` item id、失败时 status 如何恢复。([GitHub][2])

7. **Rollback 是否影响文件变更**：协议只说 drop last N turns from agent context 并持久化 marker；必须验证它是否完全不改 Git/workspace、能否对 active/archived/notLoaded thread 使用、以及后续 resume/list/read 如何展示 marker。([GitHub][2])

8. **Loaded/list 与真实 active 的关系**：`loaded/list` 是 loaded-in-memory，不是 active turn 列表；需要和 `thread/status/changed`、`thread/closed`、turn events 做 reconciliation。([GitHub][2])

9. **Inject items 的审计/可见性**：协议说 items 会持久化并进入后续 model requests；必须验证这些 items 是否出现在 read/list/timeline、是否触发 notifications、是否能被用户导出、是否会绕过你现有脱敏规则。([GitHub][2])

10. **协议漂移**：官方 app-server 文档明确可以从 CLI 生成 TypeScript schema / JSON Schema，且输出与运行的 Codex 版本精确匹配；Codex Remote 必须把生成物版本纳入 capability detection，而不是只看文档。([OpenAI Developers][5])

---

## 6. 推荐落地顺序

### Stage A：立即 productize

实现 `resume/open`、`archive/unarchive`、`rename`、`loaded status badge`。这四项与 Codex App 用户语义最接近，风险低，且能补齐完整 conversation lifecycle 的基础闭环。

最小 UI：

```text
Sidebar row:
- click: open / resume
- context menu: Rename, Archive
- filter: Active / Archived / Chronological
- badge: Active, Goal, Error, Archived

Main Conversation:
- open existing conversation
- continue follow-up
- live timeline reconciliation

Right Detail Pane:
- title, project display name, device, mode, status
- no local path
```

### Stage B：下一阶段灰度

实现 `fork`、`goal`、`compact`。这些已经有明确协议基础，但用户语义更复杂。

建议：

```text
Fork:
- label: “Branch from here”
- default: create in worktree when project is Git repo
- never imply it is a Git branch unless actual worktree/branch created

Goal:
- first ship read-only Goal card + set/clear
- do not immediately implement autonomous continuation loops
- show budget/status clearly

Compact:
- show as maintenance item
- do not call it “delete history”
- treat as active operation with progress events
```

### Stage C：暂缓

`rollback` 和 `inject_items` 先不要做普通用户按钮。

`rollback` 应先实现 `rollback-preview`，并在 UI 明确写出：**只回退 Codex 对话上下文，不保证撤销本地文件改动**。更安全的默认行为是先 fork，再在 fork 上 rollback。

`inject_items` 应只做 Worker/internal API，用于迁移、automation result、snapshot reconciliation、系统生成摘要。普通 Web 用户需要“追加上下文”时，应通过 `turn/start` 的文本、文件、图片、mention 等公开输入表达，而不是提交 raw Responses API items。

---

## 来源边界

**官方产品 UX 明示**：Codex App 是多项目、多线程 command center；支持 project sidebar、active thread、review pane、worktrees、Git review、terminal、task sidebar/artifacts、automations、remote/mobile start/steer/approve/review。([OpenAI Developers][1])

**官方 app-server / 公开协议明示**：app-server 面向 rich clients，覆盖 conversation history、approvals、streamed events；协议用 JSON-RPC；`thread/resume/fork/archive/unarchive/name/goal/compact/rollback/loaded/list/inject_items` 的行为来自官方 OpenAI Codex app-server 文档和 openai/codex 公开源码说明。([OpenAI Developers][5])

**本文推断**：所有公开 REST API 命名、UI placement、opaque id 模型、近期实现顺序，是基于官方产品语义 + app-server 行为 + 你给出的 Codex Remote 架构约束推导出来的产品化建议，不是 OpenAI 官方 API 契约。

[1]: https://developers.openai.com/codex/app "App – Codex | OpenAI Developers"
[2]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[3]: https://developers.openai.com/codex/changelog "Changelog – Codex | OpenAI Developers"
[4]: https://developers.openai.com/codex/app/troubleshooting "Troubleshooting – Codex app | OpenAI Developers"
[5]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
