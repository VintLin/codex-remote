---
title: "Q6：Codex app-server 参数设计"
source_url: "https://chatgpt.com/c/6a34fe59-aed0-83e8-aa5c-260fa4e0fe0c"
exported_at: "2026-06-19T17:06:59"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

下面基于我能查到的公开官方文档、`openai/codex` 当前协议源码，以及相关 issue。Codex app-server 协议仍在快速演进；你的架构里把 `packages/codex-protocol` 作为唯一 app-server 协议事实源是正确边界，因为官方文档也明确建议按 Codex 版本生成/锁定 schema。([OpenAI 开发者][1])

## 1. 结论先行

**Start conversation 应该是两个阶段：**

1. `thread/start`：创建 app-server thread，设置 conversation/session 级默认值，例如模型、工作目录、审批策略、默认沙箱/权限、基础/开发者指令、personality、serviceName。
2. `turn/start`：在这个 thread 上启动第一轮，传入用户输入，以及只属于当前 turn 或 turn override 的能力，例如 `input`、`clientUserMessageId`、`outputSchema`、`sandboxPolicy`、turn 级模型/推理参数等。官方生命周期文档把 “start or resume thread” 和 “begin a turn” 明确分成两个步骤。([OpenAI 开发者][1])

**Follow-up 应该是：**

1. 如果 Worker 当前没有加载/订阅这个 thread，先 `thread/resume`，通常只用内部保存的 `threadId`，避免把 resume 当成用户可见配置更新接口。
2. 再 `turn/start` 启动新 turn；如果用户是在活跃 turn 上继续补充/steer，而不是新一轮 follow-up，则应走 `turn/steer`，并要求 `expectedTurnId`。`turn/steer` 不支持 overrides，且在没有活跃 turn 或 turn 不可 steer 时会失败。([OpenAI 开发者][1])

**最重要的 contract 设计原则：**

不要在 Web/API contract 里暴露 `thread/start`、`thread/resume`、`turn/start` 这些 app-server 方法名，也不要暴露 `sandbox`、`sandboxPolicy` 这种历史/协议字段。你的稳定 contract 应该暴露一个中性能力模型，例如 `execution` / `permissions` / `approval` / `model` / `response`，由 Worker 做版本感知映射。尤其是 `sandbox` 和 `sandboxPolicy` 不能合并成一个同名字段：源码显示 `thread/start` / `thread/resume` 使用 `sandbox`，而 `turn/start` 使用 `sandbox_policy` / `sandboxPolicy`，且 `permissions` 不能和它们组合使用。([GitHub][2])

---

## 2. app-server 三个方法的参数边界

### `thread/start`

源码里的 `ThreadStartParams` 包含这些主要字段：`model`、`model_provider`、`service_tier`、`cwd`、`runtime_workspace_roots`、`approval_policy`、`approvals_reviewer`、`sandbox`、`permissions`、`config`、`service_name`、`base_instructions`、`developer_instructions`、`personality`、`ephemeral`、`session_start_source`、`thread_source`、`environments`、`dynamic_tools`、`experimental_raw_events` 等。`permissions` 明确不能和 `sandbox` 一起使用。返回值会给出 thread、模型、cwd、指令来源、审批策略、legacy sandbox、active permission profile、reasoning effort 等有效配置。([GitHub][2])

这个方法的语义是**创建/加载一个 conversation 容器**，不是启动模型推理。它没有用户输入字段；第一条用户消息要通过后续 `turn/start` 发送。官方示例也是先 `thread/start`，拿到 `thread.id` 后再 `turn/start`。([OpenAI 开发者][1])

### `thread/resume`

源码里的 `ThreadResumeParams` 必填 `thread_id`，也有实验性的 `history` / `path`，优先级是 `history > path > thread_id`。它支持很多和 `thread/start` 相同的 override：`model`、`model_provider`、`service_tier`、`cwd`、`runtime_workspace_roots`、`approval_policy`、`approvals_reviewer`、`sandbox`、`permissions`、`config`、`base_instructions`、`developer_instructions`、`personality`、`excludeTurns`、`initialTurnsPage`。同样，`permissions` 不能和 `sandbox` 一起使用。([GitHub][2])

