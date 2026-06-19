---
title: "Q16"
source_url: "https://chatgpt.com/c/6a350f67-9ac8-83ee-b98c-3dd00c75bfc3"
exported_at: "2026-06-19T19:39:24"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

Codex Remote 的 **Device-bound token MVP** 建议采用 **DPoP-compatible sender-constrained token**，而不是只做普通 bearer token + refresh rotation。具体做法是：Worker 本地生成 device key；Control Plane 只保存 public JWK / JWK thumbprint；access token 是短期 JWT，包含 `cnf.jkt`；refresh token 是 opaque 随机值，服务端只存 hash，并绑定到同一个 `device_id + key thumbprint + token family`；Worker 调用 Worker API 时必须带 `Authorization: DPoP <access_token>` 和 `DPoP: <proof_jwt>`。OAuth 安全 BCP 明确建议 sender-constrain access token，并要求 public client 的 refresh token 必须 sender-constrained 或使用 refresh token rotation；bearer token 的基本问题是“谁拿到谁可用”，不需要证明持有任何密钥。([IETF 数据追踪器][1])

mTLS device certificate 安全性强，但对自托管、多反代、多端部署的运维成本更高；应用层自定义签名 handshake 可以作为 WebSocket/命令通道补充，但不应替代标准 DPoP；普通 bearer + rotation 只能作为临时降级方案，不能称为真正的 device-bound token。

---

## 推荐 MVP 架构

### 1. Threat model 先定清楚

MVP 主要防这些：

| 攻击                                           | DPoP-style MVP 结果                                                  |
| -------------------------------------------- | ------------------------------------------------------------------ |
| access token 被日志、代理、浏览器、DB dump 泄露           | 攻击者没有 device private key，不能生成匹配的 proof，token 不可用                   |
| refresh token 被窃取                            | refresh endpoint 要求 DPoP proof，且 refresh token 轮换；没有私钥不能刷新         |
| 请求被重放                                        | `jti + iat + replay cache` 拒绝同一 proof；高风险端点再加 server nonce         |
| Control Plane DB 泄露                          | DB 里只有 refresh token hash、public key、device metadata；不能直接冒充 Worker |
| pairing code 被抢先使用                           | 仍可注册攻击者自己的设备；需要短 TTL、一次性、用户确认 device fingerprint/hostname          |
| Worker 主机被 malware 控制，私钥和 refresh token 同时被盗 | DPoP/mTLS 都无法根治；只能靠 OS keychain、硬件密钥、异常审计、快速 revoke                |

DPoP 的 proof 只证明“请求方持有私钥”，本身不是完整授权机制；资源服务器仍必须验证 access token、scope、device 状态、用户/组织权限。RFC 9449 也明确说 DPoP proof 不是单独的认证或访问控制机制。([IETF 数据追踪器][2])

---

## Pairing flow

### 一次性 pairing

1. 用户在 Control Plane Web UI 中点击 “Pair new Worker”。
2. Control Plane 创建 `pairing_session`：

   * `pairing_id`
   * `pairing_secret_hash`
   * `expires_at`，建议 5 分钟
   * `created_by_user_id`
   * `allowed_scopes`
   * `status = pending`
3. UI 显示 QR / copy command，例如：

   ```bash
   codex-remote-worker pair --url https://cp.example.com --pairing-code xxxx-yyyy
   ```
4. Worker 本地生成 device key。MVP 建议：

   * 标准互操作优先：`P-256 / ES256`
   * 自控端到端优先：`Ed25519 / EdDSA`
   * Control Plane 永远不生成、不接收 private key
5. Worker 调用：

   ```http
   POST /api/device/pair/complete
   ```

   请求体包含：

   ```json
   {
     "pairing_id": "...",
     "pairing_secret": "...",
     "device_name": "vint-mbp",
     "worker_version": "0.1.0",
     "public_jwk": {...},
     "proof": "signed challenge or DPoP-style proof"
   }
   ```
