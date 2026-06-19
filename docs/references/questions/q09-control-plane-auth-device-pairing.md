---
title: "Q9：自托管多设备安全方案"
source_url: "https://chatgpt.com/c/6a34fec7-14b0-83ee-b3b8-fc890086d461"
exported_at: "2026-06-19T17:06:49"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 推荐结论

Codex Remote 最适合采用 **“短期 pairing 凭据 + 长期设备公钥身份 + Worker 反向长连接 + 设备证书/令牌轮换”** 的组合，而不是单独依赖 one-time token、QR 或某个 OpenAI/ChatGPT 账号。

建议架构：

```text
Web / iOS
  └── Control Plane 自有登录：OIDC / passkey / MFA / session
        ├── 只保存：用户、设备、公钥/证书、状态、路由策略、审计日志
        ├── 不保存：OpenAI / ChatGPT / Bedrock / provider secrets
        └── 通过已认证的反向通道下发任务
              ▲
              │ outbound WebSocket/gRPC over TLS + mTLS 或 DPoP
              │
        Device Worker
          ├── 本机保存：Codex auth、API key、provider 配置、model provider
          ├── 本机生成：device private key
          └── 执行：Codex CLI / local workflows
```

长期方向应是：**Worker 首次注册用 OAuth Device Flow 风格的 code/QR pairing；注册成功后，Control Plane 给该 Worker 签发短期设备证书或 sender-constrained device token；Worker 主动连 Control Plane；后续通过 cert/token rotation、revocation、heartbeat、capability reporting 做多设备路由和状态聚合。** RFC 8628 的 Device Authorization Grant 已经定义了“设备显示 user code / verification URI，用户在另一台设备登录并确认，设备轮询拿 token”的模型，也明确支持把 `verification_uri_complete` 用 QR/NFC 这种非文本方式传输。([IETF Datatracker][1])

---

## 为什么这套方案匹配你的约束

OpenAI 官方 Codex 文档显示，Codex 本地 CLI / IDE 扩展支持 ChatGPT 登录或 API key 登录，并会把登录信息缓存在本机 `~/.codex/auth.json` 或 OS credential store；这正好说明 Codex auth 的自然边界在 **Worker 本机**，不是 Control Plane。([OpenAI 开发者][2]) OpenAI API key 安全建议也明确要求不要把 API key 暴露在浏览器或移动端，并建议使用环境变量、KMS 和轮换；对 Codex Remote 来说，可信后端不是 Control Plane，而是每台用户自己的 Worker。([OpenAI Help Center][3])

所以 Control Plane 应只做：

1. **用户身份认证**：谁能看哪些 Worker、发哪些任务。
2. **设备身份认证**：哪个 Worker 是已配对、未吊销、持有私钥的设备。
3. **路由与状态聚合**：按 device_id、labels、capabilities、online status 路由。
4. **审计与策略**：谁在什么时间向哪台 Worker 下发了什么任务。

Control Plane 不应做：

1. 不保存 OpenAI / ChatGPT / provider API key。
2. 不把多个 Worker 绑定到同一个 OpenAI / ChatGPT 账号。
3. 不作为通用 LLM proxy 转发 provider secrets。
4. 不把 pairing token 当作长期设备身份。

---

## Control Plane 用户认证方案

Control Plane 的用户登录应独立于 OpenAI/ChatGPT。推荐：

| 场景                       | 方案                                              | 说明                                                                                                                                                         |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-hosted 单人 / 小团队 MVP | 本地账户 + passkey / TOTP MFA                       | 简单，可离线自托管。                                                                                                                                                 |
| 团队 / 企业                  | OIDC / SSO                                      | OWASP 明确区分：OIDC 用于 authentication / SSO，OAuth 用于 API authorization；Control Plane 登录应按 OIDC 处理，而不是用 OAuth access token 误当身份。([OWASP Cheat Sheet Series][4]) |
| Web / iOS 客户端            | Authorization Code + PKCE / first-party session | RFC 9700 要求 public clients 使用 PKCE 来防 authorization code misuse / injection。([IETF Datatracker][5])                                                        |
| 高安全                      | Passkeys + MFA / device-bound passkeys          | FIDO passkeys 基于公私钥，抗 phishing，服务端不保存共享密码秘密。([FIDO Alliance][6])                                                                                           |

