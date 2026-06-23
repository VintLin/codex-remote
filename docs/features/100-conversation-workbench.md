# 100 对话工作台

状态：`active`  
负责人：`web/conversation`  
最近审阅：2026-06-22

## 0. 结论

对话工作台是 Codex Remote 的主工作流：用户从 Sidebar 选择或创建 conversation，在 Main Conversation 查看 timeline，在 Composer 发起 start / follow-up / interrupt / steer，在 Settings 恢复 archived conversations。

这个能力不是 `thread/*` 和 `turn/*` method 的按钮集合。产品语义是“打开一个远程设备上的 Codex 工作上下文，并安全地继续或控制它”。所有 app-server 调用必须经 Worker 投影为 public contract；Web 不接触 raw JSON-RPC、raw prompt、command output、full diff、本机绝对路径或 app-server URL。

## 1. 用户目标

用户需要在浏览器里管理多台设备上的 Codex conversation，快速判断哪个会话正在运行、打开历史上下文、继续发送指令、必要时中断或引导当前执行，并把无关或完成的会话归档。

成功体验：

- 进入页面后能看到设备、project、conversation 列表和状态。
- 选择 conversation 后能看到安全 timeline。
- Composer 根据当前状态展示 start、follow-up、interrupt、steer。
- 系统能区分“真的没有数据”和“Worker/依赖降级”。

## 2. 范围

范围内：

- 启动新 conversation。
- 打开/恢复已有 conversation。
- 发送 follow-up。
- 中断 running turn。
- 引导 running turn。
- 归档/恢复 conversation。
- 重命名 conversation。
- 展示 Loaded/Live badge。
- 读取安全 timeline。
- 从 snapshot / Worker registry 投影 request/lifecycle events。
- Worker 内部 drain list pagination cursor。
- conversation directory isolation。
- degraded vs empty state。

范围外：

- durable realtime output stream。
- rollback、compact、goal、fork 的完整产品行为。
- raw `inject_items`。
- Web 直接调用 app-server。
- 展示 raw command output、raw prompt、full diff、本机绝对路径。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 开始新工作 | Shared composer，未选中 conversation | Web 调 Control Plane-shaped API，Worker 调 `thread/start` + `turn/start` | Composer 进入提交中；成功后选中新 conversation 并加载 timeline |
| 回到旧工作 | Sidebar conversation row | Worker 读取并投影 `thread/read` / `thread/resume` 结果 | Main Conversation 显示 timeline；partial snapshot 使用安全 metadata fallback |
| 继续对话 | Shared composer，已选中 conversation | Worker 调 `turn/start` | 新 turn 出现在 timeline；running state 更新 |
| 停止当前执行 | Composer running state | Worker 调 `turn/interrupt`，必须匹配 `expectedTurnId` | Interrupt 按钮进入 pending；失败显示脱敏错误 |
| 调整当前执行方向 | Composer running state | Worker 调 `turn/steer`，必须匹配 `expectedTurnId` | “引导当前执行”提交后保持 running 上下文 |
| 清理列表 | Conversation actions | Worker 调 `thread/archive` / `thread/unarchive` | archived row 从默认 Sidebar 消失；Settings 可恢复 |
| 修改识别名 | Detail action row | Worker 调 `thread/name/set` | Sidebar 和 detail title 同步更新 |

## 4. 状态模型

```text
no-selection
  -> draft-start
  -> starting
  -> loaded-idle
  -> running
  -> waiting-request
  -> loaded-idle

loaded-idle
  -> followup-submitting
  -> running

running
  -> interrupt-pending
  -> interrupted | running

running
  -> steer-submitting
  -> running

loaded-idle
  -> archived
  -> restored
```

状态规则：

- `running` 时显示 interrupt 和 steer，隐藏 start 语义。
- `loaded-idle` 时 composer 表示 follow-up。
- 无 conversation 时 composer 表示 start。
- `archived` conversation 不出现在默认 Sidebar，只从 Settings -> 已归档对话恢复。
- Worker unavailable 是 degraded，不是 empty。

## 5. 页面表现规格