6. Control Plane 校验 pairing code、TTL、一次性状态、签名 proof，然后创建 trusted device。
7. 返回：

   * `device_id`
   * short-lived access token
   * rotating refresh token
   * server public signing key / JWKS endpoint
   * initial DPoP nonce，可选

Pairing code 本身是一次性 enrollment capability；它不能替代 device proof。用户界面应显示 Worker 上报的 hostname、OS、IP、key thumbprint，让用户确认“这台设备就是我要绑定的 Worker”。

---

## Token 设计

### access token

使用 JWT，TTL 建议 2–10 分钟，MVP 默认 5 分钟。JWT 至少包含：

```json
{
  "iss": "https://cp.example.com",
  "aud": "codex-remote-worker-api",
  "sub": "device:dev_123",
  "iat": 1710000000,
  "nbf": 1710000000,
  "exp": 1710000300,
  "jti": "at_...",
  "scope": "worker.poll worker.ack worker.logs",
  "device_id": "dev_123",
  "grant_id": "gr_456",
  "device_epoch": 3,
  "cnf": {
    "jkt": "base64url-jwk-thumbprint"
  }
}
```

JWT 的 `iss`、`aud`、`exp`、`iat`、`jti` 都是标准 claim；`exp` 到期后不得接受，`aud` 不匹配应拒绝，`jti` 可用于防重放。([IETF 数据追踪器][3])
DPoP-bound JWT access token 使用 `cnf.jkt` 表示绑定的 JWK SHA-256 thumbprint；资源服务器必须确认 proof 里的公钥和 token 里的 `cnf.jkt` 匹配。([IETF 数据追踪器][2])

### refresh token

不要用 JWT refresh token。MVP 用 opaque 256-bit random token：

```text
cr_rt_<base64url-32-or-48-bytes>
```

服务端只存：

```text
refresh_token_hash = HMAC-SHA256(server_pepper, raw_refresh_token)
```

绑定字段：

```sql
refresh_grants(
  grant_id,
  family_id,
  device_id,
  user_id,
  jkt,
  current_token_hash,
  rotation_counter,
  status,
  created_at,
  last_used_at,
  idle_expires_at,
  absolute_expires_at,
  revoked_at,
  reuse_detected_at
)
```

Refresh endpoint 必须要求 DPoP proof；否则 stolen refresh token 仍可被抢先使用。

---

## Worker API 请求格式

每个 Worker → Control Plane API 请求：

```http
POST /api/worker/poll HTTP/1.1
Host: cp.example.com
Authorization: DPoP <access_token>
DPoP: <proof_jwt>
```

DPoP proof header：

```json
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
}
```

DPoP proof payload：

```json
{
  "jti": "uuid-or-128-bit-random",
  "htm": "POST",
  "htu": "https://cp.example.com/api/worker/poll",
  "iat": 1710000001,
  "ath": "base64url(sha256(access_token))",
  "nonce": "optional-server-nonce"
}
```

RFC 9449 要求 DPoP proof 是由 client 私钥签名的 JWT；header 至少有 `typ=dpop+jwt`、非对称 `alg`、public `jwk`；payload 至少有 `jti`、`htm`、`htu`、`iat`，访问 protected resource 时还必须有 `ath`。([IETF 数据追踪器][2])

服务端验证顺序：

1. 拒绝多个 `DPoP` header。
2. 解析 proof JWT。
3. 校验 `typ = dpop+jwt`。
4. 拒绝 `alg = none` 或 HMAC 类对称算法。
5. 用 proof header 里的 public JWK 校验签名。
6. 计算 JWK thumbprint，必须等于 access token 的 `cnf.jkt`。
7. 校验 access token 签名、`iss`、`aud`、`exp`、`nbf`、scope。
8. 校验 `htm` 等于 HTTP method。
9. 校验 `htu` 等于当前请求 URI，注意规范化；DPoP 的 `htu` 不含 query 和 fragment。
10. 校验 `ath = base64url(sha256(access_token))`。
11. 校验 `iat` 在允许窗口内。
12. 检查 `jti` replay cache。
13. 检查 device 状态、`device_epoch`、grant 状态。
14. 高风险接口校验 `nonce`。

