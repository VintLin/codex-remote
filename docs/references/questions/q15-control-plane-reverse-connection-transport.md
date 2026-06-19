---
title: "Q15"
source_url: "https://chatgpt.com/c/6a350f4c-fc20-83e8-8ca4-dd51b3efe741"
exported_at: "2026-06-19T19:39:31"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

对 **Codex Remote 的 Device Worker 反向连接**，建议：

**默认选 WebSocket over TLS（WSS）作为 v1 主 transport。**
Worker 主动连 Control Plane，Control Plane 通过同一条长连接下发任务、取消指令、stdin、lease extension request 等；Worker 通过同一条连接回传状态、ACK、日志和 streaming events。WebSocket 的优势是：全双工、低延迟、跨语言库成熟、能跑在 443/TLS 上、对自托管用户的反向代理要求低于 gRPC。WebSocket RFC 的设计目标就是在单条 TCP 连接上提供双向通信，避免用多个 HTTP 连接模拟双向通道。([IETF 数据追踪器][1])

**HTTP/2/gRPC bidirectional streaming 作为“受控部署 / Pro transport”。**
如果你的目标用户主要在 Kubernetes、Envoy、Traefik、Caddy、NGINX gRPC 配置成熟的环境里部署，gRPC 的类型系统、双向流、HTTP/2 flow control、代码生成会更优雅。gRPC 原生支持 client/server/bidirectional streaming，并保证单个 stream 内消息顺序；HTTP/2 也有 stream 级 flow control。([gRPC][2]) ([IETF 数据追踪器][3]) 但它对代理、HTTP/2 end-to-end、keepalive、stream timeout 的运维要求更高，不适合作为面向广泛自托管用户的唯一默认方案。

**SSE + HTTP polling/POST 作为兼容 fallback，不建议作为主通道。**
SSE 很适合“Control Plane → Worker”的单向事件流，且有 `Last-Event-ID` / reconnect 语义；但 SSE 本身不能从客户端向服务端发送事件，Worker → Control Plane 仍需要额外 HTTP POST / polling，因此会把 ACK、ordering、backpressure、lease 的状态拆到两条通道上，复杂度反而上升。([MDN文档][4]) ([HTML Living Standard][5])

推荐架构可以写成：

```text
v1 default:
  Worker ──outbound WSS──> Control Plane
  + app-level reliable protocol:
    msg_id / seq / ack / lease / credit / heartbeat / resume_token

fallback:
  Worker ──SSE GET──> Control Plane events
  Worker ──HTTP POST──> acks/status/output

pro/enterprise:
  Worker ──gRPC bidi stream over HTTP/2──> Control Plane
```

---

## Transport 对比

| 方案                               | 适配 Codex Remote Worker 反向连接 | 主要优点                                                                                                       | 主要风险                                                                                                          | 建议定位                            |
| -------------------------------- | --------------------------: | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **WebSocket / WSS**              |               **最高，适合作为默认** | 单连接全双工；daemon / CLI / mobile / server 库都成熟；自托管用户容易理解和配置；能通过 443/TLS；适合任务控制、状态、日志、取消、stdin/stdout streaming | 协议层不提供 durable delivery、ACK、lease、replay；标准浏览器 WebSocket API 无内建 backpressure；代理需要正确处理 Upgrade 和 idle timeout | **默认主通道**                       |
| **SSE + HTTP POST / polling**    |              中等，适合 fallback | 基于普通 HTTP；SSE 有 reconnect、`id`、`retry`、`Last-Event-ID`；很容易穿过保守代理；调试简单                                      | SSE 单向；上行必须另走 POST；全双工语义、backpressure、ACK、ordering 需要更多应用层状态；大规模连接要处理代理 buffering / timeout                   | **兼容降级通道**                      |
| **HTTP/2 / gRPC bidi streaming** |                    高，但部署要求高 | 原生 bidirectional streaming；protobuf 类型系统；HTTP/2 multiplexing 和 flow control；适合强类型 agent 协议                 | 自托管代理配置更复杂；HTTP/2、h2c、grpc_pass、stream timeout、keepalive 兼容问题更多；浏览器直连 gRPC 不理想                                | **Pro / controlled deployment** |
| **HTTP long polling only**       |                         低到中 | 非常稳，GitLab Runner 这类 job pickup 模型长期使用；适合低频任务领取                                                            | 不适合低延迟交互式 streaming；取消、stdin、实时日志会变笨重                                                                         | 只适合“取任务”模式                      |
| **NATS / MQTT / broker**         |                       取决于目标 | Durable consumer、ACK、redelivery、flow control 可由 broker 承担                                                  | 引入额外基础设施；自托管部署复杂度显著增加                                                                                         | 多租户、大规模 fleet、已有 broker 时考虑     |
| **WebTransport / QUIC**          |                       未来可观察 | 支持双向流、datagram、HTTP/3                                                                                      | HTTP/3/QUIC 在企业代理、防火墙、自托管部署中的可预期性仍弱于 WSS/gRPC                                                                 | 不建议 v1 默认                       |

