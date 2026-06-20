---
title: "Q21：Real command/control protocol compatibility"
source_url: "https://chatgpt.com/c/6a364c7c-c04c-83ee-9582-3f35219b4441"
exported_at: "2026-06-20T17:07:51"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

调研结论

当前官方文档、生成协议文件和 app-server 源码都显示：真实 Codex app-server 当前支持 thread/start、turn/start、turn/interrupt、turn/steer。但真实可用性必须以你实际运行的 codex 版本生成出来的 schema 与真实 app-server 响应为准；官方文档明确说明 codex app-server generate-ts / generate-json-schema 的输出与运行该命令的 Codex 版本精确匹配。
OpenAI Developers

另一个关键点：turn/steer 是“向当前 in-flight turn 注入输入”，不是“新建 follow-up turn”。公开 issue 也提到 turn/steer 协议方法已存在，参数为 threadId、input、expectedTurnId，但 SDK 曾一度未暴露该方法。
GitHub

1. 真实参数与返回语义
thread/start

当前生成协议参数形态：

TypeScript
{
 model?: string | null
 modelProvider?: string | null
 serviceTier?: string | null
 cwd?: string | null
 approvalPolicy?: AskForApproval | null
 approvalsReviewer?: ApprovalsReviewer | null
 sandbox?: "read-only" | "workspace-write" | "danger-full-access" | null
 config?: Record<string, JsonValue> | null
 serviceName?: string | null
 baseInstructions?: string | null
 developerInstructions?: string | null
 personality?: "none" | "friendly" | "pragmatic" | null
 ephemeral?: boolean | null
 sessionStartSource?: "startup" | "clear" | null
 threadSource?: string | null
}

生成 schema 里 thread/start.sandbox 是 CLI 风格的 kebab-case：read-only / workspace-write / danger-full-access，不是 turn/start.sandboxPolicy.type 的 camelCase。
GitHub
+1

返回语义：

thread/start 创建新 thread，返回 ThreadStartResponse，其中至少有 thread，并包含解析后的 model、modelProvider、serviceTier、cwd、approvalPolicy、approvalsReviewer、sandbox、reasoningEffort 等配置回显；官方示例也显示会收到 thread/started notification。
GitHub
+1

注意：thread/start 只创建 thread，不代表 turn 已完成，也不代表 agent 已开始工作。后续必须 turn/start。

turn/start

当前生成协议参数形态：

TypeScript
{
 threadId: string
 input: UserInput[]

 clientUserMessageId?: string | null
 cwd?: string | null
 approvalPolicy?: AskForApproval | null
 approvalsReviewer?: ApprovalsReviewer | null
 sandboxPolicy?: SandboxPolicy | null
 model?: string | null
 serviceTier?: string | null
 effort?: string | null
 summary?: "auto" | "concise" | "detailed" | "none" | null
 personality?: "none" | "friendly" | "pragmatic" | null
 outputSchema?: JsonValue | null
}

threadId 与 input 是 required。turn/start 的 sandboxPolicy 是对象形态，例如 { "type": "workspaceWrite", "writableRoots": [...], "networkAccess": false }；这与 thread/start.sandbox 的 kebab-case 字符串不同。
GitHub
+1

input 形态：

官方文档列出 text、image、localImage；生成 schema 还包含 skill 与 mention。文本输入在 JSON schema 中只要求 type 与 text，text_elements 默认 []；为最大兼容，真实校准脚本建议显式发送：

JSON
{ "type": "text", "text": "CALIBRATION", "text_elements": [] }

OpenAI Developers
+1

返回语义：

