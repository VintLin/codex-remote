# Codex Remote Research Questions

## 维护规则

`QUESTIONS.md` 记录需要全网调研的问题。每个问题都应能被单独复制给 ChatGPT 或其他研究工具，并在没有额外上下文的情况下被理解。

调研完成后，应把结论同步回本文件，并按影响更新 `PLAN.md`、相关 spec 或 plan。

每个调研结果至少包含：

- 结论：推荐采用什么，不采用什么。
- 依据：官方文档、源码、issue、release notes、成熟项目实践。
- 风险：仍不确定或后续需要验证的点。
- 决策影响：会影响哪个阶段、模块或技术选型。
- 更新位置：需要同步更新哪些项目文档或代码边界。

优先使用一手来源：官方文档、源码仓库、协议定义、release notes、标准文档。博客和社区讨论只能作为补充。

## 已导入调研回答

调研回答已导入 `docs/references/questions/`。导入索引见 `docs/references/questions/README.md`。

| Question | Answer file | Status |
| --- | --- | --- |
| Q1 | `docs/references/questions/q01-codex-app-server-local-transport.md` | answered |
| Q2 | `docs/references/questions/q02-thread-turns-list-protocol-gap.md` | answered |
| Q3 | `docs/references/questions/q03-worker-http-api-stack.md` | answered, verify runtime claims before implementation |
| Q4 | `docs/references/questions/q04-worker-readonly-http-api-endpoints.md` | partial: contract reconciliation needed |
| Q5 | `docs/references/questions/q05-app-server-streaming-events.md` | answered |
| Q6 | `docs/references/questions/q06-thread-start-resume-turn-start.md` | answered |
| Q7 | `docs/references/questions/q07-approval-request-lifecycle.md` | answered |
| Q8 | `docs/references/questions/q08-turn-interrupt-steer-races.md` | partial: local integration validation needed |
| Q9 | `docs/references/questions/q09-control-plane-auth-device-pairing.md` | answered |
| Q10 | `docs/references/questions/q10-db-stack-selection.md` | answered |
| Q11 | `docs/references/questions/q11-ios-api-contract-constraints.md` | partial adopt: guardrails now, iOS implementation later |
| Q12 | `docs/references/questions/q12-device-worker-installation-management.md` | answered |
| Q13 | `docs/references/questions/q13-e2e-playwright-introduction.md` | answered |

解析结论见 `docs/references/questions/SYNTHESIS.md`。Q14-Q17 为解析后新增的后续调研问题。

Q14-Q17 的 ChatGPT 回答已导入并完成 synthesis 解析：

| Question | Answer file | Status |
| --- | --- | --- |
| Q14 | `docs/references/questions/q14-db-driver-selection.md` | answered |
| Q15 | `docs/references/questions/q15-control-plane-reverse-connection-transport.md` | answered |
| Q16 | `docs/references/questions/q16-device-bound-token-mvp.md` | partial/adopt with caution |
| Q17 | `docs/references/questions/q17-cross-platform-secret-storage.md` | answered |

## 通用项目背景

Codex Remote 是一个自托管多设备 Codex Web 控制台。长期目标是在一个 Web 工作台中管理多台设备上的 Codex：查看设备状态、项目、对话、timeline 和输出流，发送 follow-up，中止任务，处理 approval，并把不同设备上的 Codex conversations 关联到任务看板。

当前架构原则：

- `packages/api-contract/openapi.yaml` 是 Web、Worker、Control Plane、未来 iOS 的唯一 API 事实源。
- `packages/codex-protocol` 是 Codex app-server 协议唯一事实源，来自 `codex app-server generate-ts` / `generate-json-schema`。
- `apps/worker` 是唯一直接启动或连接 Codex app-server 的模块。
- `apps/web` 不能直接接触 app-server 原始协议，只能使用 Control Plane-shaped API。
- Control Plane 不保存 OpenAI / ChatGPT / provider secrets。
- app-server 只应绑定 localhost 或本机 socket。

当前已完成：

- monorepo、包边界、`api-contract`、`codex-protocol` 底座。
- `apps/worker` read-only CLI probe。
- Worker probe 可启动或连接 loopback app-server，执行 `initialize`、`model/list`、`thread/list`、`thread/read`。
- 已实现 loopback-only、token/origin/project allowlist 工具、realpath 防 symlink escape、超时、诊断脱敏。

