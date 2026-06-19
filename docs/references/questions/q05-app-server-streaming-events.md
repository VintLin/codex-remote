---
title: "Q5：Codex Remote 事件调研"
source_url: "https://chatgpt.com/c/6a34fe4d-b80c-83e9-91e1-4d90307a73f8"
exported_at: "2026-06-19T17:07:38"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

**Web timeline reducer 需要三件事都做：sequence 去重、snapshot reconciliation、断线补偿。**
原因是：Codex app-server 的公开协议提供 `threadId / turnId / itemId / JSON-RPC request id` 这类稳定关联键，但没有公开的全局事件 sequence、ack、resume offset 或 exactly-once 交付语义。Worker 应该把 app-server 的 JSON-RPC stream 投影成你们自己的稳定 `ConversationEvent`，并由 Worker 生成单调 `seq/eventId`，Web 只消费 `packages/api-contract/openapi.yaml` 派生类型。

## app-server stream 的真实外形

Codex app-server 是双向 JSON-RPC 2.0，但 wire 上省略 `"jsonrpc":"2.0"`；默认 stdio 是 JSONL，websocket 是一帧一个 JSON-RPC message，但官方明确标注 websocket transport 仍是 experimental / unsupported，不建议生产依赖。官方 README 还说明 app-server 用 bounded queues 处理 ingress / processing / outbound writes，饱和时请求会收到 `-32001 Server overloaded; retry later`，客户端应退避重试。([GitHub][1])

JSON-RPC envelope 有三类：client/server request 带 `method + params + id`，response echo `id` 并带 `result` 或 `error`，notification 不带 `id`，只带 `method + params`。这点很关键：普通 `thread/* / turn/* / item/*` notification 本身没有 upstream event id；approval 这类“server request”才有 JSON-RPC `id` 可用于 response correlation。([OpenAI 开发者][2])

官方将会话抽象为三层：Thread 是 conversation，Turn 是一次用户请求及后续 agent work，Item 是用户消息、agent 消息、命令执行、文件修改、工具调用等原子输入/输出单元；`turn/start` 后应持续读取 `thread/*`、`turn/*`、`item/*`、`serverRequest/resolved` 等 stream。([OpenAI 开发者][2]) OpenAI 的架构文章也说明 app-server 会把 Codex core 的低层事件转换成“小集合、稳定、UI-ready JSON-RPC notifications”，一个 client request 会产生多个 event updates。([OpenAI][3])

## 主要事件形态

### `thread/*`

常见 thread 事件/状态包括：

| 方法                                                                           | 形态                     | timeline 含义                                                         |
| ---------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `thread/started`                                                             | `{ thread }`           | 新 thread、fork、detached review 等被介绍给当前 connection                    |
| `thread/status/changed`                                                      | `{ threadId, status }` | runtime 状态变化；`active` 表示正在运行，`activeFlags` 可包含如 `waitingOnApproval` |
| `thread/archived` / `thread/unarchived` / `thread/deleted` / `thread/closed` | thread-scoped payload  | 侧边栏/生命周期状态                                                          |
| `thread/tokenUsage/updated`                                                  | usage update           | token usage 独立流，不应当塞进 item list                                     |
| `thread/name/updated`、`thread/goal/updated`、`thread/settings/updated`        | snapshot-style update  | thread metadata 更新                                                  |

`thread/start` 会 emit `thread/started` 并订阅该 connection 的 turn/item events；`thread/resume` 用于继续已有 thread，默认 response 会包含重建的 `thread.turns`，也支持 `excludeTurns: true` 加 `initialTurnsPage`，用于一边恢复 live subscription，一边分页拉历史。([GitHub][1]) ([GitHub][1]) `thread/read` 则是只读 snapshot：它不会 load thread，也不会订阅 events。([OpenAI 开发者][2])

### `turn/*`

官方 README 对 turn lifecycle 的描述很直接：每个 turn 在开始运行时 emit `turn/started`，完成时 emit `turn/completed`；客户端应增量渲染 items，item 生命周期总是 `item/started → zero or more deltas → item/completed`。`turn/started` payload 是 `{ turn }`，其中 turn id、空 `items`、`status: "inProgress"`；`turn/completed` 的 `turn.status` 是 `completed | interrupted | failed`，失败带 `{ error: { message, codexErrorInfo?, additionalDetails? } }`。([GitHub][1])