但在你的 Web API 里，`thread/resume` 最好被视为**Worker 内部的加载/订阅操作**，而不是用户可见的“继续对话配置更新”。官方文档也说明 resume 不会立刻更新 thread 的 `updatedAt`，只有后续 turn 才会更新；这进一步说明 resume 本身不等同于用户行为。([OpenAI 开发者][1])

另一个实际风险是：公开 issue 显示，`thread/resume` / fork 时的 `developerInstructions` override 曾经存在 stale override 问题。因此，除非你的 Worker 针对当前 Codex 版本有集成测试覆盖，不建议把 `developerInstructions` 的动态变更建模为 follow-up/resume 的常规能力。([GitHub][3])

### `turn/start`

源码里的 `TurnStartParams` 包含：`thread_id`、`client_user_message_id`、`input`、`responsesapi_client_metadata`、`additional_context`、`environments`、`cwd`、`runtime_workspace_roots`、`approval_policy`、`approvals_reviewer`、`sandbox_policy`、`permissions`、`model`、`service_tier`、`effort`、`summary`、`personality`、`output_schema`、`collaboration_mode`、`multi_agent_mode`。`permissions` 不能和 `sandboxPolicy` 一起使用。`UserInput` 支持 text、image、local image、skill、mention。([GitHub][4])

`turn/start` 是真正启动一次模型回合的方法。官方文档说明，`turn/start` 里的 turn-level overrides 会成为后续 turns 的默认值；但 `outputSchema` 只影响当前 turn。这一点对 contract 设计非常关键：`execution`、`cwd`、`model` 这类 override 可能是 sticky default，而 `response.schema` 应该是 per-turn 选项。([OpenAI 开发者][1])

---

## 3. `sandbox` 与 `sandboxPolicy` 的正确组合

公开 issue 明确指出，`thread/start` 的 `sandbox` 和 `turn/start` 的 `sandboxPolicy` 是两个不同层级的入口。交互式路径会在 `thread/start` 发送 `sandbox`，并在必要时在 `turn/start` 发送 `sandboxPolicy`；如果某些路径漏掉 `thread/start.sandbox`，app-server 可能回落到默认 workspace-write，造成权限行为不符合预期。([GitHub][5])

另一个 issue 也直接提出了插件侧的问题：start/resume 用的是 thread-level `sandbox`，但后续 `turn/start` 没有机会传 turn-level `sandboxPolicy`，因此无法表达 turn 级 override。该 issue 的建议正是把 thread-level shorthand sandbox 与 turn-level sandboxPolicy 分开处理，只在调用方显式给出 turn policy 时才传 `turn/start.sandboxPolicy`。([GitHub][6])

因此你的 contract 不应设计成：

```yaml
sandbox: ...
```

也不应让 Worker 无脑把 `sandbox` 和 `sandboxPolicy` 合并、互相覆盖或同名透传。

更合适的是稳定抽象：

```yaml
ExecutionPolicy:
  oneOf:
    - type: object
      required: [mode]
      properties:
        mode:
          enum: [readOnly, workspaceWrite, fullAccess]
        network:
          enum: [disabled, enabled]
        writableRoots:
          type: array
          items: { type: string }
        readOnlyRoots:
          type: array
          items: { type: string }

    - type: object
      required: [permissionProfile]
      properties:
        permissionProfile:
          type: string
```

Worker 映射规则建议：

| Contract 概念           | `thread/start` / `thread/resume` | `turn/start`                               | 规则                               |
| --------------------- | -------------------------------- | ------------------------------------------ | -------------------------------- |
| 简单默认执行模式              | `sandbox`                        | 可省略，或在需要 turn override 时转为 `sandboxPolicy` | conversation 默认值走 thread 层       |
| 细粒度 turn 执行策略         | 不强行塞进 `sandbox`                  | `sandboxPolicy`                            | 只在显式 turn override 或细粒度策略时使用     |
| permission profile    | `permissions`                    | `permissions`                              | 与 `sandbox` / `sandboxPolicy` 互斥 |
| 网络、额外 root、外部 sandbox | 尽量不要压扁为 legacy `sandbox`         | `sandboxPolicy`                            | 保留能力，避免丢语义                       |

