---
title: "Q22：Safe active turn and pending approval scenarios"
source_url: "https://chatgpt.com/c/6a364cc9-c9e8-83e8-9b39-60ce3748e40b"
exported_at: "2026-06-20T17:07:59"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

以下结论基于 OpenAI 官方 Codex 文档、Codex app-server README、配置/规则文档，以及相关公开 issue。核心原则：用真实 turn / 真实 approval request 验证协议与 UI 状态机；自动校准阶段默认只 decline / cancel，不要为了覆盖率扩大权限或自动 accept。

0. 先定安全边界

Codex 的安全模型是两层：sandbox 决定命令能触达什么，approval policy 决定何时停下来问用户；本地 CLI / IDE 默认通常是无网络、只能写当前 workspace，越界才进 approval。
OpenAI Developers
+1

推荐把验证分成两个独立 profile：

TOML
# safe-active.config.toml
approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "workspace-write"
allow_login_shell = false

[sandbox_workspace_write]
network_access = false

[shell_environment_policy]
inherit = "none"
set = { PATH = "/usr/bin:/bin:/usr/local/bin", HOME = "/tmp/codex-remote-calib/home" }
TOML
# approval-probe.config.toml
approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "read-only"
allow_login_shell = false

[shell_environment_policy]
inherit = "none"
set = { PATH = "/usr/bin:/bin:/usr/local/bin", HOME = "/tmp/codex-remote-calib/home" }

这样 active-turn 验证不需要 approval；approval 验证则用 read-only sandbox 触发“运行一个无副作用命令”的 pending approval。Codex 文档把 workspace-write + on-request列为 Auto/低摩擦本地工作模式，把 read-only + on-request列为安全只读浏览模式，后者会要求批准编辑、命令和网络访问。
OpenAI Developers
 另外，环境变量应做最小继承；官方配置说明明确 shell_environment_policy 用于控制传给子进程的环境变量，以减少 secret 泄露。
OpenAI Developers

远程连接本身也要收紧：Codex Remote / remote TUI 可以连接 codex app-server，但非本地访问应使用 WebSocket auth，并置于 TLS 后；官方文档说明 remote auth token 只应通过 wss:// 或 local-only ws:// 发送。
OpenAI Developers

1. 构造长运行但低风险 active turn，用于 interrupt / steer
推荐方式：在空 fixture workspace 运行只输出 stdout 的长命令

准备一个无 secret、无 git 凭据、无真实项目内容的临时目录：

Bash
mkdir -p /tmp/codex-remote-calib/work /tmp/codex-remote-calib/home
cd /tmp/codex-remote-calib/work

cat > safe_long_active.py <<'PY'
import time
for i in range(90):
 print(f"tick {i}", flush=True)
 time.sleep(1)
print("SAFE_LONG_ACTIVE_DONE", flush=True)
PY

发起 turn 的 prompt：

Use the shell to run exactly this command from the current workspace:

python3 safe_long_active.py

Do not modify files. Do not read files other than safe_long_active.py. Do not access the network.
After the command finishes, reply with the last stdout line.

预期状态机：

turn/start 返回 turn.status = "inProgress"。

服务端随后流式发 turn/started、item/started，其中 commandExecution item 进入运行态。

收到 item/commandExecution/outputDelta 中的 tick 0 / tick 1 后，即可验证 active turn。

interrupt 测试：调用 turn/interrupt，预期最终收到 turn/completed，状态为 interrupted。官方 app-server 文档明确 turn/interrupt 用于取消运行中的 turn，成功后 turn 以 status: "interrupted" 结束。
OpenAI Developers
+1

steer 测试：另开一个同样的长 turn，收到第一段输出后调用：

JSON
{
 "method": "turn/steer",
 "id": 32,
 "params": {
 "threadId": "<thread>",
 "expectedTurnId": "<active-turn>",
 "clientUserMessageId": "steer-probe-001",
 "input": [
 {
 "type": "text",
 "text": "Steer probe: when the command completes, include the literal STEER_OK in your final answer and do not run any additional commands."
 }
 ]
 }
}