`turn/diff/updated` 是 **snapshot**，不是 patch delta：payload `{ threadId, turnId, diff }` 表示当前 turn 的最新聚合 unified diff。`turn/plan/updated` 也是 snapshot-style 的计划状态。官方还提示这些 turn-level notifications 当前可能带空 `items`，item list 应以 `item/*` 为 canonical source。([GitHub][1])

### `item/*`

`ThreadItem` 是 tagged union。官方列出的主要 item types 包括 `userMessage`、`agentMessage`、`plan`、`reasoning`、`commandExecution`、`fileChange`、`mcpToolCall`、`collabToolCall`、`webSearch`、`imageView`、`sleep`、`enteredReviewMode`、`exitedReviewMode`、`contextCompaction` 等。`item/started` 会发完整 item，`item.id` 与后续 deltas 的 `itemId` 匹配；`item/completed` 发最终 item，官方明确说应把它当作 authoritative execution/result state。([GitHub][1])

item delta 主要是 append 或分段更新：

| 方法                                  | 处理方式                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `item/agentMessage/delta`           | 同一 `itemId` 的 `delta` 按到达顺序拼接，重建 agent reply                                                                  |
| `item/plan/delta`                   | 同一 `itemId` 拼接，但最终 `plan` item 不保证等于 deltas 拼接结果                                                              |
| `item/reasoning/summaryTextDelta`   | 用 `summaryIndex` 区分 summary section                                                                           |
| `item/reasoning/summaryPartAdded`   | 标记 reasoning summary section boundary                                                                         |
| `item/reasoning/textDelta`          | raw reasoning text，必要时按 `contentIndex` 分组                                                                     |
| `item/commandExecution/outputDelta` | stdout/stderr 按到达顺序 append；最终 `commandExecution` item 带 `aggregatedOutput`、`status`、`exitCode`、`durationMs` 等 |
| `item/fileChange/patchUpdated`      | feature-gated structured file-change snapshot                                                                 |
| `item/fileChange/outputDelta`       | deprecated compatibility event，当前版本通常不再 emit                                                                  |

官方明确要求 `agentMessage/delta` 和 `commandExecution/outputDelta` 按同一 `itemId` 的到达顺序拼接；但没有给出 delta index 或全局 stream offset。([GitHub][1])

## Approval server request 形态

approval 不是普通 notification，而是 app-server 发给 client 的 **server-initiated JSON-RPC request**，client 必须对该 request 的 `id` 回 response。普通 UI 事件流里随后会看到 `serverRequest/resolved` notification，以及目标 item 的 `item/completed`。官方说明 command/file approval request 都包含 `threadId` 和 `turnId`，用于把 UI pending state 绑定到当前 conversation/turn。([GitHub][1])

### Command approval

顺序是：

1. `item/started`：`commandExecution` item，包含 `command`、`cwd` 等，可先渲染 proposed action。
2. `item/commandExecution/requestApproval`：server request，包含 `itemId`、`threadId`、`turnId`、nullable `environmentId`、可选 `approvalId`、`reason`；普通 command approval 通常还有 `command`、`cwd`、`commandActions`。experimental capability 下可能带 `additionalPermissions`；network-only approval 可能省略 command 字段并改用 `networkApprovalContext`；还可能带 `availableDecisions`、`proposedExecpolicyAmendment`、`proposedNetworkPolicyAmendments`。
3. client 回 `{ decision: ... }`。
4. `serverRequest/resolved`：`{ threadId, requestId }`，确认 pending request 已被回答或清理。
5. `item/completed`：最终 `commandExecution`，`status` 为 `completed | failed | declined`，这是结果权威状态。([GitHub][1])

### File change approval

顺序是：

1. `item/started`：`fileChange` item，包含 proposed `changes` 和 `status: "inProgress"`。
2. `item/fileChange/requestApproval`：server request，包含 `itemId`、`threadId`、`turnId`、可选 `reason`，可能带不稳定的 `grantRoot`。
3. client 回 `accept | acceptForSession | decline | cancel`。
4. `serverRequest/resolved`。
5. `item/completed`：同一个 `fileChange` item，状态更新为 `completed | failed | declined`。([GitHub][1])