用户认证和 Worker pairing 要分开。用户登录只证明“这个人是谁”；Worker 设备身份要靠每台 Worker 自己生成并持有的私钥证明。

---

## Worker pairing 推荐流程

### MVP 流程

```text
1. Worker 启动：
   codex-remote worker pair https://cp.example.com

2. Worker 本机生成 device keypair：
   Ed25519 / P-256 private key 留在本机 OS keychain / file with permissions / TPM 可选

3. Worker 调用 Control Plane：
   POST /device/pair/start
   body: public_key, worker_version, hostname, os, random nonce, capabilities hash

4. Control Plane 返回：
   user_code, verification_uri, verification_uri_complete(QR), device_code, expires_in, polling_interval

5. Worker 显示：
   - pairing code
   - QR
   - public key fingerprint
   - hostname / OS / Worker version

6. 用户在 Web/iOS 登录 Control Plane，输入 code 或扫 QR。
   Control Plane 显示待注册 Worker 的 fingerprint、hostname、OS、capabilities。
   用户确认。

7. Worker 轮询 /device/pair/token。
   如果用户批准，Control Plane 返回：
   - device_id
   - signed device certificate 或 DPoP-bound device refresh token
   - CP root / trust bundle
   - 初始 routing policy

8. Worker 建立反向连接：
   outbound WebSocket/gRPC over TLS
   auth: mTLS device cert 或 DPoP/app-level signature

9. Control Plane 标记：
   device_id = active
   last_seen = now
   capabilities = ...
```

这个流程本质上是 RFC 8628 Device Authorization Grant 的变体：设备拿到 `device_code` / `user_code`，用户在另一台设备上登录并确认，设备轮询 token endpoint。RFC 8628 还建议 QR 等非文本传输时仍显示 `user_code`，用于设备确认和降低远程 phishing 风险。([IETF Datatracker][1])

### 关键点

Pairing code 只做 **bootstrap**。注册完成后，它必须失效。长期身份是 Worker 私钥对应的公钥、证书或 key-bound token。

Control Plane 数据库只保存：

```ts
WorkerDevice {
  device_id: string
  owner_user_id / org_id: string
  public_key_thumbprint: string
  cert_serial?: string
  status: "pending" | "active" | "suspended" | "revoked"
  labels: string[]
  capabilities: {
    providers: string[]      // 例如 "openai-chatgpt", "openai-api-key", "bedrock"
    models?: string[]        // 可选，注意不要泄露 secret
    os: string
    arch: string
    codex_version: string
  }
  created_at: timestamp
  last_seen_at: timestamp
}
```

不要保存：

```ts
openai_api_key
chatgpt_refresh_token
bedrock_secret
provider_credentials
~/.codex/auth.json content
```

---

## 方案比较

