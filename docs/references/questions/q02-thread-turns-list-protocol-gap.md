---
title: "Q2：缺少 thread/turns/list"
source_url: "https://chatgpt.com/c/6a34fccb-fba8-83ee-9ec6-9400d2beb4bb"
exported_at: "2026-06-19T17:08:06"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

`thread/turns/list` **不是不存在，也不是重命名**。它在 openai-codex 官方 app-server protocol 源码里存在，但被标记为 **experimental method**；默认生成的 protocol 是 stable-only，所以 `ClientRequest` 不会包含它。要让生成物暴露该方法，需要用 `codex app-server generate-ts --experimental` / `generate-json-schema --experimental` 重新生成，并且运行时 `initialize` 必须声明 `capabilities.experimentalApi: true`。官方文档明确说明：生成物默认过滤 experimental surface，只有传 `--experimental` 才会包含 experimental methods / fields；运行时未 opt-in 会返回类似 `<descriptor> requires experimentalApi capability` 的错误。([GitHub][1])

因此，你现在的 `precondition_missing` 判断是合理的；真正要改的是 protocol 生成模式和运行时 capability，而不是手写上游 request type。

## 关键证据

官方 protocol 源码中，`ClientRequest` 的宏定义里有 `ThreadTurnsList => "thread/turns/list"`，并且前面带有 `#[experimental("thread/turns/list")]` 标记。这说明该方法是官方协议的一部分，但属于 experimental surface。([GitHub][2])

官方 app-server README 也把 `thread/turns/list` 列在 API overview 里，并说明它用于分页读取存储线程的 turn history，支持 `cursor`、`sortDirection`、`itemsView`、`nextCursor`、`backwardsCursor`。同一份 README 说明 schema / TS 生成物与执行生成命令的 Codex 版本严格匹配。([GitHub][1])

更直接的根因来自 PR #20499：`thread/turns/list` 和 `exclude_turns` 被标为 experimental，PR 描述说明原因是“还有一些 bug，要解决后才适合作为 public API 消费”。这基本解释了为什么 stable generated `ClientRequest` 没有这个 method。([GitHub][3])

`itemsView` 是后续演进。PR #21566 更新了 `thread/turns/list`，加入 `itemsView?: "notLoaded" | "summary" | "full" | null`，默认 `summary`；`notLoaded` 返回空 items，`summary` 返回摘要 items，`full` 保持原来的 full items 行为。该 PR 还说明当前实现仍会加载完整 rollout 后再 slice，真正的存储层分页还在后续演进。([GitHub][4])

Codex CLI 0.130.0 release notes 明确包含这一变更：“App-server clients can page large threads with unloaded, summary, or full turn item views”，对应 PR #21566。因此，若你需要 `thread/turns/list(itemsView: "full")`，实际版本下限应按 **Codex CLI >= 0.130.0** 处理；更稳妥是直接升级到当前最新 release 后重新生成。官方 releases 页面显示 0.141.0 是 2026-06-18 的 latest release。([OpenAI 开发者][5])

## 对你当前现象的判断

你的现象最可能是：

```text
生成命令没有带 --experimental
→ generated ClientRequest 是 stable-only
→ thread/turns/list 被过滤
→ Worker probe 无法通过 generated protocol 构造 request
→ 只能记录 precondition_missing
```

这不是生成器漏导出，而是生成器按设计过滤 experimental API。官方 README 写得很明确：默认生成 stable surface；要包含 experimental methods / fields，需要传 `--experimental`。([GitHub][1])

还有一个版本维度需要区分：