下一阶段计划：

- Worker HTTP API Read-only MVP。
- 目标是把当前 Worker probe 能力变成 Web 可调用的稳定 API。
- 明确不做 DB、不做 stream、不做写操作、不做 approval、不做多设备 Control Plane 路由。

## P0 - 进入下一阶段前必须调研

### Q1. Codex app-server 最稳定的本机传输方式是什么？

可单独发送的调研提示：

```text
我在开发一个自托管多设备 Codex Web 控制台，项目名 Codex Remote。架构中 apps/worker 是唯一能启动或连接 Codex app-server 的模块；Web 和未来 Control Plane 不能直接访问 app-server。当前 Worker read-only probe 使用 `codex app-server --listen ws://127.0.0.1:<port>` 通过 loopback WebSocket 调用 `initialize`、`model/list`、`thread/list`、`thread/read`。app-server 只允许绑定 localhost 或本机 socket，不能暴露到 LAN 或公网。下一阶段要实现 Worker HTTP API read-only MVP。

请全网调研：Codex app-server 在本机 Worker 场景下最稳定、最安全、最可维护的传输方式是什么？重点比较 loopback WebSocket、stdio、Unix socket，以及是否存在 `--ws-auth` 或其他本机 IPC / auth 机制。

请优先使用 OpenAI Codex / openai-codex 官方源码、命令帮助、release notes、protocol generation 输出、官方文档；社区讨论只能补充。
```

原因：

- 当前实现使用 loopback WebSocket，但规格中把它视为 product spike 路径。
- 传输方式会影响 Worker HTTP API、streaming、approval、多设备和安全边界。
- 如果后续要切换 stdio / Unix socket，越早明确越少返工。

调研方向：

- `codex app-server --help`、Codex CLI 源码、app-server 启动参数。
- `codex app-server generate-ts` / `generate-json-schema` 输出。
- 是否支持 stdio、Unix socket、ws-auth 或其他本机 IPC。
- loopback WebSocket 的认证、稳定性、生命周期和已知限制。

想要的调研结果：

- 阶段 2 是否继续使用 `ws://127.0.0.1:<port>`。
- 是否需要现在抽象 transport，还是保持最小实现。
- 如果推荐 stdio / Unix socket，需要列出协议、生命周期、错误处理和测试变化。
- 明确哪些安全措施必须保留，例如 loopback-only、Worker token、Origin allowlist、project allowlist。

### Q2. 当前 generated protocol 为什么缺少 `thread/turns/list`？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。项目中 `packages/codex-protocol` 是 Codex app-server 协议唯一事实源，由 `codex app-server generate-ts` / `generate-json-schema` 生成。当前 Worker read-only probe 已使用 generated protocol 调用 `initialize`、`model/list`、`thread/list`、`thread/read`。但是当前生成出的 `ClientRequest` 没有暴露 `thread/turns/list`，所以 probe 只能把 `thread/turns/list(itemsView: "full")` 记录为 `precondition_missing`，不能手写上游 request type。

请全网调研：为什么当前 generated Codex app-server protocol 缺少 `thread/turns/list`？它是版本落后、生成器未导出、方法不存在、方法重命名，还是 schema 结构变化？应该如何升级或处理？

请优先使用 openai-codex 官方源码、protocol schema、Codex CLI release notes、issue / PR、命令输出说明。
```

原因：

- Timeline 分页和长对话读取会依赖 `thread/turns/list(itemsView: "full")`。
- 唯一事实源原则禁止在 Worker 中手写缺失的上游 request shape。
- 下一阶段 read-only API 需要明确 timeline 降级策略。

调研方向：

- openai-codex app-server 源码中的 method registry。
- 最新 Codex CLI 和当前项目使用版本的协议差异。
- `generate-ts` / `generate-json-schema` 是否过滤了部分方法。
- upstream issue / PR / release notes 是否提到该方法。

想要的调研结果：

- 缺失根因。
- 是否应升级 Codex CLI 并重新生成 `packages/codex-protocol`。
- 在缺失期间，timeline MVP 如何降级：只用 `thread/read(includeTurns=true)`，还是限制分页。
- 需要更新哪些 contract 字段或 Worker diagnostic。

### Q3. Worker HTTP API 应使用 Node 原生 `http`，还是引入 Hono / Fastify？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个 TypeScript + pnpm + Turborepo + Next.js 的自托管多设备 Codex Web 控制台。下一阶段要实现 `apps/worker` 的 HTTP API read-only MVP，让 Web 通过 Control Plane-shaped API 读取 Worker health、capabilities、conversation list、timeline。Worker 运行在 Node 25，当前测试使用 Node built-in test runner。项目偏好最小依赖、清晰边界、唯一事实源；不希望为了未来功能引入过重框架。但 Worker HTTP API 后续会需要 token auth、Origin allowlist、CORS、SSE / streaming、统一错误响应。

请全网调研：阶段 2 的 Worker HTTP API 应使用 Node 原生 `http`，还是引入 Hono / Fastify？请比较它们在 Node 25、TypeScript、SSE、CORS、测试、依赖体积、维护活跃度、安全中间件和长期维护方面的取舍。
```