RFC 9449 对这些校验项有明确要求，包括 method/URI 匹配、nonce 匹配、proof 时间窗口、`ath`、以及 access token 绑定公钥匹配。([IETF 数据追踪器][2])

---

## Replay cache 与 nonce

### replay cache

MVP 单实例自托管可以先用进程内 LRU/TTL cache；多实例必须用 Redis 或等价共享 cache。分布式部署只用内存 cache 会漏掉打到另一个实例的 replay；已有 DPoP 实现文档也把 Redis 作为分布式 replay detection 的典型选择。([Duende Software][4])

建议 key：

```text
dpop:jti:sha256(jkt + "\n" + htm + "\n" + normalized_htu + "\n" + jti)
```

写入方式：

```text
SET key 1 NX EX <proof_max_age + clock_skew + safety_margin>
```

推荐默认值：

| 参数                |                               MVP 默认 |
| ----------------- | -----------------------------------: |
| `proof_max_age`   |                             60–120 秒 |
| clock skew leeway |                                 30 秒 |
| replay cache TTL  |      `proof_max_age + leeway + 10 秒` |
| `jti` 随机性         | 至少 96 bit；建议 UUIDv4 或 128 bit random |

RFC 9449 建议服务器在 proof 可接受时间窗口内保存已见过的 `jti`，同一 URI 上重复出现应拒绝；它也说明 `jti` 可用至少 96 bit 随机数据或 UUIDv4 生成。([IETF 数据追踪器][2])

### nonce

MVP 不需要一开始对所有 GET/long-poll 请求强制 nonce，否则会增加失败重试复杂度。建议：

| endpoint                                            | nonce 策略         |
| --------------------------------------------------- | ---------------- |
| `/api/device/pair/complete`                         | 必须               |
| `/api/oauth/token` / refresh                        | 必须               |
| `/api/devices/*` 管理接口                               | 必须               |
| command mutation / cancel / secret-sensitive action | 必须               |
| telemetry / logs / heartbeat                        | 可选，仅 `jti + iat` |

DPoP nonce 是服务端通过 `DPoP-Nonce` header 给 client 的 opaque 值；client 后续 proof 必须带同一个 nonce。服务端可在 400/401 中返回新 nonce，也可在 200 响应中滚动下发下一次 nonce。([IETF 数据追踪器][2])

---

## Refresh token rotation

Refresh flow：

```http
POST /api/oauth/token
Authorization: DPoP <optional-old-access-token-or-none>
DPoP: <proof_jwt>

grant_type=refresh_token
refresh_token=<raw_refresh_token>
```

服务端事务逻辑：

1. 计算 `hash(raw_refresh_token)`。
2. 查找 `refresh_grants.current_token_hash`。
3. 校验 grant 未过期、未 revoke。
4. 校验 DPoP proof 的 JWK thumbprint 等于 grant 的 `jkt`。
5. 原子更新：

   * `current_token_hash = hash(new_refresh_token)`
   * `rotation_counter += 1`
   * `last_used_at = now`
6. 返回新 access token + 新 refresh token。
7. 旧 refresh token 立即失效。

如果收到已失效 refresh token：

1. 标记 `reuse_detected_at`。
2. revoke 整个 `family_id`。
3. revoke 当前 active refresh token。
4. 将 device 置为 `suspicious` 或直接 `revoked`，取决于策略。
5. 记录高危 audit event。
6. Worker 下次刷新失败后 fail-closed，要求重新 pairing。