---

## 为什么 WebSocket 更适合作为默认

Codex Remote 的 Worker 是 **daemon/agent**，不是浏览器页面。这个场景下要优化的是：

1. Worker 只能主动 outbound。
2. Control Plane 需要低延迟下发任务、取消、stdin、lease 请求。
3. Worker 需要实时回传状态、日志、进度、结果、ACK。
4. 断线后必须可恢复。
5. 需要能在 Docker Compose、家庭 NAS、VPS、公司内网、Kubernetes 等自托管环境里部署。

WebSocket 正好处在复杂度和能力的中间点。它比 SSE 更接近你需要的全双工控制通道；又比 gRPC 更容易穿过普通 HTTPS 反向代理。Kubernetes 也已经把 WebSocket 用作流式 exec/attach/cp/port-forward 等交互式低延迟通道的默认实现之一，这说明它很适合“控制面到 agent 的交互式 streaming”这类问题。([Kubernetes][6])

但要明确：**WebSocket 只解决 transport，不解决可靠任务语义。**
WebSocket 有 ping/pong，可用于 keepalive 和连接健康检查；也支持 text/binary frame。([IETF 数据追踪器][1]) 但它不会替你做 durable queue、任务去重、租约、断线重放或业务级 backpressure。浏览器 WebSocket API 甚至明确没有内置 backpressure；虽然你的 Worker daemon 不一定用浏览器 API，但这提醒你不能把“socket 写成功”当成“对端已处理”。([MDN文档][7])

因此，WebSocket 方案的正确形态是：

```text
WSS transport
  + application-level envelope
  + persistent task queue in Control Plane
  + ACK / NACK / lease / retry
  + per-worker bounded queue
  + resume from seq
  + heartbeat and reconnect
```

---

## 为什么不把 SSE + HTTP 当主通道

SSE 的优点很实际：它是普通 HTTP 响应流，模型简单，服务端能连续推事件；浏览器 EventSource 会自动重连；事件流支持 `id`、`retry`，重连时可以带 `Last-Event-ID`，这对“从上次事件继续”很有用。([MDN文档][4]) ([HTML Living Standard][5])

问题在于 Codex Remote 不是单向通知系统。你需要：

```text
Control Plane -> Worker:
  run task / cancel / send stdin / extend lease / request state

Worker -> Control Plane:
  ack / status / logs / tool events / result / heartbeat
```

SSE 只能做第一半。MDN 明确说明 SSE 是服务端向客户端的单向事件，客户端不能通过同一条 SSE 连接向服务端发送事件。([MDN文档][4]) 于是你必须增加 HTTP POST 或 polling 来承载 Worker 上行消息。这样会出现几类复杂度：

```text
SSE stream:
  Control Plane -> Worker messages

HTTP POST:
  Worker -> Control Plane ack/status/output

需要额外解决:
  - POST ack 和 SSE seq 的一致性
  - 断线时到底哪些消息已送达、已处理、已提交
  - SSE 连接恢复和 POST 重试的幂等
  - Worker 输出太快时如何反压
  - task cancel 与 task output 并发时的 ordering
```

SSE + HTTP 仍然值得保留，因为它是非常好的 **fallback transport**。在某些公司代理、旧网关、托管平台中，WebSocket 或 HTTP/2 可能被错误配置或中断；SSE/long-polling 更容易活下来。GitLab 的 long polling 文档也说明，runner/job pickup 这类模型可以通过长轮询减少空轮询和服务器压力，但长轮询也会引入 worker starvation、concurrency bottleneck 等调参问题。([GitLab Docs][8]) ([GitLab Docs][9])

---

## 为什么 gRPC 很强，但不建议作为唯一默认

gRPC 在协议表达上最接近“理想答案”：

```protobuf
service WorkerControl {
  rpc Connect(stream WorkerMessage) returns (stream ControlMessage);
}
```

