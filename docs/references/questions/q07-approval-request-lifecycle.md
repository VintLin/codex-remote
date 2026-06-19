---
title: "Q7：Codex approval request设计"
source_url: "https://chatgpt.com/c/6a34fe89-9ed4-83e8-add4-1d75fd4629b8"
exported_at: "2026-06-19T17:06:26"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论摘要

`Codex app-server approval` 不是普通错误，也不是一个单独的 `approval/respond` RPC。它是 **app-server 主动发给客户端的 JSON-RPC request**，Web/Worker 必须用同一个 JSON-RPC `id` 回一个 JSON-RPC response，`result` 内携带用户决策。官方协议说明 app-server 使用省略 `"jsonrpc":"2.0"` 的双向 JSON-RPC，request 有 `method/params/id`，response echo 同一个 `id` 并带 `result` 或 `error`。([OpenAI 开发者][1])

对你的 Codex Remote，建议把 app-server 的 server-request 投影成内部 `ApprovalRequest`，但 **Web 不应直接拿 upstream request id 当业务主键**。Worker 应保存 `approvalRequestId -> upstreamJsonRpcRequestId` 映射，并用 CAS/idempotency 保证多设备下只有第一个有效用户决策被转发。

---

## 1. request id 生命周期

### 已确认行为

app-server 的 server request id 是 `OutgoingMessageSender` 进程内的递增整数。源码里 `next_server_request_id` 初始化为 `AtomicI64::new(0)`，`next_request_id()` 用 `fetch_add(1)` 生成 `RequestId::Integer(...)`。([GitHub][2])

生成 id 后，app-server 会把 server request 包装成带该 id 的 JSON-RPC request，并把 `{ callback, thread_id, request }` 放入 `request_id_to_callback` 这个内存 HashMap。也就是说，id 的有效性依赖当前 app-server 进程内 pending callback，而不是持久化协议状态。([GitHub][2])

`approvalId` 不是 JSON-RPC request id。协议里明确说明 `approvalId` 是某些 zsh-exec-bridge subcommand approval 的不透明 callback id；普通 shell/unified_exec approval 为 `null`。同一个 `itemId` 下可能有多个 subcommand callback，所以 `approvalId` 只用于 disambiguate routing，真正响应 app-server 时仍然用 JSON-RPC request `id`。([GitHub][3])

### Worker 设计含义

内部主键建议用：

```ts
type ApprovalRequestKey = {
  workerId: string;
  appServerInstanceId: string;   // Worker 启动 app-server 时生成，app-server 重启就换
  threadId: string;
  upstreamRequestId: string | number;
};
```

Web 层暴露：

```ts
approvalRequestId = base64url(
  workerId + "." + appServerInstanceId + "." + threadId + "." + upstreamRequestId
)
```

不要只用 `requestId` 做全局主键，因为 app-server 重启后递增计数会重新开始；也不要用 `itemId` 或 `approvalId` 替代 upstream JSON-RPC id。

---

## 2. 响应协议

### command approval

官方文档给出的流程是：

1. `item/started`
2. `item/commandExecution/requestApproval` server request
3. client response：`{ "decision": ... }`
4. `serverRequest/resolved`
5. `item/completed`，其中最终 `commandExecution.status` 为 `completed | failed | declined`。([GitHub][4])

支持的 command 决策包括：

```ts
type CommandApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: unknown[] } }
  | { applyNetworkPolicyAmendment: { network_policy_amendment: unknown } };
```

官方文档同时说明 `networkApprovalContext` 出现时，这不是普通 shell command approval，而是 managed network access approval；Web 应渲染成网络访问审批，不能假设 `command` 一定是有意义的 shell 预览。Codex 还可能按 host/protocol/port 聚合同目的地的并发网络审批，一个 approval 可能解锁多个 queued request。([OpenAI 开发者][1])

### file change approval

file change approval 的流程类似：

1. `item/started`
2. `item/fileChange/requestApproval`
3. client response：`{ "decision": "accept" | "acceptForSession" | "decline" | "cancel" }`
4. `serverRequest/resolved`
5. `item/completed`，最终状态为 `completed | failed | declined`。([GitHub][4])

### permissions request

`item/permissions/requestApproval` 不是传统 command/file approval，但建议一并纳入 `ApprovalRequestRegistry`，因为它也是显式用户决策通道。客户端 response 是 `result.permissions`，必须是 requested permission profile 的子集；省略的 permission 被视为拒绝，未请求的 permission 会被忽略。`scope: "session"` 可让授权在同 session 后续 turn 中继续使用，否则默认为 turn-scoped。([GitHub][4])

---

## 3. 超时语义