官方命令执行文档也说明，`sandboxPolicy` 可使用与 turn overrides 相同的 shape；外部 sandbox 的 `networkAccess` 还有特殊限制。这进一步支持把 `execution` 抽象成能力模型，而不是把 app-server 字段原样暴露。([OpenAI 开发者][1])

---

## 4. 推荐的调用顺序

### Start conversation

```text
Worker
  ├─ ensure app-server connection
  ├─ initialize
  ├─ initialized
  ├─ thread/start
  │    └─ receives thread.id, sessionId/effective settings
  ├─ persist conversation mapping
  │    └─ conversationId -> appServerThreadId/sessionId/effective defaults
  ├─ turn/start
  │    └─ first user message
  └─ stream notifications until turn/completed
```

初始化只应在每个连接上做一次；未初始化会返回错误，重复初始化也会返回错误。官方文档还说明 app-server 使用 JSON-RPC 风格消息，但省略 `jsonrpc` header；服务端会发送 `codex/event` notifications，客户端需要持续读取 stream。([OpenAI 开发者][1])

### Follow-up

```text
Worker
  ├─ load conversation by conversationId
  ├─ if thread not currently loaded/subscribed:
  │    └─ thread/resume(threadId)
  ├─ if user wants a new assistant turn:
  │    └─ turn/start(threadId, input, optional turn overrides)
  ├─ if user wants to add to active turn:
  │    └─ turn/steer(threadId, expectedTurnId, input)
  └─ stream notifications until turn/completed
```

`thread/read` 适合“只读历史”场景；follow-up 需要 thread 处于可运行/订阅状态时，才应 resume。官方文档还说明客户端 unsubscribe 后，服务端可能在空闲约 30 分钟后卸载 thread，并发送 `thread/closed`。因此多设备 Web 控制台应允许 Worker 在需要时重新 resume，而不要假设 thread 永远常驻内存。([OpenAI 开发者][1])

---

## 5. 生命周期与事件模型

启动或恢复 thread 后，客户端应继续读取事件。官方事件文档列出 `turn/started`、`turn/completed`，并说明 item 状态应以 item 事件为事实源。换句话说，Web 不应只依赖 `turn/start` 的同步返回；同步返回只表示 turn 已被接受，实际生命周期要靠后续事件推进。([OpenAI 开发者][1])

建议你的内部状态机至少有：

```text
conversation:
  created
  loaded
  idle
  running
  waiting_for_approval
  interrupted
  failed
  closed

turn:
  accepted
  started
  streaming
  waiting_for_approval
  completed
  interrupted
  failed
```

审批是生命周期的一部分。官方文档描述了 command execution approval 和 file change approval：app-server 会发出 approval request，客户端必须 respond，turn 才能继续。你的 Web API 应把它暴露成稳定状态，例如 `waitingForApproval`，而不是暴露 app-server 的 approval notification 原始结构。([OpenAI 开发者][1])

中断也要作为正常终止状态处理。官方 `interrupt` 文档说明，中断会把正在运行的 turn 结束为 `interrupted`。([OpenAI 开发者][1])

---

## 6. 错误行为：同步错误与运行时错误分开建模

app-server 有两类错误：

**第一类：JSON-RPC request 级错误。**
例如未初始化、重复初始化、实验字段未启用、无效参数、thread 无法加载、`turn/steer` 没有活跃 turn、required MCP server 初始化失败、连接/负载错误等。官方文档特别说明，`-32001` 被过载、临时不可用和 session 问题复用，客户端应根据 message 做区分。([OpenAI 开发者][1])

**第二类：turn 运行时错误事件。**
官方事件文档列出 `error` event，并给出 `codexErrorInfo`，包括 `context_window_exceeded`、`usage_limit_exceeded`、`server_overloaded`、`cyber_policy`、`http_connection_failed`、`sandbox_error`、`active_turn_not_steerable` 等；如果上游返回 HTTP status，也会透传。源码里的 `CodexErrorInfo` 枚举也包含这些类别。([OpenAI 开发者][1])

你的稳定 API 可以统一成：

```yaml
CodexRemoteError:
  type: object
  required: [code, message, retryable]
  properties:
    code:
      enum:
        - invalid_request
        - not_initialized
        - conversation_not_found
        - conversation_closed
        - active_turn_conflict
        - active_turn_not_steerable
        - approval_rejected
        - context_window_exceeded
        - usage_limit_exceeded
        - policy_violation
        - sandbox_error
        - upstream_unavailable
        - unauthorized
        - internal
    message:
      type: string
    retryable:
      type: boolean
    upstream:
      type: object
      description: Internal/debug only; redact by default.
```