| 现象                                                   | 最可能原因                                                       | 处理                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `ClientRequest` 完全没有 `thread/turns/list`             | stable-only 生成，或 Codex CLI 太旧                               | 用新 CLI 加 `--experimental` 重新生成                          |
| 有 `thread/turns/list`，但 params 没有 `itemsView`        | 生成自 0.130.0 之前的 protocol                                    | 升级到 >= 0.130.0 后重新生成                                    |
| TS 类型有该 request，但 server 返回 requires experimentalApi | `initialize` 没有声明 experimental capability                   | `initialize.params.capabilities.experimentalApi = true` |
| TS 类型有该 request，但 server 返回 method not found         | 运行时 app-server binary 与生成 protocol 的 binary 不一致，或 server 太旧 | 保证生成与运行使用同一 Codex 版本                                    |
| `thread/turns/items/list` 返回 unsupported / -32601    | 这是预期；PR #21566 只加了 experimental stub，server 返回 unsupported  | 不要依赖它作为正式能力                                             |

`thread/turns/items/list` 不应与 `thread/turns/list` 混淆。官方 docs 说前者目前是 reserved / unsupported，PR #21566 也说明它只是 protocol、schema、dispatcher、processor stub，服务器返回 JSON-RPC unsupported。([OpenAI 开发者][6])

## schema 结构变化的影响

这里还有一个容易误判的点：PR #21251 把 v2 API definitions 从一个巨大的 `v2.rs` 拆成模块树，PR 描述称这是 mechanical refactor，目标是把约 12k 行的 `v2.rs` 拆分，核心 API schema 语义并不是因为这个 PR 被重命名或删除。([GitHub][7])

所以如果你在源码里只看旧路径或单个 `v2.rs`，可能会以为某些类型消失了。对 `codex-protocol` 来说，不应该手工追踪源码文件布局，而应该继续以官方生成命令输出为事实源。

## 推荐升级方案

### 1. 升级 Codex CLI，并固定版本

最低需要覆盖 PR #21566，因此建议至少：

```bash
codex --version
# 需要 >= 0.130.0，建议使用当前统一部署版本
```

如果 Codex Remote 的目标是多设备控制台，建议把生成 protocol 的 Codex binary 与 Worker / app-server 实际运行的 Codex binary 绑定为同一版本。官方文档说明 generated schema artifacts 与生成它们的 Codex 版本匹配；混用版本会让类型与 runtime 行为不一致。([OpenAI 开发者][6])

### 2. 用 experimental surface 重新生成

你的 `packages/codex-protocol` 可以继续保持“唯一事实源”，但生成命令要显式选择 experimental：

```bash
codex app-server generate-ts \
  --out packages/codex-protocol/src/generated \
  --experimental

codex app-server generate-json-schema \
  --out packages/codex-protocol/schema \
  --experimental
```

官方 README 明确说明 `--experimental` 会把 experimental methods / fields 纳入 TS 和 JSON schema 输出。([GitHub][1])

如果你想保持稳定 API 与实验 API 边界，可以生成两个入口：

```text
packages/codex-protocol/stable
packages/codex-protocol/experimental
```

Worker read-only probe 使用 `experimental` 入口；普通稳定功能继续使用 `stable` 入口。这样仍然没有手写 request type，只是消费官方 generated experimental protocol。

### 3. 初始化时 opt in experimentalApi

生成物包含 `thread/turns/list` 还不够。运行时也必须在 `initialize` 里 opt in：

```json
{
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "codex-remote",
      "title": "Codex Remote",
      "version": "..."
    },
    "capabilities": {
      "experimentalApi": true
    }
  }
}
```

官方 docs / README 都说明：省略或设为 false 时只启用 stable surface；experimental request 会被拒绝。([OpenAI 开发者][6])

### 4. 对 `itemsView` 做版本门控

`thread/turns/list` 与 `itemsView` 不是同一天稳定出现的。PR #21063 先给 app-server `Turn` payload 加了 `itemsView` metadata，并保持当时 `thread/turns/list` 返回 full turns 的行为；PR #21566 才把 `itemsView` 作为 `thread/turns/list` 的 request 参数加入，并定义 `notLoaded`、`summary`、`full` 三种模式。([GitHub][8])

建议在 `codex-protocol` 生成后产出一个 manifest，例如：

