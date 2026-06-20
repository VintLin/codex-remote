---
title: "Q19：Public project identity and project discovery"
source_url: "https://chatgpt.com/c/6a364be3-cc70-83ee-9f9b-cdaa5c283473"
exported_at: "2026-06-20T17:07:35"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

结论

公开 API contract 里，project identity 应使用 Control Plane 分配的 opaque projectId。basename 只能作为默认展示名；绝对路径、app-server cwd、app-server 启动时的进程 cwd 都不应作为公开 identity，也不应进入 Web/任务看板的稳定链接。

依据是：Codex app-server 的 thread/start 直接接受 cwd，而 thread/list.cwd 的语义是“只返回 session current working directory 与该 path 精确匹配的 threads”；这说明 cwd 是 host-local execution selector，不是跨设备、跨系统稳定资源 ID。thread.sessionId 也被官方文档明确要求从响应里读取，不要从 thread.id 派生。
OpenAI Developers
+1
 Remote connections 文档也说明，远程访问使用 connected host 的 projects、threads、files、credentials、permissions、plugins 和 local tools，shell 命令运行在 host 或 remote environment 上；因此本机路径属于 host-local implementation detail。
OpenAI Developers
+1

安全侧也支持这个结论：OWASP 把“API 返回客户端不应读取的敏感对象属性”归为对象属性级授权/过度暴露问题，并建议只返回 endpoint 业务需要的最小字段；Full Path Disclosure 也明确指出完整路径泄露会给后续攻击提供材料。Microsoft 的 Web API 设计建议同样强调客户端不应暴露于服务内部实现，API 应通过 mapping layer 隔离内部结构变化。
OWASP Foundation
+2
OWASP Foundation
+2

1. 推荐的 RemoteProject 模型字段
Public API：只公开 opaque identity 和展示信息
TypeScript
type RemoteProject = {
 id: string; // opaque, e.g. "rprj_..."
 name: string; // display-only, 默认 basename，可由用户改名
 workerId: string; // opaque, e.g. "rwk_..."
 kind: "localWorker";
 availability: "online" | "offline";
 capabilities: {
 startConversation: boolean;
 };
 createdAt: string;
 updatedAt: string;
};

不要公开：

TypeScript
path: string; // 不公开
cwd: string; // 不公开
absolutePath: string; // 不公开
appServerCwd: string; // 不公开

name 可以默认取 basename(allowedProjectRoot)，但必须标注为 display-only。它不能作为 key，因为 basename 不唯一、可变、跨 worker 容易碰撞，例如两个机器都可能有 ~/work/app 或 ~/src/app。如果需要区分同名项目，优先展示 Worker/host 的非敏感 display label，例如 “MacBook · app”，而不是 /Users/alice/company/secret-client/app。

Worker local state：保存真实 cwd
TypeScript
type WorkerProjectBinding = {
 remoteProjectId: string;
 localProjectKey: string; // Worker 生成并持久化的随机/opaque key
 allowedProjectRoot: string; // canonical absolute path, Worker 本地保存
 codexCwd: string; // 传给 app-server thread/start、thread/list 的 cwd
};

allowedProjectRoot 和 codexCwd 只应存在于 Worker 本地配置/内存里。Worker 调用 Codex app-server 时使用真实绝对路径，因为 thread/start 和 thread/list.cwd 的 contract 就是路径型 cwd；但 Worker 向 Control Plane/Web 返回时必须投影成 projectId。
OpenAI Developers
+1

Control Plane private state：不存 raw path，最多存不可逆/加密引用
TypeScript
type RemoteProjectPrivate = {
 id: string;
 workspaceId: string;
 ownerUserId: string;
 workerId: string;
 localProjectKey: string; // Worker 提供的 opaque key
 name: string;
 cwdFingerprint?: string; // 可选：Worker 本地 secret HMAC(canonicalCwd)，不可逆
 encryptedCwdBlob?: string; // 不推荐；仅在确有路由/恢复需求时使用
};

推荐优先级：

最佳：Control Plane 完全不保存 raw cwd，只保存 workerId + localProjectKey -> projectId。

可接受：Worker 计算 HMAC(workerLocalSecret, canonicalCwd)，Control Plane 只保存不可逆 fingerprint，用于幂等 upsert。

尽量避免：Control Plane 保存加密 cwd。即使加密，也不要返回给 Web，不要进入日志、analytics、task link 或错误消息。

还要注意：Codex app-server 的一些事件/功能本身会携带 cwd，例如 command execution approval payload 可能带 cwd，skills/external-agent-config 也按 cwd 扫描或返回 cwd；因此 Remote Worker 不能把 app-server 原始 JSON-RPC payload 直接透传给 Web，必须做 schema projection/redaction。
OpenAI Developers

