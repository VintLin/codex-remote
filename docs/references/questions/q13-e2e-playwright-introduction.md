## 结论

**Codex Remote 应在“第一个可交互用户纵切链路”出现时引入 Playwright，而不是等真实 Worker datasource 全部接完，也不是现在就把所有 UI 行为搬到 E2E。**

更具体地说：当 Web 已经能以稳定 fixture 或 fake Worker datasource 跑通下面这条最小链路时，就应引入 Playwright 并放入 CI 的 smoke 阶段：

> 打开 Web → 看到设备 → 进入项目 → 进入对话 → 看到 timeline → 发送 follow-up → timeline 出现 running/streaming 状态 → 可中止或进入 approval 分支。

原因是：Next.js 官方把 E2E 定义为在类似真实用户的浏览器环境中验证用户任务；并建议 Playwright 测试尽量跑生产构建，以更接近真实应用行为。([Next.js](https://nextjs.org/docs/app/guides/testing)) 但 Google 的测试分层经验也很明确：E2E/large tests 成本高、可能慢且更容易非确定，所以不能把协议、状态机和边界场景都压到浏览器自动化里。([Google Testing Blog](https://testing.googleblog.com/2010/12/test-sizes.html))

因此，推荐策略是：

**Node built-in test 继续作为主力；API-level integration 覆盖 Web ↔ Worker datasource 边界；Playwright 只覆盖 P0 用户链路和浏览器独有风险。**

------

## 阶段划分

| 阶段                                       | 项目状态                                                     | 是否引入 Playwright                             | 推荐动作                                                     |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| 0. 现在：协议、contract、Worker probe 为主 | UI 还没接真实 datasource，核心风险在协议和边界               | **不做大规模引入**                              | 继续用 `node:test` 覆盖 Worker message contract、timeline event contract、approval/abort 状态机、stream parser、probe。Node 官方 test runner 已支持 mocking、timer mocking、coverage reporter 等基础能力，足够支撑这层。([Node.js](https://nodejs.org/api/test.html)) |
| 1. Web shell + datasource 抽象成型         | 设备/项目/对话/timeline 页面能用 deterministic fake datasource 展示 | **引入 Playwright skeleton**                    | 新增 `apps/web-e2e` 或 `tests/e2e`，先跑 1 条 navigation smoke。只装 `@playwright/test`，不引入 Cypress/MSW/Storybook 之类额外栈。 |
| 2. 第一个用户纵切链路可跑                  | follow-up、stream、abort/approval 至少有 fake Worker 场景    | **正式引入 Playwright 到 PR smoke**             | 覆盖 3–6 条 P0 浏览器链路。用 fake Worker 或 test datasource 保持稳定。Playwright 支持 Chromium/Firefox/WebKit、auto-wait、web-first assertions、trace、隔离 browser context，适合这层。([Playwright](https://playwright.dev/)) |
| 3. 接入真实 Worker datasource              | Web 能连真实 Worker 或本地 Worker simulator                  | **增加 API integration + 少量 real-worker E2E** | 大部分真实 Worker 行为放 API-level integration；Playwright 只保留 1–2 条 real-worker smoke，用于验证真实浏览器 + Next runtime + Worker 的端到端兼容。 |
| 4. 多设备/协作语义出现                     | 两个设备/会话同时看同一任务，approval/abort 可跨设备影响     | **扩展 Playwright multi-context 测试**          | 用两个 isolated browser contexts 模拟不同设备或用户。Playwright 官方支持单个测试内创建多个 browser context，典型用途就是 multi-user 场景。([Playwright](https://playwright.dev/docs/browser-contexts)) |
| 5. release hardening                       | 准备自托管用户发布                                           | **跨浏览器 + trace + nightly/full suite**       | PR 跑 Chromium smoke；nightly 或 release gate 跑 Chromium/Firefox/WebKit。失败时启用 trace，Playwright 官方建议 CI 上用 `trace: 'on-first-retry'`。([Playwright](https://playwright.dev/docs/trace-viewer)) |

**关键点：Playwright 的引入触发条件不是“UI 稳定”，而是“有真实用户价值的纵切链路开始存在”。** 如果等到真实 Worker 接完再加，stream、中止、approval、路由/状态同步这类浏览器问题会积累到后期；如果太早引入，又会在不稳定 UI 上制造脆弱测试。

------

## 必须浏览器自动化的场景

这些场景不应只靠 Node test 或 API integration，因为风险发生在真实浏览器、Next.js runtime、DOM、用户交互和客户端状态之间。

| 场景                                          | 为什么必须浏览器自动化                                       | 推荐测试数量    |
| --------------------------------------------- | ------------------------------------------------------------ | --------------- |
| **主链路导航：设备 → 项目 → 对话 → timeline** | 需要验证真实路由、layout、hydration、loading/error/empty states、URL/back-forward 行为。Next.js 官方把这类用户任务归为 E2E。([Next.js](https://nextjs.org/docs/app/guides/testing)) | 1–2             |
| **发送 follow-up**                            | 表单输入、按钮状态、重复提交保护、pending 状态、timeline append 都是 UI 行为。API 测试只能证明 endpoint 可用，不能证明用户能完成动作。 | 1               |
| **stream 输出在 timeline 中增量显示**         | API 测试能验证 stream 协议，但不能验证浏览器端 fetch/EventSource/WebSocket 消费、React 状态更新、增量渲染、自动滚动、完成态切换。 | 1–2             |
| **中止任务**                                  | 必须验证用户点击 Abort 后，按钮 disable、状态从 running 变为 aborted/cancelling、后续 stream 停止、重复点击不产生错误。底层 abort 幂等性仍放 Node/API 测。 | 1               |
| **approval 处理**                             | approval prompt、approve/deny 按钮、焦点、键盘可达性、modal/drawer 状态、timeline 更新都属于浏览器行为。 | 1–2             |
| **多设备/多会话同步**                         | 你的产品是多设备控制台，这类风险必须用真实隔离 browser context 验证：设备 A 发送/中止，设备 B 看到状态变化。Playwright 的 isolated contexts 很适合。([Playwright](https://playwright.dev/docs/browser-contexts)) | 1–2             |
| **认证/session/cookie/CSRF/CORS，如有**       | 这些是浏览器安全模型和真实请求链路问题，Node-level fetch 不一定能暴露。 | 1–2             |
| **键盘导航和关键可访问性路径**                | Playwright 推荐使用 `getByRole`、`getByLabel` 等贴近用户感知的 locator，可顺带约束语义化 UI。([Playwright](https://playwright.dev/)) | 覆盖 P0 即可    |
| **移动/窄屏关键链路**                         | 自托管控制台可能在平板/手机上查看任务状态；至少验证 timeline 和 action bar 不阻断主操作。 | release/nightly |

这里的“必须”不是指每个 edge case 都写浏览器测试，而是指**每类浏览器风险至少要有 1 条端到端代表性测试**。例如 stream 的 20 种 chunk 边界情况不该全用 Playwright；Playwright 只证明“真实浏览器能把 stream 变成用户可见 timeline”。

------

## 可以继续用 Node built-in test 的场景

这些测试应保持在 `node:test`，因为它们更快、更确定、更便宜，也更适合 contract 和边界。

| 场景                                                 | 推荐层级                  | 说明                                                         |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| Worker protocol schema / message union / status enum | Node contract test        | 保证 Web 与 Worker 的共享 contract 不漂移。Contract testing 的目标就是验证系统间消息符合共同理解，而不是部署整个世界。([Pact Docs](https://docs.pact.io/)) |
| timeline event ordering / dedupe / idempotency       | Node unit/contract        | 例如重复 delta、乱序 event、缺失 timestamp、terminal state 后又收到 delta。 |
| follow-up request builder                            | Node unit                 | 验证 prompt、conversation id、metadata、approval context 等 payload。 |
| stream parser                                        | Node unit                 | UTF-8 split、SSE `data:` 分片、heartbeat、EOF mid-event、malformed JSON、large output。 |
| abort 状态机                                         | Node unit                 | queued/running/completed/failed/aborted 中各状态下 abort 的合法性和幂等性。 |
| approval 状态机                                      | Node unit                 | requested → approved/denied/expired/stale 的转换、重复 approve、过期 approval id。 |
| Worker probe                                         | Node integration          | health、capabilities、version negotiation、timeout、retry/backoff。 |
| datasource adapter contract                          | Node integration          | fake Worker、本地 Worker simulator、错误映射、超时、认证 header。 |
| 权限和资源访问控制                                   | Node unit/API integration | 用户是否能访问某 device/project/conversation。浏览器只测 1 条代表性 unauthorized UI。 |
| API route handlers / server actions                  | Node/API integration      | `GET /devices`、`GET /projects`、`GET /timeline`、`POST /followups`、`POST /abort`、`POST /approval` 的状态码和响应体。 |

你的现有方向是对的：**contract、边界、Worker probe 不应该被 Playwright 替代。** Microsoft 的 CDC 文档也强调，contract tests 可把大型 E2E 拆成更快、更稳定的组件间验证；但仍需要少量 E2E 验证真实整体系统。([Microsoft GitHub](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/cdc-testing/))

------

## API-level integration 应覆盖的场景

API integration 是 Codex Remote 里最关键的中间层：比 Node unit 更接近真实系统，比浏览器 E2E 更稳定。

建议把这些放在 API integration：

| API-level 场景                                      | 断言重点                                                     |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `GET devices → projects → conversations → timeline` | shape、排序、分页、empty/error state、权限过滤               |
| `POST follow-up`                                    | 返回 task/conversation event id；非法状态返回 409/400；重复提交处理 |
| stream endpoint                                     | header、event 顺序、delta/completed/error、断线、client abort、backpressure |
| abort endpoint                                      | running 时可取消；completed 时幂等或明确 409；Worker timeout 映射 |
| approval endpoint                                   | approve/deny payload、stale id、重复处理、Worker 返回错误映射 |
| real Worker simulator                               | 不经过浏览器，验证 datasource 与 Worker 协议兼容             |
| persistence，如有                                   | timeline replay、task resume、重启后状态恢复                 |

API-level integration 的原则：**只要目标是验证 HTTP/Worker 协议、数据转换、错误映射、状态机，就不要上浏览器。** 浏览器只验证“用户是否真的能通过 UI 完成这件事”。

------

## Playwright vs 其他 E2E 工具

### 推荐默认选 Playwright

对你的项目，Playwright 比 Cypress 更贴合，主要因为 Codex Remote 有“多设备/多会话”和 stream/approval/abort 这种复杂交互。Playwright 官方能力包括 Chromium/Firefox/WebKit 一套 API、auto-wait、web-first assertions、trace、隔离 browser context；还支持 route 级网络 mock 和 HAR mock，可在真实 Worker 未完成时用 fake datasource 验证 UI。([Playwright](https://playwright.dev/))

### Cypress 不是不能用，但不是首选

Cypress 现在也支持 Chrome-family、Firefox、WebKit，并且有很好的交互式开发体验。([Cypress](https://docs.cypress.io/app/guides/cross-browser-testing)) 但它的官方 trade-offs 仍明确写到：不能同时驱动两个浏览器，每个测试受单一 superdomain 等边界影响；FAQ 也说明 Cypress 没有 native multi-tab support。([Cypress](https://docs.cypress.io/app/references/trade-offs)) 对一个“自托管多设备 Codex Web 控制台”，这会直接影响多会话测试设计。

### Selenium/WebdriverIO 只在特殊条件下考虑

只有在你需要接企业现有 Selenium Grid、真实设备云、遗留浏览器矩阵或团队已有重资产时，才值得考虑。否则它会比 Playwright 增加更多框架和运行环境复杂度。

### Vitest/Jest/RTL 暂不必急着加

你已经偏好最小依赖，并且 Node built-in test runner 已覆盖核心逻辑层。只有当 React 组件内部逻辑变复杂、又不值得走浏览器 E2E 时，再考虑 Vitest/Jest + Testing Library。若使用 Next.js async Server Components，Next 官方也提示目前部分单元测试工具支持不完整，建议优先用 E2E。([Next.js](https://nextjs.org/docs/app/guides/testing))

------

## 推荐测试组合

### PR 必跑

| 层级            | 工具                                   | 内容                                                         |
| --------------- | -------------------------------------- | ------------------------------------------------------------ |
| Unit/contract   | `node:test`                            | protocol、state machine、stream parser、approval/abort edge cases |
| API integration | `node:test` + local server/fake Worker | route handlers、datasource adapter、stream/abort/approval endpoint |
| Browser smoke   | Playwright, Chromium only              | 3–6 条 P0 用户链路，使用 deterministic fake Worker           |

### Nightly 或 pre-release

| 层级                 | 工具                               | 内容                                               |
| -------------------- | ---------------------------------- | -------------------------------------------------- |
| Browser full         | Playwright Chromium/Firefox/WebKit | 主链路、approval、abort、多设备、错误恢复          |
| Real Worker smoke    | Playwright + real/local Worker     | 1–2 条真实端到端链路                               |
| Worker compatibility | API integration                    | 多版本 Worker、capabilities negotiation、超时/断线 |

### 不建议

不要把每个 Worker error code、每种 stream chunk、每个 approval race condition 都写成 Playwright 测试。那会快速变成 E2E ice-cream cone：慢、脆、难定位。Google 的测试尺寸划分把 E2E/system tests 归为 large tests；large tests 有价值，但天然更慢、更可能非确定。([Google Testing Blog](https://testing.googleblog.com/2010/12/test-sizes.html))

------

## 具体落地建议

### 1. 新增单独 E2E package

建议结构：

```txt
apps/
  web/
packages/
  worker-protocol/
  testing-worker-fixtures/
tests/
  e2e/
    playwright.config.ts
    specs/
      p0-navigation.spec.ts
      p0-followup-stream.spec.ts
      p0-abort.spec.ts
      p0-approval.spec.ts
      p0-multidevice.spec.ts
```

Playwright 只放在 E2E package 的 devDependency，不污染 runtime packages。

### 2. 用 fake Worker datasource，而不是 mock React 内部

优先级：

1. **最好**：Web 跑真实 Next app，datasource 指向 deterministic fake Worker server。
2. **次好**：Playwright `page.route()` mock API 响应。Playwright 支持拦截、修改和 mock 页面发出的 XHR/fetch 请求。([Playwright](https://playwright.dev/docs/mock))
3. **不建议**：mock React hooks/store 内部。这样会失去 E2E 价值。

stream 场景建议用 fake Worker server，而不是 HAR。HAR 更适合静态请求回放；stream、abort、approval 更适合可编程 fixture server。

### 3. locator 策略

优先：

```ts
page.getByRole('button', { name: /send/i })
page.getByRole('button', { name: /abort/i })
page.getByRole('list', { name: /timeline/i })
page.getByRole('dialog', { name: /approval/i })
```

必要时再用：

```ts
page.getByTestId('timeline-event-running')
page.getByTestId('stream-output')
```

Playwright 官方推荐使用贴近用户感知的 resilient locators，例如 role、label、placeholder、test id，避免脆弱 CSS path。([Playwright](https://playwright.dev/))

### 4. Turborepo/pnpm 运行方式

pnpm 的 `--filter` 可只运行目标 package 及其依赖，适合把 `web`、`worker-fixtures`、`e2e` 分层执行。([pnpm](https://pnpm.io/filtering)) Turborepo 中真实 Worker E2E 建议 `cache: false`，因为这类任务通常依赖 runtime 环境、端口、浏览器和外部进程；Turbo 官方也说明 `cache: false` 可用于需要每次执行的任务。([Turborepo](https://turborepo.dev/docs/reference/configuration)) 另外，E2E 相关环境变量如 datasource URL、auth secret、fixture mode 要明确纳入 `env`/`globalEnv` 或 passthrough，避免错误缓存或运行时缺失；Turbo 文档特别强调环境变量会影响 task hash 和缓存正确性。([Turborepo](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables))

示意：

```json
{
  "tasks": {
    "test": {
      "inputs": ["src/**/*.ts", "test/**/*.ts"]
    },
    "test:integration": {
      "dependsOn": ["^build"]
    },
    "e2e:smoke": {
      "dependsOn": ["@codex-remote/web#build"],
      "cache": false
    },
    "e2e:full": {
      "dependsOn": ["@codex-remote/web#build"],
      "cache": false
    }
  }
}
```

### 5. Playwright 配置策略

推荐：

```txt
PR:
  browser: chromium
  datasource: fake-worker
  tests: p0 smoke only
  trace: on-first-retry

Nightly/release:
  browsers: chromium, firefox, webkit
  datasource: fake-worker + real/local worker smoke
  trace: on-first-retry
```

Next.js 官方 Playwright guide 也建议 E2E 跑 `build` + `start`，并可用 Playwright `webServer` 让测试启动并等待 server。([Next.js](https://nextjs.org/docs/pages/guides/testing/playwright))

------

## 最小 Playwright P0 套件

建议第一批只写这些：

1. **`p0-navigation.spec.ts`**
   打开首页，看到 devices；进入 project；进入 conversation；timeline 有 expected events。
2. **`p0-followup-stream.spec.ts`**
   输入 follow-up；点击 Send；看到 user message；看到 assistant/task event 从 queued/running 到 streaming；至少一个 token 增量出现；最终 completed。
3. **`p0-abort.spec.ts`**
   触发 long-running fake stream；点击 Abort；状态变 cancelling/aborted；按钮不可重复触发；stream 不再追加。
4. **`p0-approval.spec.ts`**
   fake Worker 发 approval required；UI 出现 approval prompt；点击 approve；timeline 继续；另测 deny 或放到 API-level。
5. **`p0-multidevice.spec.ts`**
   两个 browser contexts 打开同一 conversation；A 发送 follow-up；B 看到 running/timeline 更新；A abort；B 看到 aborted。

这 5 条足够覆盖你的主链路，不会把 E2E 扩散成维护负担。

------

## 最终建议

**现在继续强化 Node built-in test 和 API integration；当 Web datasource abstraction + fake Worker 能跑通第一条用户纵切链路时，引入 Playwright。**

不要等真实 Worker 全部接入后才加。Playwright 的第一价值不是验证 Worker 内部正确性，而是验证：

- 用户能否完成主链路；
- 浏览器中 stream 是否真的可见；
- abort/approval 是否从 UI 正确触发并反馈；
- 多设备/多会话状态是否一致；
- Next.js production build 下是否行为正常。

工具选择上，**Playwright 是默认最优解**；Cypress 可用但不如 Playwright 贴合多设备场景；Selenium/WebdriverIO 只有在已有基础设施或真实设备矩阵要求下才值得引入。