它天然支持双向 streaming，并且每个 stream 内的消息顺序是确定的。([gRPC][2]) HTTP/2 的 flow control 也能防止一个 stream 或 connection 无限制压垮接收端；gRPC 文档同样强调 flow control 用于避免 streaming RPC 中接收端被过量数据淹没。([IETF 数据追踪器][3]) ([gRPC][10])

gRPC 的强项：

```text
+ protobuf schema 明确
+ 多语言代码生成
+ bidi streaming 语义自然
+ HTTP/2 multiplexing / flow control
+ TLS、mTLS、token metadata 都是常见模式
+ 适合 Go/Rust/Swift/Kotlin 等 daemon/agent 客户端
```

但面向自托管用户时，gRPC 的运维坑会明显多于 WSS：

```text
- 反向代理必须正确支持 HTTP/2 / gRPC
- NGINX 需要 grpc 模块和 HTTP/2 配置
- Traefik 要区分 h2c / HTTPS gRPC 后端配置
- Envoy、Ingress、LB 的 route timeout / stream idle timeout 默认值可能打断长连接
- keepalive PING 配错可能导致 GOAWAY / too_many_pings
```

这些不是理论问题。NGINX 的 gRPC proxy 依赖 HTTP/2 配置；Traefik 需要按 h2c 或 HTTPS gRPC 配置 service scheme；Envoy 对 stream idle timeout、route timeout 有默认行为，长流必须显式处理。([Nginx][11]) ([Traefik Labs Docs][12]) ([Envoy Proxy][13]) gRPC keepalive 也需要谨慎配置，服务端不接受过频 PING 时可能发送 `GOAWAY`。([gRPC][14])

另一个现实问题是浏览器生态。虽然 Worker 不是浏览器，但你的 Web 控制台可能希望复用某些 API。gRPC-Web 通常需要代理，并且当前主流 gRPC-Web 不支持完整的 client streaming / bidirectional streaming。([GitHub][15]) 这意味着你最终很可能仍然要维护 REST/WebSocket 给 Web 前端，而不是全栈只用 gRPC。

所以建议：**内部 schema 可以先按 protobuf/typed envelope 设计，但 v1 wire transport 先用 WSS；gRPC 作为可选 transport。**

---

## 安全模型建议

不要把 transport 认证和业务授权混在一起。建议拆成四层。

### 1. TLS 基线

所有连接都走 TLS：

```text
Worker -> https://control-plane.example.com
Worker -> wss://control-plane.example.com/v1/workers/connect
```

gRPC 也应使用 TLS；gRPC 官方认证文档支持 SSL/TLS，并可选使用 client certificate 做 mutual TLS。([gRPC][16])

### 2. Worker 身份

每个 Worker 应有独立身份：

```text
device_id
worker_id
install_id
public key / client cert / long-lived refresh credential
capabilities
owner / workspace / tenant
```

连接时使用短期 token：

```json
{
  "sub": "worker:abc",
  "aud": "codex-remote-control-plane",
  "exp": 1710000000,
  "jti": "unique-connect-token-id",
  "capabilities": ["shell", "codex", "fs.read", "fs.write"]
}
```

JWT 的 `aud`、`exp`、`jti` 分别适合做目标受众、过期时间和重放防护。([IETF 数据追踪器][17])

### 3. WebSocket 特有注意点

WebSocket 本身不定义业务认证/授权；应用必须自己做。OWASP 也明确建议测试 WebSocket 的认证绕过、Origin 校验、消息注入、flooding、超大 payload 等问题。([OWASP Foundation][18]) ([OWASP Cheat Sheet Series][19])

对 Codex Remote：

```text
Worker daemon:
  - 用 Authorization: Bearer <token> 或 mTLS
  - 不依赖 Origin
  - 禁止 token 放 URL query，避免日志泄露
  - 设置 max message size
  - 设置 per-device rate limit
  - 对每条 command 做 ACL 校验

Browser Web UI:
  - 不直接连接 Worker
  - 只连 Control Plane
  - WebSocket 如用于浏览器，要校验 Origin
```

### 4. 任务级授权

即使 Worker 已连接，也不要默认它能执行所有任务：

```text
Control Plane 下发 task 前:
  - 检查 user/workspace/device binding
  - 检查 device capability
  - 检查 task policy
  - 记录 audit log

Worker 回传结果时:
  - 校验 task_id 属于该 worker lease
  - 校验 msg_id 去重
  - 校验 seq 单调
```