| 方案                                       | MVP 可行性 | 长期安全性 | 适合用途                               | 主要风险                                            | 对 Codex Remote 的建议                                                                                                                                                       |
| ---------------------------------------- | ------: | ----: | ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One-time token**                       |      很高 |   低到中 | 首次注册、邀请、设备加入                       | 被截获即可抢注；如果可复用会变成 fleet-wide shared secret       | 可用，但必须短 TTL、单次使用、存 hash、绑定 Worker 公钥、用户确认后即废弃。                                                                                                                           |
| **QR pairing**                           |       高 |     中 | Web/iOS 体验、headless Worker pairing | QR 只是传输方式，不自动证明设备可信；可能被远程 phishing              | 推荐作为 one-time code 的 UX 层。仍要显示 code、fingerprint、设备信息。                                                                                                                    |
| **Device token rotation**                |       中 |   中到高 | 已注册 Worker 的会话续期                   | 如果是 bearer token，泄漏后可重放                         | 必做。refresh token 要 rotation + reuse detection，或绑定到设备私钥。RFC 9700 要求 public clients 的 refresh token 使用 sender-constrained 或 refresh token rotation。([IETF Datatracker][5]) |
| **mTLS**                                 |       中 |     高 | Worker 长期身份、反向连接认证                 | 需要 CA、证书生命周期、反向代理透传 client cert；运维复杂            | 长期推荐。MVP 可先用 DPoP/app-level signature，随后迁移到 mTLS。RFC 8705 定义了基于 X.509 的 mutual TLS client authentication 和 certificate-bound tokens。([IETF Datatracker][7])              |
| **DPoP / app-level proof-of-possession** |       中 |   中到高 | 不想一开始上 PKI / mTLS 的 MVP            | 实现 JWT proof、nonce、replay cache；协议细节易错          | MVP 很合适。RFC 9449 定义了用应用层 proof-of-possession 将 token 绑定到客户端密钥，降低 access/refresh token replay。([RFC Editor][8])                                                           |
| **反向连接**                                 |      很高 |   中到高 | NAT / 家庭网络 / 多设备连接                 | 只解决连通性，不解决身份；Control Plane compromised 后可下发恶意任务 | 强烈推荐。Worker 永远主动连 CP，不暴露入站端口。Cloudflare Tunnel、ngrok 这类模式也采用 outbound-only 连接来穿越防火墙/NAT。([Cloudflare Docs][9])                                                           |
| **SPIFFE / SPIRE**                       |       低 |    很高 | 大规模 fleet、跨集群、多 trust domain       | 对个人自托管 MVP 太重                                   | 作为长期 v2/v3 方向。SPIFFE/SPIRE 提供跨平台 workload cryptographic identity、attestation、SVID、证书轮换和 mTLS 支持。([SPIFFE][10])                                                           |
| **共享 bootstrap secret / claim cert**     |       高 |     低 | 工厂预置设备、无用户交互 IoT                   | 一旦泄漏影响所有未注册设备                                   | 不推荐用于你的场景。AWS IoT 文档也指出 shared claim certificate 泄漏风险更大，trusted-user 临时 claim 只有 5 分钟窗口以降低风险。([AWS 文档][11])                                                              |

---

## One-time token 应该怎么用

One-time token 可以做 MVP，但必须降级为“临时入网授权”，不能作为 Worker 后续身份。

推荐属性：

```ts
PairingSession {
  pairing_id: uuid
  user_code_hash: string
  device_code_hash: string
  public_key_thumbprint: string
  requested_by_user_id?: string
  approved_by_user_id?: string
  expires_at: now + 5~10 minutes
  status: "pending" | "approved" | "consumed" | "expired" | "denied"
  attempts: number
}
```

安全要求：

1. `device_code` 高熵，Worker 用来轮询，不给用户看。
2. `user_code` 给用户输入或 QR 传输，需要 rate limit。
3. 数据库存 hash，不存明文 code。
4. TTL 5–10 分钟。
5. 成功兑换后立即 `consumed`。
6. 必须绑定 Worker 公钥 thumbprint。
7. 用户批准页显示 Worker fingerprint、hostname、OS、version。
8. 不允许 reusable pairing token。
9. 不把 pairing token 写入日志、URL analytics、crash report。

Kubernetes 的 node join 也使用 bootstrap token 作为加入集群的简单 bearer token，并配合 kubelet TLS bootstrapping 取得后续证书；这说明 bootstrap token 适合“加入流程”，但长期安全通信应切换到证书身份。([Kubernetes][12]) Tailscale 的 auth key 设计也把 one-off key、reusable key、key expiry、node key 区分开，并警告 reusable keys 被盗风险很高。([Tailscale][13])

---

## QR pairing 的定位

QR 不应被视为单独的安全机制。它只是把 `verification_uri_complete`、pairing session id、user code 或 bootstrap URL 从一个设备传到另一个设备。

适合两种 UX：

### Worker 显示 QR，Web/iOS 扫描

适合 CLI / desktop Worker：

```text
Worker terminal:
  Visit: https://cp.example.com/pair
  Code: 8H3K-L9Q2
  Fingerprint: SHA256:ab12...
  [QR: https://cp.example.com/pair?user_code=8H3K-L9Q2]
```

