---
title: "Q1：最稳定的本机传输方式"
source_url: "https://chatgpt.com/c/6a34fc62-2084-83e8-9e5c-ebbe3d88c9fa"
exported_at: "2026-06-19T17:07:47"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

对 Codex Remote 这个架构，**最推荐的生产主线是：Worker 直接以 `stdio` 启动并持有 `codex app-server` 子进程**。它是官方默认传输、不是实验性 WebSocket、没有监听端口、权限边界最清晰，最符合“只有 `apps/worker` 能访问 app-server”的设计。官方文档明确列出 `stdio` 是默认传输，使用 JSONL；`websocket` 虽然支持，但被标为 experimental/unsupported；Unix socket 是本机控制 socket 场景的传输。([OpenAI 开发者][1])

如果你需要 **Worker 连接到一个本机长驻 app-server / daemon**，例如未来要复用 Codex Desktop/remote-control 风格的本地控制面，那么第二选择是 **Unix socket (`--listen unix://`)**。它比 loopback TCP 更适合作本机 IPC，官方实现会创建默认 control socket、加锁、清理 stale socket，并在 Unix 上把 socket 权限设为 `0600`。([OpenAI 开发者][1])

**不建议把 loopback WebSocket 作为生产主传输**。你当前的 `ws://127.0.0.1:<port>` probe 可以继续用于探针、验证协议、调试和过渡，但官方文档明确说 WebSocket transport “experimental and unsupported”，不要依赖它跑生产负载。它的优点是有 `/readyz`、`/healthz` 和标准 WS tooling；缺点是官方稳定性承诺弱、TCP 端口暴露面更大、需要处理 Origin/auth/端口抢占等问题。([OpenAI 开发者][1])

## 推荐排序

| 场景                                                |                   推荐传输 | 理由                                                                                  |
| ------------------------------------------------- | ---------------------: | ----------------------------------------------------------------------------------- |
| Worker 自己启动并管理 app-server 生命周期                    |              **stdio** | 官方默认；无端口；无 socket 文件；只通过子进程 pipe；最小暴露面；最容易把 app-server 包在 Worker HTTP allowlist 后面。 |
| Worker 需要连接同机长驻 app-server，或未来做本机 daemon/多本机客户端复用 |        **Unix socket** | 官方本机 control socket 机制；文件系统权限隔离；适合本机 IPC；但客户端实现要处理 WebSocket-over-UDS。              |
| Probe、开发、临时兼容、需要健康检查 endpoint                     | **loopback WebSocket** | 易调试，有 `/readyz`/`/healthz`；但官方标实验/不支持，不应作为长期生产主线。                                   |
| LAN / 公网直接暴露 app-server                           |                **不要做** | 即使有 `--ws-auth`，也不符合你的架构。远程访问应终止在 Worker HTTP API / Control Plane，而不是 app-server。   |

## `--ws-auth` 是否存在

存在。官方文档和源码都显示 WebSocket 认证参数已经存在，主要有两类：

```bash
--ws-auth capability-token --ws-token-file /absolute/path
--ws-auth capability-token --ws-token-sha256 HEX
--ws-auth signed-bearer-token --ws-shared-secret-file /absolute/path
```

`signed-bearer-token` 还支持 `--ws-issuer`、`--ws-audience`、`--ws-max-clock-skew-seconds`。客户端在 WebSocket handshake 阶段用 `Authorization: Bearer <token>` 发送凭证，app-server 在 JSON-RPC `initialize` 前做认证。官方还建议优先用 `--ws-token-file`，避免把原始 bearer token 直接放在命令行参数里。([OpenAI 开发者][1])

但这个结论要拆开看：

1. **`--ws-auth` 只适用于 WebSocket transport。**
   它不是 app-server 的通用权限模型，也不是 read-only 模式。它不会限制 JSON-RPC method；只是在 WS upgrade 阶段鉴权。

2. **stdio 没有也不需要 `--ws-auth`。**
   stdio 的边界是子进程 pipe。安全性来自 Worker 拥有子进程、没有监听端口、Web/Control Plane 无法直接连到 pipe。官方 stdio 实现就是从 stdin 逐行读 JSON、向 stdout 逐行写 JSON。([GitHub][2])

3. **Unix socket 没看到独立的 `--unix-auth` / `--uds-auth` 机制。**
   官方列出的本机 IPC 传输就是 `stdio`、`unix://`、`ws://IP:PORT`、`off`；Unix socket 的实际安全边界主要是 socket 文件路径、目录隔离、锁文件、stale socket 检测和 Unix 上的 `0600` 权限。([OpenAI 开发者][1])