---

## 推荐的 WebSocket 应用层协议

Transport 选 WSS 后，关键是把协议设计成“断线可恢复、消息可去重、任务可租约化”。

### 1. 连接握手

Worker 主动连接：

```http
GET /v1/workers/connect
Upgrade: websocket
Authorization: Bearer <short-lived-worker-token>
Codex-Worker-Version: 0.1.0
Codex-Worker-ID: worker_123
```

连接后第一条消息：

```json
{
  "type": "hello",
  "worker_id": "worker_123",
  "device_id": "device_abc",
  "protocol_version": 1,
  "capabilities": {
    "shell": true,
    "codex": true,
    "max_parallel_tasks": 2,
    "artifact_upload": "http-signed-url"
  },
  "resume": {
    "session_id": "prev_session",
    "last_control_seq": 1288,
    "last_event_seq": 9120
  }
}
```

Control Plane 返回：

```json
{
  "type": "hello_ack",
  "session_id": "sess_new",
  "server_time": "2026-06-19T10:00:00Z",
  "heartbeat_interval_ms": 25000,
  "max_message_bytes": 1048576,
  "initial_credit": 64
}
```

### 2. 消息 envelope

建议所有消息统一 envelope：

```json
{
  "msg_id": "msg_01J...",
  "seq": 1290,
  "stream": "control",
  "type": "task.start",
  "task_id": "task_123",
  "lease_id": "lease_456",
  "deadline": "2026-06-19T10:05:00Z",
  "requires_ack": true,
  "payload": {}
}
```

Worker ACK：

```json
{
  "type": "ack",
  "ack_msg_id": "msg_01J...",
  "ack_seq": 1290,
  "task_id": "task_123",
  "status": "accepted"
}
```

关键规则：

```text
- msg_id 全局唯一，用于去重
- seq 在每个 worker session 或 stream 内单调递增
- ack 表示 Worker 已持久接受或明确处理，不表示 TCP send 成功
- task_id 幂等；重复 task.start 不应重复执行
- lease_id 绑定一次任务租约
- deadline 到期前 Worker 必须 extend 或 complete
```

### 3. 消息分类

不要所有消息都用同一种可靠性语义。

| 类型              | 例子                                          | 可靠性                                      |
| --------------- | ------------------------------------------- | ---------------------------------------- |
| Durable command | `task.start`, `task.cancel`, `lease.revoke` | 必须 ACK；断线后重放；幂等                          |
| Lease           | `lease.extend`, `lease.expired`             | 必须 ACK；过期后 Control Plane 可重派             |
| Streaming event | 日志、token、progress、tool event                | per-task seq；可断点续传；可设置保留窗口               |
| State heartbeat | CPU、battery、online、current task             | latest-wins；可丢弃旧值                        |
| Bulk artifact   | 文件、trace、截图、repo patch                      | 不建议走 WS 大帧；用 signed HTTP upload/download |

### 4. Backpressure

WebSocket 没有业务级 backpressure，所以要自己做 credit-based flow control：

```json
{
  "type": "credit",
  "stream": "control",
  "available": 32
}
```

Control Plane 规则：

```text
- 每个 worker 有 bounded outbound queue
- inflight durable messages <= worker credit
- streaming logs 有 per-task ring buffer / byte budget
- Worker 长时间不 ACK：停止继续发送 durable command
- Worker 输出过快：要求降采样、批量发送或切断低优先级 stream
- 大 payload 不走 WS，改走 HTTP artifact API
```

gRPC 虽然有 HTTP/2 flow control，但也不等于业务 ACK。它能防止接收端 socket buffer 被打爆，却不能表达“任务已经落盘接收”“任务正在执行”“lease 已续期”。所以即使用 gRPC，也应保留同样的 `msg_id / ack / lease / credit` 语义。

### 5. Reconnect / resume

Worker 断线后：

```text
1. 指数退避 + jitter 重连
2. 携带 worker_id、session_id、last_control_seq、last_event_seq
3. Control Plane 查 durable outbound log
4. 重放未 ACK 的 durable command
5. 对已过期 lease 做 requeue / mark lost / require reconciliation
6. 对 duplicate connection 使用 generation fencing
```

建议每个 Worker 只有一个 active generation：

```text
worker_id = worker_123
generation = 42

新连接成功:
  - generation = 43
  - 旧连接如果还活着，收到 fenced / reconnect_required 后关闭
```

