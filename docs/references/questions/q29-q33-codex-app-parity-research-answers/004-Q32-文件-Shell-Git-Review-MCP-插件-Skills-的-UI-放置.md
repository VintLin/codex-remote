---
title: "Q32：文件 Shell Git Review MCP 插件 Skills 的 UI 放置"
source_url: "https://chatgpt.com/c/6a36fc44-4710-83ee-a1aa-bc3159dad0a3"
exported_at: "2026-06-21T04:57:38"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

不要把 `fs/*`、`command/exec*`、`mcpServer/*`、`plugin/*` 等直接暴露为按钮。Codex App 的官方产品语义是：**项目/线程导航、对话任务流、Diff/Review 面板、集成终端、插件/Skills/MCP/Apps 设置与目录、审批与沙箱提示**。app-server 方法应作为这些产品面的后端能力，而不是 UI IA。官方 Codex App 明示了 Projects/threads、task sidebar、Git diff pane、integrated terminal、browser/artifact preview、skills、plugins、MCP、approvals/sandbox 等用户面；app-server 文档明示了底层 RPC 能力，但没有逐项规定 Web UI 放置方式，因此下面的 matrix 中“入口/状态/退化态/写操作阶段”是基于官方产品语义的推断。([OpenAI Developers][1])

---

## 1. UI placement matrix