turn/start 返回 { turn }，返回时 turn.status 通常是 "inProgress"；后续完成靠 notifications，尤其是 turn/completed。官方文档明确说 turn/start 会开始 Codex generation，并 stream turn/started、item/*、turn/completed。
OpenAI Developers
+2
GitHub
+2

turn/steer

当前生成协议参数形态：

TypeScript
{
 threadId: string
 input: UserInput[]
 expectedTurnId: string

 clientUserMessageId?: string | null
}

expectedTurnId 是 required precondition，必须匹配当前 active turn。生成 schema 和官方文档都确认：turn/steer 不接受 turn-level overrides，如 model、cwd、sandboxPolicy、outputSchema。
GitHub
+2
GitHub
+2

返回语义：

成功返回：

JSON
{ "turnId": "<active-turn-id>" }

这只表示“注入已被 active turn 接受”。它不会发新的 turn/started，也不会创建新 turn。最终完成仍然属于原来的 active turn，靠该 turn 的 turn/completed 判断。
GitHub
+1

源码和 README 还显示 review/manual compaction turn 会拒绝 turn/steer。
GitHub
+1

turn/interrupt

当前生成协议参数形态：

TypeScript
{
 threadId: string
 turnId: string
}

threadId 与 turnId 都是 required。
GitHub
+1

返回语义：

成功返回空对象 {}，但这仍然是“interrupt 请求被接受”，不是“turn 已经终止”。官方文档说明成功后该 turn 会以 status: "interrupted" 完成；生成协议里 TurnStatus 枚举包含 "completed" | "interrupted" | "failed" | "inProgress"。
OpenAI Developers
+2
GitHub
+2

2. 常见失败与处理方式
失败场景 真实表现/判断 建议处理
未初始化 每个连接必须先 initialize，再发 initialized；初始化前请求会返回 Not initialized，重复 initialize 会返回 Already initialized。
OpenAI Developers
 Web/Worker 在连接层建立 initialized=true gate；未完成 handshake 前禁止任何业务 RPC。
实验字段未 opt-in 官方文档说明 experimental 方法/字段需要 capabilities.experimentalApi=true，否则返回 <descriptor> requires experimentalApi capability。
OpenAI Developers
 默认只发 stable schema 字段。实验字段必须由“生成 schema + initialize capability + 实测通过”三者共同开启。
cwd /权限/沙箱不被允许 源码在 turn settings override 预检失败时返回 invalid thread settings override: ...；不是一定叫 cwd_not_allowed。
GitHub
 Control Plane 应先做自己的 cwd allowlist；app-server 返回的 invalid override 记录为 real failure，并映射成用户可读错误。
thread 不存在或未 loaded app-server 有 thread/read、thread/loaded/list 等区分 stored/read 与 loaded/in-memory surface；外部 client 尝试控制已有 Desktop UI turn 的路径目前公开 issue 仍认为不清晰。
OpenAI Developers
+1
 不要把“能读 stored thread”当成“能 steer/interrupt loaded active turn”。
active turn 不存在 turn/steer 源码错误字符串是 no active turn to steer；公开 VS Code issue 里实际错误为 {"code":-32600,"message":"no active turn to steer"}。
GitHub
+1
 清空本地 active-turn 状态，reconcile 线程状态；不要让 UI spinner 卡住。
expectedTurnId 不匹配 源码返回 expected active turn id \...` but found `...`；公开 /review` issue 也复现了 active turn ID mismatch。
GitHub
+1
 treat as stale client state；停止 steer，重新读取 active/latest turn，再决定 queue 或 start new turn。
review/compact turn 不可 steer 源码返回 cannot steer a review turn 或 cannot steer a compact turn，并带 ActiveTurnNotSteerable 数据。
GitHub
 review/compact 期间隐藏 live follow-up；允许排队到 turn 完成后再 turn/start。
active turn 不可 interrupt / 已结束 源码在没有 active turn 或 agent 不 running 时返回 no active turn to interrupt；turnId 不匹配时返回 active turn mismatch。
GitHub
 Interrupt 按钮只在持有 active turnId 时可点；点后进入 stopping，等 turn/completed: interrupted。
方法不存在 / 版本过旧 当前源码 dispatch 中有 TurnStart、TurnSteer、TurnInterrupt 分支；错误码常量包含 -32601 method not found，但未知 JSON method 也可能走反序列化 invalid request 路径。
GitHub
+2
GitHub
+2
 校准脚本必须记录原始 error.code 与 error.message，不要只按一种错误码分类。
WebSocket backpressure 官方文档说明 WebSocket ingress 满时返回 -32001，message 为 Server overloaded; retry later.
OpenAI Developers
 WebSocket 模式使用指数退避 + jitter；不要无限重试同一个 steer。
3. Web 应如何表达 accepted vs completed

Web 层应把 RPC result 与 turn terminal event 分开表达。

accepted：

thread/start 收到 result.thread，表示 thread 创建成功；不表示 turn 已开始。turn/start 收到 result.turn.status="inProgress"，表示 turn 已被接受并开始流式执行；不表示完成。turn/steer 收到 { turnId }，表示输入已注入 active turn；不会有新的 turn/started。turn/interrupt 收到 {}，表示 interrupt 请求被接受；不表示已中断完成。
OpenAI Developers
+1

completed：

只有收到目标 turn 的 turn/completed，并看到 terminal status：completed / interrupted / failed，才应把任务标为完成。turn/interrupt 的最终 completed 应该是 status: "interrupted"。
OpenAI Developers
+1

推荐 Web 状态机：

idle
 -> threadStarting
 -> threadAccepted
 -> turnStarting
 -> turnAccepted/running
 -> steeringAccepted // only for turn/steer, still same active turn
 -> interruptAccepted/stopping
 -> completed | interrupted | failed

对 follow-up 的 UI 文案应区分：

已发送到当前运行中的 turn // turn/steer accepted
已排队，等待当前 turn 完成 // not steered yet
已作为新 turn 开始执行 // turn/start accepted
已完成 / 已中断 / 已失败 // turn/completed terminal

公开 issue 里已经出现过 completed turn 被恢复成 streaming、no active turn to steer 后队列停止等问题；建议 Web 在 terminal turn/completed 时强制清理 streaming/active-turn state，并把 stale no active turn to steer / active_turn_not_steerable 当作“本地 active 状态过期”，而不是让发送锁或 spinner 挂住。
GitHub
+1

4. 最小真实校准脚本步骤

目标不是证明 fake Worker smoke，而是证明“当前安装的真实 codex app-server 能按当前 contract 工作”。

A. 记录版本与生成协议

记录 codex --version、平台、transport、CODEX_HOME、工作目录、auth 模式。

运行：

Bash
codex app-server generate-json-schema --out ./calibration-schema/stable
codex app-server generate-ts --out ./calibration-schema/ts

如需测试实验字段，单独运行：

Bash
codex app-server generate-json-schema --experimental --out ./calibration-schema/experimental

对比当前 API contract 与生成的 ThreadStartParams、TurnStartParams、TurnSteerParams、TurnInterruptParams。官方文档明确这些生成物与运行该命令的 Codex 版本精确匹配。
OpenAI Developers

B. 启动真实 app-server

优先用 stdio，降低 WebSocket auth/backpressure 变量：

Bash
codex app-server

发送 JSON-RPC JSONL，并将所有 sent/received 原文写入 calibration-raw.jsonl。

C. 测试用例顺序

pre-init negative
初始化前发送 thread/start。期望 Not initialized。

initialize
发送：

JSON
{
 "method": "initialize",
 "id": 1,
 "params": {
 "clientInfo": {
 "name": "codex_remote_calibration",
 "title": "Codex Remote Calibration",
 "version": "0.0.1"
 }
 }
}

随后发送：

JSON
{ "method": "initialized", "params": {} }

thread/start minimal
建议用 schema 形态，而不是 fake smoke 形态：

JSON
{
 "method": "thread/start",
 "id": 2,
 "params": {
 "cwd": "/ABS/PATH/TO/TEMP/REPO",
 "approvalPolicy": "never",
 "sandbox": "workspace-write",
 "serviceName": "codex_remote_calibration"
 }
}

记录 thread.id 与 thread/started。

turn/start minimal

JSON
{
 "method": "turn/start",
 "id": 3,
 "params": {
 "threadId": "<thread-id>",
 "input": [
 { "type": "text", "text": "CALIBRATION: reply exactly OK.", "text_elements": [] }
 ]
 }
}

期望 result.turn.id 且 status="inProgress"，随后等待 turn/completed。

steer after completed negative
在 turn 已完成后发送 turn/steer。期望 no active turn to steer。

active steer positive
新开一个会保持运行的 turn，例如让 Codex 执行安全的长任务或长测试，再立即发送：

JSON
{
 "method": "turn/steer",
 "id": 5,
 "params": {
 "threadId": "<thread-id>",
 "expectedTurnId": "<active-turn-id>",
 "input": [
 { "type": "text", "text": "Also include STEERED_OK in the final answer.", "text_elements": [] }
 ]
 }
}

期望 { "turnId": "<active-turn-id>" }，且没有新 turn/started。

expectedTurnId mismatch negative
在 active turn 存在时用错误 expectedTurnId。期望 active turn mismatch。

interrupt positive
新开长 turn，发送：

JSON
{
 "method": "turn/interrupt",
 "id": 7,
 "params": {
 "threadId": "<thread-id>",
 "turnId": "<active-turn-id>"
 }
}

期望先 {}，随后 turn/completed.status="interrupted"。

interrupt after terminal negative
同一个 turn 再 interrupt。期望 no active turn to interrupt 或 mismatch 类错误。

unknown/old-version method negative
发送 turn/steer_typo，记录真实 error.code/message。不要预设一定是 -32601，因为未知 method 可能在 JSON 反序列化阶段变成 invalid request。
GitHub
+1

D. 记录分类

每个 case 输出一条结构化结果：

JSON
{
 "case": "turn_steer_active_positive",
 "codexVersion": "...",
 "schemaHash": "...",
 "transport": "stdio",
 "request": {...},
 "observed": {...},
 "classification": "real-pass | fixed-pass | real-gap",
 "notes": "..."
}

分类标准：

分类 含义
real-pass 当前 contract 原样对真实 app-server 通过。
fixed-pass 首次失败来自 contract/client 形态不匹配；修改 payload 或状态机后通过。例如 thread/start.sandbox 从 workspaceWrite 改为 workspace-write，或 steer 增加 expectedTurnId。
real-gap 真实 app-server 不支持当前设想能力。例如方法不存在、字段 gated、无法 attach 到已有 Desktop UI active turn、turn/steer 对 review turn 被拒。
5. UI 暴露建议
现在适合暴露为主 UI

新建任务 / 新建 thread + turn
主路径用 thread/start + turn/start。这是官方文档的基础生命周期。
OpenAI Developers
+1

普通 follow-up，但仅在 idle 后用 turn/start
如果当前没有 active turn，follow-up 应作为新 turn：turn/start({ threadId, input })。

Stop / Interrupt，但只在持有 active turnId 时显示
成功返回 {} 后显示 “Stopping…”，直到 turn/completed.status="interrupted" 才完成。

流式事件展示
主 UI 可以显示 turn/started、item/*、item/agentMessage/delta、turn/completed，因为官方 lifecycle 就要求客户端持续读取 notifications。
OpenAI Developers

应隐藏到 active turn 出现后

Live follow-up / steer 输入框
只有同时满足以下条件才展示或启用：真实校准 turn/steer 为 real-pass 或 fixed-pass；当前 thread 有 active turnId；active turn 不是 review/compact；本地 expectedTurnId 与最新 active turn 一致。

Steer 的高级配置项
turn/steer 不接受 model、cwd、sandboxPolicy、outputSchema。这些设置只能放在下一次 turn/start，不能在 live steer UI 中暴露。
OpenAI Developers

控制已有 Codex Desktop UI session
公开 issue 明确指出：文档 primitives 对“client 自己通过 app-server 创建的 thread”有效，但外部 client 发现并 attach 到正在运行的 Codex Desktop thread/turn 仍缺少清晰支持路径。该能力应隐藏在 diagnostics/experimental 后面。
GitHub

实验字段
dynamicTools、background terminal、process control、permission profile 等实验 surface 必须等到生成 schema 与 capabilities.experimentalApi=true 实测通过后再暴露。
OpenAI Developers

Review/compact 期间 follow-up 直注入
review/manual compaction turn 会拒绝 turn/steer；这类状态下 UI 应改成“排队到当前 turn 完成后发送”，而不是继续发 steer。
GitHub
+1

核心实现原则：idle 用 turn/start，active 才考虑 turn/steer，interrupt 必须绑定 active turnId，completed 只能由 turn/completed 判定。