不要把 app-server 的 raw JSON-RPC code 作为公开 API 的主 code；它可以进入内部日志、debug metadata 或管理员诊断视图。

---

## 7. 推荐的 `StartConversationInput`

建议 `StartConversationInput` 表达“创建远程 conversation 并启动第一 turn”，而不是表达 app-server 的 `thread/start` 参数。

```yaml
StartConversationInput:
  type: object
  required:
    - workspaceId
    - message
  properties:
    workspaceId:
      type: string
      description: Codex Remote 的 workspace/project 标识，不是 app-server threadId。

    cwd:
      type: string
      description: 该 conversation 的默认工作目录。

    message:
      $ref: "#/components/schemas/TurnInput"

    clientMessageId:
      type: string
      description: 客户端生成的幂等/去重 ID，映射到 clientUserMessageId。

    model:
      $ref: "#/components/schemas/ModelSelection"

    execution:
      $ref: "#/components/schemas/ExecutionPolicy"

    approval:
      $ref: "#/components/schemas/ApprovalSettings"

    instructions:
      $ref: "#/components/schemas/ConversationInstructions"

    personality:
      type: string

    response:
      $ref: "#/components/schemas/TurnResponseOptions"

    metadata:
      type: object
      additionalProperties: true
```

配套类型：

```yaml
ModelSelection:
  type: object
  required: [id]
  properties:
    id:
      type: string
    provider:
      type: string
      description: 只作为 conversation-level 选择；不要假设 follow-up turn/start 支持 provider。
    serviceTier:
      type: string

ApprovalSettings:
  type: object
  properties:
    policy:
      enum: [untrusted, onRequest, never, granular]
    reviewer:
      enum: [user, autoReview]

ConversationInstructions:
  type: object
  properties:
    base:
      type: string
    developer:
      type: string

TurnResponseOptions:
  type: object
  properties:
    outputSchema:
      type: object
      additionalProperties: true
```

注意 `model.provider` 的边界：源码显示 `thread/start` 和 `thread/resume` 有 `model_provider`，但 `turn/start` 只有 `model`，没有 `model_provider`。公开 issue 也指出过这个不一致。因此，`provider` 不应作为普通 follow-up turn override 暴露，除非你的 Worker 明确通过 resume 或新 thread 实现并测试过。([GitHub][2])

`response.outputSchema` 可以放在 StartConversationInput，因为它会映射到第一轮 `turn/start.outputSchema`，但文档明确说它只影响当前 turn，不会成为后续默认值。([OpenAI 开发者][1])

---

## 8. 推荐的 `FollowUpInput`

Follow-up 应该表达“对已有 conversation 发起一个新用户 turn”，而不是“resume thread”。

```yaml
FollowUpInput:
  type: object
  required:
    - conversationId
    - message
  properties:
    conversationId:
      type: string
      description: Codex Remote conversation ID；Worker 内部映射到 app-server threadId。

    message:
      $ref: "#/components/schemas/TurnInput"

    clientMessageId:
      type: string

    response:
      $ref: "#/components/schemas/TurnResponseOptions"

    turnOverrides:
      $ref: "#/components/schemas/TurnOverrides"

    delivery:
      type: object
      properties:
        mode:
          enum: [newTurn, steerActiveTurn]
          default: newTurn
        expectedTurnId:
          type: string
          description: mode=steerActiveTurn 时必填。
```

```yaml
TurnOverrides:
  type: object
  properties:
    model:
      type: object
      properties:
        id:
          type: string
        serviceTier:
          type: string

    cwd:
      type: string

    execution:
      $ref: "#/components/schemas/ExecutionPolicy"

    approval:
      $ref: "#/components/schemas/ApprovalSettings"

    reasoning:
      type: object
      properties:
        effort:
          type: string
        summary:
          type: string

    personality:
      type: string
```