turn/steer 的官方语义是向当前 in-flight regular turn 追加用户输入，不创建新 turn；expectedTurnId 必须匹配 active turn，且 review/compact 等非 regular turn 可能拒绝 steer。
OpenAI Developers
+1

为什么这个安全

它只在空 workspace 中运行本地 Python 脚本；没有网络、没有真实 repo、没有 secret 环境变量、没有写文件。Codex 的 sandbox 适用于它启动的命令，包括 test runner、package manager、git 等子进程，因此这里的 Python 子进程也继承 sandbox 边界。
OpenAI Developers

不要用这些方式制造 active turn：

不要用 thread/shellCommand 做自动校准。app-server README 明确该 API 是用户发起的 ! shell workflow，unsandboxed with full access，不继承 thread sandbox policy。
OpenAI Developers
+1

不要用 --dangerously-bypass-approvals-and-sandbox / --yolo。CLI 参考明确说明它会无 approval、无 sandbox 运行所有命令，只能在外部硬化环境中使用；安全建议也明确避免使用。
OpenAI Developers
+1

不要用公开 issue 里那种“打开 Calculator”等 host UI 操作作为自动测试；它虽能制造真实 approval，但会触达宿主桌面而不是纯 fixture。该公开 issue 的 repro 使用了 open -g -a Calculator 来触发 approval，这不适合作为安全校准默认路径。
GitHub

2. 构造只读或低风险 pending approval；无法安全触发时如何标记 real-gap
首选：read-only sandbox 下请求运行一个无副作用命令

使用 approval-probe.config.toml：

TOML
approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "read-only"
allow_login_shell = false

prompt：

Use the shell to run exactly this command:

python3 -c "print('APPROVAL_PROBE_READONLY_OK')"

Do not read files. Do not modify files. Do not access the network.
If approval is required, request it and wait.

read-only + on-request 的官方效果是 Codex 可以读文件并回答问题，但编辑、运行命令、网络访问都需要 approval。
OpenAI Developers
 因此这个 prompt 应生成真实 item/commandExecution/requestApproval，但拟执行命令本身是无写入、无网络、无私密读取的 stdout-only 命令。

自动校准时的决策建议：

JSON
{ "decision": "decline" }

或：

JSON
{ "decision": "cancel" }

只验证“pending list 出现 → decision 发送 → serverRequest/resolved → item/turn 收敛”。app-server 文档说明 command approval 支持 accept、acceptForSession、decline、cancel 等 decision，并在客户端响应后通过 serverRequest/resolved 清除 pending request，最终 item/completed 给出权威状态。
OpenAI Developers
+1

可选：人工 isolated accept

只在人工验证、且 fixture 为空、env 已净化、命令与 allowlist 精确匹配时，允许一次性：

JSON
{ "decision": "accept" }

不要用 acceptForSession。不要用 acceptWithExecpolicyAmendment。不要接受网络 policy amendment。官方 README 显示这些 persistence / policy amendment decision 存在，因此 UI 必须把它们和一次性 accept 区分开。
GitHub

次选：精确 prompt rule，只验证 decline/cancel

如果某些版本在 read-only + on-request 下没有产生 command approval，可在临时 CODEX_HOME 加一个只用于校准的 .rules，精确匹配 harmless command：

Rust
prefix_rule(
 pattern = ["python3", "-c"],
 decision = "prompt",
 justification = "Calibration only: prompt before the exact harmless Python one-liner. Do not persist."
)

Codex rules 支持 allow / prompt / forbidden，其中 prompt 会在匹配时提示，forbidden 会直接阻止；官方还提醒应使用窄 prefix，而不是 python、curl 这类宽规则。
OpenAI Developers
+1

此方式只建议自动验证 decline / cancel。不要自动 accept，因为规则类 approval 可能意味着“允许越过 sandbox / execpolicy 边界”。

可选：request_permissions 的只读 fixture gap 探测

新版本 app-server README 记录了内建 request_permissions tool，它会发 item/permissions/requestApproval，请求的权限 profile 可包含 network 和 filesystem；客户端只能返回请求权限的子集，未返回的权限视为 denied，未请求的权限会被 server 忽略。
GitHub