### 其他 approval / request 类

`item/tool/requestUserInput` 被清理或回答后也会 emit `serverRequest/resolved`；如果 turn start/complete/interrupt 先清掉 pending request，也会发同一个 resolved notification。MCP server 也可通过 `mcpServer/elicitation/request` 打断 turn，请求 form / OpenAI form / URL input；其 `turnId` 是 best-effort，无法总是假设存在。([GitHub][1])

内置 `request_permissions` tool 会发 `item/permissions/requestApproval` server request，payload 包含 `threadId`、`turnId`、`itemId`、`environmentId`、`cwd`、`reason` 和 requested permission profile；client response 只授予 requested subset，遗漏字段视为拒绝。([GitHub][1]) 需要注意，公开 issue 中仍有报告称某些 `sandbox_permissions` escalation 在 `codex-cli 0.130.0` 下没有通过 app-server surface 出对应 `item/*/requestApproval`，导致 turn 卡住直到超时；这说明 Worker 还应处理“thread active/waiting，但没有可见 pending request”的降级状态。([GitHub][4])

auto-review 相关还有 `item/autoApprovalReview/started` 和 `/completed`，但官方 README 标为 `[UNSTABLE]`，并明确这些 notifications 与目标 item 自身的 `item/completed` lifecycle 分离。不要把 auto-review notification 当作目标 command/file item 的终态。([GitHub][1])

## 顺序保证：能依赖什么，不能依赖什么

能依赖的：

1. **单个 item 的 lifecycle**：`item/started → zero or more item-specific deltas → item/completed`。`item/completed` 是 item 最终权威状态。([GitHub][1])
2. **同一 `itemId` 的文本/输出 deltas 按 Worker 收到的顺序 append**。官方对 `agentMessage/delta` 和 `commandExecution/outputDelta` 都是 append-in-order 语义。([GitHub][1])
3. **turn 终态以 `turn/completed` 为准**；interrupt 也要等 `turn/completed status="interrupted"` 才算完成。([GitHub][1])
4. **`turn/diff/updated` / `turn/plan/updated` 是 last-write-wins snapshot**，不需要拼接。([GitHub][1])

不能依赖的：

1. **没有公开全局 upstream sequence。** notification 没有 `id`，approval 以外的普通事件无法用 upstream event id 去 exactly-once 去重。([OpenAI 开发者][2])
2. **没有公开 replay offset / ack。** `thread/resume` 是重新 load / subscribe，并可返回重建 turn history；`thread/turns/list` 是分页历史 API，不是“从 event offset 继续 replay stream”。([GitHub][1]) ([GitHub][1])
3. **断线可能丢 terminal lifecycle frames。** 公开 issue 中有 slow websocket outbound queue 填满后，client 没收到 `turn/completed` 和 idle `thread/status/changed`，但另一个 observer 看到 server-side thread 已经 `idle`、latest turn `completed`；这正是 stale UI 的典型来源。([GitHub][5])
4. **多客户端 co-presence / fanout 不应假设可靠。** 公开 RFC issue 观察到 stock App Server 下额外 observer 并不可靠接收 TUI-originated live turn stream；这与你们“Worker 是唯一连接 app-server 的模块”的架构约束一致。([GitHub][6])

## 幂等标识建议

上游可用的稳定键：

| 层级               | 上游键                                                        | 用途                                             |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| thread           | `thread.id`                                                | conversation 主键                                |
| session/fork     | `thread.sessionId`、`forkedFromId`                          | fork tree / live session grouping              |
| turn             | `turn.id`                                                  | turn 主键                                        |
| item             | `item.id` / delta `itemId`                                 | item 主键；started/completed/delta 关联             |
| user input       | `clientUserMessageId → userMessage.clientId`               | client-originated user message 幂等              |
| approval request | JSON-RPC `id`，以及 `serverRequest/resolved.params.requestId` | pending approval / request lifecycle           |
| approval target  | `threadId + turnId + itemId`                               | 把 approval 绑到 command/file/permission item     |
| command subflow  | optional `approvalId`、`environmentId`                      | subcommand callback / execution environment 关联 |

