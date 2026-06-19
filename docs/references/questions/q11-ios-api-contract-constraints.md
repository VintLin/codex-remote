---
title: "Q11：iOS API 设计优化"
source_url: "https://chatgpt.com/c/6a34ff0d-0270-83ee-9246-cad4814ef695"
exported_at: "2026-06-19T17:06:15"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

把 `packages/api-contract/openapi.yaml` 当成 **Control Plane API contract**，而不是 Web BFF contract。现在最该避免的是：封闭响应枚举、复杂 `oneOf/anyOf/allOf`、只能靠 SSE/WebSocket 才能拿到的状态、offset 分页、cookie-only / same-origin-only 认证、以及把 QR pairing 当成“扫码即登录”的短路流程。

优先级最高的设计原则：

1. **每个实时事件都必须可重放、可分页、可通过普通 HTTP 拉取。**
2. **所有移动端需要的资源都要是资源模型，不是 dashboard/view-model。**
3. **响应里的状态值要 forward-compatible，不能让旧 Swift client 因新增 enum case 解码失败。**
4. **pairing flow 要像 OAuth device flow 一样：短期、一次性、可轮询、可拒绝、可审计、绑定设备。**
5. **分页和离线缓存都以 server cursor / sync token / resource version 为核心。**

---

## 1. OpenAPI → Swift 类型生成：现在就要保守建模

Apple 的 Swift OpenAPI Generator 会在 build time 从 OpenAPI 生成 Swift client/server 代码，并且生成的 `Client` 会为每个 operation 暴露方法；它支持 OpenAPI 3.0/3.1，对 3.2 仍是 preliminary，支持 streaming body 和 `URLSessionTransport`。这说明 `openapi.yaml` 里的 operation 形状会直接影响未来 iOS SDK 的 API 面。([GitHub][1])

### 现在应预留

* 给所有 operation 写稳定、语义化的 `operationId`，例如 `listRuns`、`getRun`、`cancelRun`、`openEventStream`。不要让 Swift 生成器从路径猜方法名。
* 把 path/tag 分成 `Auth`、`Pairing`、`Devices`、`Runs`、`Workers`、`Events`、`Artifacts`、`Approvals`，不要用 `Dashboard`、`Sidebar`、`Modal` 这类 UI tag。
* 在同一个 OpenAPI 源里允许 Web-only operation，但明确标注，例如：

```yaml
x-client-audience:
  - web
  - worker
  - ios
```

或：

```yaml
x-mobile-visibility: public | hidden | manual
```

未来 iOS 生成时可以按 tag/extension 过滤，仍然保持单一事实源。

### 现在要避免

**避免复杂 `oneOf/anyOf/allOf` 出现在移动端公共响应 DTO。** OpenAPI Generator 的 swift6 feature table 对 `oneOf/anyOf/allOf` 标为不支持；Apple Swift OpenAPI Generator 也有关于 `anyOf/allOf/oneOf` 和 optional/null 表达的开放问题，生成结果可能不如手写 Swift 类型稳定。([OpenAPI Generator][2])

**避免把响应状态做成封闭 enum。** OpenAPI Generator swift6 有 `enumUnknownDefaultCase` 选项，可在服务端新增 enum case 时让旧 client 落到 unknown case；但 Apple Swift OpenAPI Generator 相关 issue 显示目前没有内置 graceful unknown enum case 支持，新增响应枚举值可能导致旧 Swift client 解码失败。([OpenAPI Generator][2])

推荐做法：

```yaml
RunStatus:
  type: string
  description: >
    Known values: queued, running, succeeded, failed, cancelled.
    Clients MUST treat unknown values as displayable but non-terminal unless terminal=true.
  x-extensible-enum:
    - queued
    - running
    - succeeded
    - failed
    - cancelled
```

同时在资源上增加稳定布尔字段，避免 client 必须理解所有状态：

```yaml
Run:
  type: object
  required: [id, status, terminal, createdAt, updatedAt, version]
  properties:
    id:
      $ref: '#/components/schemas/ResourceId'
    status:
      $ref: '#/components/schemas/RunStatus'
    terminal:
      type: boolean
    success:
      type: boolean
      nullable: true
    version:
      $ref: '#/components/schemas/ResourceVersion'
```