原因：

- 下一阶段需要 HTTP API，但 API 面很小。
- 原生 `http` 代码少但容易重复造 auth/CORS/error handling。
- 框架可减少样板，但会增加依赖和抽象。

调研方向：

- Node 25 原生 `http` / Web API 能力。
- Hono 和 Fastify 的 Node 支持、SSE、CORS、测试方式。
- 依赖体积、维护活跃度、类型体验。
- 在小型本机 daemon / worker 中的实践。

想要的调研结果：

- 阶段 2 推荐选型。
- 如果选 Node 原生，需要哪些最小 helper，哪些能力暂不做。
- 如果选框架，说明它替代了哪些手写代码，是否值得引入。
- 明确不引入的能力，避免框架驱动范围膨胀。

### Q4. Worker read-only HTTP API 应该定义哪些端点？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。最终架构是 Web / iOS 通过 Control Plane API 管理多个 Device Worker；但当前阶段只做单机 Worker HTTP API read-only MVP。Worker 是唯一连接 Codex app-server 的模块，Web 不允许接触 app-server 原始协议。当前已有 `packages/api-contract/openapi.yaml` 作为唯一 API 事实源，已有 read-only schema：WorkerHealth、WorkerCapabilities、ConversationTimeline、ConversationTimelinePage、ConversationEvent、WorkerProbeSummary、ProbeCheckResult 等。当前 Worker probe 可调用 `initialize`、`model/list`、`thread/list`、`thread/read`。