2. conversation.projectId 应由谁产生和归一化

推荐：Worker 投影本地项目，Control Plane 归一化成公开 projectId，Web 只消费，不派生。

流程：

Worker
 allowedProjectRoot -> canonicalize/validate
 -> localProjectKey + display name
 -> registerProject

Control Plane
 (workspaceId, workerId, localProjectKey)
 -> upsert RemoteProject(id = opaque)
 -> return projectId

Web
 GET /v1/projects
 -> 用户选择 projectId
 POST /v1/conversations { projectId, ... }

Worker
 projectId -> local codexCwd
 -> app-server thread/start { cwd: codexCwd, ... }

不要让 Web 从这些字段派生 conversation.projectId：

候选 是否可作为 public identity 原因
basename 否 不唯一、可变、只能展示
绝对路径 否 泄露本机用户名、公司名、客户名、目录结构；OS/WSL/symlink 也不稳定
app-server cwd 否 是 Codex 执行上下文和 exact-match filter，不是 public resource ID
app-server 启动进程 cwd 否 可能与 thread cwd 不同，也不应暴露
opaque projectId 是 稳定、可授权、可迁移、可重命名、不泄露路径

Worker 必须负责本机路径 canonicalization 和 allowedProjectRoot 校验，因为 Control Plane 没有本机 filesystem 语义，无法可靠判断 symlink、WSL path、大小写、realpath、挂载点等。Control Plane 的“归一化”应是身份归一化和授权归一化，不是路径归一化。

对已有 Codex threads 做反向关联时，也应由 Worker 做投影：如果 thread 的 cwd 能被本地 Worker 确认为当前 allowedProjectRoot，Worker 返回 projectId；否则返回 projectId: null 或 unbound。不要让 Web 通过 cwd 字符串匹配。GitHub issue 里已有 Windows/WSL cwd 不匹配导致 thread/list 查不到历史的报告，也有 resume 时实际 cwd 仍用旧 cwd 的报告；这些不能当官方 contract，但很适合作为本机验证用例。
GitHub
+1

3. 空 conversation 时 /v1/projects 的最小可用设计

关键点：/v1/projects 不能依赖已有 conversations 或 thread/list 推断项目。在没有任何 conversation 时，项目发现必须来自 Worker registration/heartbeat，因为 Worker 已经知道唯一的 allowedProjectRoot。

GET /v1/projects
http
GET /v1/projects

响应：

JSON
{
 "data": [
 {
 "id": "rprj_01J...",
 "name": "my-repo",
 "workerId": "rwk_01J...",
 "kind": "localWorker",
 "availability": "online",
 "capabilities": {
 "startConversation": true
 },
 "createdAt": "2026-06-20T00:00:00Z",
 "updatedAt": "2026-06-20T00:00:00Z"
 }
 ]
}

对于“本地 Worker 只允许一个 allowedProjectRoot”的当前约束，GET /v1/projects 在线时最小只需要返回一个 project。即使 conversation 数量为 0，也应返回这一个 project。

POST /v1/conversations
http
POST /v1/conversations
Content-Type: application/json

请求：

JSON
{
 "projectId": "rprj_01J...",
 "initialMessage": "Fix failing tests"
}

Control Plane 行为：

校验 projectId 属于当前 user/workspace。

校验对应 Worker 在线且允许 start conversation。

把请求转发给 Worker，不传 path 给 Web。

Worker 用本地绑定查出 codexCwd。

Worker 调用 Codex app-server：

JSON
{
 "method": "thread/start",
 "id": 10,
 "params": {
 "cwd": "<worker-local-absolute-allowedProjectRoot>",
 "model": "gpt-5.4",
 "serviceName": "codex-remote"
 }
}

Worker/Control Plane 保存：

JSON
{
 "conversationId": "conv_01J...",
 "projectId": "rprj_01J...",
 "workerId": "rwk_01J...",
 "codexThreadId": "thr_123",
 "codexSessionId": "thr_123"
}

thread/list 默认只包含 interactive source kinds cli 和 vscode；如果你们后续用 app-server-started threads 做历史列表，验证时要显式包含 sourceKinds: ["appServer", ...]，否则可能误判为空。
OpenAI Developers

4. task link 应保存哪些 ID 才稳定且不泄露路径

任务看板上的稳定链接建议保存：

TypeScript
type TaskConversationLink = {
 taskId: string;
 workspaceId: string;
 projectId: string; // opaque RemoteProject id
 workerId: string; // opaque Worker/host id
 conversationId: string; // 你们自己的 conversation id
 codexThreadId: string; // app-server thread.id
 codexSessionId: string; // app-server thread.sessionId，读取响应，不派生
 codexTurnId?: string; // 可选：指向具体 turn/run
 createdAt: string;
};