**显式声明 `additionalProperties`。** OpenAPI Generator swift6 文档里 `additionalProperties` 的默认行为有兼容性开关，且默认可能保留旧的不合规行为；因此每个 object 都应明确写 `additionalProperties: false`，只有真正需要扩展 map 的对象才设为 `true`。([OpenAPI Generator][2])

```yaml
Run:
  type: object
  additionalProperties: false
```

**避免 Swift 保留字和泛型化名字。** swift6 generator 文档列出了大量 Swift primitive/reserved words，例如 `Response`、`Type`、`Protocol`、`ErrorResponse`、`Optional` 等；schema 名尽量用业务名：`RunProblem`、`WorkerDevice`、`ApprovalRequest`。([OpenAPI Generator][2])

---

## 2. Web-specific contract：保留 Web 快速迭代，但不要污染 Control Plane

当前 Web 为主可以保留聚合接口，但不要让它成为未来 iOS 唯一入口。建议把 API 分三层：

1. **Canonical resource API**：iOS/Web/Worker 都能用，例如 `/runs/{runId}`、`/workers/{workerId}`、`/approvals/{approvalId}`。
2. **Realtime/event API**：只传输 canonical event，不传 UI patch。
3. **Web view-model API**：可选、Web-only，例如 `/web/dashboard-state`，标 `x-client-audience: [web]`。

避免这些字段进入公共 DTO：

```yaml
# 避免
activeTab: logs
sidebarCollapsed: false
toastMessage: ...
cssClass: ...
domId: ...
html: ...
```

替代为能力和状态：

```yaml
capabilities:
  canCancel: true
  canApprove: false
  canAttachDevice: true
requiredAction:
  type: approval_required
```

iOS 不复用 Web runtime，所以 contract 不应暴露“页面怎么画”，只暴露“资源是什么、现在是什么状态、用户能做什么”。

---

## 3. SSE / WebSocket：事件语义必须脱离传输

MDN 对 SSE 的定义是 `EventSource` 打开一个 HTTP 持久连接，服务端用 `text/event-stream` 单向发送事件；SSE 不是双向协议。浏览器 SSE 在 HTTP/1.1 下还有每域连接数限制，多个 tab/多个 run 各开一条 stream 会很快踩坑。([开发者 Mozilla 网文档][3])

### 推荐 contract 形状

保留一个全局事件流，而不是每个 run/worker 一条流：

```yaml
/events:
  get:
    operationId: openEventStream
    tags: [Events]
    parameters:
      - name: Last-Event-ID
        in: header
        required: false
        schema:
          type: string
      - name: since
        in: query
        required: false
        schema:
          $ref: '#/components/schemas/EventCursor'
    responses:
      '200':
        description: Server-sent control-plane events
        content:
          text/event-stream:
            schema:
              type: string
            x-event-schema:
              $ref: '#/components/schemas/ControlEvent'
```

OpenAPI Initiative 的 SSE registry 把 SSE media type 记为 `text/event-stream`，并说明 OAS 3.2 可用 `itemSchema` 描述每个 streamed event；但 Apple Swift generator 对 OAS 3.2 仍是 preliminary，所以如果你现在用 OAS 3.0/3.1，建议用 `x-event-schema` 扩展，同时把 `ControlEvent` 作为普通 component schema 复用。([OpenAPI Initiative Publications][4])

### `ControlEvent` 必须可重放

```yaml
ControlEvent:
  type: object
  additionalProperties: false
  required: [id, type, createdAt, resource, resourceId, resourceVersion]
  properties:
    id:
      $ref: '#/components/schemas/EventId'
    type:
      type: string
      description: Extensible event type, e.g. run.updated, log.appended.
    createdAt:
      type: string
      format: date-time
    resource:
      type: string
      description: runs | workers | approvals | artifacts | devices
    resourceId:
      $ref: '#/components/schemas/ResourceId'
    resourceVersion:
      $ref: '#/components/schemas/ResourceVersion'
    payload:
      type: object
      additionalProperties: true
```

MDN 的 SSE 格式支持 `event`、`data`、`id`、`retry` 字段；`id` 会设置 EventSource 的 last event ID，`retry` 控制重连等待时间。contract 应要求每个业务事件都有稳定 `id`，并支持 `Last-Event-ID` / `since` 重放。([开发者 Mozilla 网文档][5])

### 现在要避免