| 能力组                                                          | 不应暴露成                                       | 主 UI surface                                                                 | 辅助 surface                                                                        | 推荐入口位置                                                                                  | 状态展示                                                                                                                | 空态 / 退化态                                                                                              | 失败态                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Files / `fs/*`**                                           | `fs/readFile`、`fs/writeFile`、`fs/remove` 按钮 | **Right Detail Pane**：文件预览、metadata、引用来源、binary/image/PDF preview            | Sidebar/Navigator 项目文件树；Main Conversation 中 file chips；Diff/Review 里的文件链接         | 左侧项目树、Quick Open、timeline 文件变更项、Review diff 行                                           | 文件路径脱敏名、只读/可写、大小、类型、是否在当前 project/worktree、是否 modified                                                              | 无项目：提示选择 device/project；无权限：仅显示路径 chip；大文件/二进制：只给 metadata + 下载/打开本机                                  | 文件不存在、路径越界、权限不足、文件过大、watch 断开、版本冲突                                                                 |
| **Shell / Commands / `command/exec*`、`thread/shellCommand`** | “Run arbitrary RPC”                         | **Tool Surface：Terminal / Command Runs**                                     | Main Conversation timeline 的 command summary；Status Strip 运行中 badge               | 顶栏 Project Actions、Terminal toggle、timeline command item、“Run tests/build” quick action | running/succeeded/failed/killed、exit code、cwd、耗时、stdout/stderr 摘要、sandbox/full-access 标识                            | 无本机 Worker：禁用终端；无 project：不能运行；未授权：显示 approval required                                               | 非 0 exit、timeout、terminated、sandbox denied、stdin/PTY 不支持、命令危险需审批                                   |
| **Git Diff / `gitDiffToRemote` 语义、`turn/diff/updated`**      | “Fetch gitDiffToRemote” 按钮                  | **Right Detail Pane：Diff panel** 或独立 Diff Tool Surface                       | Status Strip changed files badge；timeline “files changed” item                    | 状态栏变更计数、Review 按钮、文件树 modified marker、thread header                                     | additions/deletions、changed files、staged/unstaged、base branch/remote、last turn diff                                 | 非 Git repo：显示“not a Git project”；无变更：empty diff；无 remote：只显示 working tree diff                        | diff 太大、remote 不可达、branch 不存在、Git 命令失败、worktree 状态异常                                               |
| **Review / `review/start`**                                  | “review/start” 方法按钮                         | **Right Detail Pane：Review tab + inline comments on diff**                   | Main Conversation timeline 的 review started/completed；Status Badge findings count | Diff 面板按钮、`/review` slash command、thread toolbar                                        | reviewing、done、finding count、target scope：uncommitted/baseBranch/commit/custom                                      | 无 Git repo/无变更：提示选择 review target；无 `gh`/PR 上下文：退化为本地 diff review                                     | reviewer failed、target invalid、PR context unavailable、review thread detached 失败                    |
| **Fuzzy Search / `fuzzyFileSearch`**                         | “start fuzzyFileSearch session”             | **Modal/Popover：Quick Open / Command Palette**                               | Sidebar 文件树搜索；Main Conversation attach/reference file                             | `Cmd/Ctrl+P` quick open、`Cmd/Ctrl+K` command palette、composer `@file`                   | indexing、matches count、current query、session complete                                                               | 无项目/未索引：显示 empty state；退化为简单 path search                                                              | indexing timeout、Worker disconnected、结果过多、权限过滤后为空                                                  |
| **MCP resources/tools/status/OAuth / `mcpServer/*`**         | “call any MCP tool”                         | **Tool Surface：Connections / MCP settings**                                  | Right Detail Pane server detail；timeline MCP tool-call item；Modal OAuth           | Settings > MCP；Status Strip MCP badge；`/mcp`；plugin detail page                         | server enabled/disabled、startup status、auth required、tool allow/deny、approval policy、resource count                 | 无 server：推荐添加/安装 plugin；server 未启动：显示 disabled/offline；无 auth：Sign in                                 | startup failed、OAuth failed/expired、tool denied、approval declined、resource read failed             |
| **Plugins / Marketplace / `plugin/*`、`marketplace/*`**       | “plugin/install RPC”                        | **Tool Surface：Plugin Directory / Marketplace**                              | Sidebar/Navigator Plugins；Right Detail plugin page；Modal install/auth/share       | 左侧 Plugins、Settings、composer `@plugin`、deep link                                        | installed/enabled/update available/auth needed、bundled skills/apps/MCP、source local/git/remote                      | 无 marketplace：显示 Add marketplace；无 installed plugins：推荐 curated plugins；remote-only 条目显示 install-only | install failed、marketplace load error、版本不兼容、auth policy missing、trust/permission blocked           |
| **Skills / Hooks / `skills/*`、`hooks/list`**                 | “skills/list / hooks/list”                  | **Skills：Sidebar/Navigator catalog + `$` picker；Hooks：Settings/Diagnostics** | Right Detail skill/hook detail；timeline skill invoked / hook blocked item         | Skills sidebar、composer `$skill`、Settings > Hooks、plugin detail bundled skills          | skill enabled/disabled、scope repo/user/admin/system、dependencies；hook trusted/untrusted、event type、timeout/blocking | 无 skills：提示安装/创建；无 hooks：empty diagnostics；untrusted hook：review required                             | skill load error、dependency missing、hook timeout、hook blocked prompt/tool、hash changed needs trust |
| **Apps / Connectors / `app/list`**                           | “app/list” 按钮                               | **Tool Surface：Apps / Connections**                                          | Right Detail app detail；composer `$app` / mention；Status Strip app auth badge     | Apps picker、plugin detail、Settings > Apps、composer `$app-slug`                          | accessible/enabled、install URL、auth state、labels/branding、destructive/open-world policy                             | 无 accessible apps：展示 directory/install；未启用：enable；未登录：Sign in                                         | auth expired、app inaccessible、tool approval declined、external service error                        |

官方 app-server 文档把 `fs/*` 定义为绝对路径文件系统 API，把 `command/exec` 定义为在 server sandbox 下运行单个命令，而 `thread/shellCommand` 明确是用户发起、归属 thread、且在 sandbox 外 full access 的命令，因此 UI 必须把两者区分为“沙箱命令运行”和“显式用户 shell”。([OpenAI Developers][2])
官方 Codex App 文档已经把 diff、terminal、project actions、review、skills、plugins/MCP 做成 App 级面板、菜单或侧栏，而不是 conversation 里的 raw method 列表。([OpenAI Developers][1])

---

## 2. Timeline item、Right Detail、Tool Surface 的边界