不要保存：

TypeScript
cwd
path
absolutePath
basename as foreign key
appServerProcessCwd

codexThreadId 用于回到 app-server thread；conversationId 用于你们自己的权限、审计和 UI 状态；projectId 用于在打开任务时找到正确 Worker/project binding；codexSessionId 必须从 thread.sessionId 读取，因为 forked threads 会保留 root session id，官方文档明确说客户端不应从 thread id 派生 session id。
OpenAI Developers

如果任务还需要关联代码版本，可以额外保存非路径型信息：

TypeScript
git?: {
 providerRepoId?: string;
 remoteUrlHash?: string;
 branch?: string;
 sha?: string;
}

注意不要直接保存本地 repo path，也谨慎保存 raw originUrl，因为私有 Git URL 可能包含组织名、内部 hostname 或 token。若只用于去重/审计，保存 hash 或 provider repo id 更安全。

5. 需要本机验证的 Codex cwd 行为

这些需要在你们实际支持的 Codex app-server/CLI/App 版本上验证。官方 troubleshooting 文档说明 Codex app 和 CLI 使用同一底层 agent/config，但版本可能不同，实验特性也可能先进入 CLI；因此不能只测一个 binary。
OpenAI Developers

必测清单

thread/start.cwd 是否成为真实执行 cwd
用 Worker 的 allowedProjectRoot 调 thread/start { cwd }，随后启动 turn 执行 pwd / git rev-parse --show-toplevel / 读取 AGENTS.md，确认 shell、文件读取、项目配置都在正确目录。

thread/list.cwd 是否必须 exact match
官方文档写明 thread/list.cwd 是按 session current working directory 精确匹配。要测试这些变体是否返回同一 thread：trailing slash、symlink path vs realpath、大小写差异、macOS case-insensitive volume、Windows path、WSL /mnt/c/... path。
OpenAI Developers
+1

sourceKinds 是否影响 Remote-created threads 可见性
因为 thread/list 默认 sourceKinds 是 cli 和 vscode，而 app-server-created thread 可能是 appServer，你们的 Worker 历史列表要验证是否必须显式传 sourceKinds: ["cli","vscode","exec","appServer",...]。
OpenAI Developers

resume 时 cwd 是否会被旧 loaded thread 污染
GitHub issue 报告过 app-server daemon 已加载旧 thread 时，resume 选择新 cwd 但实际仍使用旧 cwd，影响 shell、project-local config 和 skills。你们应验证当前版本是否已修复；若未修复，Remote Worker 不应允许同一个 conversation 在不同 project/cwd 下 resume。
GitHub

project-scoped config/trust 是否由 cwd 触发
Codex 配置文档说明 user config 在 ~/.codex/config.toml，project-scoped .codex/config.toml 只在 trusted project 时加载。要验证 Remote start 使用的 sandbox/approval 配置是否会改变 trust 状态，以及 project-local config 是否按 allowedProjectRoot 加载。
OpenAI Developers

空历史项目能否独立 start conversation
不要用 thread/list 结果推断项目是否存在。创建一个没有任何历史 thread 的 allowed root，确认 /v1/projects 仍返回项目，POST /v1/conversations { projectId } 能启动新 thread。相关社区 issue 显示 Codex App 现有“saved project / visible thread”路径对新目录并不总是可靠，所以你们自己的 Remote /v1/projects 应独立于 App sidebar state。
GitHub
+1

app-server payload/path redaction
检查所有 Worker → Control Plane/Web 的事件、错误、日志、approval payload、thread metadata、debug dump。Codex 文档也提醒分享 logs 前要确认不含敏感信息；Remote 场景下这应变成自动 redaction，不依赖人工。
OpenAI Developers
+1

同名项目 collision
即使当前 Worker 只有一个 allowedProjectRoot，也要测两个不同 Worker 同时注册 basename 相同的项目。期望：projectId 不碰撞；UI 显示可区分；task link 不依赖 name。

Worker 重启/重装后的 project 稳定性
Worker 正常重启后应保持同一个 localProjectKey -> projectId。如果 Worker local state 丢失，可以接受生成新 projectId，但 task link 打开时应给出“project binding missing/offline/reconnect required”，而不是尝试用历史 path 恢复。

推荐落地规则

把 contract 定成这三条即可避免后续返工：

Public identity：RemoteProject.id 是唯一 project identity；name 是展示字段；public API 永不返回 raw cwd/path。

Execution binding：projectId -> codexCwd 的映射只存在 Worker 本地；Control Plane 只保存 opaque binding。

Conversation/task association：conversation.projectId 由 Worker project registration 经 Control Plane upsert 后写入，Web 只能选择已有 projectId，不能从 basename、path、thread cwd 或 app-server cwd 派生。