OAuth BCP 对 refresh rotation 的语义是：每次 refresh 返回新 refresh token，旧 token 作废；如果旧 refresh token 被再次提交，服务器无法判断攻击者还是合法 client 提交了旧 token，因此应撤销 active refresh token，让合法 client 重新授权。([IETF 数据追踪器][1])
Auth0 的实现文档也采用 token family invalidation；Okta 会在 refresh token reuse detected 时写入系统日志事件。([Auth0][5])

---

## Revocation 设计

MVP 需要四层 revoke：

| 层                                  | 用途                        |
| ---------------------------------- | ------------------------- |
| `device.status = revoked`          | 用户手动 unpair、管理员禁用、异常设备    |
| `refresh_grant.status = revoked`   | 撤销某个 token family         |
| `device_epoch` / `session_version` | 让短期 JWT 在过期前也可被拒绝         |
| signing key rotation               | Control Plane 签名密钥泄露时全局换钥 |

Access token 是短期 JWT 时，纯 JWT 本地验证无法天然做到即时失效。MVP 可选两种方案：

1. **短 TTL + device status cache 查询**：每次 Worker API 验证 JWT 后查 `device.status/device_epoch`，或用 5–30 秒缓存。
2. **opaque access token + introspection**：所有请求查 token state，失效更即时，但实现和性能成本更高。OAuth token introspection 标准就是让资源服务器查询 token active state 和 metadata。([IETF 数据追踪器][6])

Token revocation endpoint 可按 RFC 7009 风格实现；该标准定义了客户端通知授权服务器撤销 access/refresh token 的机制，并允许撤销同一授权 grant 下的相关 token。([IETF 数据追踪器][7])

---

## Worker 本地 fail-closed

Worker 端规则应很硬：

1. 本地没有 private key：拒绝启动 command runner。
2. 本地没有 refresh token：进入 unpaired 状态，只允许 pairing。
3. refresh 失败且错误是 `invalid_grant`、`revoked_device`、`dpop_key_mismatch`、`reuse_detected`：立即停止轮询、清理 access token、要求重新 pairing。
4. Control Plane 不可达：不执行新命令；只允许安全的本地诊断。
5. 本地 policy/cache 只能有短 TTL；不允许无限期 offline allow。
6. Provider secrets 只在 Worker 本地安全存储，Control Plane 不保存、不回传、不记录。
7. 命令执行前再次验证：

   * command `device_id` 等于本机 device id
   * command 未过期
   * command scope 在本机 token/policy 允许范围内
   * 可选：Control Plane 对 command envelope 签名，Worker 校验 CP public key

本地私钥和 refresh token 存储建议使用 OS credential store。Electron `safeStorage` 使用 OS 提供的加密系统保护本地磁盘数据；Rust `keyring` 生态提供跨 macOS、Windows、Unix credential store 的接口。([Electron][8])

---

## 四种方案对比

