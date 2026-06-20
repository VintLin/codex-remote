---
title: "Q30：app-server notifications 能否支撑 Web timeline stream"
source_url: "https://chatgpt.com/c/6a36fa97-55f4-83ee-a72f-597f8e116e5f"
exported_at: "2026-06-21T05:01:15"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 总结论

**app-server notifications 适合作为 Worker 侧的上游“实时信号输入”，不适合作为 Web 直接消费的 timeline stream，也不能视为 durable event log。**

官方文档把 app-server 定位为给“rich clients”使用的 JSON-RPC 接口，负责 conversation history、approvals、streamed agent events；但它同时明确 notifications 是 active transport stream 上的 server-initiated messages，JSON-RPC notification 本身没有 `id`，只包含 `method` 和 `params`。文档还要求客户端在 active transport 上持续读取事件，并把 `thread/read`、`thread/turns/list` 作为读取已存储线程/历史的 API。也就是说，**stream 是运行时进度面，snapshot/history 是状态恢复面**，两者不是同一层契约。([OpenAI Developers][1])

对 Codex Remote 的设计含义是：**Worker 可以订阅 notifications，但必须投影成自己的稳定 Web-facing event schema**，补 `seq`、`eventId`、去重键、脱敏、截断、replay、gap detection、snapshot reconciliation。Web 不应看到 app-server 原始 notification method/params。

---

## 1. notification 类别判断表