```json
{
  "generatedFromCodexVersion": "0.141.0",
  "experimental": true,
  "hasThreadTurnsList": true,
  "hasThreadTurnsListItemsView": true,
  "hasThreadTurnsItemsList": true,
  "schemaHash": "..."
}
```

Worker probe 启动时先读 manifest：

```text
hasThreadTurnsList=false
→ precondition_missing

hasThreadTurnsList=true, hasThreadTurnsListItemsView=false
→ capability_missing: thread/turns/list.itemsView

hasThreadTurnsList=true, hasThreadTurnsListItemsView=true
→ 可发起 typed read-only probe
```

## Worker probe 的建议行为

对 read-only probe，建议保留当前“不手写上游 request type”的约束，并把状态细分：

```ts
type ThreadTurnsProbeStatus =
  | "ok"
  | "precondition_missing"          // generated protocol 没有 method
  | "items_view_missing"            // method 有，但 params 没有 itemsView
  | "experimental_not_enabled"      // server 要求 experimentalApi
  | "method_not_found"              // runtime app-server 版本不匹配或太旧
  | "unsupported"                   // 例如 thread/turns/items/list stub
  | "error";
```

实际 probe 建议先低成本调用：

```json
{
  "method": "thread/turns/list",
  "params": {
    "threadId": "...",
    "limit": 1,
    "itemsView": "summary"
  }
}
```

再按需要测：

```json
{
  "method": "thread/turns/list",
  "params": {
    "threadId": "...",
    "limit": 1,
    "itemsView": "full"
  }
}
```

原因是 PR #21566 说明当前实现仍会加载完整 rollout 再分页，`itemsView: "full"` 对大线程可能比较重。([GitHub][4])

## 最终处理建议

你应该把当前问题归类为：

```text
primary cause: generated protocol 默认 stable-only，过滤了 experimental method
secondary cause: itemsView 需要 Codex CLI >= 0.130.0
not cause: 方法不存在
not cause: 方法重命名
not cause: 生成器漏导出
possible confusion: v2 schema 源码文件被拆分，但不是 API 删除
```

落地方案：

1. 升级 Codex CLI 到至少 `0.130.0`，最好与部署 app-server 使用同一最新版本。
2. 用 `--experimental` 重新生成 `packages/codex-protocol` 的 TS 和 JSON schema。
3. Worker 的 `initialize` 加 `capabilities.experimentalApi: true`。
4. 继续禁止手写 request type；只从 generated experimental protocol 导入 `ClientRequest`。
5. CI 增加断言：generated protocol 必须包含 `thread/turns/list`，且 `ThreadTurnsListParams` 必须包含 `itemsView` 的 `notLoaded | summary | full`。
6. Runtime 增加版本 / capability probe，避免 generated protocol 与实际 app-server binary 不一致。
7. 若 experimental 不可用，继续记录 `precondition_missing`，或退回 `thread/read includeTurns:true` 作为非分页 fallback；不要手写 `thread/turns/list` request。

[1]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
[2]: https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/src/protocol/common.rs "raw.githubusercontent.com"
[3]: https://github.com/openai/codex/pull/20499 "fix(app-server): mark thread/turns/list and exclude_turns as experime… by owenlin0 · Pull Request #20499 · openai/codex · GitHub"
[4]: https://github.com/openai/codex/pull/21566 "feat(app-server, threadstore): Thread pagination APIs and ThreadStore contract by owenlin0 · Pull Request #21566 · openai/codex · GitHub"
[5]: https://developers.openai.com/codex/changelog?type=codex-cli "Changelog – Codex | OpenAI Developers"
[6]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[7]: https://github.com/openai/codex/pull/21251 "chore(app-server-protocol): split v2 API definitions into modules by owenlin0 · Pull Request #21251 · openai/codex · GitHub"
[8]: https://github.com/openai/codex/pull/21063 "add turn items view to app-server turns by rhan-oai · Pull Request #21063 · openai/codex · GitHub"