这样可以避免同一设备多进程、网络分裂、旧连接僵尸写入导致重复执行。

---

## 运维成本对比

### WebSocket 运维

WebSocket 自托管要注意两件事：

1. 反向代理要显式转发 `Upgrade` / `Connection`。
2. 长连接要配置 idle timeout 和 heartbeat。

NGINX 文档说明，`Upgrade` 是 hop-by-hop header，代理不会自动转发，必须显式设置。([Nginx][20]) Cloudflare 也提醒 WebSocket 有 idle timeout，长连接场景应做 heartbeat，并且负载均衡时可能需要 session affinity。([Cloudflare Docs][21])

对用户文档应提供现成配置：

```nginx
location /v1/workers/connect {
    proxy_pass http://control_plane;
    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### SSE 运维

SSE 是普通 HTTP，代理层通常更容易通过，但仍要配置：

```text
- 禁止或规避响应 buffering
- 足够长的 read timeout
- 定期 comment heartbeat
- 每条事件带 id
- Worker 重连时带 Last-Event-ID
```

SSE 的浏览器 EventSource 会自动重连，事件流也支持 comment 作为 keepalive。([MDN文档][4]) 但在 daemon 场景下，你需要自己实现这些语义或选可靠库。

### gRPC 运维

gRPC 需要更精确的文档和自检工具：

```text
- 检查 HTTP/2 是否 end-to-end
- 检查 h2c / TLS gRPC 是否和代理匹配
- 配置 stream idle timeout
- 配置 route timeout
- 配置 keepalive interval / permit
- 提供 grpcurl / health check 指南
```

Envoy 默认 timeout 对长流尤其容易踩坑：stream idle timeout 和 route timeout 都可能中断 streaming RPC。([Envoy Proxy][13])

---

## 什么时候应该选 gRPC 而不是 WebSocket

满足这些条件时，可以把 gRPC 作为主 transport：

```text
- Worker 和 Control Plane 都主要用 Go/Rust/Java/Kotlin/Swift 等强类型语言
- 部署环境主要是 Kubernetes / Envoy / Traefik / Caddy
- 你愿意维护 protobuf schema 和版本兼容
- 用户群能处理 HTTP/2/gRPC 代理配置
- 需要更强的接口治理、代码生成、stream API 规范
```

这时协议可以设计为：

```protobuf
service DeviceWorkerControl {
  rpc Connect(stream WorkerToControl) returns (stream ControlToWorker);
}
```

但依然保留：

```text
msg_id
seq
ack
lease
resume_token
credit
idempotency_key
```

原因很简单：gRPC 保证的是 stream 传输，不保证你的任务已经被 Worker 幂等执行。

---

## 什么时候需要 broker

如果未来 Codex Remote 进入“大规模 fleet / 多 Control Plane 节点 / 多租户 / 离线 durable command queue”阶段，可以考虑 broker：

### NATS JetStream

适合：

```text
- 需要 durable consumer
- 需要 ACK / redelivery
- 需要 MaxAckPending 这类消费者级 backpressure
- 多 Control Plane 实例共享设备命令队列
```

NATS JetStream consumer 可以持久记录 delivery progress，也支持 ACK policy、AckWait、redelivery、MaxAckPending 等机制。([NATS 文档][22]) ([NATS 文档][23])

### MQTT

适合更 IoT 化的设备 fleet：

```text
- 设备数量非常多
- topic-based routing 合理
- QoS 1 / persistent session 足够
- 不需要复杂 interactive task stream
```

MQTT persistent session 可以保存订阅和 QoS 1 消息，客户端重连后接收离线期间存储的消息。([AWS 文档][24])

但 broker 会增加部署面。对 v1 自托管项目，先不要强依赖 broker；可以先用 Postgres/SQLite + Control Plane 内存连接表实现 durable queue 和 session routing。

---

## 推荐落地方案

### v1

```text
Primary transport:
  WSS /v1/workers/connect

Fallback:
  SSE /v1/workers/events
  HTTP POST /v1/workers/acks
  HTTP POST /v1/workers/status
  HTTP POST /v1/tasks/{id}/events

Large artifacts:
  HTTPS signed upload/download URLs

Storage:
  Postgres/SQLite durable task table
  per-worker outbound_command table
  per-task event log/ring buffer