安全探测可以是：准备 /tmp/codex-remote-calib/public-readonly，里面只有一个公开 dummy 文件；让模型只请求该 fixture 的 read access。自动响应时返回空权限或 turn-scoped exact subset。不要请求或授予 $HOME、repo 外真实目录、write root、network enabled、session scope。

无法安全触发时：标记 real-gap

不要用更危险的动作补覆盖率。记录为结构化 real-gap：

JSON
{
 "kind": "real-gap",
 "surface": "codex-app-server",
 "capability": "approval.pending.command.readonly",
 "observed": "no item/commandExecution/requestApproval within timeout",
 "safety_stop": "did not broaden permissions; did not use yolo; did not request private paths; did not trigger destructive file changes",
 "version": "<codex version>",
 "profile": "approval-probe.config.toml",
 "prompt_id": "approval-readonly-python-print",
 "thread_id": "<redacted>",
 "turn_id": "<redacted>",
 "events_seen": ["turn/started", "..."]
}

公开 issue 曾报告 app-server approval request/response 合约不明确或 version-specific gap；当前官方 app-server 文档已经描述 server-initiated request、客户端 decision payload、serverRequest/resolved，所以实际实现应按当前版本探测，不要假设所有版本一致。
GitHub
+1

3. approval UI 最少展示哪些 sanitized metadata

UI 的目标是让用户能判断：这是什么请求、会在哪个 turn 执行、触达什么资源、是否持久化、最坏后果是什么、可选 decision 是哪些。

通用字段

每个 pending approval 至少展示：

TypeScript
{
 requestId,
 method, // item/commandExecution/requestApproval 等
 threadId,
 turnId,
 itemId,
 createdAt,
 status, // pending | resolving | resolved | expired
 reason,
 availableDecisions,
 persistenceRisk, // once | session | always | policy-amendment
 sandboxMode,
 approvalPolicy,
 cwdAlias,
 environmentId
}

app-server 文档明确 approval request 包含 threadId、turnId，客户端应据此把 UI state 绑定到 active conversation。
OpenAI Developers

command approval

展示：

TypeScript
{
 type: "command",
 argvPreview, // tokenized argv，不只是一整串 shell 字符串
 cwdAlias, // $WORKSPACE/..., $TMP/..., $HOME/<redacted>
 commandActions,
 reason,
 networkApprovalContext, // host, protocol, port if present
 additionalPermissions, // redacted absolute paths, network enabled
 proposedExecpolicyAmendment,
 proposedNetworkPolicyAmendments,
 availableDecisions
}

官方 schema 中 command approval 可包含 command、cwd、commandActions、proposedExecpolicyAmendment、networkApprovalContext、availableDecisions 和 experimental additionalPermissions；additionalPermissions 里的路径在线上是 absolute path，因此 UI 必须做 path alias / redaction。
OpenAI Developers
+1

网络 approval 要单独渲染为网络请求，而不是普通 shell command；官方文档说明 networkApprovalContext 存在时当前 v2 schema 暴露目标 host 和 protocol，客户端不应依赖 command 作为用户可理解的预览。
OpenAI Developers

file change approval

展示：

TypeScript
{
 type: "fileChange",
 paths: [{ pathAlias, kind }],
 diffSummary, // added/deleted line count, hunk count
 diffPreviewRedacted, // bounded, secret-redacted
 grantRoot, // if present, emphasize session/root grant risk
 reason,
 availableDecisions
}

app-server 的 fileChange 流程是先发 item/started，其中含 proposed changes，再发 item/fileChange/requestApproval，包含 itemId、threadId、turnId、reason、可选 grantRoot。
OpenAI Developers
+1

request_permissions approval

展示：

TypeScript
{
 type: "permissions",
 environmentId,
 cwdAlias,
 requestedFileSystem: {
 readRoots: [...],
 writeRoots: [...]
 },
 requestedNetwork: {
 enabled: boolean,
 hostsOrPolicy: [...]
 },
 requestedScope: "turn" | "session",
 grantableSubsetOnly: true
}

客户端响应只能授予请求权限的子集，未列出的权限视为 denied，未请求的权限会被忽略；这一点应直接体现在 UI 中，避免用户误以为“接受”是全量授权。
GitHub

