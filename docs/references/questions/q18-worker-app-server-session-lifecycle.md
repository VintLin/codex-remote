---
title: "Q18：Worker app-server session lifecycle and initialization"
source_url: "https://chatgpt.com/c/6a364b9d-9b64-83e8-8d76-e43c0739b68e"
exported_at: "2026-06-20T17:07:28"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

1. 结论：真实 app-server 的初始化/握手要求

**真实 Codex app-server 要求每条 transport connection 先完成 initialize，再进入正常 RPC 阶段。**官方 app-server README 明确写的是：initialize 必须在同一条连接上、在任何其他方法之前发送；随后发送 initialized notification；初始化前的其他请求会返回 "Not initialized"，同一连接重复 initialize 会返回 "Already initialized"。Codex app-server 使用类似 MCP 的双向 JSON-RPC 2.0 消息，但在线上消息里省略 "jsonrpc":"2.0" 字段。
GitHub
 
GitHub

源码也支持这一结论。ConnectionSessionState 是连接级状态，内部用 OnceLock 记录是否已经初始化；非 Initialize 请求会走 dispatch_initialized_client_request，如果 !session.initialized() 就返回 invalid_request("Not initialized")。
GitHub
 
GitHub
 initialize_processor 里也有重复初始化保护：如果该 connection 的 session 已初始化，返回 "Already initialized"；成功后把 InitializedConnectionSessionState 写入该连接 session。
GitHub
 
GitHub

有一个实现细节需要区分：**当前源码中强制 gate 主要由 initialize request 成功后设置的 session.initialized() 控制；client notification 目前在 process_notification 中只是记录日志，源码注释还写着当前不期望 client 发通知。**因此，当前实现看起来是“initialize 强制；initialized 是官方协议合同/LSP 风格 ACK，建议必须发送，但不要把它当成当前唯一的代码级 gate”。
GitHub
 官方文档仍要求发送 initialized，而且 LSP 语义也要求 client 收到 initialize 结果后、发送其他请求前发送 initialized，且只能发送一次。
microsoft.github.io

与 LSP/MCP 对比：LSP 规定 initialize 是 client 发给 server 的第一个请求，initialize 响应前 client 不能发其他请求/通知，且 initialize 只能发送一次。
microsoft.github.io
 MCP 也把初始化定义为 client/server 的第一阶段，client 发 initialize，server 响应后 client 发 initialized notification，然后进入 operation 阶段。
modelcontextprotocol.io
 
modelcontextprotocol.io

2. Worker session 生命周期推荐

推荐：Worker 维护已初始化的 long-lived session；可按用途使用小型 pool，但不要每个 HTTP request 都重新初始化。

具体建议：

场景 推荐
thread/start、thread/resume、thread/fork、turn/start、approval 监听 long-lived、sticky session
thread/list、thread/read、model/list、轻量配置读取 可用同一个 long-lived session；高并发时可用小型 read-only pool
每个 HTTP request 新建 app-server connection 不推荐，除非只是极短的非流式只读探测

原因如下。