Worker 应该生成自己的幂等 envelope，例如：

```ts
type ConversationEventEnvelope = {
  eventId: string;        // Worker stable id
  seq: number;            // Worker monotonic, per thread or global
  threadId: string;
  turnId?: string;
  itemId?: string;
  requestId?: string;
  kind: string;
  observedAt: string;
  payload: unknown;       // already normalized to api-contract type
  snapshot?: boolean;     // true for authoritative snapshot/upsert
};
```

推荐的 `eventId` 规则：

| Upstream event           | Worker event id                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| `thread/started`         | `thread:${threadId}:started`                                               |
| `thread/status/changed`  | `thread:${threadId}:status:${seq}` 或 last-write-wins snapshot key          |
| `turn/started`           | `turn:${threadId}:${turnId}:started`                                       |
| `turn/completed`         | `turn:${threadId}:${turnId}:completed`                                     |
| `item/started`           | `item:${threadId}:${turnId}:${itemId}:started`                             |
| `item/completed`         | `item:${threadId}:${turnId}:${itemId}:completed`                           |
| `item/*/delta`           | `delta:${threadId}:${turnId}:${itemId}:${seq}`，因为 upstream 无 delta ordinal |
| approval request         | `request:${threadId}:${turnId}:${requestId}`                               |
| `serverRequest/resolved` | `request:${threadId}:${requestId}:resolved`                                |
| snapshot reconciliation  | `snapshot:${threadId}:${snapshotVersionOrSeq}`                             |

关键点：**Web 不能只用 `itemId` 对 delta 去重**。同一个 item 会有多条合法 delta，且 upstream 没有 delta index。delta 幂等必须依赖 Worker 生成的 `seq` 或 Worker 持久化后的 event id。

## Reducer 设计判断

### 1. sequence 去重：需要

Web reducer 应以 Worker `seq` 为准，记录：

```ts
lastAppliedSeqByThread[threadId]
lastDeltaSeqByItem[itemId]
seenEventIds
```

处理规则：

* `seq <= lastAppliedSeq`：忽略。
* `eventId` 已见：忽略。
* lifecycle upsert 不应 append duplicate row；`item/completed` replace/merge `item/started` 的临时状态。
* delta 只在 `seq` 新且 item 未 final 时 append；如果 final item 已到，迟到 delta 可忽略或放入 debug buffer。
* `turn/completed` 后，不再把该 turn 视为 active，即使没有收到某个 status idle event。

这不是为了弥补 app-server 的“重复发送”，而是为了 Web/Worker/SSE 断线重放时保证 Web 端幂等。

### 2. snapshot reconciliation：需要

需要两类 snapshot：

**启动/重连 snapshot**：Worker 连接 app-server 后 `initialize`，对每个关注的 thread 执行 `thread/resume` 或 `thread/read/thread/turns/list`。`thread/resume` 默认可返回重建 turn history；如果历史很大，用 `excludeTurns: true + initialTurnsPage` 或之后 `thread/turns/list` 分页。([GitHub][1])

**运行中 authoritative snapshot**：

* `item/completed` 覆盖该 item 的 streaming aggregate。
* `turn/completed` 覆盖该 turn 的状态。
* `turn/diff/updated` 覆盖 turn diff。
* `turn/plan/updated` 覆盖 plan snapshot。
* `thread/status/changed` 覆盖 runtime status。

### 3. 断线补偿：需要

Browser ↔ Worker 断线：Worker 应维护 replay log，SSE/WebSocket 使用 Worker `seq` 或 `Last-Event-ID` 补发。这是你们自己的可靠层。

Worker ↔ app-server 断线：不能要求 app-server “从 seq N 重放”。Worker 应重新 `initialize`，再对活跃 threads 做 `thread/resume` + snapshot reconciliation；若 latest turn 已 `completed/interrupted/failed`，清理本地 active/pending 状态；若仍 `inProgress`，继续收后续 live events，但把断线期间缺失的 deltas 标记为不可完全恢复，等待 final `item/completed` 或重新拉取历史 snapshot 修正。