| 类别                              | 典型 app-server notifications / events                                                                                                                                        | Web timeline 判断                                                                                                                                                           | snapshot fallback                                                                                                                      | 本地验证 / Worker 处理                                                                                                                                                                  | 依据强度                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conversation / thread           | `thread/started`、`thread/status/changed`、`thread/archived`、`thread/unarchived`、`thread/closed`、`thread/name/updated`、token usage 类更新                                        | **可投影为 timeline/state event**，但只暴露稳定语义：thread created / loaded / closed / status changed。不要直接透传 method 名。                                                                 | **必须需要**。用 `thread/read` 读取 stored thread，用 `thread/turns/list` 分页读取历史；`thread/read` 本身不等于订阅/恢复实时流。                                    | 校验 thread 属于当前 allowed project/root；状态事件可降噪合并；`status/changed` 更像 UI/runtime state，不应当作业务事实唯一来源。                                                                                  | 官方明示：thread API、状态通知、read/list 历史读取。([OpenAI Developers][1])                                                                                              |
| turn lifecycle                  | `turn/started`、`turn/completed`、`turn/failed`、`turn/interrupted`、`turn/tokenUsage/updated`、`turn/diff/updated`、`turn/plan/updated`                                          | **核心 timeline event**。`turn/started` / terminal event 是第一版最应接入的主干。`turn/diff/updated` / `turn/plan/updated` 适合做“当前状态快照更新”，不是最终事实。                                         | **必须需要**。断线后用 `thread/read` / `thread/turns/list(itemsView=full)` 重建已存储 turn/item；对活跃 turn 的中间 delta 只能 best-effort reconcile。         | `turn/completed` 是 terminal anchor；对 `turn/diff/updated`、`turn/plan/updated` 做覆盖式 snapshot，而不是 append-only 文本事件。官方还说明 diff/plan 相关事件里某些 item 可能为空，item events 才是 source of truth。 | 官方明示：turn events、diff/plan caveat、history API。([OpenAI Developers][1])                                                                                    |
| assistant delta                 | `item/agentMessage/delta`、`item/started`、`item/completed` for `agentMessage`                                                                                                | **可作为 timeline event**。这是 Web live stream 第一版的重点：流式显示 assistant 文本。                                                                                                       | **需要**。delta 用于即时显示；`item/completed` 的 final item 是权威状态；断线后从 snapshot 重建。                                                              | Worker 应按 `threadId + turnId + itemId` 聚合 delta，维护 chunk index，合并/截断，最终用 completed item 覆盖临时内容。                                                                                   | 官方明示：所有 item 有 started/completed，agentMessage delta 按顺序拼接；completed 是 final authoritative state。([OpenAI Developers][1])                                  |
| reasoning / plan                | `item/reasoning/summaryTextDelta`、`item/reasoning/textDelta`、`item/plan/delta`、`turn/plan/updated`                                                                          | **默认不建议第一版全部进 Web timeline**。plan 可做可选 UI；reasoning 需严格产品策略，不应直接暴露 raw reasoning。                                                                                         | **需要**。plan/reasoning 的 final item 或 snapshot 才能修正中间态；plan delta 还被标注为 experimental。                                                   | 对 reasoning 做 visibility policy：默认隐藏或只暴露官方允许的 summary；对 plan delta 做 feature flag；不要把 internal chain/raw reasoning 存进用户可见 durable timeline。                                       | 官方明示：plan/reasoning item 与 deltas；plan delta experimental；item completed 为最终状态。([GitHub][2])                                                              |
| tool / command / process output | `item/commandExecution/outputDelta`、`command/exec/outputDelta`、`process/outputDelta`、`process/exited`                                                                       | 分两类：`item/commandExecution/outputDelta` **可投影到 turn timeline**；`command/exec/*`、`process/*` 更像独立命令/进程 API 的 runtime output，第一版建议**内部消费或单独建 terminal stream**。             | **需要**。命令最终结果以 `item/completed` 的 parsed output/status/exitCode/duration 为准；standalone process 断线后的语义需要本地验证。                           | 必须脱敏、截断、限制总字节数；识别 secret/path/env；按 command item 聚合 stdout/stderr；不要让 Web 直接看到 raw command outputDelta。`process` API 仍有 experimental 属性，尤其不应先做稳定 Web 契约。                          | 官方明示：commandExecution outputDelta 顺序追加，final item 包含 exitCode/duration；`command/exec`、`process/spawn` 是独立 API，process 属 experimental。([GitHub][2])        |
| file change / diff              | `turn/diff/updated`、`item/fileChange/*`、`item/completed` for `fileChange`                                                                                                   | **可作为 timeline event，但必须谨慎**。适合显示“files changed / diff updated / patch ready”，不适合作为最终文件事实源。                                                                               | **必须需要**。最终 UI 应结合 `fileChange` completed item、`turn/diff/updated` 快照、必要时 Worker 本地 git/file diff。                                     | Worker 应做路径归一化、allowed root 校验、私有绝对路径脱敏、diff size cap；`item/fileChange/outputDelta` 已 deprecated / 不再推荐，不能作为新契约基础。                                                                | 官方明示：`turn/diff/updated` 是 aggregated diff；legacy fileChange outputDelta deprecated/no longer emitted；patchUpdated feature-gated。([OpenAI Developers][1]) |
| approval / request resolution   | server-initiated approval JSON-RPC request；`serverRequest/resolved`；approval result reflected in `item/completed`                                                           | **可作为 timeline + action state**，但原始 approval request 不是普通 notification。Worker 必须捕获 server request，投影成 `approval.pending`，再用 `serverRequest/resolved` 和 final item 收口。     | **需要**。如果 Web 丢连接，Worker 仍要持有 pending approval state；最终以 item completed 的 approval result 为准。                                          | 必须校验 `threadId/turnId/requestId/itemId`，展示 command/path/sandbox/decision 元数据；禁止自动接受高风险请求；resolved 只表示请求已清理，不等于操作成功。                                                               | 官方明示：command/file approvals 通过 server-initiated requests；`serverRequest/resolved` 确认 answered/cleared；final result 在 `item/completed`。([GitHub][2])       |
| MCP                             | `item/mcpToolCall/*`、`mcpServer/startupStatus/updated`、`item/tool/requestUserInput`、MCP elicitation request/resolved                                                        | `mcpToolCall` **可作为 timeline event**；`mcpServer/startupStatus/updated` 更适合 device/capability/status 面；elicitation/requestUserInput 应走 approval/input 子系统，不直接当普通 timeline。 | **需要**。工具调用最终以 completed item 或 resolved request 收口。                                                                                   | MCP args/results 可能含外部服务数据、token、路径，必须脱敏；表单类 elicitation 由 Web 渲染时要做 schema validation。                                                                                           | 官方明示：MCP startup status、mcpToolCall item、elicitation/requestUserInput 与 serverRequest/resolved。([OpenAI Developers][1])                                   |
| search                          | `item/webSearch/*`、`fuzzyFileSearch/sessionUpdated`、`fuzzyFileSearch/sessionCompleted`                                                                                      | `webSearch` **可作为 timeline event**；`fuzzyFileSearch/*` 建议**只能内部消费**，用于本地 fuzzy file picker/session UI，不作为 conversation timeline。                                          | webSearch 需要 snapshot；fuzzy search 不应依赖 snapshot 进入历史。                                                                                 | 搜索结果、文件名、路径需要脱敏；fuzzy search 事件若暴露，会泄露本机文件结构，第一版不要放 Web timeline。                                                                                                                 | 官方明示：ThreadItem 包含 `webSearch`；fuzzy file search 是单独通知组。([OpenAI Developers][1])                                                                          |
| realtime voice                  | `thread/realtime/started`、`thread/realtime/itemAdded`、`thread/realtime/transcriptDelta`、`thread/realtime/outputAudioDelta`、`thread/realtime/error`、`thread/realtime/closed` | **第一版应延后**。这些不是普通 ThreadItem timeline；只能作为独立 realtime subchannel 或内部消费。                                                                                                   | **没有可靠 Codex snapshot fallback**。官方明确 realtime events 是 ephemeral transport events，不会由 `thread/read`、`thread/resume`、`thread/fork` 返回。 | 若未来要持久化 transcript/audio，必须由 Worker 自己建 transcript/audio store；`itemAdded` raw JSON schema 还被标注 unstable。                                                                         | 官方明示：thread realtime events are ephemeral, not ThreadItems, not returned by read/resume/fork；raw item schema unstable。([GitHub][2])                       |
| warnings / errors               | `error`、`configWarning`、`warning`、turn failed/error metadata                                                                                                                | `error` **应投影为 timeline/system event**；`warning/configWarning` 更适合 toast/status panel，除非影响 turn。                                                                          | **需要**。terminal failed/completed 与 snapshot 状态用于修正。                                                                                    | 错误 message/details 要脱敏；不要暴露 raw stack、raw JSON-RPC、私有路径、环境变量、完整命令输出。OTel/redaction 可作为内部审计，不等于 Web timeline。                                                                      | 官方明示：error event schema、warning/configWarning；OpenAI 文档也强调日志/OTel 的 prompt redaction 与隐私控制。([OpenAI Developers][1])                                       |