* 不要让 terminal/log/run 状态只能从 live stream 获取。
* 不要把 WebSocket 子协议作为唯一语义来源。
* 不要用 `[DONE]` 这类非结构化 sentinel 作为唯一结束信号；用 `run.completed`、`stream.closed` 这类 typed event。
* 不要为每个 run 单独开 SSE。用一个 account/device scoped stream，再用 `resource`、`resourceId` 过滤。

为离线/断线补齐：

```yaml
/runs/{runId}/events:
  get:
    operationId: listRunEvents
    parameters:
      - name: after
        in: query
        schema:
          $ref: '#/components/schemas/EventCursor'
      - name: limit
        in: query
        schema:
          type: integer
          minimum: 1
          maximum: 500
```

---

## 4. SSE 认证：不要被浏览器 EventSource 绑死

Web 的原生 `EventSource` 构造器主要接收 URL 和 `withCredentials` 选项；WHATWG 有长期 issue 讨论 EventSource 无法设置 `Authorization` 等自定义 header。iOS 的 `URLSession` 则没有这个 Web API 限制。([开发者 Mozilla 网文档][5])

### 推荐 contract

公共 Control Plane API 统一支持 header bearer auth：

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

如果当前 Web 必须用原生 EventSource 且不能带 header，不要把 cookie-only 变成唯一 contract。加一个短期 stream ticket：

```yaml
/event-stream-tickets:
  post:
    operationId: createEventStreamTicket
    security:
      - bearerAuth: []
    responses:
      '201':
        content:
          application/json:
            schema:
              type: object
              required: [ticket, expiresAt]
              properties:
                ticket:
                  type: string
                  description: One-time, short-lived, stream-only credential.
                expiresAt:
                  type: string
                  format: date-time
```

然后：

```yaml
/events:
  get:
    parameters:
      - name: ticket
        in: query
        required: false
        schema:
          type: string
```

约束：ticket 只能用于 `/events`，一次性，短 TTL，不授予 refresh 权限，服务端日志中必须脱敏。iOS 仍使用 `Authorization: Bearer ...`。

---

## 5. iOS background networking：不要把长连接当后台能力

Apple 的 URLSession 可恢复下载要求 HTTP GET、服务端支持 `Accept-Ranges`，并提供 `ETag` 或 `Last-Modified`；Apple 也明确说明 background URLSession 适合大文件上传/下载，任务可在 app suspended/terminated 后由系统继续。([Apple Developer][6])

这意味着 iOS 后台可靠能力应设计成 **文件传输 + 之后同步状态**，而不是“后台保持 WebSocket/SSE 在线”。Apple 对 background push 也说明它是低优先级刷新手段，不保证投递。([Apple Developer][7])

### 现在 contract 要预留

Artifact 下载：

```yaml
/artifacts/{artifactId}/download:
  get:
    operationId: downloadArtifact
    parameters:
      - name: Range
        in: header
        required: false
        schema:
          type: string
    responses:
      '200':
        headers:
          ETag:
            schema: { type: string }
          Accept-Ranges:
            schema: { type: string }
          Content-Length:
            schema: { type: integer, format: int64 }
        content:
          application/octet-stream:
            schema:
              type: string
              format: binary
      '206':
        description: Partial content
```

Artifact 元数据：

```yaml
Artifact:
  type: object
  required: [id, runId, filename, sizeBytes, contentType, checksum, createdAt]
  properties:
    id: { $ref: '#/components/schemas/ResourceId' }
    runId: { $ref: '#/components/schemas/ResourceId' }
    filename: { type: string }
    sizeBytes: { type: integer, format: int64 }
    contentType: { type: string }
    checksum:
      type: object
      required: [algorithm, value]
      properties:
        algorithm: { type: string }
        value: { type: string }
```

上传不要走 base64 JSON。Apple 文档搜索结果明确指出，background upload 只支持 file-backed upload task，data/stream upload 在 app 退出后会失败；所以 contract 应支持 upload session、file upload URL、required headers、checksum、idempotency key。([Apple Developer][8])