| 能力                  | 应显示为 timeline item                                                          | 应显示在 Right Detail Pane                             | 需要独立 Tool Surface                    |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Files               | **是，仅限语义事件**：文件被读取、生成、修改、删除、图片查看、artifact 生成                                | **是**：文件预览、metadata、source、large/binary fallback   | 可选：File Explorer / Artifact Viewer   |
| Shell/Commands      | **是**：命令开始、输出摘要、exit code、失败原因；stdout/stderr 默认折叠                           | 仅选中 command item 时显示详情                             | **必须**：Terminal / Command Runs       |
| Git Diff            | **是**：turn 产生 diff、changed files summary                                    | **必须**：selected diff、hunk、file-level diff          | **建议**：大 diff/review 时独立 Diff panel  |
| Review              | **是**：review started/completed、finding summary                              | **必须**：inline comments、finding detail、target scope | 与 Diff panel 合并成 Review Tool Surface |
| Fuzzy Search        | 通常**否**；只记录“opened file”或“attached file”即可                                  | 否，选中文件后跳到 file detail                              | **否**；用 Modal/Popover                |
| MCP                 | **是**：agent 调用 MCP tool、resource read、OAuth required、approval requested     | **是**：server/tool/resource/auth/policy details     | **必须**：MCP/Connections settings      |
| Plugins/Marketplace | 安装/卸载/启用可作为 system timeline，但默认不刷主 conversation                             | **是**：plugin detail、bundled skills/apps/MCP        | **必须**：Plugin Directory              |
| Skills              | **是**：用户显式 `$skill` 调用、skill 注入、skill load failure                          | **是**：skill docs、dependencies、enabled state        | Skills catalog 可放 Navigator，不必大面板    |
| Hooks               | **是，仅异常/阻塞/注入上下文时**；普通 list 不进 timeline                                     | **是**：hook config、event、trust、last run             | Settings/Diagnostics                 |
| Apps                | **是**：app/tool call、auth required、approval requested、external action result | **是**：app detail、auth/scopes/policy                | **必须**：Apps/Connections              |

app-server 的 item union 已经把 `commandExecution`、`fileChange`、`mcpToolCall`、`enteredReviewMode`、`exitedReviewMode`、`imageView` 等定义成 thread item；这说明 timeline 应显示“工作单元”和状态，而不是显示低层 RPC 名称。`turn/diff/updated` 是聚合 diff 信号，适合驱动 diff badge/pane，而不是作为用户可点击 raw event。([OpenAI Developers][2])

---

## 3. 各能力的具体落点建议

### A. Files：作为“项目对象”和“证据对象”，不是文件 API 控制台

`fs/readFile/readDirectory/getMetadata/watch` 应驱动文件树、Quick Open、文件预览、artifact 预览、diff 文件链接。`fs/writeFile/remove/copy/createDirectory` 不应直接做按钮；写操作应从更高层动作触发：agent edit、apply change、revert hunk、create file、save generated artifact。官方 Codex App 文档已经把非代码 artifact 的预览放到 sidebar/task sidebar，而代码文件更多通过 diff/review/editor context 进入。([OpenAI Developers][1])

推荐产品语义：

* Sidebar/Navigator：Project files、recent files、changed files。
* Main Conversation：文件引用 chips、fileChange item、artifact item。
* Right Detail Pane：文件预览、metadata、引用来源、binary fallback。
* Tool Surface：大文件/多 artifact viewer 可独立打开。
* Status Strip：file watcher 状态、project root、dirty count。

先做只读：`readDirectory/readFile/getMetadata/watch`。
近期写：仅允许 agent edit / diff apply / create generated file。
延后：任意路径删除、复制、重命名、批量写、跨 project 写。

### B. Shell / Commands：分成“项目动作”“集成终端”“agent 命令项”

官方 Codex App 有 integrated terminal，并且 project actions 会出现在 top bar 并在 terminal 中运行；它还说明 terminal scoped to project/worktree，Codex 可以读取 terminal output。([OpenAI Developers][1])

因此 UI 应拆成三层：

1. **Project Actions**：顶栏按钮，如 `test`、`build`、`dev server`，来自项目配置。
2. **Integrated Terminal**：用户显式输入 shell 命令。
3. **Agent command timeline**：agent 运行命令时显示 command item、输出摘要、exit code。

关键安全差异：`command/exec` 是 sandbox 下的单命令 API；`thread/shellCommand` 是用户显式发起、归属 thread、但不继承 thread sandbox 且 full access。Web UI 必须用明显 badge 区分 `sandboxed` 与 `full access user shell`，后者不能通过 agent 自动触发。([OpenAI Developers][2])