| 方案                                            | Threat model                                                                | 实现复杂度 | Replay cache / nonce                                   | Rotation                                     | Revocation                                       | 审计成本                                                          | 对 Codex Remote 的判断                       |
| --------------------------------------------- | --------------------------------------------------------------------------- | ----: | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| **标准 DPoP**                                   | 防 access/refresh token 被盗后离机使用；防大部分 HTTP replay；适合 public client 和本地 Worker |     中 | 必须做 `jti` cache；高风险端点加 `DPoP-Nonce`                    | refresh token 仍要 rotation；access token 短 TTL | revoke device/grant；JWT 加 `device_epoch` 查状态     | 中：要记录 proof failure、jti replay、nonce failure、binding mismatch | **MVP 首选**                               |
| **mTLS device certificate**                   | 防 token 被盗；TLS 层证明持有 cert private key；适合企业内网、固定 ingress                     |     高 | 通常不需要 DPoP-style `jti`；但反代转发 client cert metadata 需要严控 | cert 更新会使绑定 token 失效；需要 cert/key rotation    | revoke device/cert/grant；可加 CRL/OCSP 或 DB status | 高：证书签发、过期、TLS failure、反代 header 安全                            | 后续 enterprise / homelab 高安全选项，不建议做唯一 MVP |
| **应用层签名 handshake / HTTP Message Signatures** | 可签 method/path/query/body digest；适合 WebSocket、command envelope、非 OAuth 请求   |   中到高 | 需要 nonce 或 request id cache；canonicalization 要非常严格     | 可绑定 refresh，但要自定义 token 语义                   | 自定义 revoke；必须自己定义错误和审计语义                         | 高：自研协议测试、互操作、规范化风险                                            | 可作为 DPoP 的补充，不建议自创替代 DPoP                |
| **普通 bearer + refresh rotation**              | 只能限制 refresh token 长期滥用；不能阻止 stolen access token 使用                         |     低 | 无 proof replay cache；只能靠短 TTL                          | 必须 rotation + reuse detection                | revoke family/device 简单                          | 低到中：能看到 refresh reuse，但看不到 access token 离机滥用                  | 不满足 “device-bound token”；只可做临时 fallback  |

mTLS 的标准做法是把 access token 绑定到 TLS client certificate，JWT 里用 `cnf.x5t#S256` 表示证书 SHA-256 thumbprint，资源服务器从 TLS 层取 client certificate 并比较 hash；自签证书方式可以不维护完整 PKI，但 TLS termination 到负载均衡/反代后，client cert metadata 如何安全传给应用服务器是 RFC 8705 明确留给部署方解决的问题。([IETF 数据追踪器][9])

HTTP Message Signatures 是标准化的应用层 HTTP 签名方案，可签 `@method`、`@path`、`@query`、`content-digest` 等组件；如果要保护 body，通常用 Digest Fields 的 `Content-Digest` 表示 HTTP message content integrity，再把该 header 纳入签名。([IETF 数据追踪器][10])
但 HTTP Message Signatures 不是 OAuth token binding 方案，token、grant、refresh rotation、`cnf`、resource server 验证语义都要自己定义。

---

## 库选择

### TypeScript / Node.js Control Plane

推荐组合：

| 任务                           | 库                                        |
| ---------------------------- | ---------------------------------------- |
| JWT/JWS/JWK/JWK thumbprint   | `jose`                                   |
| DPoP proof 生成                | `@panva/dpop`                            |
| OAuth client-side primitives | `oauth4webapi`                           |
| Auth0 resource server 场景     | `express-oauth2-jwt-bearer` 可参考其 DPoP 支持 |

`jose` 支持 JWT、JWS、JWE、JWK、JWKS，并面向 Node.js、浏览器、Cloudflare Workers、Deno、Bun 等 Web-interoperable runtime；`@panva/dpop` 提供 DPoP proof generation，并支持浏览器、Bun、Cloudflare Workers、Deno、Electron、Node.js；Auth0 的 Express middleware 也已有 DPoP 验证支持。([GitHub][11])

### Rust Worker

| 任务                  | 库                                     |
| ------------------- | ------------------------------------- |
| Ed25519 signing     | `ed25519-dalek`                       |
| OS credential store | `keyring`                             |
| JOSE/JWT            | `josekit`、`jose-rs`、或项目内固定 JWS subset |

`ed25519-dalek` 是 Rust 的 Ed25519 key generation、signing、verification 实现；Rust `keyring` 提供跨平台 credential store 抽象。([Docs.rs][12])

### Go Worker / Control Plane

| 任务                      | 库                     |
| ----------------------- | --------------------- |
| JOSE/JWT/JWK/JWS        | `lestrrat-go/jwx`     |
| HTTP Message Signatures | `yaronf/httpsign` 可参考 |

`lestrrat-go/jwx` 是 Go 的 JWA/JWE/JWK/JWS/JWT 实现；`httpsign` 明确支持 RFC 9421，并提示 nonce replay prevention 需要调用方用 cache/DB 实现唯一性校验。([GitHub][13])