MCP / app tool approval

展示：

TypeScript
{
 type: "mcpToolCall" | "appToolCall",
 serverOrAppName,
 toolName,
 sanitizedArguments,
 destructiveHint,
 openWorldHint,
 requestedPersistence, // none | session | always
 requestedSchemaOrQuestions,
 reason
}

app-server 文档说明 side-effecting app / connector tool calls 可以通过 tool/requestUserInput 请求 Accept / Decline / Cancel；破坏性 app/MCP tool 即使同时声明低权限 hint，也总是需要 approval。
OpenAI Developers
+1
 MCP elicitation 也可能携带 persist: "session" / "always" 之类持久化提示，UI 必须显式显示。
GitHub

Sanitization 规则

最小 redaction：

/home/vint/project -> $WORKSPACE
/home/vint/.codex -> $CODEX_HOME/<redacted>
/home/vint -> $HOME/<redacted>
/tmp/codex-remote-calib -> $CALIB_TMP

命令中 redact：

*_TOKEN=...
*_KEY=...
Authorization: Bearer ...
--password ...
--token ...
.env
~/.ssh
~/.codex/auth.json

URL 中只展示 scheme、host、port、path 前几段；query 默认隐藏，因为 query 常含 token。diff / stdout 只展示 bounded snippet，并做高熵 token / secret key pattern redaction。

4. 自动校准里绝不应 accept 的 approval 类型

这些可以出现在 pending list 中，但自动校准只能 decline / cancel，不能 accept。

类型 不应自动 accept 的原因
danger-full-access、--dangerously-bypass-approvals-and-sandbox、--yolo 无 sandbox、无 approval，官方标注为危险，仅限外部硬化环境。
OpenAI Developers
+1

thread/shellCommand / 用户 ! shell workflow app-server README 明确它 unsandboxed full access，不继承 thread sandbox。
OpenAI Developers
+1

acceptForSession、persist: session、persist: always、“Always allow” 会把一次校准扩展为会话或持久授权。MCP approval 也可能声明 session/always persistence。
GitHub

acceptWithExecpolicyAmendment、applyNetworkPolicyAmendment 会改 exec / network policy，超过一次性验证范围；官方 README 明确这些是 command approval decision 变体。
GitHub

broad prefix rule approval，例如 ["python"]、["curl"]、["bash"]、["sh","-c"] 官方 Auto-review 文档建议使用窄 prefix，避免 python、curl 这种宽规则，因为会抹掉安全边界。
OpenAI Developers

shell wrapper / compound command 中含变量、glob、重定向、管道、下载执行 官方 rules 文档说明 shell wrapper 可能隐藏多个动作；只在受限情形下可被安全拆分。
OpenAI Developers

网络访问：*、公网任意域、私网/localhost、metadata IP、Unix socket、proxy 放宽 配置参考说明 network proxy 默认不允许外部目的地，* 会广泛打开公网访问，dangerously_allow_all_unix_sockets 仅限严格受控环境。
OpenAI Developers

任何读取真实私密路径：~/.ssh、~/.aws、~/.config、浏览器 profile、.env、~/.codex/auth.json、OS keychain 这不是低风险 approval，会变成私密数据访问测试。
任何写真实 repo、真实 home、父目录、邻近 repo、系统目录的 write root 属于 broad permission approval；只能在临时 fixture 里人工一次性 accept。
删除、覆盖、移动、chmod/chown、rm -rf、git reset --hard、git clean、git push、package publish/deploy 破坏性或外部副作用；Codex 文档也把 destructive Git operations 等列为需要 approval 的风险动作。
OpenAI Developers

app/MCP destructive tool、open-world connector、OAuth / app install / plugin install 官方说明 side-effecting app tool 可触发 approval，destructive app/MCP tool 总是需要 approval；自动校准不应接受。
OpenAI Developers
+1

request_permissions 中的 network enabled、write root、session scope、HOME/repo 外目录 这是扩大 sandbox 边界；request_permissions 只能授予请求子集，自动测试应返回空或 decline。
GitHub