我没有在当前官方 app-server approval 文档或 `send_request_to_connections` 路径中看到 command/file approval 的固定 hard timeout。源码显示 server request 被注册到 pending callback map 后等待 response receiver；这里没有像 auth refresh 那样包一层 `timeout(...)`。([GitHub][2])

需要区分三类“超时”：

| 类型                                       | 是否适用于 command/file approval | 行为                                                              |
| ---------------------------------------- | --------------------------: | --------------------------------------------------------------- |
| app-server approval hard timeout         |                   未发现文档化固定值 | 不应假设会自动超时批准或拒绝                                                  |
| `tool/requestUserInput.autoResolutionMs` |  不适用于 command/file approval | host client 可按该字段自动 resolve user input prompt。([OpenAI 开发者][1]) |
| auto-review timeout                      | 不是 Web 用户 approval response | 官方安全文档说明 timeout 会 fail closed，action 不会运行。([OpenAI 开发者][5])    |

Worker 可实现自己的 **soft timeout**，但只能 fail closed。例如：UI 显示“长时间未处理”；若产品策略要求自动清理，只能向 app-server 回 `decline` 或 `cancel`，不能自动 `accept`。

---

## 4. 重复响应与多设备竞态

app-server 在收到 JSON-RPC response 后会 `take_request_callback(&id)`，也就是从 pending map 中移除 callback。找到 entry 时把 result 发给 callback；找不到时只记录 warning：`could not find callback for {id}`。这意味着 **第一个到达 app-server 的有效 response 胜出，后续重复/迟到 response 不再有上游效果**。([GitHub][2])

因此，Codex Remote 不能把多端点击都盲目转发给 app-server。Registry 必须在 Worker 层先做原子状态转换：

```ts
pending -> responding -> resolved
pending -> stale
pending -> upstreamDisconnected
pending -> expiredLocal
```

推荐响应规则：

| 场景                                               | Web API 返回                                  |
| ------------------------------------------------ | ------------------------------------------- |
| 同一 `clientMutationId` 重试同一 decision              | `200 OK`，返回第一次处理结果                          |
| pending 状态下第一个有效 decision                        | `202 Accepted` 或 `200 OK`，状态变 `responding`  |
| 已有另一个 decision 正在/已经转发                           | `409 Conflict`                              |
| app-server 已发 `serverRequest/resolved`，但 Web 才点击 | `410 Gone`                                  |
| decision 不在 `availableDecisions` 内               | `422 Unprocessable Entity`                  |
| Worker 与 app-server 断开且无法确认 pending              | `503` 或 `409 upstream_disconnected`，不要本地假成功 |

---

## 5. 断线、重连、replay 行为

app-server 对连接关闭会等待最多 30 秒让该连接的 RPC drain，然后清理连接相关 processor 状态。这里不等价于“审批被拒绝”或“自动通过”。([GitHub][6])

对 thread-scoped pending server requests，app-server 源码提供 `pending_requests_for_thread(thread_id)` 和 `replay_requests_to_connection_for_thread(connection_id, thread_id)`：新连接重新 attach thread 时，app-server 会把仍 pending 的 server request 重新发给该连接，且 request 对象保留原来的 id。([GitHub][2])

如果最后一个 subscriber 退订，app-server 不会立刻 unload thread；官方文档说明它会在“无 subscriber 且无 thread activity”持续 30 分钟后 unload，并发 `thread/status/changed` 到 `notLoaded` 与 `thread/closed`。([OpenAI 开发者][1])

Worker 设计含义：

```text
Web socket 断开 ≠ approval rejected
Worker 到 app-server 连接断开 ≠ approval resolved
app-server replay 同一个 request id ≠ 新 approval
app-server restart ≈ pending request 全部失效，需要重新 resume/等待新 request
```

重连时应按 `(appServerInstanceId, threadId, upstreamRequestId)` 去重；如果收到同 id request，刷新 `lastSeenAt` 和 delivery metadata，不创建新的 Web approval。

---

## 6. ApprovalRequestRegistry 设计

### 数据模型

