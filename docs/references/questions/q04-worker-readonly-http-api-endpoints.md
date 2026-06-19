---
title: "Q4：Worker read-only API 设计"
source_url: "https://chatgpt.com/c/6a34fdb5-6e10-83ee-ac67-eb5df786055f"
exported_at: "2026-06-19T17:06:37"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

Worker read-only HTTP API MVP 建议只定义 **5 个 GET 端点**：

```text
GET /v1/worker/health
GET /v1/worker/capabilities
GET /v1/worker/probe
GET /v1/conversations
GET /v1/conversations/{conversationId}/timeline
```

这组端点覆盖当前 read-only MVP 的全部能力：Worker 状态、Worker 能力、主动诊断、会话列表、会话时间线读取。不要在 MVP 中定义 `/threads`、`/models`、`/rpc`、`/app-server/*`、`/turns/start`、`/approvals/*`、`/devices/*`、`/workers/{id}`、stream/SSE/WebSocket/write 类端点。

设计依据是：上游 `codex app-server` 仍属于 experimental，本身面向 stdio/WebSocket/Unix socket 调试和本地开发；Worker 应把它封装成稳定 HTTP 资源 API，而不是把 JSON-RPC 方法透传给 Web/iOS。OpenAI 文档也标注 `codex app-server` 为 experimental，并说明它用于本地开发或调试传输层。([OpenAI 开发者][1]) OpenAPI 应继续作为唯一事实源，因为 OAS 的目标就是让消费者无需读取源码或抓包即可理解 HTTP API。([OpenAPI Initiative Publications][2])

---

## 1. 端点设计

| Endpoint                                          |                                       Response schema | 上游映射                                                  | 是否 MVP 必需 | 说明                                                               |
| ------------------------------------------------- | ----------------------------------------------------: | ----------------------------------------------------- | --------: | ---------------------------------------------------------------- |
| `GET /v1/worker/health`                           |                                        `WorkerHealth` | 可不触发深度 app-server 扫描；最多做轻量连接/缓存状态                     |         是 | 便宜、快速、可被 Control Plane 当 heartbeat/readiness 使用                  |
| `GET /v1/worker/capabilities`                     |                                  `WorkerCapabilities` | `initialize` + 可选 `model/list`                        |         是 | 告诉前端当前 Worker 支持哪些 read-only 资源、限制、模型摘要、禁用能力                     |
| `GET /v1/worker/probe`                            |                                  `WorkerProbeSummary` | `initialize`、`model/list`、`thread/list`、`thread/read` |         是 | 主动诊断，不返回原始 JSON-RPC payload，只返回规范化检查结果                           |
| `GET /v1/conversations`                           | `ConversationTimelinePage` 或新增 `ConversationListPage` | `thread/list`                                         |         是 | 会话/线程列表，暴露为 `conversation`，不要把 app-server 的 `thread` 命名泄露成公共 API |
| `GET /v1/conversations/{conversationId}/timeline` |   `ConversationTimeline` 或 `ConversationTimelinePage` | `thread/read { includeTurns: true }`                  |         是 | 读取单个会话时间线，不 resume，不创建 turn，不订阅 stream                           |

`thread/list` 已支持 cursor 分页、`limit`、`sortKey`、`sortDirection`、`modelProviders`、`sourceKinds`、`archived`、`cwd`、`searchTerm` 等过滤；返回 `nextCursor` 和 `backwardsCursor`。([GitHub][3]) `thread/read` 可以按 id 读取存储线程而不 resume，并可用 `includeTurns` 读取历史 turns。([GitHub][3]) `model/list` 可列出可用模型及 reasoning effort、service tier 等元数据，但 MVP 不需要单独暴露 `/models`，放进 capabilities/probe 即可。([GitHub][3])

---

## 2. 为什么全部用 GET

MVP 是 read-only，所以 HTTP 层也应尽量保持资源读取语义。RFC 9110 将 safe method 定义为客户端不请求也不期待服务端资源状态变化，`GET` 属于 safe 且 idempotent；`GET` 的请求体没有通用语义，可能被实现拒绝，所以查询条件应放 query string，不要用 GET body。([IETF Datatracker][4])