```yaml
/uploads:
  post:
    operationId: createUpload
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required: [purpose, filename, sizeBytes, contentType]
            properties:
              purpose:
                type: string
                description: workspace-archive | run-input | artifact
              filename:
                type: string
              sizeBytes:
                type: integer
                format: int64
              contentType:
                type: string
    responses:
      '201':
        content:
          application/json:
            schema:
              type: object
              required: [uploadId, method, uploadUrl, requiredHeaders, expiresAt]
              properties:
                uploadId: { $ref: '#/components/schemas/ResourceId' }
                method: { type: string, enum: [PUT, POST] }
                uploadUrl: { type: string }
                requiredHeaders:
                  type: object
                  additionalProperties:
                    type: string
                expiresAt:
                  type: string
                  format: date-time
```

---

## 6. QR / one-time token pairing：按 device flow 思路设计，但更严格

RFC 8628 的 OAuth Device Authorization Grant 定义了 `device_code`、`user_code`、`verification_uri`、`verification_uri_complete`、`expires_in`、`interval`，并要求客户端按 interval 轮询；它还说明 `verification_uri_complete` 可用 QR/NFC 做非文本传输。([IETF Datatracker][9])

但 RFC 8628 也明确说 device flow 不推荐替代智能手机原生 app 的浏览器授权流程；有能力打开浏览器的 native app 应参考 OAuth 2.0 for Native Apps。对 Codex Remote 的场景，QR 更适合“把 iOS 设备加入一个已登录 Web 控制台/自托管实例”，不应替代所有登录方式。([IETF Datatracker][9])

### 推荐 pairing API

```yaml
/pairing/sessions:
  post:
    operationId: createPairingSession
    security:
      - bearerAuth: []
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              requestedScopes:
                type: array
                items: { type: string }
    responses:
      '201':
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PairingSession'

PairingSession:
  type: object
  additionalProperties: false
  required:
    - id
    - userCode
    - verificationUri
    - qrPayload
    - expiresAt
    - pollIntervalSeconds
    - serverId
  properties:
    id: { $ref: '#/components/schemas/ResourceId' }
    userCode: { type: string }
    verificationUri: { type: string }
    qrPayload:
      type: string
      description: Signed, one-time, short-lived pairing payload.
    expiresAt:
      type: string
      format: date-time
    pollIntervalSeconds:
      type: integer
      minimum: 1
    serverId:
      type: string
    serverDisplayName:
      type: string
    serverPublicKeyFingerprint:
      type: string
```

iOS 扫码后不要直接得到 refresh token。流程应是：

1. Web 已登录用户创建 pairing session。
2. iOS 扫 QR，得到 `pairingSessionId`、一次性 token、server id/base URL/fingerprint。
3. iOS 生成 device public key，调用 `/pairing/sessions/{id}/claim`。
4. Web 页面显示 iOS device name、平台、确认码、请求 scopes。
5. 用户 approve。
6. iOS 轮询 `/pairing/sessions/{id}/token`，拿到 device-bound refresh token。

```yaml
/pairing/sessions/{pairingSessionId}/claim:
  post:
    operationId: claimPairingSession
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required: [oneTimeToken, deviceName, devicePublicKey, confirmationCode]
            properties:
              oneTimeToken: { type: string }
              deviceName: { type: string }
              devicePublicKey: { type: string }
              confirmationCode: { type: string }

/pairing/sessions/{pairingSessionId}/approve:
  post:
    operationId: approvePairingSession
    security:
      - bearerAuth: []
```

### 安全重点

跨设备 QR/user-code flow 的根本问题是 initiating device 与 authenticating device 之间的信道未认证，攻击者可以复制 QR 或 user code 并换上下文诱导用户授权；IETF cross-device security draft 把这一点列为核心风险，并建议减少用户判断负担、提供更好上下文、建立 proximity。([IETF Datatracker][10])

Proofpoint 在 2025/2026 的报告里记录了 OAuth device code phishing 的快速增长，攻击者会用合法的设备授权页面诱导用户输入 code，成功后可导致账户接管、数据外泄和横向移动。([Proofpoint][11])

所以 contract 里应强制这些字段/机制：

* `expiresAt`：短 TTL。
* `pollIntervalSeconds`：服务端控制轮询频率。
* `attemptsRemaining` 或 rate-limit error。
* `deviceName`、`devicePlatform`、`devicePublicKeyFingerprint`。
* `serverId`、`serverDisplayName`、`serverPublicKeyFingerprint`。
* `confirmationCode`：Web 和 iOS 同时显示，用户确认一致。
* `scopes`：最小权限，不要默认 full admin。
* `approvedByUserId`、`approvedAt`、`ipHint`、`auditId`。
* `revokedAt` 和 device revoke endpoint。