```ts
type ApprovalRequestStatus =
  | "pending"
  | "responding"
  | "resolved"
  | "declined"
  | "cancelled"
  | "stale"
  | "upstreamDisconnected"
  | "expiredLocal"
  | "failed";

type ApprovalRequestKind =
  | "commandExecution"
  | "fileChange"
  | "permissions"
  | "mcpElicitation"
  | "toolRequestUserInput";

type ApprovalRequest = {
  approvalRequestId: string;

  workerId: string;
  appServerInstanceId: string;
  upstreamRequestId: string | number;

  threadId: string;
  turnId: string | null;
  itemId: string | null;
  approvalId?: string | null;
  environmentId?: string | null;

  kind: ApprovalRequestKind;
  status: ApprovalRequestStatus;
  version: number;

  receivedAt: string;
  lastSeenAt: string;
  resolvedAt?: string;

  availableDecisions?: unknown[];

  // UI payload：可展示，但不要写入普通日志
  presentation: {
    reason?: string | null;
    commandPreview?: string | null;
    cwd?: string | null;
    commandActions?: unknown[];
    fileChangesSummary?: unknown[];
    grantRoot?: string | null;
    networkApprovalContext?: unknown;
    requestedPermissions?: unknown;
  };

  response?: {
    decision: unknown;
    respondedByUserId: string;
    clientMutationId: string;
    respondedAt: string;
  };

  upstream: {
    connectionState: "connected" | "disconnected";
    replayCount: number;
    rawMethod: string;
  };
};
```

`presentation` 可以给 Web 展示，但不进入普通日志。特别是 `commandPreview`、diff、cwd、reason 都可能含有 secret 或敏感路径。

### Upsert 规则

收到 app-server server request：

```ts
function onServerRequest(req) {
  key = { appServerInstanceId, threadId, upstreamRequestId: req.id };

  existing = registry.get(key);

  if (existing) {
    existing.lastSeenAt = now();
    existing.upstream.replayCount += 1;
    emitApprovalUpdated(existing);
    return;
  }

  create ApprovalRequest(status="pending");
  emitApprovalRequested(approval);
}
```

收到 `serverRequest/resolved`：

```ts
function onServerRequestResolved(threadId, requestId) {
  approval = registry.find(appServerInstanceId, threadId, requestId);
  if (!approval) return;

  approval.status = "resolved";
  approval.resolvedAt = now();
  approval.version += 1;
  emitApprovalResolved(approval);
}
```

`serverRequest/resolved` 是清除 pending UI 的强信号；`item/completed` 是最终 command/file item 状态的权威来源。官方文档明确要求把 `item/completed` 当作最终状态。([GitHub][4])

---

## 7. Web approval response API

建议 API：

```http
GET /api/threads/{threadId}/approval-requests?status=pending

POST /api/approval-requests/{approvalRequestId}/respond
Idempotency-Key: <uuid>
Content-Type: application/json
```

`RespondApprovalInput` 建议用 discriminated union，而不是一个过宽的 `{ decision: any }`：

```ts
type RespondApprovalInput =
  | {
      kind: "commandExecution";
      decision:
        | "accept"
        | "acceptForSession"
        | "decline"
        | "cancel"
        | {
            acceptWithExecpolicyAmendment: {
              execpolicy_amendment: unknown[];
            };
          }
        | {
            applyNetworkPolicyAmendment: {
              network_policy_amendment: unknown;
            };
          };
      expectedVersion: number;
      clientMutationId: string;
    }
  | {
      kind: "fileChange";
      decision: "accept" | "acceptForSession" | "decline" | "cancel";
      expectedVersion: number;
      clientMutationId: string;
    }
  | {
      kind: "permissions";
      scope?: "turn" | "session";
      permissions: unknown; // 必须是 requestedPermissions 的子集
      expectedVersion: number;
      clientMutationId: string;
    }
  | {
      kind: "mcpElicitation";
      action: "accept" | "decline" | "cancel";
      content?: unknown | null;
      expectedVersion: number;
      clientMutationId: string;
    };
```

Worker 转发给 app-server 时，不是调用 `approval/respond`，而是写回 JSON-RPC response：

```json
{
  "id": 61,
  "result": {
    "decision": "accept"
  }
}
```

permissions request 则是：

```json
{
  "id": 61,
  "result": {
    "scope": "session",
    "permissions": {
      "fileSystem": {
        "write": ["/workspace/project"]
      }
    }
  }
}
```

历史上 GitHub issue #14192 曾质疑 strict protocol-only 模式下没有单独 approval response RPC；当前官方文档和源码表明正确模型是“响应 server-initiated JSON-RPC request”，不是新增一个 client request method。([GitHub][7])

---

## 8. 安全与日志设计

### Control Plane

Control Plane 只保存：

```text
device/workspace/thread routing metadata
approvalRequestId
status/version/timestamps
sanitized presentation summary
decision audit metadata
```

不保存：

```text
provider API key
ChatGPT token / auth.json
raw prompt
raw command output
raw model output
full diff by default
raw JSON-RPC frames
```