`GET /v1/worker/probe` 虽然会主动调用上游检查，但它不创建会话、不写配置、不启动 turn、不批准操作；它只是返回“当前 Worker 对上游 read-only 能力的诊断表示”。当前没有 DB，也不记录 probe run，因此不建议做成 `POST /probe/run`。

---

## 3. 推荐路径命名策略

当前单机 Worker 不要实现多设备路由，因此不要做：

```text
/v1/devices/{deviceId}/...
/v1/workers/{workerId}/...
```

但 payload 和资源尾路径要适合未来 Control Plane 复用。未来 Control Plane 可以把同一组资源挂载成：

```text
GET /v1/workers/{workerId}/health
GET /v1/workers/{workerId}/capabilities
GET /v1/workers/{workerId}/probe
GET /v1/workers/{workerId}/conversations
GET /v1/workers/{workerId}/conversations/{conversationId}/timeline
```

当前 Worker 只实现本地版本：

```text
GET /v1/worker/health
GET /v1/worker/capabilities
GET /v1/worker/probe
GET /v1/conversations
GET /v1/conversations/{conversationId}/timeline
```

关键点：**不要把 `conversationId` 命名成 `threadId`**。当前它可以直接等于 app-server thread id，但 API contract 中必须声明为 opaque id。未来 Control Plane 可以把它包装成 `{workerId}:{threadId}`、ULID、数据库 id 或加密 cursor，而前端不需要改逻辑。

---

## 4. Endpoint payload 设计

### 4.1 `GET /v1/worker/health`

用途：快速判断 Worker HTTP 服务和 Codex app-server 依赖是否可用。不要扫描 thread history，不要调用昂贵 read。

建议 response：

```json
{
  "status": "ok",
  "checkedAt": "2026-06-19T03:20:00Z",
  "worker": {
    "id": "local",
    "version": "0.1.0",
    "apiVersion": "v1",
    "readOnly": true
  },
  "appServer": {
    "status": "reachable",
    "transport": "stdio",
    "initialized": true,
    "platformFamily": "unix",
    "platformOs": "darwin"
  }
}
```

状态建议：

```text
ok         Worker 和 app-server 均可读
degraded   Worker 可用，但 app-server 部分检查失败或能力未知
unavailable Worker 可用但 app-server 不可达
```

`initialize` 是 app-server 连接后的必需握手；上游文档说明每个连接必须先发送一次 `initialize`，并且返回 user agent、`codexHome`、platform family/os 等运行时信息。([GitHub][3]) Health 可以使用该信息，但不要默认暴露完整本地路径；`codexHome` 这类字段更适合 probe/capabilities 的 redacted debug 字段。

---

### 4.2 `GET /v1/worker/capabilities`

用途：让 Web/iOS 知道当前 Worker 支持哪些资源和限制。它是未来 Control Plane 做 worker discovery 的核心 payload。

建议 response：

```json
{
  "worker": {
    "id": "local",
    "apiVersion": "v1",
    "version": "0.1.0",
    "readOnly": true
  },
  "capabilities": {
    "health": true,
    "probe": true,
    "conversationList": true,
    "conversationTimelineRead": true,
    "modelCatalogRead": true,

    "stream": false,
    "write": false,
    "approval": false,
    "multiDeviceRouting": false,
    "dbPersistence": false,
    "rawAppServerProtocol": false
  },
  "limits": {
    "conversationListDefaultLimit": 25,
    "conversationListMaxLimit": 49,
    "timelineDefaultEventLimit": 200,
    "timelineMaxEventLimit": 1000
  },
  "appServer": {
    "status": "reachable",
    "protocol": "codex-app-server-v2",
    "experimentalApiEnabled": false
  },
  "models": {
    "available": true,
    "count": 12
  }
}
```

`model/list` 的细节可以很大，MVP 不必暴露完整模型 catalog；只要 capabilities 里说明“模型目录可读”和摘要即可。等到未来 write/create-turn UI 需要选择模型时，再新增 `GET /v1/models`。

`experimentalApiEnabled` 建议默认 `false`。上游 `thread/turns/list` 虽然非常适合分页读取历史，但它需要 `capabilities.experimentalApi = true`；MVP 不应把核心功能建立在 experimental method 上。([GitHub][3])

