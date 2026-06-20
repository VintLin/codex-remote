---
title: "Q20：Owned app-server transport choice"
source_url: "https://chatgpt.com/c/6a364c30-82dc-83e9-8a48-97e048b8a5d2"
exported_at: "2026-06-20T17:07:43"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

结论

Stage 9：Worker-owned Codex app-server 默认用 stdio。
Debug fallback：保留 loopback WebSocket，仅用于本机调试/外部 TUI attach，必须随机端口、loopback-only、token 不落日志。
Unix socket：作为未来 Unix service/daemon 控制面候选，不作为 Stage 9 跨平台默认。

1. 当前官方默认 / 推荐 transport

官方 App Server 文档把 stdio 标为默认：--listen stdio://，JSONL over stdio；同一段把 TCP websocket 标为 “experimental and unsupported”；unix:// 是 WebSocket-over-Unix-socket；off 表示不暴露本地 transport。
OpenAI Developers

CLI reference 也一致：codex app-server 是 experimental，用于 local development/debugging；--listen 支持 stdio:// | ws://IP:PORT | unix:// | unix://PATH | off，--stdio 等价于 --listen stdio://。
OpenAI Developers

WebSocket 的官方使用场景主要是 Remote TUI：文档示例是 codex app-server --listen ws://127.0.0.1:4500，然后 codex --remote ws://127.0.0.1:4500；非本机访问要求 WebSocket auth，非本地客户端要求 TLS/WSS。
OpenAI Developers

远程连接文档反而明确说：Remote connections 通过 SSH 启动和管理远端 app-server，不要把 app-server transport 直接暴露到共享或公网网络；需要跨网络访问时用 VPN/mesh，而不是直暴 app-server。
OpenAI Developers

补充 release notes：2026-06-01 的 Codex CLI 0.136.0 记录了 app-server integrations 新增/暴露 codex app-server --stdio alias；同一批 notes 还提到 remote-control websockets 改用短期 server tokens，而不是 ChatGPT access tokens。
OpenAI Developers

**解释：**官方没有把 loopback WebSocket 定义为 Worker-owned self-hosted 默认；它是 remote TUI / debug / attach 场景。对 Worker 自己启动、自己持有、单客户端控制的 app-server，官方默认与稳定性信号都指向 stdio。

2. stdio vs loopback WebSocket，并补充 unix socket
维度 stdio loopback WebSocket unix socket
稳定性 最适合 Stage 9。官方默认，JSONL，--stdio 是正式 alias。 不适合作生产主路径。官方把 TCP WebSocket 标为 experimental/unsupported，但用于 Remote TUI 和本机/SSH-forward debug。
OpenAI Developers
+1
 适合 Unix 本机控制面；官方描述为 app-server control-plane clients 的本地路径，走 Unix socket 上的 WebSocket upgrade。
GitHub

认证面 无监听端口；安全边界是父子进程、OS 用户、Worker 启动环境。无需为 app-server transport 额外发 token。 有本机 TCP 端口；即使 loopback，也会被同机同用户/恶意本地进程探测。需要随机端口，必要时 capability token / signed bearer。官方支持 bearer auth，且在 JSON-RPC initialize 前校验。
OpenAI Developers
 无 TCP 端口；主要依赖文件系统权限/同机用户边界。源码设置 control socket 0600，但只适合 Unix-style 生命周期。
GitHub

日志与协议隔离 stdout 是协议 JSONL；stderr 放 tracing/log。官方支持 RUST_LOG，LOG_FORMAT=json 会把 app-server tracing logs 发到 stderr。
GitHub
 有 /readyz、/healthz，便于 debug readiness；但端口、banner、auth header 都要防泄露。官方说明带 Origin 的请求会被拒绝。
OpenAI Developers
 更像 daemon/control-plane；适合用 socket readiness + JSON-RPC initialize 判断健康。
进程监管 Worker 拥有 child PID，EOF/exit 直接等价于 server 生命周期；kill/reap 简单。 Worker 仍要监管 child PID，同时还要管理端口生命周期、端口发现、health probe、连接重试、token 轮换。 Codex daemon 已有 pidfile、lock、start/restart/stop 语义，但当前 daemon README 标为 experimental，生命周期合约仍可能变。
GitHub