---

## 推荐默认值

| 项                          | 默认值                                         |
| -------------------------- | ------------------------------------------- |
| pairing code TTL           | 5 分钟                                        |
| pairing code 使用次数          | 1 次                                         |
| access token TTL           | 5 分钟                                        |
| refresh token idle TTL     | 30 天，可配置                                    |
| refresh token absolute TTL | 90 天，可配置                                    |
| DPoP proof max age         | 60–120 秒                                    |
| DPoP clock skew            | 30 秒                                        |
| replay cache               | 单实例内存；多实例 Redis                             |
| high-risk nonce TTL        | 60–120 秒                                    |
| access token alg           | `ES256` 优先；自控端可用 `EdDSA`                    |
| refresh token 存储           | 只存 HMAC/hash，不存明文                           |
| device private key         | Worker 本地生成，OS keychain/credential store 保存 |
| Worker API auth scheme     | 只接受 `DPoP`，不要同时接受 `Bearer`                  |

---

## 最小数据模型

```sql
devices (
  device_id text primary key,
  user_id text not null,
  name text,
  public_jwk jsonb not null,
  jkt text not null unique,
  key_alg text not null,
  status text not null, -- pending, trusted, suspended, revoked
  device_epoch integer not null default 1,
  worker_version text,
  os text,
  hostname text,
  created_at timestamp,
  trusted_at timestamp,
  revoked_at timestamp,
  last_seen_at timestamp
);

pairing_sessions (
  pairing_id text primary key,
  pairing_secret_hash text not null,
  created_by_user_id text not null,
  status text not null, -- pending, consumed, expired
  expires_at timestamp not null,
  consumed_by_device_id text,
  consumed_at timestamp
);

refresh_grants (
  grant_id text primary key,
  family_id text not null,
  device_id text not null references devices(device_id),
  jkt text not null,
  current_token_hash text not null,
  rotation_counter integer not null default 0,
  status text not null, -- active, revoked, reuse_detected
  created_at timestamp,
  last_used_at timestamp,
  idle_expires_at timestamp,
  absolute_expires_at timestamp,
  revoked_at timestamp,
  reuse_detected_at timestamp
);

audit_events (
  event_id text primary key,
  event_type text not null,
  severity text not null,
  user_id text,
  device_id text,
  grant_id text,
  jkt text,
  ip text,
  user_agent text,
  reason text,
  metadata jsonb,
  created_at timestamp not null
);
```

不要把 raw access token、raw refresh token、DPoP proof JWT、provider secrets 写入 audit log。只记录 hash、`jti` hash、`jkt`、失败原因、IP、设备、scope、endpoint、request id。

---

## 必须记录的审计事件

| 事件                               | 严重级别         |
| -------------------------------- | ------------ |
| `pairing.created`                | info         |
| `pairing.completed`              | info         |
| `device.trusted`                 | info         |
| `device.revoked`                 | warning      |
| `access.issued`                  | debug/info   |
| `refresh.rotated`                | info         |
| `refresh.reuse_detected`         | critical     |
| `dpop.replay_detected`           | critical     |
| `dpop.cnf_mismatch`              | critical     |
| `dpop.ath_mismatch`              | high         |
| `dpop.nonce_required`            | info/warning |
| `dpop.nonce_invalid`             | high         |
| `worker.command.accepted`        | info         |
| `worker.command.rejected_policy` | warning      |
| `worker.fail_closed`             | high         |

---

## 关键反模式

1. **把 device-bound token 做成普通 JWT + `device_id` claim**
   这只是“声称来自某设备”，不是绑定。必须有 `cnf.jkt` + private-key proof。

2. **只在 pairing 时签名，后续用 bearer access token**
   这样 access token 泄露后仍可被任何人使用。