4. **当前源码比文档更保守：非 loopback WebSocket 无认证会被拒绝启动。**
   官方开发文档仍提示非 loopback WS 在 rollout 期间存在默认无认证风险，要求远程暴露前配置 WS auth；而当前源码中已经有 guard：如果是非 loopback listener 且未配置 auth，会报错拒绝启动。这说明版本间存在行为差异，工程上不能依赖默认值，应该直接禁止非 loopback bind。([OpenAI 开发者][1])

## 三种传输的具体判断

### 1. stdio：Codex Remote Worker MVP 的首选

建议命令：

```bash
codex app-server
# 或显式写法
codex app-server --listen stdio://
```

优点：

* 官方默认传输，协议是 newline-delimited JSON。([OpenAI 开发者][1])
* 没有 TCP 端口，也没有 socket 文件，Web、浏览器、Control Plane、同网段机器都无法直接连接。
* Worker 可以完全持有 app-server 生命周期：spawn、初始化、重启、stderr 日志收集、健康状态、超时与熔断。
* 对 read-only MVP 最干净：Worker 只暴露自己的 HTTP API，不做原始 JSON-RPC 透传。

需要注意：

* JSONL 不是“消息长度无限”的抽象。社区 issue 报告过 Python SDK 的 `asyncio.StreamReader.readline()` 默认 64 KiB 限制导致大消息读取失败；该 issue 同时说明 app-server 本身可处理大 prompt，问题在客户端 reader limit。你如果用 Python/Rust/Node 实现 stdio adapter，要设置足够大的 line/read buffer，或实现无固定 64 KiB 限制的 JSONL reader。([GitHub][3])
* stdio 通常适合“一条 Worker-managed 连接对应一个 app-server 子进程”。如果你需要多个本机进程 attach 同一个 app-server，stdio 不是最自然的选择。

### 2. Unix socket：本机 daemon / control-socket 场景的首选

建议命令：

```bash
codex app-server --listen unix://
# 或自定义路径
codex app-server --listen unix:///path/to/codex-remote.sock
```

优点：

* 官方文档描述为通过默认 app-server control socket 或自定义 Unix socket path 建立 WebSocket 连接，使用标准 HTTP Upgrade。([OpenAI 开发者][1])
* 官方 README 说明 Unix socket 目标是本地 app-server control-plane clients；`codex app-server proxy` 默认连接 `$CODEX_HOME/app-server-control/app-server-control.sock`。([GitHub][4])
* 源码里有 socket path 准备、startup lock、stale socket 清理、Unix `0600` 权限设置和 drop 时清理 socket 文件。([GitHub][5])

缺点：

* 它实际是 WebSocket-over-UDS，所以客户端复杂度高于 stdio。
* 社区 issue 显示 `app-server proxy`、daemon lifecycle、Windows/Git Bash 的 Unix socket 行为有过边缘问题；这不否定 Unix socket，但说明你不应把 MVP 的稳定性押在未充分测试的 proxy/daemon 路径上。([GitHub][6])
* 如果你的 Worker 是唯一 app-server 调用方，Unix socket 比 stdio 多了一层不必要 IPC 面。

### 3. loopback WebSocket：保留为 probe/debug，不作为生产主线

建议只允许：

```bash
codex app-server --listen ws://127.0.0.1:<port>
# 或 IPv6 loopback
codex app-server --listen ws://[::1]:<port>
```

优点：

* 标准 WebSocket，现有探针容易实现。
* 有 `/readyz`、`/healthz`。
* app-server 会拒绝带 `Origin` header 的请求，这对防止浏览器页面直接打 localhost app-server 有一定帮助。([OpenAI 开发者][1])

缺点：

* 官方明说 WebSocket transport 仍是 experimental/unsupported。([OpenAI 开发者][1])
* loopback 只防 LAN/公网，不防同机恶意进程；同机进程仍可扫端口。
* 如果某层错误地把 `127.0.0.1:<port>` 反代、SSH forward、容器端口映射或 Tailscale/Funnel 暴露出去，风险会迅速扩大。
* `--ws-auth` 能增强 WS handshake 鉴权，但它不是 method-level 权限，也不能替代 Worker HTTP API 的鉴权与 allowlist。

## Codex Remote read-only MVP 的建议架构