跨平台 最通用：不依赖 Unix socket，不依赖端口权限/防火墙行为。 TCP loopback 跨平台较好，但会引入本地网络栈、端口冲突、防火墙/安全软件变量。 daemon README 明确当前 daemon implementation 是 Unix-only，不支持 Windows lifecycle management。
GitHub

installer/service 影响 对 Stage 9 最小：Worker 启动时带起 app-server，退出时回收。未来若做系统级 service，再迁移控制面。 installer/service 需要解决端口发现、auth token、TLS/WSS、端口抢占、用户隔离。官方远程连接方向不是直暴 WS，而是 SSH/remote-control。
OpenAI Developers
 与未来 Unix daemon 最贴近：daemon state 在 CODEX_HOME/app-server-daemon/，有 pidfile、settings、lock、updater loop；但 updater loop 不 reboot-persistent，且 Unix-only。
GitHub

取舍判断：

对 Worker-owned, self-hosted, local app-server，stdio 的优势是没有端口、没有 transport token、没有发现问题、没有跨进程 attach 面；Worker 本来就拥有 child process，所以它能天然完成 supervision。WebSocket 的优势是可 attach、可用 Remote TUI、可 health probe，但这些是 debug/interop 优势，不是 Worker 主路径优势。

3. 如果保留 WebSocket，必须限制的点

保留 WebSocket 可以，但建议作为显式 debug fallback，例如 CODEX_REMOTE_WORKER_TRANSPORT=ws-loopback-debug，不要 silent fallback 到 WS。

必须限制：

bind address
只允许 127.0.0.1，必要时另行支持 [::1]；禁止 0.0.0.0、::、LAN IP。官方示例的安全本机场景也是 ws://127.0.0.1:4500。
OpenAI Developers

port
使用随机端口。优先验证 ws://127.0.0.1:0 是否可用；源码路径使用 TcpListener::bind 后读取 local_addr，这通常支持 port 0，但仍应在 spike 中验证实际 CLI 行为。
GitHub

不能使用固定 4500 作为产品默认；固定端口只适合文档/手动 debug。

auth
对 debug fallback，建议默认也启用 capability token。用高熵 token，服务端优先传 --ws-token-sha256 HEX，客户端在 WebSocket handshake 的 Authorization: Bearer <token> header 中发送原始 token。官方支持 capability-token 与 signed-bearer-token 两类 auth，并说明 bearer 在 handshake 期间使用。
OpenAI Developers
+1

token 不泄露
不把 token 放 URL query、命令行、日志、crash report、telemetry、debug dump。不要打印 Authorization header。人手调试 TUI 可以用 --remote-auth-token-env，但 Worker 代码应优先内存注入 header。官方 TUI 文档用环境变量只是 CLI 人工调试路径。
OpenAI Developers

非 loopback fail closed
这里存在文档/源码口径漂移：官方 docs/CLI reference 仍描述非本地 listener 在无 auth 时 disabled/warn 或 rollout 允许；当前 app-server-transport 源码已经表现为拒绝启动未认证的非 loopback WebSocket listener。产品封装不要依赖任一版本默认行为，自己在启动前校验并 fail closed。
OpenAI Developers
+2
OpenAI Developers
+2

Origin 不是认证
官方 WebSocket listener 会拒绝带 Origin 的请求，这有助于挡浏览器跨站 WebSocket，但不能替代 bearer token；本地 native 进程不会受 Origin 限制。
OpenAI Developers

远程访问禁止直暴
远程 Worker 或 SSH 机器场景，不要把 app-server 直接暴露到共享网络/公网；官方 remote connections 走 SSH 启动和管理 app-server。
OpenAI Developers

4. 最小 spike 验证步骤：list / start / follow-up

先用 stdio 做主路径 spike；同一个 harness 抽象 transport 后，再用 loopback WS 重跑三项作为 debug fallback 验证。App-server 要求连接后先发 initialize，再发 initialized notification，之后才能调用其他方法。
GitHub

A. list：握手 + 列线程

启动：