RFC 8628 还特别建议在 remote phishing 防护中显示设备信息，让用户确认正在授权的设备确实在自己手上；使用 QR 优化时更要确认同一 code 正显示在设备上。([IETF Datatracker][9])

---

## 7. Token、安全存储、设备生命周期

iOS 应把 refresh token、device private key、server fingerprint 这类短小敏感数据放 Keychain；Apple Platform Security 说明 Keychain 用于密码、keys、login tokens 等短小敏感数据，并说明 Keychain secret value 受独立密钥保护。([苹果支持][12])

OAuth 2.0 Security BCP RFC 9700 要求 public client 的 refresh token 使用 sender-constraining 或 refresh token rotation；它也建议用 mTLS 或 DPoP 防止 stolen/leaked access token replay，并限制 access token 的 scope/audience。([IETF Datatracker][13])

### contract 要预留

```yaml
/auth/refresh:
  post:
    operationId: refreshToken
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required: [refreshToken]
            properties:
              refreshToken:
                type: string
              deviceKeyProof:
                type: string
                description: Optional DPoP-like proof or signed nonce.
    responses:
      '200':
        content:
          application/json:
            schema:
              type: object
              required: [accessToken, expiresIn, tokenType]
              properties:
                accessToken: { type: string }
                refreshToken:
                  type: string
                  description: Present when refresh token rotation is enabled.
                expiresIn: { type: integer }
                tokenType: { type: string, enum: [Bearer] }
                scope:
                  type: array
                  items: { type: string }

/devices:
  get:
    operationId: listDevices

/devices/{deviceId}/revoke:
  post:
    operationId: revokeDevice
```

避免：

* QR payload 里放 refresh token。
* access token 出现在 redirect URL fragment 或 query。
* iOS 只能靠 cookie session。
* token 没有 device id / scope / audience。
* 无法撤销单台设备。

RFC 9700 也建议 public clients 使用 PKCE，并明确不应使用 implicit grant，因为 access token 在授权响应中暴露会增加泄漏与 replay 风险。([IETF Datatracker][13])

---

## 8. 离线缓存与同步：把“事件流”和“列表”接到同一个版本序列

iOS 离线时至少要缓存 run 列表、worker 列表、最近事件、artifact 元数据、approval 状态。contract 里每个可缓存资源都应有：

```yaml
ResourceBase:
  type: object
  required: [id, createdAt, updatedAt, version]
  properties:
    id:
      $ref: '#/components/schemas/ResourceId'
    createdAt:
      type: string
      format: date-time
    updatedAt:
      type: string
      format: date-time
    version:
      $ref: '#/components/schemas/ResourceVersion'
    deletedAt:
      type: string
      format: date-time
      nullable: true
```

HTTP 自身已有条件请求语义：`If-None-Match` 用于 conditional GET 以便缓存高效更新，服务端可返回 `304 Not Modified`；`If-Match` 常用于 state-changing 方法，防止并发客户端造成 lost update。([IETF Datatracker][14])

### 推荐 sync endpoint

```yaml
/sync:
  get:
    operationId: syncChanges
    parameters:
      - name: since
        in: query
        required: false
        schema:
          $ref: '#/components/schemas/SyncToken'
      - name: limit
        in: query
        schema:
          type: integer
          minimum: 1
          maximum: 1000
    responses:
      '200':
        content:
          application/json:
            schema:
              type: object
              required: [changes, nextSyncToken, hasMore]
              properties:
                changes:
                  type: array
                  items:
                    $ref: '#/components/schemas/SyncChange'
                nextSyncToken:
                  $ref: '#/components/schemas/SyncToken'
                hasMore:
                  type: boolean
                resetRequired:
                  type: boolean
```

```yaml
SyncChange:
  type: object
  additionalProperties: false
  required: [changeId, type, resource, resourceId, resourceVersion, changedAt]
  properties:
    changeId:
      $ref: '#/components/schemas/EventId'
    type:
      type: string
      description: upsert | delete
    resource:
      type: string
    resourceId:
      $ref: '#/components/schemas/ResourceId'
    resourceVersion:
      $ref: '#/components/schemas/ResourceVersion'
    changedAt:
      type: string
      format: date-time
    data:
      type: object
      additionalProperties: true
```