---

### 4.3 `GET /v1/worker/probe`

用途：主动诊断 Worker 到 app-server 的 read-only 链路。它可以比 health 慢，但返回结构化检查结果，便于本地调试和未来 Control Plane 展示设备健康详情。

建议 query：

```text
checks=initialize,models,conversationList,conversationRead
sampleConversationId=...
timeoutMs=5000
```

建议 response：

```json
{
  "status": "ok",
  "startedAt": "2026-06-19T03:20:00Z",
  "finishedAt": "2026-06-19T03:20:01Z",
  "durationMs": 832,
  "checks": [
    {
      "name": "initialize",
      "status": "pass",
      "durationMs": 41
    },
    {
      "name": "models",
      "status": "pass",
      "durationMs": 95
    },
    {
      "name": "conversationList",
      "status": "pass",
      "durationMs": 301,
      "summary": {
        "itemsReturned": 25,
        "hasNextPage": true
      }
    },
    {
      "name": "conversationRead",
      "status": "pass",
      "durationMs": 252,
      "summary": {
        "conversationId": "conv_opaque",
        "eventsReturned": 80
      }
    }
  ]
}
```

probe 的检查名应使用公共 API 语言，例如 `conversationList`，不要暴露 `thread/list` 这类上游方法名。`ProbeCheckResult` 里可以保留 `upstreamErrorCode` 供调试，但不要返回原始 JSON-RPC request/response。

---

### 4.4 `GET /v1/conversations`

用途：列出会话摘要，供 Web/iOS 左侧列表或首页使用。内部映射 `thread/list`。

建议 query：

```text
cursor          opaque cursor
limit           default 25, max from WorkerCapabilities
sort            recencyAt | updatedAt | createdAt
order           desc | asc
archived        default false
cwd             repeatable; e.g. ?cwd=/repo/a&cwd=/repo/b
search          title/preview search term
```

建议 response：

```json
{
  "data": [
    {
      "conversationId": "conv_opaque_1",
      "title": "Fix tests",
      "preview": "Fix tests",
      "status": {
        "type": "notLoaded"
      },
      "createdAt": "2026-06-18T10:15:00Z",
      "updatedAt": "2026-06-18T10:20:00Z",
      "recencyAt": "2026-06-18T10:20:00Z",
      "modelProvider": "openai",
      "cwd": "/Users/me/project",
      "archived": false
    }
  ],
  "nextCursor": "opaque-token-or-null",
  "backwardsCursor": "opaque-token-or-null"
}
```

如果现有 `ConversationTimelinePage` 已经是“会话列表页”，直接复用它。如果它现在表示“单个会话的事件分页”，建议新增一个很小的 `ConversationListPage`，不要让同一个 `*Page` schema 同时表示“会话列表分页”和“事件分页”。

实现细节建议：MVP 默认 `limit=25`。近期有用户报告 `thread/list` 在某些 Codex App / app-server 版本中使用 `useStateDbOnly: true` 且 `limit >= 50` 时返回空列表；因此 Worker 不应把 `useStateDbOnly` 暴露成公共参数，MVP 可将 list max limit 暂时设为 49，并通过 `WorkerCapabilities.limits` 公告。这个 issue 是用户报告，不应当作长期规范，但足够支持保守默认。([GitHub][5])

---

### 4.5 `GET /v1/conversations/{conversationId}/timeline`

用途：读取单个会话时间线。内部映射 `thread/read { includeTurns: true }`，不 resume，不订阅，不创建 turn。

建议 query：

```text
cursor          optional; opaque event cursor
limit           default 200
order           asc | desc, default asc for timeline rendering
eventView       summary | full, default summary
```

建议 response：