3. **refresh token rotation 不做 reuse detection**
   只轮换、不检测旧 token 复用，会失去最重要的入侵信号。

4. **DPoP proof 不做 `jti` replay cache**
   捕获到 access token + proof 的攻击者可在有效窗口内重放同一请求。

5. **mTLS 通过反代 header 传 client cert，但不清洗外部 header**
   如果外部请求能伪造 `X-Forwarded-Client-Cert` 类 header，就等价于绕过 mTLS。

6. **Control Plane 生成 Worker private key**
   这破坏 Worker-generated device key 的信任边界。

7. **把 OpenAI/ChatGPT/provider secrets 放进 Control Plane**
   这会显著扩大 CP compromise 的 blast radius；Codex Remote 的 CP 应只保存自己的 device/token metadata。

---

## 推荐落地顺序

1. **MVP-1：DPoP-compatible Worker API**

   * one-time pairing
   * Worker-generated key
   * access JWT `cnf.jkt`
   * DPoP proof on every Worker API request
   * refresh rotation + reuse detection
   * single-node replay cache

2. **MVP-2：多实例安全**

   * Redis replay cache
   * Redis/DB nonce store
   * device status cache with short TTL
   * audit event pipeline

3. **MVP-3：更强 Worker local security**

   * OS keychain 默认启用
   * TPM/Secure Enclave/Keychain non-exportable key 可选
   * signed command envelope
   * Worker fail-closed hardening

4. **Enterprise option**

   * mTLS device certificate mode
   * Caddy/Envoy/nginx profile
   * cert rotation/revocation tooling
   * optional private CA

最终判断：**Codex Remote 的 MVP 应实现 DPoP-style device-bound access token + DPoP-bound rotating refresh token。mTLS 做高级部署选项；应用层签名用于命令/WS补充；普通 bearer + rotation 不应作为 Worker trust 的主方案。**

[1]: https://datatracker.ietf.org/doc/rfc9700/ "

        RFC 9700 - Best Current Practice for OAuth 2.0 Security

        "
[2]: https://datatracker.ietf.org/doc/html/rfc9449 "

                RFC 9449 - OAuth 2.0 Demonstrating Proof of Possession (DPoP)

        "
[3]: https://datatracker.ietf.org/doc/html/rfc7519 "

                RFC 7519 - JSON Web Token (JWT)

        "
[4]: https://duendesoftware.com/blog/20260202-dpop-security-for-dotnet-apis-with-jwtbearer-extensions-v1?utm_source=chatgpt.com "DPoP Security for .NET APIs with JwtBearer Extensions v1. ..."
[5]: https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation?utm_source=chatgpt.com "Refresh Token Rotation - Auth0 Docs"
[6]: https://datatracker.ietf.org/doc/html/rfc7662?utm_source=chatgpt.com "RFC 7662 - OAuth 2.0 Token Introspection"
[7]: https://datatracker.ietf.org/doc/html/rfc7009?utm_source=chatgpt.com "RFC 7009 - OAuth 2.0 Token Revocation"
[8]: https://electronjs.org/docs/latest/api/safe-storage?utm_source=chatgpt.com "safeStorage"
[9]: https://datatracker.ietf.org/doc/html/rfc8705 "

                RFC 8705 - OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens

        "
[10]: https://datatracker.ietf.org/doc/html/rfc9421 "

                RFC 9421 - HTTP Message Signatures

        "
[11]: https://github.com/panva/jose "GitHub - panva/jose: JWA, JWS, JWE, JWT, JWK, JWKS for Node.js, Browser, Cloudflare Workers, Deno, Bun, and other Web-interoperable runtimes · GitHub"
[12]: https://docs.rs/ed25519-dalek/?utm_source=chatgpt.com "ed25519_dalek - Rust"
[13]: https://github.com/lestrrat-go/jwx?utm_source=chatgpt.com "lestrrat-go/jwx"