这里有一个关键语义选择：因为 `turn/start` 的 overrides 会成为后续 turns 的默认值，你需要在 API 文档中明确 `turnOverrides` 是“更新 conversation 后续默认值的 turn override”，还是“仅本次 turn”。app-server 原生语义偏向 sticky defaults；如果你想提供“仅本次 turn”的稳定语义，Worker 必须在 turn 完成后恢复旧默认值，或者禁止这类字段做 per-turn 临时 override。官方文档明确了 turn-level overrides 会成为后续 turns 默认值，因此这里不能含糊。([OpenAI 开发者][1])

`delivery.mode=steerActiveTurn` 应单独建模，因为 `turn/steer` 与 `turn/start` 能力不同：它需要 `expectedTurnId`，不会发送 `turn/started`，也不支持 overrides。([OpenAI 开发者][1])

---

## 9. Worker 内部映射建议

### Start 映射

```ts
async function startConversation(input: StartConversationInput) {
  const normalized = normalizeAndValidate(input);

  const thread = await app.threadStart({
    model: normalized.model?.id,
    modelProvider: normalized.model?.provider,
    serviceTier: normalized.model?.serviceTier,
    cwd: normalized.cwd,
    approvalPolicy: mapApprovalPolicy(normalized.approval?.policy),
    approvalsReviewer: mapReviewer(normalized.approval?.reviewer),
    ...mapExecutionForThread(normalized.execution),
    baseInstructions: normalized.instructions?.base,
    developerInstructions: normalized.instructions?.developer,
    personality: normalized.personality,
    serviceName: "codex-remote"
  });

  persistConversation({
    conversationId,
    appServerThreadId: thread.thread.id,
    effectiveDefaults: extractEffectiveDefaults(thread),
    normalizedStartInput: normalized
  });

  const turn = await app.turnStart({
    threadId: thread.thread.id,
    clientUserMessageId: normalized.clientMessageId,
    input: mapTurnInput(normalized.message),
    outputSchema: normalized.response?.outputSchema,
    ...mapExecutionForTurnIfNeeded(normalized.execution),
  });

  return { conversationId, turnId: turn.turn.id };
}
```

### Follow-up 映射

```ts
async function followUp(input: FollowUpInput) {
  const conversation = await db.getConversation(input.conversationId);

  if (!conversation.loadedInCurrentWorker) {
    await app.threadResume({
      threadId: conversation.appServerThreadId
      // Avoid passing user-level overrides here unless explicitly required.
    });
  }

  if (input.delivery?.mode === "steerActiveTurn") {
    await app.turnSteer({
      threadId: conversation.appServerThreadId,
      expectedTurnId: input.delivery.expectedTurnId,
      input: mapTurnInput(input.message)
    });
    return;
  }

  const turn = await app.turnStart({
    threadId: conversation.appServerThreadId,
    clientUserMessageId: input.clientMessageId,
    input: mapTurnInput(input.message),
    outputSchema: input.response?.outputSchema,
    ...mapTurnOverrides(input.turnOverrides)
  });

  return { conversationId: input.conversationId, turnId: turn.turn.id };
}
```

`thread/resume` 可以接受 override，但在 Remote 架构里应尽量避免把它变成业务语义入口。它更适合解决“当前 Worker 没有加载该 app-server thread”的运行时问题。公开 issue 也显示 resume/turn permission provenance 复杂，难以诊断；更好的做法是让 contract 只有一个清晰的配置变更入口，并在 DB 中记录每次 override 的来源。([GitHub][7])

---

## 10. 你应该在 DB 中保存的内部状态

至少保存：

```text
Conversation
  id                        # Codex Remote conversationId
  appServerThreadId          # internal only
  appServerSessionId         # if returned/known
  appServerVersion/schemaVersion
  workspaceId
  cwd
  effectiveModel
  effectiveModelProvider
  effectiveApprovalPolicy
  effectiveExecutionPolicy
  activePermissionProfile
  instructionsHash
  personality
  status
  activeTurnId
  lastCompletedTurnId
  eventCursor/checkpoint
  createdAt
  updatedAt

Turn
  id                         # Codex Remote turn id or app-server turn id mapping
  appServerTurnId
  conversationId
  clientMessageId
  inputDigest
  status
  startedAt
  completedAt
  errorCode
  errorInfo
  approvals
```