关键约束：SSE `ControlEvent.id`、`SyncChange.changeId`、列表分页的 `syncWatermark` 尽量来自同一服务端序列。这样 iOS 断线后可以用 `Last-Event-ID` 或 `/sync?since=` 补洞，而不是猜测本地状态。

避免：

* 只提供 `/dashboard` 快照，没有 `/sync`。
* 只提供 live stream，没有 replay API。
* 用客户端时间 `updatedSince=2026-...` 做唯一同步游标。
* 删除资源直接消失，没有 tombstone。

---

## 9. 分页：不要 offset/page number，统一 opaque cursor

JSON:API cursor pagination profile 使用 `page[size]`、`page[after]`、`page[before]`，并要求服务端有 default/max page size；Stripe 的 list API 也使用 cursor-based pagination，通过 `limit`、`starting_after`、`ending_before` 和 `has_more` 遍历列表。([JSON:API][15])

对 Codex Remote，run、logs、events、artifacts、audit records 都会持续变化。offset 分页在这种列表里容易出现重复/漏项。建议统一：

```yaml
PageRequest:
  parameters:
    - name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 200
    - name: after
      in: query
      schema:
        $ref: '#/components/schemas/PageCursor'
    - name: before
      in: query
      schema:
        $ref: '#/components/schemas/PageCursor'
```

```yaml
PageMeta:
  type: object
  additionalProperties: false
  required: [hasMore]
  properties:
    nextCursor:
      $ref: '#/components/schemas/PageCursor'
    prevCursor:
      $ref: '#/components/schemas/PageCursor'
    hasMore:
      type: boolean
    syncWatermark:
      $ref: '#/components/schemas/SyncToken'
```

```yaml
ListRunsResponse:
  type: object
  additionalProperties: false
  required: [items, page]
  properties:
    items:
      type: array
      items:
        $ref: '#/components/schemas/Run'
    page:
      $ref: '#/components/schemas/PageMeta'
```

规则：

* `cursor` 是 opaque string，不暴露 offset。
* 默认排序必须稳定，例如 `createdAt desc, id desc`。
* `totalCount` 只能 optional/approximate，不能让客户端依赖它判断结束。
* `limit` 有服务端 max。
* 同一类列表统一字段名：`items + page.nextCursor + page.hasMore`。

---

## 10. 错误模型：用机器可处理的标准形状

RFC 9457 定义了 HTTP API 的 Problem Details，用机器可读结构表达错误，避免每个 API 自造错误格式；它也取代了 RFC 7807。([RFC Editor][16])

建议全局错误响应使用 `application/problem+json`，并扩展 `code`、`requestId`、`retryAfterSeconds`、`violations`：

```yaml
Problem:
  type: object
  additionalProperties: true
  required: [type, title, status, code, requestId]
  properties:
    type:
      type: string
    title:
      type: string
    status:
      type: integer
    detail:
      type: string
    instance:
      type: string
    code:
      type: string
      description: Stable machine-readable error code.
    requestId:
      type: string
    retryAfterSeconds:
      type: integer
    violations:
      type: array
      items:
        type: object
        required: [field, message]
        properties:
          field: { type: string }
          message: { type: string }
```

移动端尤其需要稳定 `code`，不要靠英文 `message` 判断逻辑。

---

## 11. 现在可以直接落到 `openapi.yaml` 的 checklist

**P0：立刻做**

* 所有 public resource schema 增加 `id`、`createdAt`、`updatedAt`、`version`。
* 所有 object 明确 `additionalProperties`。
* 响应里的 server-controlled status/type 不用封闭 enum；改成 extensible string + 稳定辅助字段。
* 新增统一 `PageMeta`、`PageCursor`，把 list 接口从 offset/page 改成 cursor。
* 新增 `/events` + `/runs/{id}/events` replay；不要只有 live stream。
* 新增 `/sync`，让 iOS 能离线补洞。
* 新增 `PairingSession`、`Device`、`TokenResponse`、`DeviceRevoke` schema。
* 全局错误改成 `Problem`。
* 所有 mutation 支持 `Idempotency-Key` 或 body 内 `clientMutationId`。
* CI 里跑 Swift OpenAPI Generator 编译一个最小 iOS client target；至少确保 schema 能生成、能 decode 示例。