---

## 2. app-server notification 不能视为 durable event log

不能。原因分三层：

**官方明示的事实：**

1. JSON-RPC notification 没有 `id`，只有 `method` / `params`；这天然不是可 replay、可 ack、可分页的 event log 形态。([OpenAI Developers][1])
2. app-server 文档把事件描述为需要在 active transport stream 上持续读取的 server-initiated stream；历史状态读取另有 `thread/read`、`thread/turns/list`。([OpenAI Developers][1])
3. 某些 notification 可以 opt out；这意味着不同连接看到的事件集合可能不同，不能作为全局事实日志。([OpenAI Developers][1])
4. WebSocket transport 被官方标注为 experimental / unsupported，且有 bounded queues / retry / shutdown 行为；这更像 live transport，而不是 durable delivery substrate。([OpenAI Developers][1])
5. Realtime voice 事件被官方明确描述为 ephemeral transport events，不是 ThreadItem，也不会由 `thread/read`、`thread/resume`、`thread/fork` 返回。([GitHub][2])

**工程推断：**

因此，app-server notifications 只能被看作“Codex 当前连接上的实时进度信号”。它们可以驱动 Web 的低延迟体验，但不能承担以下职责：跨 Web 连接 replay、断线补偿、权限边界、审计日志、产品级 timeline schema、历史分页、幂等去重。

