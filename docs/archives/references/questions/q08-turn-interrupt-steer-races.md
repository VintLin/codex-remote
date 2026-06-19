---
title: "Q8：Codex app-server 竞态规则"
source_url: "https://chatgpt.com/c/6a34fe9d-771c-83ee-bc7e-1743167f70a2"
exported_at: "2026-06-19T17:07:28"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

截至这次调研，公开可确认来源主要是 OpenAI Codex app-server 文档、`openai/codex` 仓库 README、app-server/core Rust 源码，以及少量 GitHub issue 现场证据。结论：`turn/steer` 的竞态语义比较清晰；`turn/interrupt` 文档描述较简化，当前源码实现里有更细的“挂起响应直到 turn 终止事件”的行为。

## 1. `expectedTurnId` 的语义

`turn/steer.expectedTurnId` 是一个 **compare-and-append guard**：只有“当前 active turn 的 id 等于 `expectedTurnId`，且该 active turn 是可 steer 的普通 running turn”时，app-server 才把新用户输入追加到这个正在运行的 turn。成功返回 `{ "turnId": "<active turn id>" }`，不会发新的 `turn/started`，也不接受 model/cwd/sandbox/output schema 等 turn 设置覆盖。`expectedTurnId` 缺失、没有 active turn、id 不匹配、active turn 是 review/manual compact 等不可 steer 类型，都会失败为 invalid request。([GitHub][1])