### 5.1 页面区域

| 区域 | 位置 | 作用 | 受影响组件/代码入口 | 默认显示 |
|---|---|---|---|---|
| Primary nav | 左侧顶部 | 在设备、搜索、Local Tools、任务、设置之间切换 | `Sidebar` | 是 |
| Sidebar conversation navigation | 左侧主体 | 展示可打开的 agent conversation，并支持项目分组、置顶分组、相邻对话导航 | `Sidebar` / `createSidebarModel` | 是 |
| Main conversation header | 中间顶部 | 展示当前 conversation title、状态 badge、重命名/归档操作、数据源状态 | `ConversationMain` | 是 |
| Timeline | 中间内容区 | 展示当前 conversation 的安全 timeline、request card、tool/file/link detail 入口 | `CodexAssistantThread` | 选中 conversation 后显示 |
| Composer | 中间底部 | 根据上下文提供 start / follow-up / interrupt / steer | `CodexAssistantThread` 内部 composer | 是 |
| Right detail pane | 右侧 | 展示 timeline link/tool/file/diff/image 等安全 detail | `ConversationDetailPane` / `DetailWorkspace` | 有 detail target 时显示 |
| Settings archived conversations | Settings 页面 | 恢复 archived conversation | `SettingsPage` | 进入 Settings 后显示 |

### 5.1.1 连接入口

连接入口是进入对话工作台前的加载 gate，用于恢复上次选择的设备，并让用户理解当前连接进度。它不是 marketing onboarding，也不是隐藏真实加载状态的 splash screen。

布局规则：

- 左右工作台侧栏在连接期间保持收起；只有连接完成后进入正常工作台布局。
- 连接入口整体居中显示，不使用大卡片；内容由左侧设备列表和右侧连接步骤组成。
- 左侧设备列表最多显示前三台设备。若已记录上次选择设备，则该设备排在第一位；设备未知但有选中 id 时，仍显示正在尝试的设备。
- 右侧显示产品名称、当前加载摘要、四步连接进度和失败重试入口。

连接步骤：

| 顺序 | 用户可见步骤 | 通过条件 | 失败归属 |
|---|---|---|---|
| 1 | 连接控制中心 | Web 可以访问当前连接配置和设备目录。 | 控制中心不可达、未配置连接、连接凭证无效。 |
| 2 | 连接上次使用的设备 | 上次选择或当前选择的设备可被解析，并保留设备切换入口。 | 设备不可达。 |
| 3 | 启动 Codex 本机服务 | 设备连接已建立，且该设备上的本机 Codex 服务可以响应请求。 | Codex 本机服务未就绪、请求超时。 |
| 4 | 载入对话记录与工作区 | 项目、对话列表、当前 timeline 和工作区入口已准备好。 | 对话记录暂不可读。 |

显示规则：

- 正常工作台必须等四步全部完成后才展示。不得在第 2 步“连接上次使用的设备”后直接进入首页。
- 四步完成后，连接入口应短暂停留完成态，显示“连接步骤已完成，正在打开工作区”，再进入主工作区。
- 当前加载摘要区域显示左侧 loading 动画、当前步骤主说明和至少两条细节说明。
- loading 细节必须使用用户可理解名称，例如“设备目录”“本机 Codex 服务”“对话记录与工作区”；不得暴露 `Control Plane`、`Worker`、`runtime`、`JSON-RPC`、`app-server` 等内部术语。
- 连接失败时保留当前步骤定位和重试按钮；失败态不显示 loading 动画。
- 连接完成进入工作台后，应显示正确的 Sidebar 对话记录、项目列表和主内容区域，不回退到 mock/fake conversation。

加载摘要细节：

| 步骤 | 细节说明 |
|---|---|
| 连接控制中心 | 读取连接配置与访问凭证；确认当前浏览器可以访问设备目录。 |
| 连接上次使用的设备 | 恢复上次选择的设备；同步设备在线状态，失败时保留切换入口。 |
| 启动 Codex 本机服务 | 确认设备连接已建立；检查本机 Codex 服务是否可以响应请求。 |
| 载入对话记录与工作区 | 读取项目、对话列表与当前时间线；准备侧边栏、主内容区和本地工具入口。 |
| 完成态 | 设备、本机服务和工作区数据均已就绪；即将打开上次使用的主工作区。 |