保存 `effective*` 很重要，因为 app-server 返回的有效设置可能不是你请求的原值；例如配置文件、project config、默认权限、legacy sandbox 与 permission profile 都可能影响最终行为。官方文档和源码都把 effective model/cwd/approval/sandbox/permission profile 作为 start/resume response 的一部分返回。([GitHub][2])

---

## 11. Contract 中应避免暴露的 app-server 细节

不建议暴露：

```text
thread/start
thread/resume
turn/start
threadId
sessionId
path
history
excludeTurns
initialTurnsPage
experimental_raw_events
dynamicTools
mockExperimentalField
sandbox
sandboxPolicy
modelProvider as follow-up turn override
```

可以暴露为稳定能力：

```text
conversationId
message
workspace/cwd
model.id
model.provider only at conversation creation or explicit conversation settings
execution
approval
response.outputSchema
clientMessageId
delivery.mode
expectedTurnId
```

这样既不泄漏 app-server 方法结构，又保留了必要能力：多设备恢复、首轮启动、后续 turn、活跃 turn steer、权限/审批、结构化输出、模型选择和幂等去重。

---

## 12. 最小可执行设计建议

对你的 `packages/api-contract/openapi.yaml`，我建议采用以下分层：

```text
StartConversationInput
  = ConversationCreateOptions
  + FirstTurnInput

FollowUpInput
  = ExistingConversationRef
  + NewTurnInput
  + OptionalTurnOverrides
  + OptionalSteerMode
```

不要让 `FollowUpInput` 继承 `StartConversationInput`。二者共享 `TurnInput`、`ExecutionPolicy`、`ApprovalSettings`、`TurnResponseOptions`，但语义不同：

| 字段                      | StartConversationInput  | FollowUpInput        |
| ----------------------- | ----------------------- | -------------------- |
| `conversationId`        | 不需要，由服务端生成              | 必填                   |
| `message`               | 第一条用户消息                 | 后续用户消息               |
| `model.provider`        | 可以支持                    | 不建议支持                |
| `instructions`          | 可以支持 conversation-level | 不建议直接支持              |
| `execution`             | conversation 默认执行策略     | 仅作为明确 turn override  |
| `response.outputSchema` | 第一 turn 当前有效            | 当前 follow-up turn 有效 |
| `delivery.mode`         | 通常不需要                   | 可区分 new turn / steer |

核心约束写进 OpenAPI 描述和 Worker validator：

1. `execution.permissionProfile` 与 `execution.mode` 互斥。
2. `model.provider` 只允许在 start 或显式 conversation settings update 中出现。
3. `response.outputSchema` 是 per-turn，不持久化为 conversation 默认值。
4. `turnOverrides` 的 sticky/per-turn 语义必须明确；默认按 app-server sticky 行为处理更简单。
5. `steerActiveTurn` 不允许带 `turnOverrides`。
6. Worker 永远不要同时向 app-server 发送 `permissions` 和 `sandbox` / `sandboxPolicy`。
7. Worker 永远不要把 `thread/start.sandbox` 与 `turn/start.sandboxPolicy` 当成同一个字段直接透传。

这个设计能让 `openapi.yaml` 成为稳定产品 contract，`codex-protocol` 保持 app-server 原始协议事实源，而 Worker 作为唯一翻译层吸收 Codex 协议的字段不一致、实验字段、sticky override 和错误模型变化。

[1]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[2]: https://github.com/openai/codex/raw/refs/heads/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs "raw.githubusercontent.com"
[3]: https://github.com/openai/codex/issues/19045 "thread/resume and thread/fork ignore developerInstructions override on first resumed turn · Issue #19045 · openai/codex · GitHub"
[4]: https://github.com/openai/codex/raw/refs/heads/main/codex-rs/app-server-protocol/src/protocol/v2/turn.rs "raw.githubusercontent.com"
[5]: https://github.com/openai/codex/issues/15310 "Desktop automations silently fall back to workspace-write sandbox regardless of app configuration · Issue #15310 · openai/codex · GitHub"
[6]: https://github.com/openai/codex-plugin-cc/issues/107 "Enhancement: support turn/start sandboxPolicy for task-like commands in externally sandboxed environments · Issue #107 · openai/codex-plugin-cc · GitHub"
[7]: https://github.com/openai/codex/issues/24570 "Add permission provenance diagnostics for resumed threads and turns · Issue #24570 · openai/codex · GitHub"