它不是幂等键，不是历史 turn 选择器，也不是“把输入投递到某个旧 turn”的目标 id。它的核心作用是 fail closed：如果浏览器 A 还以为 `turn_old` 在跑，但 Worker/app-server 实际已经进入空闲或启动了 `turn_new`，`turn/steer` 不会把这条输入误追加到 `turn_new`。源码里的 mismatch 错误文本是：`expected active turn id \`{expected}` but found `{actual}``，JSON-RPC error code 是 `-32600` invalid request。([GitHub][2])

`turn/interrupt` 的当前 app-server 协议参数不是 `expectedTurnId`，而是 `{ threadId, turnId }`；但源码把 `turnId` 实际当作“预期 active turn id”来校验：若存在 active turn 但 id 不等于请求里的 `turnId`，返回 invalid request，消息为 `expected active turn id {turn_id} but found {active_turn.id}`。([GitHub][1])

## 2. `turn/steer` 的返回与竞态规则

`turn/steer` 的可确认行为如下：

| 场景                                             | 返回 / 行为                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 当前有 running regular turn，且 `expectedTurnId` 匹配 | 成功：`{ "turnId": "<same turn id>" }`；输入追加到同一个 turn；不产生新的 `turn/started`。                                                   |
| 当前没有 active turn，例如 turn 已完成且事件状态已处理           | JSON-RPC error `-32600`，消息：`no active turn to steer`。                                                                     |
| 当前有 active turn，但 id 与 `expectedTurnId` 不同     | JSON-RPC error `-32600`，消息：`expected active turn id \`{expected}` but found `{actual}``。                                  |
| 当前 active turn 是 review 或 manual compact       | JSON-RPC error `-32600`，消息类似 `cannot steer a review turn` / `cannot steer a compact turn`，并带 `ActiveTurnNotSteerable` 数据。 |
| `input` 为空                                     | JSON-RPC error `-32600`，消息：`input must not be empty`。                                                                     |
| `expectedTurnId` 为空                            | JSON-RPC error `-32600`，消息：`expectedTurnId must not be empty`。                                                            |

这些错误分支在 app-server `turn_steer` 实现中是显式分支，不是推断。([GitHub][2])

重复 `turn/steer` 不是幂等操作。README 只说明 `clientUserMessageId` 会被回显为 `userMessage.clientId`，没有说明会去重；源码路径也没有发现基于 `clientUserMessageId` 或请求内容的 dedupe。也就是说，同一条 steer 如果在同一 running turn 上被发送两次且两次都通过 `expectedTurnId` 检查，按当前实现应视为两次追加；如果第二次到达时 turn 已终止，则会变成 `no active turn to steer` 或 mismatch。([GitHub][1])

## 3. `turn/interrupt` 的返回与竞态规则

文档里的表述是：`turn/interrupt` 用 `{ threadId, turnId }` 取消 running turn，成功响应 `{}`，随后发 `turn/completed` 且 `status: "interrupted"`；还明确说不要靠 RPC 本身判断完成，要依赖 `turn/completed` 事件。([GitHub][1])

源码里有一个重要细节：普通 turn 的 `turn/interrupt` 请求不是立即返回 `{}`。app-server 会先校验 active turn，然后把请求 id 放入 `pending_interrupts`，提交 core `Op::Interrupt`；响应会在后续 `TurnAborted` 或 `TurnComplete` 事件处理中被 drain，并对所有 pending interrupt 请求发送 `TurnInterruptResponse {}`。([GitHub][2])

这导致实际竞态语义应按下面理解：

| 场景                                                             | 返回 / 行为                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| active turn 存在且 `turnId` 匹配，interrupt 赢得竞态                     | 请求被挂起；收到 `TurnAborted` 后返回 `{}`，并发 `turn/completed`，`status: "interrupted"`。                                |
| active turn 存在且 `turnId` 匹配，但 turn 自然完成先发生                     | pending interrupt 仍可能收到 `{}`，但终态可能是 `completed` 或 `failed`，不是 `interrupted`。所以 `{}` 不能被当作“必然中止成功”的唯一证据。     |
| active turn 存在但 id 不同                                          | JSON-RPC error `-32600`，消息：`expected active turn id {requested_turn_id} but found {actual_active_turn_id}`。 |
| 没有 active turn，且请求的 `turnId` 是最近终止 turn，或 agent 已不在 running 状态 | JSON-RPC error `-32600`，消息：`no active turn to interrupt`。                                                   |
| 重复 interrupt，且 turn 仍保持同一个 active turn                         | 当前源码没有重复请求去重；多个请求会进入 `pending_interrupts`，终止事件到来时都可能收到 `{}`。                                                |
| 重复 interrupt，但 turn 已终止                                        | `no active turn to interrupt`。                                                                              |

因此，对你的 Codex Remote 来说，`turn/interrupt` 的 `{}` 更安全的解释是：**app-server 已把这个 interrupt 请求解析到某个 terminal turn transition 上**；真正的 UI 状态必须以 `turn/completed.turn.status` 为准。([GitHub][2])

另一个容易漏掉的点：`turn/interrupt` 不会清理后台 terminal/shell；文档要求显式使用 `thread/backgroundTerminals/clean` 清理后台终端。([GitHub][1])

## 4. 断线重连时的规则

app-server 要求每个 transport connection 先发一次 `initialize`；未初始化就调用其他方法会得到 `"Not initialized"`，同一连接重复 initialize 会得到 `"Already initialized"`。所以 Worker 重连后必须重新 initialize，再恢复/订阅 thread 状态；不能把旧连接上的 in-flight JSON-RPC response 或旧 active turn 缓存当作仍然有效。([GitHub][1])

公开 issue 里已经出现过类似 stale-state 场景：慢 WebSocket client 被 app-server 断开后，客户端没收到 `turn/completed`，但服务端实际 thread 已经 idle；之后 stale TUI 仍把下一条输入当作 `turn/steer`，带着已完成 turn 的 `expectedTurnId` 发过去。这个 issue 的期望行为也明确提到：客户端应退出、重连后 reconcile，或清空 stale active-turn 状态，而不是继续向已完成 turn steer。([GitHub][3])

另外，README 说明 app-server WebSocket transport 当前是 experimental/unsupported，不应直接作为生产可靠通道暴露给多设备 Web；你现在“Web 只调稳定 API，Worker 唯一调用 app-server”的分层是合理的。([GitHub][1])

## 5. 并发 steer / interrupt 的实际结果

公开源码没有给出“并发 steer 与 interrupt 的全序保证”。可确认的是，core 的 `steer_input` 对 active turn 检查和 turn 状态更新持锁，注释明确说这些检查和更新必须保持原子；但 app-server 的 interrupt 请求有自己的 thread-state 校验和 pending interrupt 队列，二者在请求层面仍会按运行时调度竞争。([GitHub][4])

安全建模如下：

| 并发顺序                                                | 可能结果                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| steer 先通过 core active-turn 检查                       | steer 返回 `{ turnId }`；随后 interrupt 可能把 turn 中止。被 steer 的输入不应被 UI 当作“模型一定已处理”。                |
| interrupt 先导致 core turn abort / terminal transition | steer 可能返回 `no active turn to steer` 或 expectedTurnId mismatch。                              |
| interrupt 已挂起，但 turn 自然完成                           | interrupt RPC 可能收到 `{}`，但 `turn/completed.status` 可能是 `completed`/`failed` 而非 `interrupted`。 |
| 两个 Web 设备同时 steer 同一个 expectedTurnId                | 两个都可能成功追加；顺序取决于 Worker/app-server 调度，协议没有给跨客户端 timestamp ordering 保证。                        |
| 两个 Web 设备同时 interrupt 同一个 turn                      | 两个都可能进入 pending interrupt 并最终收到 `{}`；终态仍只看 `turn/completed`。                                 |

## 6. 对 Codex Remote 的 fail-closed 设计建议

把 Web API 设计成自己的稳定 CAS 层，不要把 app-server 的竞态直接暴露给浏览器：

```ts
type SteerTurnInput = {
  threadId: string;
  expectedTurnId: string;
  clientOpId: string;          // 你的业务幂等键
  clientUserMessageId: string; // 传给 app-server，仅用于 item 回显/展示关联
  input: UserInput[];
};