```

### 连接责任

```text
Worker:
  - 主动连接 Control Plane
  - 认证自己
  - 上报 capabilities
  - 定期 heartbeat
  - ACK durable command
  - 维护 lease
  - 断线后 resume

Control Plane:
  - 维护 worker session registry
  - 按 worker_id 路由 command
  - 对任务做 durable enqueue
  - 未 ACK / lease expired 时重试或标记 lost
  - 限制 per-worker queue 和 stream bytes
  - 对 Web/iOS 提供独立 API
```

### 最小协议状态机

```text
DISCONNECTED
  -> CONNECTING
  -> AUTHENTICATING
  -> READY
  -> DRAINING
  -> DISCONNECTED
```

### 任务状态机

```text
queued
  -> leased
  -> accepted
  -> running
  -> completed

queued
  -> leased
  -> lease_expired
  -> queued

running
  -> cancel_requested
  -> cancelled

running
  -> worker_lost
  -> queued | failed_needs_attention
```

---

## 最终建议

Codex Remote 的 transport 不应追求“最强协议”，而应追求 **默认部署成功率 + 足够的实时性 + 应用层可靠性可控**。

因此：

```text
1. 默认使用 WebSocket/WSS。
2. 把 ACK、lease、replay、backpressure 设计在应用层。
3. SSE + HTTP 作为保守网络环境 fallback。
4. gRPC bidi streaming 作为高级部署选项，而不是 v1 唯一方案。
5. 大文件、artifact、repo snapshot 不走长连接，走普通 HTTPS。
6. 未来规模上来后，再引入 NATS JetStream / MQTT 这类 broker。
```

一句话版本：

**WebSocket 是 Codex Remote 自托管 Worker reverse connection 的最佳默认 transport；gRPC 是更强但更重的可选 transport；SSE+HTTP 是可靠降级方案，不应承担主全双工控制通道。**

[1]: https://datatracker.ietf.org/doc/html/rfc6455 "

                RFC 6455 - The WebSocket Protocol

        "
[2]: https://grpc.io/docs/what-is-grpc/core-concepts/ "Core concepts, architecture and lifecycle | gRPC"
[3]: https://datatracker.ietf.org/doc/html/rfc9113 "

                RFC 9113 - HTTP/2

        "
[4]: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events "Using server-sent events - Web APIs | MDN"
[5]: https://html.spec.whatwg.org/multipage/server-sent-events.html "HTML Standard"
[6]: https://kubernetes.io/blog/2024/08/20/websockets-transition/ "Kubernetes 1.31: Streaming Transitions from SPDY to WebSockets | Kubernetes"
[7]: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket "WebSocket - Web APIs | MDN"
[8]: https://docs.gitlab.com/ci/runners/long_polling/ "Long polling | GitLab Docs"
[9]: https://docs.gitlab.com/runner/configuration/advanced-configuration/ "Advanced configuration | GitLab Docs"
[10]: https://grpc.io/docs/guides/flow-control/ "Flow Control | gRPC"
[11]: https://nginx.org/en/docs/http/ngx_http_grpc_module.html "Module ngx_http_grpc_module"
[12]: https://doc.traefik.io/traefik/expose/overview/ "Overview - Traefik"
[13]: https://www.envoyproxy.io/docs/envoy/latest/faq/configuration/timeouts "How do I configure timeouts? — envoy 1.39.0-dev-3d1ada documentation"
[14]: https://grpc.io/docs/guides/keepalive/ "Keepalive | gRPC"
[15]: https://github.com/grpc/grpc-web "GitHub - grpc/grpc-web: gRPC for Web Clients · GitHub"
[16]: https://grpc.io/docs/guides/auth/ "Authentication | gRPC"
[17]: https://datatracker.ietf.org/doc/html/rfc7519 "

                RFC 7519 - JSON Web Token (JWT)

        "
[18]: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/10-Testing_WebSockets "WSTG - Latest | OWASP Foundation"
[19]: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html "WebSocket Security - OWASP Cheat Sheet Series"
[20]: https://nginx.org/en/docs/http/websocket.html "WebSocket proxying"
[21]: https://developers.cloudflare.com/network/websockets/ "WebSockets · Cloudflare Network settings docs"
[22]: https://docs.nats.io/using-nats/developer/develop_jetstream/consumers "Consumer Details | NATS Docs"
[23]: https://docs.nats.io/nats-concepts/jetstream/consumers "Consumers | NATS Docs"
[24]: https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html "MQTT - AWS IoT Core"