建议把 app-server 当成**本机 privileged backend**，Worker 是唯一 policy enforcement point：

```text
Web / Control Plane
        |
        | HTTPS / authenticated Worker API
        v
apps/worker
  - user/session auth
  - read-only method allowlist
  - pagination / rate limit
  - redaction / audit log
  - owns app-server process or UDS connection
        |
        | stdio preferred
        | unix:// optional daemon mode
        v
codex app-server
```

Worker HTTP API 不要提供“任意 JSON-RPC 代理”。app-server 协议里不只有 read-only 方法：官方文档列出 `fs/writeFile`、`fs/remove`、`config/value/write`、`config/batchWrite`、`thread/delete`、`thread/shellCommand`、`account/login/start`、`account/logout` 等能力。read-only 必须由 Worker 自己 enforce。([OpenAI 开发者][1])

read-only MVP 的 allowlist 可以从这些方法开始：

```text
initialize
initialized
model/list
thread/list
thread/read
```

可选但要谨慎：

```text
thread/turns/list        # 更细粒度读取历史
account/read             # 只读账户状态；注意不要泄露敏感信息
config/read              # 只读配置；注意路径、token、provider 信息
```

不要在 MVP 开启：

```text
thread/start
turn/start
turn/steer
thread/resume
thread/shellCommand
thread/delete
thread/archive
thread/metadata/update
fs/*
config/*/write
account/login/*
account/logout
experimental methods
```

官方文档说明 `initialize` 必须每个连接执行一次，先发 `initialize`，再发 `initialized`，否则服务器会拒绝初始化前的请求。read-only MVP 也应默认不设置 `capabilities.experimentalApi=true`，除非某个明确需要的方法被官方标为 experimental。([OpenAI 开发者][1])

## 维护性建议

1. **协议类型不要手写到失控。**
   在 CI 里用当前打包的 Codex CLI 生成 schema/type：

   ```bash
   codex app-server generate-ts --out ./schemas
   codex app-server generate-json-schema --out ./schemas
   ```

   官方说明这些输出是 Codex 版本特定的，生成物精确匹配当前运行的 Codex 版本。([OpenAI 开发者][1])

2. **把 transport adapter 抽象成同一接口。**
   先实现 `StdioAppServerTransport`，保留 `LoopbackWsTransport` 作为 probe fallback，再加 `UnixSocketTransport` 作为 daemon 模式。上层 Worker HTTP read-only API 不应感知底层是 stdio、UDS 还是 WS。

3. **处理 backpressure。**
   官方文档说明 WebSocket 模式下有 bounded queues，满载时会返回 JSON-RPC `-32001` / “Server overloaded; retry later.”，客户端应指数退避加 jitter。即使 stdio 路径未必完全相同，也建议 Worker 统一对 app-server 请求做并发限制、超时和重试策略。([OpenAI 开发者][1])

4. **显式禁止非 loopback app-server。**
   即使某版本支持 `--ws-auth` 后的非 loopback WS，也不要在 Codex Remote 中使用。远程访问面应该是 Worker HTTP API，而不是 app-server。

## 最终建议

**Codex Remote Worker read-only MVP：切到 `stdio` 作为主传输；保留现有 loopback WebSocket probe 作为临时诊断路径；把 Unix socket 作为后续 daemon/本机多进程 attach 模式。**

`--ws-auth` 确实存在，但它只解决 WebSocket handshake 鉴权，不解决 read-only 权限，也不是 stdio/Unix socket 的本机 IPC auth 机制。对你的架构，安全边界应放在 Worker：Worker 拥有 app-server、Worker 做用户鉴权、Worker 做 method allowlist，Web 和未来 Control Plane 永远不直接连接 app-server。

[1]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[2]: https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/stdio.rs "codex/codex-rs/app-server-transport/src/transport/stdio.rs at main · openai/codex · GitHub"
[3]: https://github.com/openai/codex/issues/16554 "codex-app-server-sdk: StdioTransport crashes on prompts >64 KiB due to Python asyncio StreamReader limit · Issue #16554 · openai/codex · GitHub"
[4]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[5]: https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/unix_socket.rs "codex/codex-rs/app-server-transport/src/transport/unix_socket.rs at main · openai/codex · GitHub"
[6]: https://github.com/openai/codex/issues/25846 "codex app-server proxy hangs on WebSocket-framed initialize while direct Unix socket succeeds · Issue #25846 · openai/codex · GitHub"