```json
{
  "conversation": {
    "conversationId": "conv_opaque_1",
    "title": "Fix tests",
    "status": {
      "type": "notLoaded"
    },
    "createdAt": "2026-06-18T10:15:00Z",
    "updatedAt": "2026-06-18T10:20:00Z",
    "modelProvider": "openai",
    "cwd": "/Users/me/project"
  },
  "events": [
    {
      "eventId": "evt_opaque_1",
      "conversationId": "conv_opaque_1",
      "kind": "user_message",
      "role": "user",
      "text": "Fix the failing tests",
      "createdAt": "2026-06-18T10:15:00Z"
    },
    {
      "eventId": "evt_opaque_2",
      "conversationId": "conv_opaque_1",
      "kind": "assistant_message",
      "role": "assistant",
      "text": "I’ll inspect the test failure...",
      "createdAt": "2026-06-18T10:15:05Z"
    }
  ],
  "nextCursor": null,
  "backwardsCursor": null
}
```

`ConversationEvent.kind` 建议保持产品语义，而不是上游 item 名称。MVP 可先支持这些最小事件类型：

```text
user_message
assistant_message
reasoning_summary
tool_call
tool_result
system_event
error
```

`tool_call` / `tool_result` 只做 read-only 展示；不要加入 approve、retry、interrupt、resume、write 等动作字段。

---

## 5. OpenAPI path skeleton

可按下面形状落到 `packages/api-contract/openapi.yaml`。具体 `$ref` 名称按你现有 components 调整。

```yaml
paths:
  /v1/worker/health:
    get:
      operationId: getWorkerHealth
      tags: [Worker]
      summary: Read local worker health
      responses:
        "200":
          description: Worker health
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WorkerHealth"
        "503":
          $ref: "#/components/responses/Problem"

  /v1/worker/capabilities:
    get:
      operationId: getWorkerCapabilities
      tags: [Worker]
      summary: Read local worker capabilities
      responses:
        "200":
          description: Worker capabilities
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WorkerCapabilities"
        "503":
          $ref: "#/components/responses/Problem"

  /v1/worker/probe:
    get:
      operationId: getWorkerProbe
      tags: [Worker]
      summary: Run read-only worker diagnostics
      parameters:
        - name: checks
          in: query
          required: false
          schema:
            type: string
          description: Comma-separated check names.
        - name: sampleConversationId
          in: query
          required: false
          schema:
            type: string
        - name: timeoutMs
          in: query
          required: false
          schema:
            type: integer
            minimum: 100
            maximum: 30000
      responses:
        "200":
          description: Probe summary
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WorkerProbeSummary"
        "503":
          $ref: "#/components/responses/Problem"
        "504":
          $ref: "#/components/responses/Problem"

  /v1/conversations:
    get:
      operationId: listConversations
      tags: [Conversations]
      summary: List read-only conversation timelines
      parameters:
        - name: cursor
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 49
            default: 25
        - name: sort
          in: query
          schema:
            type: string
            enum: [recencyAt, updatedAt, createdAt]
            default: recencyAt
        - name: order
          in: query
          schema:
            type: string
            enum: [asc, desc]
            default: desc
        - name: archived
          in: query
          schema:
            type: boolean
            default: false
        - name: cwd
          in: query
          required: false
          schema:
            type: array
            items:
              type: string
          style: form
          explode: true
        - name: search
          in: query
          schema:
            type: string
      responses:
        "200":
          description: Conversation timeline page
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConversationTimelinePage"
        "400":
          $ref: "#/components/responses/Problem"
        "503":
          $ref: "#/components/responses/Problem"

  /v1/conversations/{conversationId}/timeline:
    get:
      operationId: getConversationTimeline
      tags: [Conversations]
      summary: Read a conversation timeline without resuming it
      parameters:
        - name: conversationId
          in: path
          required: true
          schema:
            type: string
        - name: cursor
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 1000
            default: 200
        - name: order
          in: query
          schema:
            type: string
            enum: [asc, desc]
            default: asc
        - name: eventView
          in: query
          schema:
            type: string
            enum: [summary, full]
            default: summary
      responses:
        "200":
          description: Conversation timeline
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConversationTimeline"
        "400":
          $ref: "#/components/responses/Problem"
        "404":
          $ref: "#/components/responses/Problem"
        "503":
          $ref: "#/components/responses/Problem"
        "504":
          $ref: "#/components/responses/Problem"
```

---

## 6. Error model