Bash
RUST_LOG=info LOG_FORMAT=json codex app-server --stdio 2>app-server.log

向 stdin 写 JSONL：

jsonl
{"id":0,"method":"initialize","params":{"clientInfo":{"name":"codex_remote_worker_spike","title":"Codex Remote Worker Spike","version":"0.0.1"}}}
{"method":"initialized","params":{}}
{"id":1,"method":"thread/list","params":{"limit":5,"sortKey":"recency_at","sortDirection":"desc"}}

通过标准：

收到 id:0 initialize response。

收到 id:1，result.data 是数组。

stdout 只有协议 JSONL；stderr 是 app-server logs。

Worker 能检测 child exit / EOF。

thread/list 是官方 API 示例中的 list 方法。
GitHub

B. start：创建 thread + 启动 turn
jsonl
{"id":2,"method":"thread/start","params":{"cwd":"/absolute/path/to/repo","approvalPolicy":"never","sandbox":"workspaceWrite"}}
{"id":3,"method":"turn/start","params":{"threadId":"<threadId-from-id-2>","input":[{"type":"text","text":"Reply with exactly STAGE9_SPIKE_OK. Do not edit files."}]}}

通过标准：

thread/start 返回 thread id。

turn/start 返回 turn object。

后续 notification 中看到 turn/started、item/*、item/agentMessage/delta、最终 turn/completed。

Worker 在超时/用户取消时能 SIGTERM child；child 未退出时能强杀并回收。

thread/start 与 turn/start 都是官方 app-server API；turn/start 后需要持续读通知流直到完成。
GitHub
+1

C. follow-up：同 thread 二次 turn；可选 mid-turn steer

完成第一个 turn 后，用同一个 threadId 再发：

jsonl
{"id":4,"method":"turn/start","params":{"threadId":"<same-threadId>","input":[{"type":"text","text":"Follow-up: reply with exactly FOLLOWUP_OK and mention the previous token."}]}}

如果要验证“进行中追问/改向”，在 turn 还没完成时发：

jsonl
{"id":5,"method":"turn/steer","params":{"threadId":"<same-threadId>","expectedTurnId":"<active-turnId>","input":[{"type":"text","text":"Actually keep it under 10 words."}]}}

turn/steer 是官方用于向 in-flight regular turn 追加输入的方法；普通 follow-up 则继续用同 thread 的第二个 turn/start。
GitHub

WebSocket fallback 重跑：

Bash
TOKEN="$(openssl rand -base64 32)"
TOKEN_SHA="$(printf "%s" "$TOKEN" | shasum -a 256 | awk '{print $1}')"

codex app-server \
 --listen ws://127.0.0.1:0 \
 --ws-auth capability-token \
 --ws-token-sha256 "$TOKEN_SHA" \
 2>app-server-ws.log

然后：

从 stderr/banner 或 wrapper stdout 解析实际 port。

GET http://127.0.0.1:<port>/readyz 必须成功。

WebSocket 连接必须带 Authorization: Bearer <TOKEN>。

重放 list/start/follow-up 三项。

验证 lsof/ss/netstat 中只监听 loopback。

5. 最终建议

Stage 9 主路径：stdio。

理由：官方默认；WebSocket 明确 experimental/unsupported；Worker-owned 场景不需要端口、发现、auth token、外部 attach；日志与进程监管最简单；跨平台风险最低。stdio 还天然避免“本机端口被其他进程连上”的本地攻击面。

Debug fallback：loopback WebSocket。

用途：手动接 codex --remote、外部 test client、UI/debug inspector、复现 Remote TUI 行为。限制为 127.0.0.1 / 随机端口 / bearer token / 不泄露 token。不要把它作为 silent automatic fallback，也不要作为 production Worker 默认。

Unix socket：暂不作为 Stage 9 默认。

它适合未来“已安装的本机 daemon/service 控制面”，尤其是 Unix/macOS/Linux；但当前 daemon 文档仍说 experimental，且 daemon lifecycle 是 Unix-only。等产品进入 installer/service 阶段，可以把 Unix socket 作为 Unix 平台的 service control-plane，再为 Windows 设计等价 native IPC，而不是让 Stage 9 过早依赖它。