用户手机扫码后登录 Control Plane，确认设备信息。

### Control Plane 显示 QR，Worker 扫描

适合 iOS / mobile Worker，但对普通 headless CLI 不如前者自然。

推荐采用第一种：**Worker 发起，Worker 显示，用户批准**。这更接近 RFC 8628，也避免用户先在 Control Plane 复制一个长 secret 到终端。

---

## Device token rotation 怎么做

Worker 注册成功后，有两种实现路径。

### 路径 A：DPoP / signed request token，MVP 友好

Worker 本机持有私钥。Control Plane 给 Worker 一个短期 access token 和可轮换 refresh token，但 token 绑定到 Worker 公钥：

```text
Worker request:
  Authorization: DPoP <access_token>
  DPoP: signed JWT {
    htm: "GET",
    htu: "https://cp.example.com/worker/connect",
    iat,
    jti,
    nonce,
    public key thumbprint
  }
```

Control Plane 校验：

1. token 未过期。
2. token `cnf/jkt` 与 Worker public key thumbprint 匹配。
3. DPoP proof 签名正确。
4. `htm` / `htu` / `iat` / `jti` / nonce 未重放。
5. device 未 revoked / suspended。

RFC 9449 的 DPoP 就是这种应用层 sender-constrained token 模型。([RFC Editor][8])

### 路径 B：mTLS device certificate，长期推荐

注册成功后，Control Plane 内置 CA 给 Worker 签发短期 client certificate：

```text
Subject / SAN:
  URI: spiffe://codex-remote.local/worker/<device_id>
  DNS: optional
  Serial: cert_serial
  NotAfter: now + 7d / 30d
```

Worker 用 client cert 建立 outbound TLS 连接。Control Plane 校验 client cert、device_id、revocation 状态，再在连接内接收 heartbeat 和下发任务。

mTLS 的优势是强，协议成熟，能减少 bearer token replay；RFC 8705 也把 mTLS client authentication 和 certificate-bound tokens 作为 OAuth 安全机制定义。([IETF Datatracker][7]) 缺点是要处理 CA、证书更新、吊销、反向代理 TLS termination 细节。

### Refresh token rotation

无论 A 还是 B，只要有 refresh token，就应使用 rotation：

```text
refresh_token_1 -> access_token_2 + refresh_token_2
refresh_token_1 invalid
如果旧 refresh token 再次出现：标记 token family compromised，吊销该 Worker session
```

RFC 9700 明确建议 public clients 的 refresh token 要 sender-constrained 或使用 refresh token rotation，并描述了通过旧 refresh token 重用来发现泄漏的机制。([IETF Datatracker][5])

---

## mTLS 是否应该 MVP 就上

取决于你的实现栈。

### MVP 可以不上 mTLS 的情况

如果你想快速验证产品：

```text
TLS server auth
+ Worker-generated Ed25519 key
+ DPoP / signed WebSocket handshake
+ short-lived access token
+ rotating refresh token
+ reverse connection
```

这足够支撑 MVP，且不需要一开始维护私有 CA。

### MVP 就上 mTLS 的情况

如果你用 Go/Rust 自写 Control Plane，且不依赖复杂 L7 代理，mTLS 可以一开始就做：

```text
POST /pair/start: no client cert
POST /pair/token: no client cert, but bound to pending public key
GET /worker/connect: require client cert
```

关键是证书签发和轮换要自动化，否则后续多设备会变成运维负担。

### 长期建议

长期应迁移到：

```text
reverse gRPC/WebSocket over mTLS
+ device cert auto-rotation
+ DB-backed revocation
+ optional SPIFFE ID
```

SPIFFE/SPIRE 的模型非常适合更大规模的 “Control Plane + many Workers” workload identity：它定义 SPIFFE ID、SVID、Workload API，并支持 attestation、SVID 续签、key/cert rotation。([GitHub][14])

---

## 反向连接为什么应作为默认

自托管多设备的默认现实是：Worker 可能在家宽、公司内网、NAT、移动热点、笔记本睡眠恢复后变化 IP。让 Control Plane 主动连 Worker 会要求：