请调研并设计：Worker read-only HTTP API MVP 应该定义哪些最小端点？要求 API 名称和 payload 适合未来 Control Plane 复用，但当前不要实现 DB、stream、write、approval、多设备路由。
```

原因：

- Endpoint 设计会成为 Web、Worker、未来 Control Plane/iOS 的契约基础。
- 下一阶段需要保持最小 read-only 垂直切片。
- 过多端点会带来无用维护，过少则 Web 无法接真实数据。

调研方向：

- 当前 `packages/api-contract/openapi.yaml` schema。
- Codex app-server read-only 能力边界。
- agent console / remote control dashboard 的 REST API 形态。
- pagination、error envelope、auth、Origin、project allowlist 的常见实践。

想要的调研结果：

- 阶段 2 最小 endpoint 清单。
- 每个 endpoint 对应的 contract schema。
- 错误响应格式、认证规则、Origin 规则、project allowlist 规则。
- 明确 non-goals：不做 write、stream、approval、DB、多设备路由。

## P1 - 写操作和 streaming 前必须调研

### Q5. app-server streaming notifications 的真实事件形态和顺序保证是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。Web 需要展示 Codex conversation timeline 和实时输出流。架构要求 Worker 是唯一连接 Codex app-server 的模块，Worker 将 app-server notifications 投影为稳定的 `ConversationEvent`，Web 只能消费 `packages/api-contract/openapi.yaml` 派生出的事件类型。当前只完成 read-only probe，还没有实现 stream。

请全网调研：Codex app-server streaming notifications 的真实事件形态、顺序保证、幂等标识和重连行为是什么？重点关注 `thread/*`、`turn/*`、`item/*`、approval server request 等事件。需要判断 Web timeline reducer 是否需要 sequence 去重、snapshot reconciliation、断线补偿。
```

原因：

- Web 输出流、timeline reducer、turn 状态都依赖事件顺序。
- 如果通知乱序、重复或缺失，需要设计 snapshot + event reconciliation。
- 事件 contract 一旦暴露给 Web 和 iOS，后续改动成本高。

调研方向：

- app-server notification schema 和源码。
- 实际运行日志或本地 probe。
- notification 是否有 sequence、cursor、snapshot revision、turn id、item id。
- 重连后如何补齐历史。

想要的调研结果：

- app-server notification 到 `ConversationEvent` 的映射表。
- Timeline reducer 的最小状态机。
- 是否需要 sequence 去重、重连补偿、snapshot 覆盖规则。
- 需要增加哪些 contract 字段。

### Q6. `thread/start`、`thread/resume`、`turn/start` 的参数和生命周期如何组合？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。未来 Web 要支持 start conversation 和 follow-up。架构中 `packages/api-contract/openapi.yaml` 是 StartConversationInput / FollowUpInput 的唯一事实源，`packages/codex-protocol` 是 Codex app-server 协议唯一事实源，Worker 负责把稳定 contract 映射到 app-server 原始方法。已知 app-server 里 `thread/start`、`thread/resume`、`turn/start` 的参数可能不同，例如 `sandbox` 和 `sandboxPolicy` 不能被错误合并。

请全网调研：Codex app-server 中 `thread/start`、`thread/resume`、`turn/start` 的参数、调用顺序、生命周期和错误行为如何组合？如何设计 StartConversationInput / FollowUpInput 才不泄漏 app-server 细节，又不丢失必要能力？
```

原因：

- follow-up 和 start conversation 是产品核心写链路。
- contract 设计错误会导致 Web/iOS 后续破坏性迁移。
- `sandbox`、`sandboxPolicy`、model、approvalPolicy、cwd 等字段必须语义准确。

调研方向：

- generated protocol 类型。
- app-server 源码调用链。
- Codex CLI 实际 start/resume 行为。
- start/resume/turn/start 的失败、超时、恢复场景。

想要的调研结果：

- StartConversationInput / FollowUpInput 的推荐字段。
- Worker 调用顺序和状态机。
- 哪些字段必填，哪些应从配置继承。
- 错误和超时如何投影给 Web。

### Q7. Approval server request 的 request id 生命周期和响应协议是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。未来 Web 需要处理 Codex app-server 发起的 approval server request。架构要求 approval 是显式用户决策通道，不能被当成普通错误，也不能自动接受。Worker 需要把 app-server approval request 投影为 `ApprovalRequest`，Web 再通过 `RespondApprovalInput` 返回用户决策。Control Plane 不保存 provider secrets，日志不能泄露 prompt、token、command output。

请全网调研：Codex app-server approval server request 的 request id 生命周期、响应协议、超时、重复响应、断线后行为是什么？Worker 应如何设计 ApprovalRequestRegistry 和 Web approval response API？
```

原因：

- Approval 直接影响文件、命令、网络等高风险操作。
- request id 生命周期不清晰会导致误响应或漏响应。
- 日志和诊断必须脱敏。

调研方向：

- app-server server request 协议。
- approval request / response 类型。
- Codex CLI / App 当前 approval UI 行为。
- 超时、重复响应、断线、重连行为。

想要的调研结果：

- ApprovalRequest contract 字段。
- ApprovalRequestRegistry 的最小职责。
- Web 响应 approval 的 API 设计。
- 安全日志和脱敏要求。

### Q8. interrupt / steer 对 running turn 的竞态规则是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。未来 Web 要支持中止 running turn 和 steer 正在运行的任务。架构中 Worker 是唯一调用 app-server 的模块，Web 通过稳定 API 发送 InterruptTurnInput / SteerTurnInput。系统必须 fail closed，避免 turn 已完成、连接断开、expectedTurnId 不匹配时误操作。

请全网调研：Codex app-server 的 `turn/interrupt` 和 `turn/steer` 对 running turn 的竞态规则是什么？`expectedTurnId` 语义是什么？在 turn 已完成、重复请求、断线重连、并发 steer/interrupt 时会返回什么？
```

原因：

- 用户控制正在运行的任务时，竞态很常见。
- 规则不清会导致 UI 状态错误或误操作。
- Contract 需要表达 expected turn 和失败原因。

调研方向：

- app-server `turn/interrupt`、`turn/steer` 协议和源码。
- `expectedTurnId` 的语义。
- Codex App / CLI 相关行为。
- 断线、重连、重复请求时的结果。

想要的调研结果：

- InterruptTurnInput / SteerTurnInput contract 设计。
- Worker fail-closed 规则。
- UI 状态转移规则。
- 必须覆盖的测试场景。

## P2 - 多设备和持久化前必须调研

### Q9. Control Plane auth 和 device pairing 应该采用什么方案？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。长期架构是 Web / iOS 连接 Control Plane，Control Plane 路由到多个 Device Worker。每台设备保留自己的 Codex auth、API key、model provider 和本地配置；Control Plane 不能保存 OpenAI / ChatGPT / provider secrets。系统不能依赖同一 OpenAI / ChatGPT 账号。需要识别可信 Worker，并支持后续多设备注册、路由和状态聚合。

请全网调研：自托管多设备场景下，Control Plane auth 和 Device Worker pairing 应采用什么方案？请比较 one-time token、QR pairing、device token rotation、mTLS、反向连接等方案的 MVP 可行性和长期安全性。
```

原因：

- 多设备能力依赖可信设备注册。
- Control Plane 不保存 provider secrets，但仍要认证 Worker。
- 过早引入复杂认证会拖慢 MVP，过弱认证会形成安全债务。

调研方向：

- self-hosted device pairing 常见方案。
- one-time token、QR pairing、device token rotation。
- 本地网络、远程访问、反向连接安全模型。
- 参考项目中 daemon/client 的注册方式。

想要的调研结果：

- MVP pairing 流程。
- token 存储和轮换策略。
- Control Plane 与 Worker 的认证边界。
- 明确不做哪些复杂能力，例如 OAuth/provider proxy。

### Q10. DB 选型应使用 SQLite + Drizzle / Kysely，还是其他方案？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。后续需要持久化设备注册、任务看板、conversation 到 task 的映射、可能的审计/诊断元数据。项目是 TypeScript + pnpm + Turborepo，强调唯一事实源：数据库 schema 是持久化字段唯一事实源，业务类型从 schema 显式派生。当前还没有 DB 包，目标结构预留 `packages/db`。

请全网调研：这个项目的 DB 选型应使用 SQLite + Drizzle、SQLite + Kysely，还是其他方案？请重点比较自托管本地/小团队场景下的迁移、类型生成、测试、备份、未来多设备扩展成本。
```

原因：

- 任务看板、conversation 映射、设备注册会需要持久化。
- DB schema 将成为新的唯一事实源。
- 选型影响包结构、测试和迁移策略。

调研方向：

- SQLite 在自托管本地控制台中的适用性。
- Drizzle / Kysely 的 TypeScript 类型生成、迁移、测试体验。
- 与 Turborepo / Node 运行环境的集成成本。
- 多设备同步是否需要更复杂数据库。

想要的调研结果：

- 阶段 7 推荐 DB 栈。
- schema/migration 目录结构。
- 类型从 schema 派生的方式。
- 备份、迁移和测试策略。

### Q11. iOS 复用 Control Plane API 需要提前预留哪些 contract 约束？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。长期会有 iOS App，但 iOS 不复用 Web runtime，只连接 Control Plane API。`packages/api-contract/openapi.yaml` 是 Web、Worker、Control Plane、未来 iOS 的唯一 API 事实源。当前阶段仍以 Web 为主，但希望避免 contract 过度 Web-specific，导致未来移动端重构。

请全网调研：为了未来 iOS 复用 Control Plane API，现在的 OpenAPI contract 需要提前预留或避免哪些设计？请考虑 OpenAPI 到 Swift 类型生成、SSE/WebSocket/background networking 限制、QR / one-time token pairing、安全存储、离线缓存和分页。
```

原因：

- iOS 只复用 API contract，不复用 Web UI。
- Web-specific payload 会增加未来迁移成本。
- 但过早为 iOS 设计过多字段也会增加当前复杂度。

调研方向：

- OpenAPI 到 Swift 类型生成工具。
- iOS SSE / WebSocket / background networking 限制。
- QR pairing / one-time token 的 iOS 实现方式。
- 移动端安全存储和证书信任策略。

想要的调研结果：

- API contract 中需要避免的 Web-only 假设。
- 是否需要分页、离线缓存、轻量 event payload。
- iOS pairing 的最小字段需求。
- 哪些 iOS 需求可以等到移动端阶段再做。

## P3 - 产品化前调研

### Q12. Worker 安装、启动和权限管理的最低可维护方案是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。每台设备未来需要运行 Device Worker。Worker 负责连接本机 Codex app-server、本机文件系统、本机 git 和 terminal；但 Control Plane 不保存 provider secrets。当前还处于开发阶段，Worker 可通过 CLI/probe 启动。长期需要稳定运行、日志、配置、权限提示和升级策略，但不想过早做复杂安装器。

请全网调研：Device Worker 在 macOS、Windows、Linux 上的最低可维护安装、启动和权限管理方案是什么？请比较 macOS launchd、Windows service、Linux systemd、手动 CLI、自更新/不自更新、配置和日志目录约定。
```

原因：

- 长期多设备需要 Worker 稳定运行。
- 安装器太早会偏离主链，完全不设计又会影响可用性。
- 权限、日志、配置会影响安全和诊断。

调研方向：

- macOS launchd、Windows service、Linux systemd 的最小实践。
- 本地配置文件、日志、pid、升级策略。
- 权限提示和安全边界。
- 类似 developer daemon / local agent 的安装方式。

想要的调研结果：

- MVP 启动方式。
- 后续正式安装方式。
- 配置、日志和故障恢复目录约定。
- 哪些平台差异必须现在考虑，哪些可以后置。

### Q13. 需要引入 Playwright 或其他 E2E 工具吗？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个 TypeScript + pnpm + Turborepo + Next.js 的自托管多设备 Codex Web 控制台。当前主要使用 Node built-in test runner，测试重点是 contract、边界和 Worker probe。后续 Web 会接真实 Worker datasource，并需要验证用户主链：查看设备/项目/对话/timeline，发送 follow-up，stream 输出，中止任务，处理 approval。项目偏好最小依赖，但不能牺牲关键用户链路验证。

请全网调研：这个项目应在什么阶段引入 Playwright 或其他 E2E 工具？哪些场景必须浏览器自动化，哪些可以继续用 Node built-in test 或 API-level integration test？
```

原因：

- Web 接真实 Worker 后，需要验证用户主链。
- E2E 工具太早引入会增加维护成本。
- 只靠 unit/integration 可能无法发现实际 UI 流程问题。

调研方向：

- Playwright 与 Next.js、pnpm、Turborepo 的集成成本。
- API-level integration test 能覆盖哪些阶段 2-4 风险。
- 浏览器自动化最小必要场景。
- CI 成本和 flakiness 控制。

想要的调研结果：

- 何时引入 Playwright。
- 最小 E2E 场景清单。
- 哪些测试继续留在 Node built-in test。
- E2E 不应覆盖的低价值场景。

### Q14. `better-sqlite3` 和 `@libsql/client` 哪个更适合本项目？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个 TypeScript + pnpm + Turborepo 的自托管多设备 Codex Web 控制台。后续 Stage 7 计划使用 SQLite + Drizzle，并在 `packages/db` 中把 schema 作为持久化字段唯一事实源。现在需要进一步判断 SQLite driver：`better-sqlite3` 还是 `@libsql/client` 更适合当前 Node/pnpm/Turborepo/跨平台分发场景。项目长期会有本地 Control Plane、Device Worker、任务看板、conversation 映射、备份和迁移；短期不需要 remote sync 或多实例写同一 DB。

请全网调研：`better-sqlite3` vs `@libsql/client` 在 Node 25、pnpm、Turborepo、macOS/Windows/Linux 安装、native dependency、迁移、备份、Drizzle 集成和未来产品化分发方面的取舍。
```

原因：

- Q10 已给出 SQLite + Drizzle 方向，但 driver 会影响安装、测试、备份和跨平台产品化。
- `better-sqlite3` 是 native dependency，可能影响安装和打包。
- `@libsql/client` 可能引入不需要的 remote/sync 语义。

调研方向：

- Drizzle 对两个 driver 的支持成熟度。
- Node 版本、pnpm workspace、CI、跨平台安装问题。
- SQLite backup / migration / transaction 能力。
- 产品化分发中的 native binary 成本。

想要的调研结果：

- Stage 7 默认 driver 推荐。
- 哪些场景需要切换 driver。
- 测试和备份策略差异。
- 需要提前验证的安装/CI 命令。

### Q15. Control Plane reverse connection 应使用什么 transport？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。长期架构是 Web/iOS 连接 Control Plane，Control Plane 路由到多个 Device Worker。为避免暴露 Worker 入站端口，调研结论建议 Worker 主动 outbound reverse connection 到 Control Plane。现在需要细化 reverse connection 的 transport：WebSocket、SSE + HTTP polling、HTTP/2/gRPC、或其他方案。需要支持设备状态、任务下发、streaming events、断线重连、backpressure、ack/lease 和安全认证。

请全网调研：Control Plane 到 Device Worker 的 reverse connection transport 应如何选择？请比较 WebSocket、SSE+HTTP、HTTP/2/gRPC 在自托管多设备 agent/daemon 场景下的复杂度、可靠性、浏览器无关性、安全和运维成本。
```

原因：

- Q9 给出 reverse connection 方向，但没有细化任务下发和状态回传协议。
- 多设备路由、streaming、approval 都会依赖该连接。
- 选错 transport 会增加后续重构成本。

调研方向：

- agent/daemon reverse connection 常见实践。
- WebSocket、SSE、HTTP/2/gRPC 的断线重连、ack、backpressure 能力。
- 自托管部署、代理、TLS、认证和 observability。

想要的调研结果：

- Stage 6 推荐 transport。
- Worker reconnect / heartbeat / lease / ack 模型。
- 哪些能力应留到后续，不进入 MVP。
- 与 device-bound token / pairing 的关系。

### Q16. Device-bound token 的 MVP 实现边界是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。长期架构需要 Control Plane 识别可信 Device Worker。Q9 调研建议采用 one-time pairing、Worker-generated device key、device-bound token、短期 access token、refresh token rotation，并可能使用 DPoP、mTLS 或应用层签名 handshake。项目不保存 OpenAI/ChatGPT/provider secrets，Worker 仍需本地 fail-closed。

请全网调研：Device-bound token 的 MVP 应如何实现？比较标准 DPoP、mTLS device certificate、应用层签名 handshake、普通 bearer token + rotation 的 threat model、实现复杂度、库选择、replay cache、nonce、rotation、revocation 和审计成本。
```

原因：

- Q9 安全方向正确，但实现细节复杂。
- 手写“类似 DPoP”的协议风险高。
- MVP 需要足够安全，但不能过度工程化。

调研方向：

- DPoP、mTLS、signed request、token rotation 的标准实践。
- Node/TypeScript 可用库和维护状态。
- replay 防护、nonce、clock skew、revocation。
- 单人自托管和 team/enterprise 的差异。

想要的调研结果：

- MVP 推荐方案。
- 不做哪些安全机制。
- 后续升级路径。
- 必须测试的攻击场景。

### Q17. 跨平台 secret storage 的最小实现是什么？

可单独发送的调研提示：

```text
我在开发 Codex Remote，一个自托管多设备 Codex Web 控制台。Device Worker 未来需要保存 device token / private key 等自身身份材料，但不能保存或上传 OpenAI / ChatGPT / provider secrets 到 Control Plane。产品化阶段需要支持 macOS、Windows、Linux。Q12 调研建议使用 OS secret store 或受限权限文件 fallback，但还没有具体 Node/TypeScript 方案。

请全网调研：跨平台 secret storage 的最小可维护实现是什么？比较 macOS Keychain、Windows DPAPI/Credential Manager、Linux libsecret/Secret Service、无桌面环境 fallback、0600 file fallback，以及 Node/TypeScript 可用库、权限、CI 测试和 headless server 行为。
```

原因：

- Worker pairing 和 device-bound token 需要可靠本地 secret storage。
- 平台差异大，容易在 Linux headless 或 Windows service 模式下失败。
- 过早做完整 secret abstraction 会膨胀，完全不调研又影响产品化。

调研方向：

- macOS Keychain、Windows DPAPI/Credential Manager、Linux Secret Service/libsecret。
- Node/TypeScript 生态库。
- headless、service、CI、权限和 fallback 行为。
- 本地文件 fallback 的权限和风险。

想要的调研结果：

- MVP secret storage 策略。
- 每个平台默认路径和 fallback。
- 哪些内容可放配置文件，哪些必须进 secret store。
- 测试和诊断方式。

## 调研完成标记

调研完成时，在对应问题下补充：

```text
结论：
依据：
风险：
决策影响：
更新位置：
```