**P1：近期做**

* 增加 `GET /instance` 或 `/.well-known/codex-remote`：

```yaml
InstanceInfo:
  type: object
  required: [serverId, apiVersion, features, auth, pairing]
  properties:
    serverId: { type: string }
    displayName: { type: string }
    apiVersion: { type: string }
    features:
      type: array
      items: { type: string }
    eventTransports:
      type: array
      items:
        type: string
        description: sse | websocket | polling
    maxPageSize:
      type: integer
    auth:
      type: object
      additionalProperties: true
    pairing:
      type: object
      additionalProperties: true
```

* 把 Web-only endpoint 标注 `x-client-audience: [web]`。
* Artifact download/upload 改成 background-friendly binary/file transfer，不走 base64 JSON。
* SSE auth 增加 header bearer + 可选短期 stream ticket。
* 为每个 endpoint 加 `ETag`/`If-None-Match` 或明确 `Cache-Control: no-store`。

**P2：iOS 开始前必须做**

* 选定 Swift generator 策略：Apple Swift OpenAPI Generator 优先，必要时对 SSE/WebSocket 做 manual adapter，只复用 DTO。
* 建立 API compatibility tests：旧 Swift client 解码新响应、新 event type、新 status。
* 增加 device-bound refresh token rotation / revoke。
* 增加 pairing audit log 和 suspicious pairing rejection。
* 将 Web dashboard aggregation 从 mobile public tag 中剥离。

---

## 推荐的 contract 方向

`openapi.yaml` 继续做唯一事实源，但逻辑上分层：

```text
components/schemas     Canonical DTO，Web/iOS/Worker 共享
paths /runs            资源 API
paths /events          实时 API，可重放
paths /sync            离线补洞 API
paths /pairing         设备加入 API
paths /devices         设备生命周期 API
paths /artifacts       background-friendly 文件 API
paths /web/*           Web-only view-model，显式隐藏于 iOS 生成
```

最重要的一条：**不要让未来 iOS app 去“模拟 Web 控制台”。让 Web 控制台和 iOS 都消费同一组 Control Plane 资源、事件、分页、同步、pairing 和 auth 原语。**

[1]: https://github.com/apple/swift-openapi-generator "GitHub - apple/swift-openapi-generator: Generate Swift client and server code from an OpenAPI document. · GitHub"
[2]: https://openapi-generator.tech/docs/generators/swift6/ "Documentation for the swift6 Generator | OpenAPI Generator"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/EventSource "EventSource - Web APIs | MDN"
[4]: https://spec.openapis.org/registry/media-type/sse "Sse"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events "Using server-sent events - Web APIs | MDN"
[6]: https://developer.apple.com/videos/play/wwdc2023/10006/ "Build robust and resumable file transfers - WWDC23 - Videos - Apple Developer"
[7]: https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app?utm_source=chatgpt.com "Pushing background updates to your App"
[8]: https://developer.apple.com/documentation/Foundation/downloading-files-in-the-background?utm_source=chatgpt.com "Downloading files in the background"
[9]: https://datatracker.ietf.org/doc/html/rfc8628 "

                RFC 8628 - OAuth 2.0 Device Authorization Grant

        "
[10]: https://datatracker.ietf.org/doc/draft-ietf-oauth-cross-device-security/00/ "

        draft-ietf-oauth-cross-device-security-00 - Cross-Device Flows: Security Best Current Practice

        "
[11]: https://www.proofpoint.com/us/blog/threat-insight/access-granted-phishing-device-code-authorization-account-takeover "Access granted: phishing with device code authorization for account takeover | Proofpoint US"
[12]: https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web "Keychain data protection - Apple Support"
[13]: https://datatracker.ietf.org/doc/rfc9700/ "

        RFC 9700 - Best Current Practice for OAuth 2.0 Security

        "
[14]: https://datatracker.ietf.org/doc/html/rfc9110 "

                RFC 9110 - HTTP Semantics

        "
[15]: https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ "JSON API — “Cursor Pagination” Profile"
[16]: https://www.rfc-editor.org/info/rfc9457/?utm_source=chatgpt.com "RFC 9457: Problem Details for HTTP APIs"