```text
公网 IP / 端口映射 / 动态 DNS / 防火墙规则 / TLS 证书 / NAT traversal
```

这不适合 MVP。

更稳的模型是：

```text
Worker ---- outbound 443 ----> Control Plane
```

连接建立后双向复用：

```text
Worker -> CP: heartbeat, status, task result, logs, capabilities
CP -> Worker: task assignment, cancel, config update, ping
```

Cloudflare Tunnel 文档明确描述了 outbound-only connection model：daemon 从内网主动向 Cloudflare 建立出站连接，连接建立后流量可双向流动，并可阻断入站访问。([Cloudflare Docs][9]) 你不需要使用 Cloudflare，但应采用同类网络拓扑。

---

## 路由与状态聚合设计

Control Plane 可以维护一个内存 + 数据库状态表：

```ts
WorkerRuntimeState {
  device_id: string
  connection_id: string
  authenticated_as: public_key_thumbprint | cert_serial
  online: boolean
  last_seen_at: timestamp
  latency_ms: number
  current_task_id?: string
  capacity: {
    max_parallel_tasks: number
    current_running: number
  }
  capabilities: {
    codex_version: string
    providers: string[]
    provider_modes: ("chatgpt" | "api_key" | "bedrock" | "local")[]
    models?: string[]
    workspaces?: string[]
    os: string
    arch: string
  }
}
```

路由策略建议：

```text
1. 用户选择明确 device_id：优先精确路由。
2. 用户选择 label：如 "macbook", "linux-gpu", "office-pc"。
3. Control Plane 自动选择：
   - online
   - owner/org match
   - policy allows project/repo
   - provider capability match
   - load lowest
4. 任务下发时加 aud=device_id。
5. Worker 本地再次校验 task policy。
```

任务对象可以是：

```ts
TaskEnvelope {
  task_id: string
  user_id: string
  org_id?: string
  aud_device_id: string
  repo_ref?: string
  working_dir_policy?: string
  command: "codex.run" | "codex.review" | "cancel"
  payload: object
  issued_at: timestamp
  expires_at: timestamp
  cp_signature: string
}
```

Worker 不应盲信 Control Plane 的任意 payload。至少应支持本地策略：

```toml
[worker.policy]
allow_repos = ["/Users/vint/dev/*"]
deny_paths = ["~/.ssh", "~/.codex/auth.json", ".env"]
require_manual_approval_for = ["shell", "git push", "delete_files"]
```

---

## “可信 Worker”的真实含义

Pairing + private key 只能证明：

```text
这台 Worker 曾经被某个已认证用户批准注册；
现在连接的进程持有当时注册的 device private key；
该 device_id 尚未被吊销。
```

它不能证明：

```text
Worker binary 未被篡改；
机器没有恶意软件；
本地 Codex auth 没有被窃取；
本地执行环境安全。
```

如果需要更强的“可信 Worker”，长期要加：

1. signed releases / code signing。
2. auto-update signature verification。
3. TPM / Secure Enclave / hardware-backed private key。
4. remote attestation，至少对企业环境可选。
5. Worker 本地 policy enforcement。
6. sensitive action require local confirmation。
7. 不把 `~/.codex/auth.json`、API key、provider config 发回 Control Plane。

NIST SP 800-63B 对 authenticator lifecycle 强调 expiration、invalidation/revocation、compromise handling 和用户通知；设备身份也应按同样思路处理：支持挂失、暂停、吊销、过期和重新绑定。([NIST页面][15])

---

## 建议的落地阶段

### Phase 0：MVP

实现：

```text
Control Plane:
  - 用户登录：local account + passkey/TOTP，或 OIDC
  - PairingSession
  - WorkerDevice registry
  - Reverse WebSocket
  - DPoP / signed handshake
  - short-lived access token
  - rotating refresh token
  - device revoke
  - heartbeat/status

Worker:
  - 本机生成 Ed25519 keypair
  - 本机保存 device private key
  - 本机保留 Codex auth / API key / provider config
  - pair 命令显示 code + QR + fingerprint
  - outbound connect
```