type InterruptTurnInput = {
  threadId: string;
  expectedTurnId: string; // Web 层命名；Worker 转成 app-server turnId
  clientOpId: string;
};
```

Worker 侧对每个 `threadId` 加单线程队列或 mutex，先做本地 preflight，再调用 app-server：

```ts
withThreadLock(threadId, () => {
  assert(workerConnection.initialized && workerConnection.healthy);

  const st = state.threads[threadId];

  if (st.status !== "running") throw Conflict("turn is not running");
  if (st.activeTurnId !== input.expectedTurnId) {
    throw Conflict("expectedTurnId does not match active turn");
  }

  if (op === "steer") {
    if (st.interruptRequested) throw Conflict("turn is interrupting");
    if (st.turnKind !== "regular") throw Conflict("turn is not steerable");
    if (input.input.length === 0) throw BadRequest("input must not be empty");

    return appServer.turnSteer({
      threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: input.clientUserMessageId,
      input: input.input,
    });
  }

  if (op === "interrupt") {
    st.interruptRequested = true;
    return appServer.turnInterrupt({
      threadId,
      turnId: input.expectedTurnId,
    });
  }
});
```

推荐策略：

1. **Web 层所有控制请求都必须带 `expectedTurnId`**。即使 app-server 的 `turn/interrupt` 字段叫 `turnId`，你的 API 也应使用 `expectedTurnId` 语义，然后由 Worker 转换。
2. **Worker 本地先 fail closed**：无 active turn、连接未初始化/不健康、`expectedTurnId` 不匹配、turn 已处于 `interrupting`，都不要调用 app-server。
3. **steer 不自动重试**：如果 Worker→app-server 的 response 丢失，重试可能造成重复追加。使用 `clientOpId` 做你的业务状态查询，而不是盲目 replay。
4. **interrupt 可重试但应先 reconcile**：如果响应丢失，先读/恢复 thread 状态；只有同一个 turn 仍 active 且用户意图仍是 stop，才重新发 interrupt。
5. **收到 interrupt `{}` 不等于 UI 立即标记 interrupted**：状态应是 `interrupting`；只有收到 `turn/completed.status === "interrupted"` 才标记中止成功。如果收到 `completed`/`failed`，说明 stop 太晚或被自然终止竞态击败。
6. **断线后清空 app-server 连接级 pending 假设**：重新 initialize、resume/read thread、重建 `activeTurnId`；任何浏览器缓存的 running 状态都必须重新通过 Worker 的 authoritative state 校验。
7. **并发控制在 Worker 串行化**：多设备同时 steer/interrupt 时，不要让它们直接竞争 app-server。Worker 应定义自己的策略，例如 interrupt 作为 terminal barrier：一旦接受 interrupt，同 turn 的后续 steer 全部 409。

[1]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[2]: https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server/src/codex_message_processor.rs "raw.githubusercontent.com"
[3]: https://github.com/openai/codex/issues/18860?utm_source=chatgpt.com "Remote TUI can remain stale after app-server slow- ..."
[4]: https://github.com/openai/codex/raw/refs/heads/main/codex-rs/core/src/session/mod.rs "raw.githubusercontent.com"