统一用 `application/problem+json`。RFC 9457 定义了 HTTP API 的 machine-readable problem details，用来避免每个 API 自定义错误格式。([RFC Editor][6])

建议扩展字段：

```json
{
  "type": "https://codex-remote.dev/problems/app-server-unavailable",
  "title": "Codex app-server unavailable",
  "status": 503,
  "detail": "Worker could not initialize the local Codex app-server connection.",
  "instance": "/v1/conversations",
  "code": "APP_SERVER_UNAVAILABLE",
  "requestId": "req_01HY..."
}
```

建议状态码：

| HTTP status | code                        | 场景                      |
| ----------: | --------------------------- | ----------------------- |
|       `400` | `INVALID_ARGUMENT`          | query/path 参数非法         |
|       `404` | `CONVERSATION_NOT_FOUND`    | conversationId 不存在或无法读取 |
|       `502` | `APP_SERVER_PROTOCOL_ERROR` | 上游返回无法映射的协议错误           |
|       `503` | `APP_SERVER_UNAVAILABLE`    | app-server 不可达、未登录、未启动  |
|       `504` | `APP_SERVER_TIMEOUT`        | 上游调用超时                  |
|       `500` | `WORKER_INTERNAL_ERROR`     | Worker 自身 bug           |

不要把 JSON-RPC error 原样返回给 Web。可以在 `debug` 字段中放 redacted 信息，但默认生产响应应只暴露规范化 `code`。

---

## 7. 明确不进入 MVP 的端点

当前阶段不要定义这些端点，即使内部 app-server 已有类似能力：

```text
POST /v1/conversations
POST /v1/conversations/{id}/turns
POST /v1/conversations/{id}/resume
POST /v1/conversations/{id}/fork
POST /v1/conversations/{id}/interrupt
POST /v1/approvals/*
GET  /v1/conversations/{id}/events/stream
GET  /v1/models
GET  /v1/devices
GET  /v1/workers/{workerId}/...
POST /v1/rpc
POST /v1/app-server/*
```

理由：这些会引入 write、stream、approval、多设备路由、Control Plane 状态、DB 或上游协议泄漏。`thread/start`、`turn/start`、`thread/resume` 等上游能力也会改变会话状态；它们不属于 read-only MVP。上游 README 明确区分 `thread/start`、`thread/resume`、`turn/start`、stream notifications 等动作型能力，而本 MVP 只应使用 `thread/list`、`thread/read`、`model/list`、`initialize`。([GitHub][3])

---

## 8. 最小实现顺序

建议按这个顺序落地：

1. `GET /v1/worker/health`
   先打通 HTTP 服务、统一 error response、request id、timeout。

2. `GET /v1/worker/probe`
   直接复用现有 probe，把 `initialize`、`model/list`、`thread/list`、`thread/read` 的结果规范化成 `WorkerProbeSummary`。

3. `GET /v1/worker/capabilities`
   从 probe/init/model list 派生，不要重新设计一套探测逻辑。

4. `GET /v1/conversations`
   只做 `thread/list` 映射和 cursor/limit/filter 规范化。

5. `GET /v1/conversations/{conversationId}/timeline`
   用 `thread/read includeTurns:true` 转成 `ConversationEvent[]`；先支持 summary view，full view 可以逐步扩展。

这个范围足够支撑单机 Web 控制台 read-only MVP，也不会提前绑定未来 Control Plane 的 DB、设备注册、路由、approval 或 stream 设计。

[1]: https://developers.openai.com/codex/cli/reference "Command line options – Codex CLI | OpenAI Developers"
[2]: https://spec.openapis.org/oas/v3.2.0.html "OpenAPI Specification v3.2.0"
[3]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[4]: https://datatracker.ietf.org/doc/html/rfc9110 "

                RFC 9110 - HTTP Semantics

        "
[5]: https://github.com/openai/codex/issues/27843 "Desktop sidebar shows \"No chats\" for all projects — thread/list with useStateDbOnly:true returns 0 threads when limit >= 50 · Issue #27843 · openai/codex · GitHub"
[6]: https://www.rfc-editor.org/info/rfc9457/ "RFC 9457: Problem Details for HTTP APIs | RFC Editor"