先做只读：命令历史、输出、exit code、运行状态。
近期写：allowlisted project actions、需要审批的 shell command、terminate/resize/write stdin。
延后：任意 interactive TTY、后台终端池、跨设备批量命令、`process/spawn` 这类 experimental / outside sandbox 能力。

### C. Git Diff：主入口是 changed files / review，不是 `gitDiffToRemote`

官方 App 明示有 Git diff pane，支持查看变更、inline comments、stage/revert file/hunk、commit/push/create PR；review 文档也把 review pane 绑定到 Git repo、uncommitted/branch/commit scope、staged/unstaged diff。([OpenAI Developers][1])

`gitDiffToRemote` 即使存在于本地协议生成物，也应被投影为：

* Status Strip：`N files changed`、`+A/-D`、branch/base。
* Right Detail：Diff panel。
* Tool Surface：Review/Diff 工作台。
* Timeline：本轮产生了哪些文件变更。
* Modal：commit / push / PR confirmation。

官方 app-server 公开页没有检索到 `gitDiffToRemote` 字面；公开 app-server 更明确的是 `turn/diff/updated` 和 `fileChange` items。因此产品层建议使用 `RemoteGitDiff` / `ConversationDiff` 这样的语义对象，不把本地 raw method 命名泄漏到 Web contract。([OpenAI Developers][2])

先做只读：working tree diff、turn diff、changed files。
近期写：stage/unstage/revert hunk/file，必须二次确认。
延后：commit/push/create PR，直到 Git identity、remote auth、branch policy、multi-device conflict 处理完成。

### D. Review：Review 是 Diff 的审阅模式，不是一个普通消息

`review/start` 官方定义为启动 Codex reviewer，target 可为 `uncommittedChanges`、`baseBranch`、`commit`、`custom`，并支持 inline 或 detached delivery；server 会流式发送进入/退出 review mode 的 items。([OpenAI Developers][2])

UI 放置：

* Main Conversation：只显示 review started/completed 和总摘要。
* Right Detail Pane：review findings 与 diff 行内绑定。
* Tool Surface：Review workspace，支持 target selector、filter findings、jump to file。
* Modal/Popover：选择 review target：current changes / branch / commit / custom。
* Status Strip：review running、findings count、target scope。

先做只读：启动 review、展示 findings、跳转 diff。
近期写：把 finding 转成 follow-up prompt / inline comment。
延后：自动修复全部 finding、自动 push PR review comments、跨 thread detached review 管理。

### E. Fuzzy Search：Quick Open，而不是搜索 API 页

Codex App 官方快捷键文档已经有 command menu、search threads、find in thread、slash command 等产品模式；app-server 的 fuzzy search 是 experimental session API，会发 `sessionUpdated/sessionCompleted`。([OpenAI Developers][3])

UI 放置：

* Modal/Popover：Quick Open，支持文件名、路径、recent。
* Sidebar：文件树搜索框。
* Composer：`@file` 引用。
* Status：indexing / searching / no results。
* Failure：timeout 后降级为 simple path contains search。

只读即可；不要设计写操作。

### F. MCP：Connections / Tool policy / OAuth，不是“工具按钮集合”

官方 Codex MCP 文档说明 MCP 用于把模型连接到工具和上下文，支持 Streamable HTTP、Bearer/OAuth、server instructions，并且 CLI/IDE/App 共享 MCP 配置；App 设置中有 MCP 区域，可启用推荐 server 或添加 server。([OpenAI Developers][4])

app-server 层的 `mcpServerStatus/list`、`mcpServer/resource/read`、`mcpServer/tool/call`、`mcpServer/oauth/login` 应映射为：

* Tool Surface：Connections > MCP servers。
* Right Detail：server detail、tools、resources、auth、approval policy。
* Modal：OAuth login / re-auth / tool approval。
* Timeline：仅显示 agent 实际 tool call、resource read、approval required、error。
* Status Strip：MCP connected/error/auth required。

先做只读：server list、startup status、tools/resources/auth state。
近期写：OAuth login、enable/disable recommended server、reload config、per-tool approval display。
延后：Web 端编辑任意 MCP config、添加任意 remote server、手动调用任意 MCP tool、暴露 env/secrets、跨设备复制 MCP 配置。

### G. Plugins / Marketplace：独立目录和安装流程