---

## 3. Worker 必须补的字段和机制

Codex Remote 的 Worker 应把 app-server notification 转换成自己的 `RemoteTimelineEvent`，至少包含：

```ts
type RemoteTimelineEvent = {
  eventId: string;          // Worker 生成，稳定、可去重
  seq: number;              // 每 thread 或每 conversation 单调递增
  type: string;             // Web-facing 稳定类型，不暴露 app-server method
  threadId: string;
  turnId?: string;
  itemId?: string;
  requestId?: string;

  phase?: "started" | "delta" | "completed" | "failed" | "resolved";
  createdAt: string;        // Worker 事件时间
  receivedAt: string;       // 收到 app-server notification 的时间

  snapshotVersion?: number;
  source: {
    kind: "codex-app-server";
    codexVersion?: string;
    protocolVersion?: string;
    method?: string;        // 内部调试可保留；默认不下发 Web
  };

  payload: unknown;         // 已投影、脱敏、截断后的稳定 payload
  redaction: {
    applied: boolean;
    reason?: string[];
  };
};
```

关键机制：

| 机制                      | 必要性                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `seq` / `eventId`       | Web reconnect 时用 `sinceSeq` replay；不能依赖 app-server notification 自带 id。                                                         |
| event store             | Worker 至少为活跃 thread 保存短期 ring buffer；如果要 durable timeline，则写 SQLite/本地 DB。                                                     |
| snapshot reconciliation | Web 首次打开先拿 snapshot，再接 live stream；断线后如果 `sinceSeq` gap，返回 `snapshot_reset`，再用 `thread/read` / `thread/turns/list` 重建。         |
| delta coalescing        | assistant/output delta 不应每个 chunk 都落 DB；可按 item 聚合、节流下发。                                                                       |
| final-state override    | `item/completed`、`turn/completed` 到达后覆盖 Worker 临时状态。官方也把 completed item 描述为 final authoritative state。([OpenAI Developers][1]) |
| 脱敏 / 截断                 | command output、diff、MCP args/results、错误、路径、环境变量都要做 sanitize。                                                                   |
| approval state machine  | approval request 不是普通 notification；Worker 必须维护 pending/resolved/expired/cancelled 状态。                                          |
| feature gating          | reasoning raw、plan delta、process API、realtime voice、autoApprovalReview、deprecated fileChange delta 不进入稳定 v1。                   |
| 本地校准                    | 对每类事件记录 `real-pass / fixed-pass / real-gap`，避免 fake Worker 行为污染产品契约。                                                           |

---

## 4. Codex Remote 第一版 stream 建议

### 第一版应接入

| Web-facing event                                      | 上游来源                                              | 说明                                                                         |
| ----------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `thread.opened` / `thread.status_changed`             | `thread/started`、`thread/status/changed`          | 只做状态更新；历史仍从 snapshot/read 来。                                               |
| `turn.started`                                        | `turn/started`                                    | timeline 主干。                                                               |
| `turn.completed` / `turn.failed` / `turn.interrupted` | `turn/completed`、error/failed terminal            | timeline 主干；触发 snapshot reconciliation。                                    |
| `item.started` / `item.completed`                     | `item/started`、`item/completed`                   | 覆盖 agentMessage、commandExecution、fileChange、mcpToolCall、webSearch。         |
| `assistant.delta`                                     | `item/agentMessage/delta`                         | 第一版 live UX 的核心；按 item 聚合。                                                 |
| `command.output_delta`                                | `item/commandExecution/outputDelta`               | 只接 turn 内 commandExecution item，不先接 standalone `command/exec` / `process`。 |
| `diff.updated`                                        | `turn/diff/updated`                               | 作为“当前 diff snapshot”，节流、截断、路径脱敏。                                           |
| `approval.pending`                                    | app-server approval JSON-RPC request              | Worker 捕获 server request 后投影。                                              |
| `approval.resolved`                                   | `serverRequest/resolved` + final `item/completed` | resolved 只表示请求清理；最终状态以 item completed 为准。                                  |
| `system.error`                                        | `error` / terminal failure                        | 脱敏后展示。                                                                     |