第一，thread/start 会自动把当前 connection 订阅到该 thread 的 turn/item 事件；thread/fork 也会自动订阅新 thread；turn/start 之后要持续读取同一条 transport 上的 turn/*、item/*、delta、工具进度等事件。
GitHub
 
GitHub
 如果 HTTP request 结束就关闭 transport，Worker 会丢失流式事件和后续 server-initiated requests。

第二，approval 是同一条双向 JSON-RPC 连接上的 server-initiated request，不是普通 REST 回调。Worker 必须持续读这条连接，并按 JSON-RPC id 回写 result；否则 Codex 会卡在等待批准的状态。官方文档明确说 turn/start 时 app-server 会向 client 发 server-initiated JSON-RPC approval request，client 必须响应。
GitHub

第三，初始化包含连接级能力协商，例如 experimentalApi、notification opt-out、OpenAI form elicitation、attestation 等；这些能力是初始化时一次性确定的。官方文档写明 optOutNotificationMethods 是 per-connection，experimental API 通过单次 initialize 开启，重复初始化会被拒绝。
GitHub
 
GitHub

推荐架构

最稳妥的 Worker 模型：

Worker process
 ├─ app-server connection/session A: interactive session
 │ ├─ once: initialize -> wait response -> initialized
 │ ├─ JSON-RPC request map: id -> pending promise
 │ ├─ reader loop: responses / notifications / server requests
 │ └─ threadId/turnId -> Web/Control Plane event bus
 │
 └─ optional read pool: 1-3 initialized sessions
 └─ thread/list, thread/read, config/model reads

**默认先用单个 long-lived session；只有在 UI read 请求明显阻塞交互流时，再拆一个小型 read-only pool。**app-server 本身有 bounded queues；队列饱和时会返回 -32001 / "Server overloaded; retry later."，官方建议用 exponential backoff with jitter。
GitHub

失败恢复策略

连接启动：

打开 stdio / unix socket / websocket。

发送 initialize。

等 initialize response 成功。

发送 initialized notification。

之后才发 thread/list、thread/start、turn/start 等业务请求。
这比“连续写入 initialize 和 initialized 再立即发业务请求”更贴合 LSP/MCP 顺序语义。
microsoft.github.io
 
microsoft.github.io

收到 "Not initialized"：

视为 Worker session 状态机 bug 或连接被错误复用。

不要在同一连接上继续业务流；关闭连接，重建并重新 handshake。

记录当前 request id、method、threadId/turnId。

收到 "Already initialized"：

说明 Worker 对同一 connection 发送了重复 initialize。

本地 session 状态机应进入 fatal/misuse；关闭重连，或者如果本地确认该连接已经可用，则停止重复初始化逻辑。

不要尝试在同一连接上“重新协商能力”，因为官方和源码都拒绝重复初始化。
GitHub
 
GitHub

transport EOF / websocket close / app-server 子进程退出：

fail fast 所有未完成请求。

对幂等只读请求如 thread/list、thread/read、model/list 可在新 initialized session 上重试。

对 turn/start 不要盲目重试；先 thread/read 或 thread/resume 检查状态，避免重复创建 turn 或重复执行命令。

对已经启动的活跃 turn，重连后用 thread/resume 重新打开 thread，再继续接收后续事件；官方文档把 thread/resume 定义为重新打开已有 thread，以便后续 turn/start 追加到它。
GitHub

关闭/释放：

用户离开 thread 或 turn 完成后，可调用 thread/unsubscribe 取消当前 connection 对该 thread 的订阅。

官方文档说明最后一个 subscriber 取消后，server 不会立即 unload，而是在无 subscriber 且无活动 30 分钟后 unload 并发 thread/closed。
GitHub

3. approval 监听对 session 生命周期的影响

approval 使 per-request session 基本不可用。

approval 流程是：

turn/start
 -> item/started
 -> server request: item/commandExecution/requestApproval
 <- client response: {"decision":"accept" | "decline" | ...}
 -> serverRequest/resolved
 -> item/completed

官方文档明确说明 approval request 包含 threadId 和 turnId，client 应用这些字段把 UI 状态绑定到活跃 conversation；command approval 支持 accept、acceptForSession、decline、cancel 等决策。
GitHub
 文件修改 approval 也类似，会发送 item/fileChange/requestApproval，client 响应后再收到 serverRequest/resolved 和最终 item/completed。
GitHub

因此：

发起 turn/start 的 connection 必须保持打开，并有 reader loop。

approval-capable session 必须是 sticky by thread/turn；不能把后续 Web HTTP 请求随机路由到另一个 pool connection。

Worker 应把 server-initiated request 当作一等 JSON-RPC request 处理：保存 requestId / JSON-RPC id，向 Web/UI 发事件，用户选择后用同一条连接回写 response。

如果 connection 在 approval pending 时断开，不要在新连接上回复旧 JSON-RPC id；应标记旧 approval 失效，重连后用 thread/read / thread/resume 恢复状态，必要时让用户重试或中断 turn。

acceptForSession 这类“session”作用域不要跨 app-server connection 自行缓存复用，除非官方 schema/文档明确该授权可跨连接持久化；当前可靠做法是让 app-server 自己维护授权状态。

此外，approval 不是唯一的 server-initiated request。文档还列出 item/tool/requestUserInput、attestation、current time 等 request/response 流；如果 Worker 只监听 approval 方法名，会漏掉其他需要 client 响应的请求。
GitHub

4. 最小本机验证步骤
4.1 版本与 schema 固定

先确认本机 CLI 支持 app-server，并导出当前版本 schema。官方 CLI 文档把 codex app-server 标为 experimental，并说明它支持 stdio、WebSocket、Unix socket；schema 也可以按当前版本生成。
OpenAI Developers
 
GitHub

Bash
codex --version
codex app-server --help

rm -rf /tmp/codex-appserver-schema
codex app-server generate-json-schema --out /tmp/codex-appserver-schema
grep -R '"thread/start"\|"turn/start"\|"item/commandExecution/requestApproval"\|"initialized"' /tmp/codex-appserver-schema | head -50

预期信号：

generate-json-schema 成功退出。

schema 中能找到 thread/start、turn/start、approval request 相关定义。

如果要用 experimental 字段，重新生成：

Bash
codex app-server generate-json-schema --out /tmp/codex-appserver-schema-exp --experimental
4.2 stdio 负向验证：未 initialize 直接 thread/list
Bash
python3 - <<'PY'
import json, subprocess, sys, time, select

p = subprocess.Popen(
 ["codex", "app-server"],
 stdin=subprocess.PIPE,
 stdout=subprocess.PIPE,
 stderr=sys.stderr,
 text=True,
 bufsize=1,
)

def send(obj):
 p.stdin.write(json.dumps(obj, separators=(",", ":")) + "\n")
 p.stdin.flush()

def recv_until_id(target_id, timeout=10):
 deadline = time.time() + timeout
 while time.time() < deadline:
 r, _, _ = select.select([p.stdout], [], [], 0.2)
 if not r:
 continue
 line = p.stdout.readline()
 if not line:
 raise RuntimeError("app-server stdout closed")
 msg = json.loads(line)
 print("RECV", json.dumps(msg, ensure_ascii=False))
 if msg.get("id") == target_id:
 return msg
 raise TimeoutError(f"timeout waiting for id={target_id}")

try:
 send({"method": "thread/list", "id": 1, "params": {"limit": 1}})
 msg = recv_until_id(1)
 assert "error" in msg, msg
 assert "Not initialized" in msg["error"]["message"], msg
finally:
 p.kill()
PY

预期成功信号：

JSON
{"id":1,"error":{"code":...,"message":"Not initialized",...}}

这直接验证“业务 RPC 不能早于 initialize”。

4.3 stdio 正向验证：initialize -> initialized -> thread/list
Bash
python3 - <<'PY'
import json, subprocess, sys, time, select

p = subprocess.Popen(
 ["codex", "app-server"],
 stdin=subprocess.PIPE,
 stdout=subprocess.PIPE,
 stderr=sys.stderr,
 text=True,
 bufsize=1,
)

def send(obj):
 print("SEND", json.dumps(obj, ensure_ascii=False))
 p.stdin.write(json.dumps(obj, separators=(",", ":")) + "\n")
 p.stdin.flush()

def recv_until_id(target_id, timeout=15):
 deadline = time.time() + timeout
 while time.time() < deadline:
 r, _, _ = select.select([p.stdout], [], [], 0.2)
 if not r:
 continue
 line = p.stdout.readline()
 if not line:
 raise RuntimeError("app-server stdout closed")
 msg = json.loads(line)
 print("RECV", json.dumps(msg, ensure_ascii=False))
 if msg.get("id") == target_id:
 return msg
 raise TimeoutError(f"timeout waiting for id={target_id}")

try:
 send({
 "method": "initialize",
 "id": 0,
 "params": {
 "clientInfo": {
 "name": "self_hosted_codex_remote_worker",
 "title": "Self-hosted Codex Remote Worker",
 "version": "0.1.0"
 },
 "capabilities": {
 "experimentalApi": True
 }
 }
 })
 init = recv_until_id(0)
 assert "result" in init, init

 # Codex app-server 文档使用 method: "initialized"；不要用 MCP 的 "notifications/initialized"。
 send({"method": "initialized", "params": {}})

 send({"method": "thread/list", "id": 2, "params": {"limit": 1}})
 listed = recv_until_id(2)
 assert "result" in listed, listed

 send({
 "method": "initialize",
 "id": 3,
 "params": {
 "clientInfo": {
 "name": "self_hosted_codex_remote_worker",
 "title": "Self-hosted Codex Remote Worker",
 "version": "0.1.0"
 }
 }
 })
 dup = recv_until_id(3)
 assert "error" in dup and "Already initialized" in dup["error"]["message"], dup
finally:
 p.kill()
PY

预期成功信号：

id 0 返回 result，通常包含 userAgent、codexHome、platformFamily、platformOs。

id 2 的 thread/list 返回 result.data。

id 3 返回 "Already initialized"。

4.4 WebSocket / remote-style 验证

官方 remote TUI 示例是启动 WebSocket app-server，再用 codex --remote ws://127.0.0.1:4500 连接；非本机访问应配置 WebSocket auth 和 TLS/proxy。
OpenAI Developers
 WebSocket listener 还提供 /readyz、/healthz 健康检查。
GitHub

Bash
codex app-server --listen ws://127.0.0.1:4500

另一个终端：

Bash
curl -i http://127.0.0.1:4500/readyz
codex --remote ws://127.0.0.1:4500

预期信号：

/readyz 返回 200 OK。

codex --remote 能显示远端 TUI / thread list。

如果你自己写 WS client，第一帧仍然必须是 initialize，之后发 initialized，再发 thread/list。

4.5 approval 验证

优先用官方 debug client 做端到端 smoke test。CLI reference 说明 codex debug app-server send-message-v2 会初始化 app-server、start thread、send turn，并 stream server notifications。
OpenAI Developers

Bash
mkdir -p /tmp/codex-approval-test
cd /tmp/codex-approval-test

codex debug app-server send-message-v2 \
 "Create file approval_probe.txt containing exactly OK. If approval is required, request it."

预期信号：

正常路径：看到初始化、thread/start、turn/start、流式通知，最终生成文件或给出拒绝/错误。

如果本机配置要求文件修改 approval，应出现 approval 相关 request/notification。

如果没有出现 approval，不一定是失败；可能当前 sandbox/approval policy 允许该操作。要强制验证，使用你们 Worker 发送 turn/start 时显式设置更严格的 approvalPolicy / sandboxPolicy。官方 turn/start 示例显示这些字段是可选 override，例如 approvalPolicy: "unlessTrusted"、sandboxPolicy: {"type":"workspaceWrite",...}。
GitHub

5. 风险清单
风险 说明 建议
协议漂移 codex app-server 官方标为 experimental；WebSocket transport 在 README 中也标为 experimental/unsupported。
OpenAI Developers
 
GitHub
 pin Codex CLI 版本；CI 中跑 handshake / thread/list / approval contract tests；启动时导出 schema 与 Worker 内置 schema 版本比对。
initialized 实现细节变化 当前源码看起来 initialized notification 不是单独 gate，但官方协议要求发送。 永远按文档发送 initialized；不要依赖当前 no-op 行为。
重连时重复执行 turn/start 成功后断线，Worker 若盲目重试，可能创建重复 turn 或重复执行命令。 对 read RPC 自动重试；对 mutating RPC 先 thread/read / thread/resume 恢复状态，再决定是否重发。
重复初始化 同一 connection 二次 initialize 会 "Already initialized"。 Worker session 状态机严格区分 new/open/initializing/initialized/closing/dead；只在 new/open 执行 handshake。
并发响应乱序 JSON-RPC 允许响应通过 id 关联；LSP 也说明 server 可并行执行并改变响应顺序。
JSON-RPC
 
microsoft.github.io
 必须用 id -> pending promise 分发 response；不要假设 FIFO。对同一 thread 的 mutating 操作做本地串行化。
approval 路由错误 approval request 到达发起/订阅该 turn 的 connection；pool 随机路由会导致 UI 看不到 request 或回错连接。 active turn 绑定 sticky session；reader loop 按 threadId / turnId 分发到 Control Plane。
队列背压 app-server 使用 bounded queue；饱和会返回 -32001 Server overloaded; retry later. 限制并发；read pool 小而固定；对 -32001 做 jitter backoff。
GitHub

WebSocket 暴露风险 WebSocket auth 若省略会关闭认证；非本机监听会有风险。官方建议非本机配置 auth，并在 TLS/secure proxy 后使用。
OpenAI Developers
 
OpenAI Developers
 本机优先 unix socket 或 stdio；远程必须 token/JWT auth + TLS/SSH tunnel。
schema/experimental 字段不一致 experimental 字段需要 capabilities.experimentalApi=true，且 schema 要用 --experimental 生成。
GitHub
 Worker 生成并 pin 当前版本 TypeScript/JSON schema；experimental client 在 initialize 中明确 opt in。

最终取舍：interactive Worker 使用 long-lived initialized session；只在 read-heavy 且无事件/approval 需求的路径上增加小型已初始化 read pool。不要把 Codex app-server 当作“每个 HTTP request 一个短连接”的 RPC 后端。