不要在 MVP 中做：

```text
- 共享 join secret
- 长期 bearer token
- Control Plane 保存 OpenAI/API/provider secret
- Worker 暴露公网入站端口
- 依赖同一个 ChatGPT/OpenAI 账号
```

### Phase 1：生产可用

增加：

```text
- device token family reuse detection
- Worker cert or mTLS
- device suspension / revocation / re-pair
- audit log
- per-device labels and policies
- per-task signed envelope
- rate limiting
- pairing approval screen with fingerprint
- Worker local policy
- encrypted local storage / OS keychain
```

### Phase 2：多设备规模化

增加：

```text
- cert auto-rotation
- connection multiplexing
- task queue with lease / ack / retry
- status stream
- per-org CA / trust domain
- device groups
- admin approval workflow
- suspicious-device detection
- capability attestation
```

### Phase 3：长期安全架构

考虑：

```text
- SPIFFE/SPIRE-style workload identity
- X.509 SVID / JWT SVID
- hardware-backed keys
- remote attestation
- reproducible/signed Worker releases
- OPA/Rego policy
- local confirmation for destructive tasks
```

---

## 最终建议

采用这个组合：

```text
Control Plane auth:
  OIDC / passkey / MFA，不依赖 OpenAI/ChatGPT 账号

Worker pairing:
  RFC 8628 风格 Device Flow
  + one-time user_code
  + QR as UX
  + Worker-generated public key
  + 用户确认 fingerprint
  + pairing code 单次短期有效

Worker long-term identity:
  MVP: DPoP / signed request + rotating refresh token
  Production: mTLS device certificate
  Scale: SPIFFE/SPIRE-style identity

Network:
  Worker 主动 outbound reverse connection
  Control Plane 不连 Worker 入站端口

Secrets boundary:
  Codex auth / OpenAI API key / provider secrets 永远留在 Worker 本机
  Control Plane 只保存 device public identity、routing metadata、status、audit
```

这满足你的核心约束：多设备、每台设备独立 Codex/provider auth、不依赖同一 OpenAI/ChatGPT 账号、Control Plane 不保存 provider secrets，并且后续可以自然扩展到注册、路由、状态聚合、吊销和证书轮换。

[1]: https://datatracker.ietf.org/doc/html/rfc8628 "

                RFC 8628 - OAuth 2.0 Device Authorization Grant

        "
[2]: https://developers.openai.com/codex/auth "Authentication – Codex | OpenAI Developers"
[3]: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety "Best Practices for API Key Safety | OpenAI Help Center"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html "Authentication - OWASP Cheat Sheet Series"
[5]: https://datatracker.ietf.org/doc/rfc9700/ "

        RFC 9700 - Best Current Practice for OAuth 2.0 Security

        "
[6]: https://fidoalliance.org/passkeys/ "FIDO Passkeys: Passwordless Authentication | FIDO Alliance"
[7]: https://datatracker.ietf.org/doc/html/rfc8705 "

                RFC 8705 - OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens

        "
[8]: https://www.rfc-editor.org/info/rfc9449/ "RFC 9449: OAuth 2.0 Demonstrating Proof of Possession (DPoP) | RFC Editor"
[9]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/ "Cloudflare Tunnel · Cloudflare One docs"
[10]: https://spiffe.io/ "SPIFFE – Secure Production Identity Framework for Everyone"
[11]: https://docs.aws.amazon.com/iot/latest/developerguide/iot-provision.html "Device provisioning - AWS IoT Core"
[12]: https://kubernetes.io/docs/reference/access-authn-authz/bootstrap-tokens/ "Authenticating with Bootstrap Tokens | Kubernetes"
[13]: https://tailscale.com/docs/features/access-control/auth-keys "Auth keys · Tailscale Docs"
[14]: https://github.com/spiffe/spiffe "GitHub - spiffe/spiffe: The SPIFFE Project · GitHub"
[15]: https://pages.nist.gov/800-63-4/sp800-63b.html "NIST Special Publication 800-63B"