OpenAI 架构文章对 Codex Web 的设计也给出相同方向：browser tab 不是 long-running task 的 source of truth；worker 维护 app-server stdio stream，后端状态和 saved thread sessions 让新 session 能 reconnect/catch up。([OpenAI][3])

## Worker 投影层推荐

把 app-server raw JSON-RPC 转成稳定 `ConversationEvent`，不要让 Web 直接理解 upstream method names。

建议最小事件集：

```ts
type ConversationEvent =
  | { kind: "thread.snapshot"; thread: ThreadSnapshot }
  | { kind: "thread.statusChanged"; threadId: string; status: ThreadStatus }
  | { kind: "turn.started"; threadId: string; turn: TurnSnapshot }
  | { kind: "turn.completed"; threadId: string; turn: TurnSnapshot }
  | { kind: "turn.diffUpdated"; threadId: string; turnId: string; diff: string }
  | { kind: "turn.planUpdated"; threadId: string; turnId: string; plan: PlanSnapshot }
  | { kind: "item.started"; threadId: string; turnId: string; item: ThreadItem }
  | { kind: "item.delta"; threadId: string; turnId: string; itemId: string; delta: ItemDelta }
  | { kind: "item.completed"; threadId: string; turnId: string; item: ThreadItem }
  | { kind: "approval.requested"; request: ApprovalRequest }
  | { kind: "approval.resolved"; threadId: string; requestId: string }
  | { kind: "stream.reconciled"; threadId: string; source: "resume" | "read" | "turnsList" }
  | { kind: "stream.disconnected" | "stream.reconnected"; threadId?: string };
```

Reducer 核心逻辑：

```ts
function applyEvent(state, ev) {
  if (state.seenEventIds.has(ev.eventId)) return state;
  if (ev.seq <= (state.lastSeqByThread[ev.threadId] ?? 0)) return state;

  switch (ev.kind) {
    case "item.delta":
      if (state.finalItems[ev.itemId]) return markSeen(state, ev);
      return appendDeltaByItemSeq(state, ev);

    case "item.completed":
      return replaceItemWithAuthoritativeSnapshot(state, ev.item);

    case "turn.completed":
      return finalizeTurnAndClearActive(state, ev.turn);

    case "approval.resolved":
      return clearPendingRequest(state, ev.requestId);

    case "thread.snapshot":
      return reconcileFromSnapshot(state, ev.thread);

    default:
      return upsert(state, ev);
  }
}
```

## 最终判断

你们当前“Worker 是唯一 app-server client，Web 只消费 OpenAPI 派生事件类型”的架构是正确方向。实现 stream 时不要把 upstream stream 当成可靠 event log；应把它当成 **ordered live observation + periodic authoritative snapshots**。

**必须做：**

1. Worker 生成单调 `seq` 和稳定 `eventId`。
2. Worker 持久化或至少内存保留近期 event log，给 Web 断线 replay。
3. Web reducer 按 `seq/eventId` 幂等。
4. 对 `item/completed`、`turn/completed`、`thread.snapshot` 做 authoritative replace。
5. Worker ↔ app-server 重连后执行 `thread/resume` / `thread/read` / `thread/turns/list` reconciliation。
6. approval pending state 用 `requestId` 管，UI 展示绑定 `threadId + turnId + itemId`。
7. 如果看到 `thread.status.activeFlags` 类似 waiting-on-approval，但没有对应 request，进入 degraded/polling 状态，不要让 Web 永久卡住。

[1]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[2]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[3]: https://openai.com/index/unlocking-the-codex-harness/ "Unlocking the Codex harness: how we built the App Server | OpenAI"
[4]: https://github.com/openai/codex/issues/21982 "Codex sandbox_permissions approval doesn't get surfaced through app-server · Issue #21982 · openai/codex · GitHub"
[5]: https://github.com/openai/codex/issues/18860 "Remote TUI can remain stale after app-server slow-websocket disconnect · Issue #18860 · openai/codex · GitHub"
[6]: https://github.com/openai/codex/issues/21551 "App Server: peer-client co-presence with the live TUI thread (RFC) · Issue #21551 · openai/codex · GitHub"