这组事件能覆盖 Codex App-like 的核心体验：turn 开始、assistant 流式输出、命令输出、diff 变化、approval 决策、turn 结束。

### 第一版应延后

| 延后项                                                     | 原因                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| raw reasoning / full reasoning delta                    | 产品与安全边界不清，容易把内部推理当用户可见内容。                                                         |
| `item/plan/delta` / `turn/plan/updated`                 | 可做后续 Plan UI；plan delta 有 experimental 属性，且最终状态仍应以 item completed/snapshot 为准。    |
| `command/exec/*`、`process/*`                            | 更像独立 terminal/process API，不是普通 conversation timeline；`process` 仍有 experimental 面。 |
| `fuzzyFileSearch/*`                                     | 更适合 Worker 内部 file picker/search session；会泄露本机文件结构。                               |
| `thread/realtime/*`                                     | 官方明确是 ephemeral realtime transport，不是 ThreadItem，不会进入 read/resume/fork。           |
| `mcpServer/startupStatus/updated`                       | 放 device/capabilities/status 面，而不是 timeline 主线。                                   |
| `autoApprovalReview`、deprecated fileChange output delta | 官方已提示不稳定或 deprecated，不适合作为新 Web 契约。                                               |

---

## 5. 推荐的 Web stream 契约形态

Web 不要订阅“Codex notification stream”，而应订阅：

```http
GET /v1/conversations/{conversationId}/events?sinceSeq=123
```

返回语义：

```ts
type TimelineStreamEnvelope =
  | {
      kind: "snapshot";
      conversationId: string;
      snapshotSeq: number;
      thread: RemoteThreadSnapshot;
      turns: RemoteTurnSnapshot[];
    }
  | {
      kind: "event";
      event: RemoteTimelineEvent;
    }
  | {
      kind: "gap";
      reason: "worker_restarted" | "event_buffer_expired" | "app_server_reconnected";
      resetToSnapshotRequired: true;
    }
  | {
      kind: "heartbeat";
      seq: number;
    };
```

打开 timeline 的流程：

1. Web 请求 conversation snapshot。
2. Web 打开 Worker/Control Plane stream，携带 `sinceSeq`。
3. Worker 如果有连续 event buffer，就 replay 后接 live。
4. Worker 如果发现 gap，就发送 `gap`，Web 重新拉 snapshot。
5. 每个 live event 都是 Worker 投影后的稳定事件，不包含 raw app-server payload。

这个模型把 Codex app-server 的 live transport、Worker 的 durable/replay 能力、Web 的 UI timeline 解耦，符合你当前“app-server notifications 不能直接透传到 Web”的原则。

---

## 最终判断

**可以用 app-server notifications 做 Web timeline stream 的输入源，但只能作为 Worker ingest layer。**
**不能把它当作 Web-facing event schema，也不能当作 durable event log。**

Codex Remote 第一版应该选择“snapshot-first + projected live events + gap reconciliation”：

* snapshot 负责正确性；
* projected notifications 负责实时性；
* Worker event store 负责 replay；
* `item/completed` / `turn/completed` 负责收口；
* approval、command output、diff、MCP、错误全部经过脱敏和权限校验；
* realtime voice、fuzzy search、process、experimental/unstable 事件延后。

[1]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[2]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