验收：

- 初始加载时能看到连接入口、设备列表、当前 active step、loading 动画和细节说明。
- 浏览器真实加载完成前，主工作区不提前出现。
- 浏览器真实加载完成后，四步均为完成态，随后进入主工作区。
- 无设备、设备不可达、本机服务未就绪、timeline 读取失败、未配置连接、凭证失败都能映射到对应步骤。

### 5.2 Sidebar conversation navigation

#### Section 结构

| Section | 内容 | 展开状态 | 空态 |
|---|---|---|---|
| 置顶 | `pinnedProjects` 下的项目与其 conversation | 可折叠 | `暂无项目` |
| 项目 | 非置顶项目与其 conversation | 可折叠；每个项目也可展开/收起 | `暂无项目` |
| 对话 | 没有关联 `projectId` 且未置顶的 free conversation | 可折叠 | `暂无对话` |

#### 数据来源

| 项 | 规则 |
|---|---|
| 来源 | Web 只消费 Control Plane-shaped public `CodexConversation[]`。 |
| 过滤位置 | agent/top-level conversation 过滤必须发生在 Worker projection 或 Control Plane 聚合层；Web 不根据 raw app-server source 自行判断。 |
| 包含 | 用户可直接打开和继续的 agent/top-level conversation。 |
| 排除 | subagent/internal conversation、archived conversation、本机目录外 conversation、Worker 无法安全归属 project 的 conversation。 |
| 分组 | `projectId + deviceId` 匹配 project 时放入对应项目；无 `projectId` 且未置顶时放入“对话”。 |
| 置顶 | `project.pinned` 决定项目进入“置顶”；conversation row 不因为自身 `pinned` 出现在 free conversation。 |
| 归档 | `conversation.archived === true` 不进入默认 Sidebar，只进入 Settings archived conversations。 |

#### Project row 显示

| UI 元素 | 字段 | 显示规则 | 空值处理 |
|---|---|---|---|
| 图标 | `project.expanded` | 展开时显示 open folder；收起时显示 folder。 | 不隐藏。 |
| 标题 | `project.name` | 只用于 project row。 | 不用它替代 conversation title。 |
| 展开状态 | `project.expanded` | 点击 project row 切换嵌套 conversation。 | 默认按本地 section state。 |

#### Conversation row 显示

| UI 元素 | 字段 | 显示规则 | 空值处理 |
|---|---|---|---|
| 标题 | `conversation.title` | 始终作为 conversation row 的主标题。 | 若未来允许空 title，显示 `Untitled conversation`；禁止 fallback 到 project 名、目录名或 `cwd` basename。 |
| 时间 | `conversation.updatedAt` | 作为 trailing text 展示。 | 无值时隐藏 trailing，不替换标题。 |
| Loaded badge | `conversation.loaded` | `true` 时显示 `Loaded`。 | `false/undefined` 不显示。 |
| Live badge | `conversation.live` | `true` 时显示 `Live`。 | `false/undefined` 不显示。 |
| Archived badge | `conversation.archived` | 仅 archived 列表或 action menu 语境显示；默认 Sidebar 不应出现 archived row。 | 默认 Sidebar 不显示。 |
| 选中态 | `deviceId + conversation.id` 组成的 conversation key | 当前选中时显示 selected。 | key 不匹配时不选中。 |
| 操作菜单 | conversation actions | archive、rename、restore 按 archived 状态展示。 | 无 conversation 时不显示操作。 |

#### Sidebar 状态表现