skill-script approval、dependency install approval 高供应链风险；granular approval policy 可让 skill_approval fail closed。
OpenAI Developers
+1
5. 最小人工 / 自动验证流程
A. 自动：active turn + interrupt

启动 local-only app-server：stdio://、unix:// 或 ws://127.0.0.1:<port>。

使用 safe-active.config.toml，cwd 指向 /tmp/codex-remote-calib/work。

thread/start。

turn/start，prompt 为 python3 safe_long_active.py。

等待：

turn/started

item/started，item.type = commandExecution

至少一个 item/commandExecution/outputDelta

调用 turn/interrupt。

断言：

interrupt RPC 返回 {}。

最终 turn/completed.status == "interrupted"。

pending approval list 没有残留。

如果实现使用 background terminals，按官方说明不要假设 turn/interrupt 会清理它们；需要显式 background terminal cleanup。
GitHub

B. 自动：active turn + steer

另开 fresh thread / fresh turn，仍运行 safe_long_active.py。

收到第一段 stdout 后调用 turn/steer，带 expectedTurnId。

断言：

turn/steer 返回同一个 turnId。

没有新 turn/started。

同一 turn 的事件继续流动。

最终 answer 包含 steer 指令中的 sentinel，例如 STEER_OK。如果模型未在最终回答中体现 steer，但 RPC 成功、同 turn 继续，则记录为 steer_effect_gap，不要改用危险命令。

C. 自动：pending approval list + decline

使用 approval-probe.config.toml，cwd 仍指向空 fixture。

turn/start，prompt 为只打印 stdout 的 Python one-liner。

等待 item/commandExecution/requestApproval。

将 pending request 入 list，key 使用：

requestId + threadId + turnId + itemId + method

UI/测试读取 list，校验 sanitized metadata：

argv = python3 -c ...

cwd = $CALIB_TMP/work

no network

no additional write permissions

decision choices 仅来自 availableDecisions 或协议允许集合

自动发送：

JSON
{ "decision": "decline" }

断言：

收到 serverRequest/resolved。

pending list 移除或置为 resolved。

对应 item/completed.status 为 declined 或 turn 进入可解释的终态。

没有执行 stdout APPROVAL_PROBE_READONLY_OK，或至少没有把 decline 误当 accept。

D. 人工：一次性 accept smoke test

仅在需要验证 accept path 时运行：

使用 fresh fixture、净化 env、无网络。

确认 UI 展示的 command 完全等于 allowlist：

python3 -c "print('APPROVAL_PROBE_READONLY_OK')"

人工点击一次性 Accept。

断言：

serverRequest/resolved

item/completed.status == "completed"

exitCode == 0

stdout 包含 APPROVAL_PROBE_READONLY_OK

禁止选择 Accept for session、rule amendment、network amendment、permission profile grant。

E. gap 处理

任何一步失败都不要扩大权限补洞。按类型标记：

active-turn-gap 没有形成 inProgress turn
interrupt-gap turn/interrupt RPC 成功但没有 interrupted 终态
steer-rpc-gap turn/steer 被拒绝或 turnId 不匹配
steer-effect-gap steer accepted 但最终输出未体现 steer
approval-trigger-gap read-only 命令没有产生 approval request
approval-list-gap request 出现但 UI list 未出现
approval-decision-gap decision 发出后无 serverRequest/resolved
approval-cleanup-gap turn 完成/中断后 pending 未清理
manual-accept-not-run 人工一次性 accept 后 command 未完成

推荐最终最小矩阵：

能力 自动验证 人工验证
active turn detection 是 否
interrupt 是 否
steer RPC 是 否
steer effect 是，允许 gap 可选
approval pending list 是 否
approval decline 是 否
approval cancel 是，可选 否
approval accept 否 仅 isolated once
acceptForSession / policy amendment / broad permission 永不 永不

结论：最安全、稳定的组合是：用 workspace-write sandbox 里的 stdout-only 长命令制造 active turn；用 read-only sandbox 下的 stdout-only 命令制造 command pending approval；自动校准只验证 list/decline/cancel，不自动 accept。无法触发时记录 real-gap，而不是改用 yolo、unsandboxed shell、私密路径、网络或持久权限。