官方插件文档说明 plugins 可以打包 skills、app integrations、MCP servers，并通过 Plugin Directory 浏览/安装；安装后可用 prompt、`@` 调用 plugin/bundled skill，Apps 可能要求 sign-in，MCP 可能要求 setup/auth。([OpenAI Developers][5])

app-server 的 `plugin/list/read/install/uninstall`、`marketplace/add/upgrade` 应投影为：

* Tool Surface：Plugin Directory。
* Sidebar：Plugins nav item。
* Right Detail：plugin detail，显示 bundled skills/apps/MCP、source、install state、share URL。
* Modal：install confirmation、uninstall、auth/setup required。
* Status Strip：plugin update/error badge。

先做只读：marketplace list、plugin detail、installed/enabled/auth policy。
近期写：install/uninstall/enable/disable curated/local plugins。
延后：add arbitrary marketplace、upgrade all marketplaces、workspace sharing、plugin publishing、remote catalog trust chain、自动迁移外部 agent config。

### H. Skills / Hooks：Skills 是用户能力入口，Hooks 是安全/诊断面

官方 Skills 文档说明 Skills 是任务专用能力包，可被隐式匹配或通过 `/skills`、`$skill` 显式调用；Skills 可来自 repo/user/admin/system，也可通过 plugins 分发。([OpenAI Developers][6])

Hooks 文档说明 hooks 是生命周期中运行的确定性脚本，可用于日志、扫描、验证、上下文注入等；非 managed hooks 需要 review/trust，hook 可能 block prompt/tool。([OpenAI Developers][7])

UI 放置：

* Skills：

  * Sidebar/Navigator：Skills catalog。
  * Composer：`$skill` picker。
  * Right Detail：SKILL summary、dependencies、scope、enabled state。
  * Timeline：skill invoked / failed to load。
* Hooks：

  * Settings/Diagnostics：hook list、event、trust、last run。
  * Timeline：只显示 blocked、modified prompt/context、permission intervention。
  * Modal：trust/review hook。

先做只读：skills list/detail、hooks list/detail/trust status。
近期写：enable/disable skill、显式 `$skill` 调用。
延后：hook trust/edit/import、hook-created prompt mutation、skill authoring/install 自动化，尤其涉及脚本执行和依赖安装的能力。

### I. Apps / Connectors：Apps 是连接器与 mention，不是插件列表的重复

app-server 文档说明 `app/list` 返回 available apps，带 `isAccessible` 与 `isEnabled`，并建议通过 `$<app-slug>` 文本加 `app://<id>` mention 方式调用；它还说明 app tool calls 可能触发 approval，destructive annotations 会要求审批。([OpenAI Developers][2])

UI 放置：

* Tool Surface：Apps / Connections。
* Right Detail：app detail、branding、labels、install URL、enabled/accessibility、policy。
* Composer：`$app` mention。
* Modal：sign in / install / approval。
* Timeline：app tool call、approval、result/error。
* Status Strip：auth required、app unavailable。

先做只读：apps list、enabled/accessibility/auth display。
近期写：open install/sign-in、enable/disable app、explicit `$app` invocation。
延后：destructive external actions、open-world app actions、批量操作外部服务、让 Codex 自动跨 app 写入，直到审批、审计、回滚和权限策略成熟。

---

## 4. 写操作阶段建议

| 阶段                                | 可以做                                                                                                                                                                                | 不建议做                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Stage 1：只读 App-like workbench** | 文件树/预览、command output、turn diff、review findings、fuzzy search、MCP status/resources/tools list、plugin marketplace read、skills/hooks/apps list                                        | 任意写文件、任意 shell、install plugin、MCP config edit、external app writes                |
| **Stage 2：受控写操作**                 | 显式用户 shell command、allowlisted project actions、start review、stage/unstage/revert hunk、enable/disable skill、OAuth login、plugin install/uninstall、explicit `$skill` / `$app` mention | 自动 full-access shell、批量删除文件、自动 push/PR、任意 MCP tool manual call、hook trust/import |
| **Stage 3：高级/延后**                 | commit/push/create PR、custom marketplace、add arbitrary MCP server、workspace plugin sharing、hook management、external app destructive writes、computer-use app control                | 未完成审计/审批/回滚/多设备冲突处理前不应开放                                                         |