| 状态 | 表现 | 禁止表现 |
|---|---|---|
| loading | 使用 skeleton 或保留上一轮安全数据，并显示加载状态。 | 禁止显示 fake conversation。 |
| loaded-empty | 三个 section 可显示各自空态。 | 禁止把 Worker unavailable 当成 empty。 |
| loaded-with-data | 显示 project rows、conversation rows、Loaded/Live badge、更新时间。 | 禁止显示 subagent/internal conversation。 |
| running | 对应 conversation row 显示 `Live`。 | 禁止把 project row 标记成 conversation running。 |
| waiting-request | 对应 conversation 可显示等待态或在 timeline 显示 request card。 | 禁止在 Sidebar 展示 raw command/diff。 |
| degraded | 显示设备或 Worker 降级提示。 | 禁止清空列表后显示 `暂无对话`。 |

#### Sidebar 明确不显示

- 不显示 subagent/internal conversation。
- 不使用 `project.name`、`projectName`、目录名或 `cwd` basename 替代 `conversation.title`。
- 不在默认 Sidebar 显示 archived conversation。
- 不显示本机绝对路径、raw prompt、raw command output、full diff、raw JSON-RPC。
- 不把 `thread/list` pagination cursor 暴露给 Web。

### 5.3 Main conversation header

| UI 元素 | 字段/状态 | 显示规则 |
|---|---|---|
| 页面标题 | `conversation.title` | 选中 conversation 时显示 title；未选中时显示 `对话`。 |
| 重命名输入 | `conversation.title` | 进入 rename 状态后用当前 title 初始化；空字符串不能提交。 |
| Loaded/Live/Archived badge | `conversation.loaded/live/archived` | 只展示布尔字段明确为 `true` 的 badge。 |
| 数据源状态 | `source.reason` + sanitized error code/message | 显示当前 datasource 状态；非 loaded 时显示数据源 banner。 |
| 相邻导航 | `previousConversationKey/nextConversationKey` | 左侧栏收起时在 header 显示上一条/下一条按钮；无 key 时 disabled。 |
| 操作菜单 | selected conversation | 有 conversation 时显示 archive/rename/restore；无 conversation 时不提供 conversation action。 |

状态规则：

- header 标题不使用 project 名替代 conversation title。
- datasource banner 只说明数据来源或降级，不展示 raw cause、raw URL、token、full output。
- mobile 返回按钮只负责回到导航，不改变 conversation 数据。

### 5.4 Timeline

| 状态 | 表现 | 规则 |
|---|---|---|
| no-selection | 显示空态或 start 引导。 | 不读取任意默认 conversation。 |
| loading | 显示 timeline skeleton。 | 不 fallback 到 fake data，除非 datasource 明确是 fixture/source 非 loaded。 |
| loaded | 渲染 public safe timeline nodes。 | 只显示 text、tool group、tool call、context compaction 的安全投影。 |
| partial snapshot | 显示已有 safe nodes 和 itemsView/partial 提示。 | 不展示 raw missing items。 |
| waiting-request | 显示 approval/request card。 | 只展示脱敏 metadata。 |
| degraded | 显示脱敏错误和 dependency 状态。 | 不把 degraded 渲染为空 timeline。 |

Timeline 明确不显示：

- raw prompt、raw command output、raw JSON-RPC frame、full diff、本机绝对路径、provider secrets。
- subagent/internal conversation 的独立 timeline；如果未来需要呈现，只能作为当前 agent conversation 的安全事件或引用，不进入 Sidebar conversation 列表。

### 5.5 Composer

| 上下文 | 主动作 | 可见辅助动作 | disabled 条件 |
|---|---|---|---|
| 无 conversation | start | 无 | `canStartConversation === false` 或 start submitting。 |
| selected loaded-idle | follow-up | queue message（如存在排队能力） | `canSubmitFollowUp === false` 或 follow-up submitting。 |
| running 且有 `activeTurnId` | interrupt / steer | follow-up 按规则禁用或保留 draft。 | 缺少 expected active turn、control submitting、Worker degraded。 |
| waiting-request | approval decision 在 request card；composer 可按规则禁用。 | 保留 draft。 | pending approval 需要先处理且策略要求禁用 follow-up。 |
| degraded | 无危险动作。 | 可保留本地 draft。 | Worker/Control Plane 不可用。 |

提交规则：