provider secrets 应只留在运行 app-server 的 Worker 主机。若必须远程连接 app-server，官方文档提示 WebSocket transport 仍是 experimental/unsupported，非 loopback WebSocket listener rollout 期间默认可能无认证；暴露远程前必须配置 WebSocket auth，并优先使用 token file 而不是命令行明文 token。([OpenAI 开发者][1])

### Worker 日志

不要记录完整 `ApprovalRequest.presentation`。建议结构化日志只包含：

```json
{
  "event": "approval.respond",
  "approvalRequestId": "apr_...",
  "kind": "commandExecution",
  "threadIdHash": "sha256:...",
  "turnId": "turn_...",
  "itemId": "call_...",
  "decision": "decline",
  "status": "responding",
  "workerId": "wkr_..."
}
```

Codex 自身 OTel 日志默认 disabled，`log_user_prompt=false` 时 prompt redacted；但 OTel 代表事件包含 `tool_result` output snippet，因此在你的“日志不能泄露 command output”要求下，应保持 exporter disabled，或在 Worker 边界过滤 tool output。([OpenAI 开发者][8])

对子进程环境，Codex 提供 `shell_environment_policy`，可用 `inherit = "none"` 或 `inherit = "core"`，并保留默认 KEY/SECRET/TOKEN 过滤来减少 secret 进入命令环境的概率。([OpenAI 开发者][8])

---

## 9. 必须坚持的产品不变量

1. **用户拒绝不是 error**
   `decline`/`cancel` 是正常 approval response。JSON-RPC `error` 只用于协议/客户端故障，不应用来表达用户拒绝。官方文档把 turn error 与 approval 分开描述，approval 有独立 decision payload。([OpenAI 开发者][1])

2. **不能自动接受**
   Codex 安全模型把 sandbox 与 approval policy 作为两层控制；approval 用于离开 sandbox、网络访问、side-effecting connector/tool call 等显式风险点。([OpenAI 开发者][5])

3. **fail closed**
   本地超时、渲染失败、schema 不认识、上游断开，都只能 `decline`/`cancel` 或标记 stale，不能 accept。Auto-review 官方语义也是 timeout/failure 不运行 action。([OpenAI 开发者][5])

4. **`item/completed` 是最终事实**
   `serverRequest/resolved` 只说明 request 被回答或清理；最终 command/file 是否完成、失败、declined，要以后续 `item/completed` 为准。([GitHub][4])

5. **pin app-server schema**
   app-server 可用 CLI 生成 TypeScript schema/JSON Schema，且输出与所运行 Codex 版本精确匹配。Codex Remote 应在 Worker 启动时记录 app-server version/schema hash，避免不同版本字段漂移。([OpenAI 开发者][1])

---

## 10. 建议测试矩阵

| 测试                                             | 期望                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| 单设备 accept command                             | Worker 发 JSON-RPC response；收到 `serverRequest/resolved`；等待 `item/completed` |
| 单设备 decline command                            | 不视为错误；item 最终 `declined` 或 turn 继续                                         |
| cancel command                                 | turn 被 interrupt；UI 关闭 pending approval                                    |
| 两台设备同时 respond                                 | 只有一个 CAS 成功；另一个 409 或 idempotent replay                                    |
| Web 重试同一 request                               | 同 `Idempotency-Key` 返回第一次结果                                                |
| app-server replay 同一 request id                | Registry upsert，不创建重复 approval                                             |
| app-server 发 `serverRequest/resolved` 后 Web 点击 | 410 Gone                                                                   |
| Worker 与 app-server 断开                         | pending 标记 `upstreamDisconnected`；不本地 accept                               |
| app-server 重启                                  | 更换 `appServerInstanceId`；旧 pending 标记 stale                                |
| unknown decision / 不在 `availableDecisions`     | 422，且不转发                                                                   |
| networkApprovalContext 无 command               | Web 显示网络审批，不显示伪 command                                                    |
| logs audit                                     | 无 prompt、token、raw command output、raw JSON-RPC frame                       |

[1]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[2]: https://github.com/openai/codex/blob/main/codex-rs/app-server/src/outgoing_message.rs "codex/codex-rs/app-server/src/outgoing_message.rs at main · openai/codex · GitHub"
[3]: https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/src/protocol/v2.rs "raw.githubusercontent.com"
[4]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[5]: https://developers.openai.com/codex/agent-approvals-security "Agent approvals & security – Codex | OpenAI Developers"
[6]: https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server/src/message_processor.rs "raw.githubusercontent.com"
[7]: https://github.com/openai/codex/issues/14192 "codex app-server emits approval requests but lacks a strict approval response RPC · Issue #14192 · openai/codex · GitHub"
[8]: https://developers.openai.com/codex/config-advanced "Advanced Configuration – Codex | OpenAI Developers"