这个分期与官方安全语义一致：Codex App 文档强调 approvals 用于约束 Codex 可执行的动作，sandbox 控制目录和网络访问，并建议只批准最窄权限；browser/computer-use 也被说明可能影响系统状态，应保持任务范围窄并审查权限提示。([OpenAI Developers][1])

---

## 5. Product contract 建议：Web-facing 不要泄漏 raw method

建议 Control Plane / Web contract 暴露这些语义对象，而不是 app-server RPC：

```ts
type ToolSurfaceKind =
  | "files"
  | "terminal"
  | "diff"
  | "review"
  | "mcp"
  | "plugins"
  | "skills"
  | "hooks"
  | "apps";

type TimelineItemKind =
  | "agent_message"
  | "plan"
  | "command_run"
  | "file_change"
  | "diff_update"
  | "review"
  | "mcp_tool_call"
  | "app_tool_call"
  | "skill_invocation"
  | "hook_intervention"
  | "approval_request"
  | "artifact"
  | "error";

type CapabilityState =
  | "available"
  | "read_only"
  | "requires_auth"
  | "requires_approval"
  | "degraded"
  | "unavailable"
  | "experimental"
  | "disabled_by_policy";
```

关键投影规则：

1. `command/exec*` → `CommandRun`，显示在 Terminal + timeline。
2. `thread/shellCommand` → `UserShellCommand`，必须带 `fullAccess: true` 和 explicit user initiated 标记。
3. `fs/*` → `FileRef` / `FilePreview` / `FileChange`，不暴露 absolute path；public id opaque。
4. `turn/diff/updated` / `gitDiffToRemote` 语义 → `DiffSummary` / `DiffFile` / `DiffHunk`。
5. `review/start` → `ReviewSession`，target 是用户语义：current changes / branch / commit / custom。
6. `mcpServer/*` → `McpServer` / `McpTool` / `McpResource` / `McpAuthState`。
7. `plugin/*` / `marketplace/*` → `PluginEntry` / `MarketplaceSource` / `InstallState`。
8. `skills/*` → `SkillEntry` / `SkillInvocation`。
9. `hooks/list` → `HookEntry` / `HookIntervention`。
10. `app/list` → `AppConnector` / `AppMention` / `AppToolCall`.

---

## 官方明示 vs 产品推断边界

**官方明示：**

* Codex 能在本地/云端读取、编辑、运行代码，并支持并行任务、PR、GitHub workflow。([OpenAI Developers][8])
* Codex App 明示有 projects、threads、worktrees、Git diff pane、integrated terminal、browser/artifact preview、skills、automations、MCP settings、plugins。([OpenAI Developers][1])
* 官方 app-server 明示底层方法：`fs/*`、`command/exec*`、`thread/shellCommand`、`review/start`、`fuzzyFileSearch` events、`mcpServer/*`、`plugin/*`、`marketplace/*`、`skills/*`、`app/list` 等。([OpenAI Developers][2])

**产品推断：**

* “Files 放 Right Detail、Commands 放 Terminal、MCP/Plugins/Apps 放 Tool Surface、Fuzzy Search 放 Modal”不是官方逐条规定，而是从 Codex App 已公开的信息架构推断出的 browser workbench 映射。
* `gitDiffToRemote` 字面没有在我检索到的官方 app-server 页面中出现；应按官方公开的 `turn/diff/updated`、`fileChange`、App Git Diff/Review pane 语义处理。
* `hooks/list` 更接近配置/诊断能力；官方 hooks 文档强调 trust/review/blocking，因此不应做成 conversation 内的“hook 按钮”。([OpenAI Developers][7])

[1]: https://developers.openai.com/codex/app/features "Features – Codex app | OpenAI Developers"
[2]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[3]: https://developers.openai.com/codex/app/commands "Commands – Codex app | OpenAI Developers"
[4]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[5]: https://developers.openai.com/codex/plugins "Plugins – Codex | OpenAI Developers"
[6]: https://developers.openai.com/codex/skills "Agent Skills – Codex | OpenAI Developers"
[7]: https://developers.openai.com/codex/hooks "Hooks – Codex | OpenAI Developers"
[8]: https://developers.openai.com/codex/cli "CLI – Codex | OpenAI Developers"