- start / follow-up / interrupt / steer 都必须经 Web -> Control Plane -> Worker。
- interrupt / steer 必须携带 expected turn id；不匹配时 fail closed。
- 失败只显示脱敏错误；不把 prompt、steer text、raw command output 写入日志或错误 envelope。

### 5.6 Right detail pane

| Detail 类型 | 显示内容 | 禁止内容 |
|---|---|---|
| diff | 安全摘要或 bounded diff detail。 | full raw diff、绝对路径。 |
| file | project-relative path 和 bounded preview。 | 本机绝对路径、未限量文件内容。 |
| skill | skill label/title 和安全链接。 | 私有 root path。 |
| image/url | 安全 href/title。 | tokenized URL、私有 file URL。 |
| tool | sanitized tool detail。 | raw command output、raw JSON-RPC。 |
| unknown | fallback title/detail。 | raw payload dump。 |

状态规则：

- detail pane 可收起；收起不改变 selected conversation。
- 打开 detail target 不触发本机写操作或 command execution。
- 无 target 时显示空态，不复用上一个 target。

### 5.7 Settings archived conversations

| 状态 | 表现 | 规则 |
|---|---|---|
| no archived conversations | 显示 archived 空态。 | 不显示默认 Sidebar 中的 active conversation。 |
| archived conversations exist | 每行显示 `conversation.title`、`conversation.projectName`、`conversation.updatedAt` 和 restore action。 | title 仍不 fallback 到 project name。 |
| restore submitting | restore action disabled/loading。 | 不重复提交。 |
| restore success | conversation 从 archived 列表移回默认可见范围。 | 保持同一 conversation id。 |
| restore failed | 显示脱敏错误。 | 不丢弃 archived row。 |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| 启动对话 | `POST /v1/conversations` -> `thread/start` + `turn/start` | `cwd` 必须在 `allowedProjectRoot` 内；使用 `clientRequestId` 做 process-local idempotency |
| 打开/恢复 | conversation read endpoint -> `thread/read` / `thread/resume` | 只返回 public safe timeline nodes |
| follow-up | turn start endpoint -> `turn/start` | 同一 `clientRequestId` 不允许不同 fingerprint 重放 |
| interrupt | interrupt endpoint -> `turn/interrupt` | `expectedTurnId` 必填，不匹配 fail closed |
| steer | steer endpoint -> `turn/steer` | steer text 不进入日志或错误 envelope |
| archive/unarchive | archive endpoints -> `thread/archive` / `thread/unarchive` | archived conversation 从默认 Sidebar 过滤 |
| rename | rename endpoint -> `thread/name/set` | `title` 是唯一公开显示名 |
| list pagination | Worker internal -> `thread/list` | cursor 只在 Worker 内部使用 |
| directory isolation | Worker security boundary | `cwd` 必须 realpath inside `allowedProjectRoot` |

## 7. 边界与安全

- Web 只消费 Control Plane-shaped public API。
- Worker 是唯一 app-server、filesystem、Git、terminal 边界。
- timeline 只渲染 public safe nodes。
- 不暴露 raw prompt、raw command output、full diff、raw JSON-RPC、provider secrets、app-server URL、本机绝对路径。
- 错误统一走脱敏 `ErrorEnvelope`。

## 8. 验收标准

- [x] 用户可 start / open / follow-up / interrupt / steer。
- [x] Sidebar 能区分 Loaded / Live / archived。
- [x] timeline 读取 partial snapshot 时不 fallback 到 fake data。
- [x] Worker directory isolation 有测试覆盖。
- [x] Control Plane 能区分 degraded 与 empty。
- [ ] durable realtime output stream 仍明确为 deferred。

## 9. 验证

当前验证入口：

- `apps/worker/src/http/readOnlyHandlers.test.ts`
- `apps/worker/src/http/writeHandlers.test.ts`
- `apps/worker/src/http/controlHandlers.test.ts`
- `apps/worker/src/security/workerSecurity.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/web/e2e/real-local-smoke.spec.ts`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `100` 能力组。
- API contract：`packages/api-contract/openapi.yaml`。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
- 来源快照：`docs/archives/references/2026-06-22-feature-support-matrix-snapshot.md`。
