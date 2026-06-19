---
title: "Q3：HTTP API 使用"
source_url: "https://chatgpt.com/c/6a34fd34-de9c-83ee-9e54-43f0b431a1d8"
exported_at: "2026-06-19T17:07:57"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

阶段 2 的 `apps/worker` HTTP API，我建议采用 **Hono + `@hono/node-server`**，而不是直接用 Node 原生 `http`，也暂时不要引入 Fastify。

理由很直接：你的 MVP 目前只是 read-only API，但后续已明确会需要 **token auth、Origin allowlist、CORS、SSE / streaming、统一错误响应**。这些需求用原生 `http` 很快会变成一个自研微框架；Fastify 又把 schema、plugin、logger、lifecycle、validation/serialization 等完整后端框架能力提前带进来。Hono 刚好处在中间：轻、边界清楚、Web Standard `Request/Response` 模型接近 Next.js / Fetch mental model，同时有 CORS、Bearer auth、secure headers、streamSSE、测试入口等现成能力。Hono 官方说明其 core 零依赖，`hono/tiny` preset 小于 12kB，并基于 Web Standard API；Node 侧通过 `@hono/node-server` adapter 运行。([GitHub][1])

另一个必须单独处理的问题是 **Node 25**：Node 官方当前发布页列出 v25 为 **EOL**，v24 为 LTS，v26 为 Current，并明确建议生产应用只使用 Active LTS 或 Maintenance LTS。([Node.js][2]) 因此框架选择不应围绕 Node 25 做长期承诺；建议把 Worker CI/runtime 目标改成 **Node 24 LTS**，需要追新再额外跑 Node 26 Current matrix。

---

## 对比

| 维度                          | Node 原生 `http`                                                                                                                                                                 | Hono + `@hono/node-server`                                                                                                                            | Fastify                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Node 25 适配**              | 最稳，直接使用 Node 内置 `http.createServer`。Node v25 `http` 文档列出 request/header timeout、`insecureHTTPParser`、`maxHeaderSize` 等底层选项，流式写入也能通过 `write()` 返回值和 `drain` 处理背压。([Node.js][3]) | Node adapter 要求 Node 版本大于 20.x，Node 25 可运行；但 Hono 原本不是为 Node 设计，Node 运行依赖 adapter 把 Web Standard API 接到 Node API。([GitHub][4])                        | Node 原生框架，生态成熟；但 Fastify LTS 文档强调其支持策略受最低 Node 版本约束，且项目更偏向 Node LTS 线，Node 25 这种 EOL 奇数版本不适合作为长期目标。([Fastify][5])                                                                          |
| **TypeScript 边界**           | 完全可控，但路由参数、错误 envelope、middleware 顺序、typed client 都要自己约束。对“唯一事实源”友好，但需要纪律。                                                                                                     | Hono 的类型模型轻，handler 基于 `Context` 和 `Request/Response`；适合把 API contract 和 handler 分离。测试可直接 `app.request()`。([Hono][6])                                 | TS 能力强，但插件系统依赖 declaration merging；Fastify 官方文档也说明插件类型只要在 TS scope 内就可能被包含，即使插件未实际使用。([Fastify][7]) 对小 Worker API 来说心智负担偏高。                                                                |
| **SSE / streaming**         | 能做，甚至最底层可控；但要自己设置 `Content-Type: text/event-stream`、flush、heartbeat、abort、backpressure、错误事件。                                                                                   | Hono 有 `streamSSE()`，能直接写 SSE event，并支持 abort 检测；但流开始后 callback 内抛错不会触发 Hono `onError`，需要单独传 streaming error handler。([Hono][8])                      | Fastify 有 `@fastify/sse`，提供 route-level `{ sse: true }`、async iterator / Node streams、Last-Event-ID replay、heartbeat、hooks/error handling、TS defs、backpressure。能力最完整，但需要额外插件。([GitHub][9]) |
| **CORS / Origin allowlist** | CORS 和 Origin allowlist 全部手写。实现不难，但容易在 preflight、`Vary: Origin`、credentials、OPTIONS、错误响应路径上漏边角。                                                                                | Hono 内置 CORS middleware，支持 origin 字符串、数组和函数；默认 origin 是 `*`，因此生产必须显式配置 allowlist。([Hono][10])                                                         | `@fastify/cors` 功能强，支持严格 preflight；官方特别警告 `RegExp` 或函数 origin 可能造成 DoS，异步反射 origin 也可能产生 reflection exploit。([GitHub][11])                                                                 |
| **Token auth / 安全中间件**      | 自写最小 Bearer token 校验即可；适合自托管 worker token。缺点是统一 401/403、timing-safe compare、日志脱敏都要自己守住。                                                                                        | Hono 内置 Bearer Auth middleware，会校验 `Authorization: Bearer ...` token；也有 secure headers、CSRF、IP restriction、JWT、timeout、request id 等内置中间件。([Hono][12]) | Fastify 官方生态有 `@fastify/basic-auth`、`@fastify/bearer-auth`、caching、circuit-breaker 等 core plugins。([Fastify][13]) 安全生态更丰富，但对 read-only MVP 属于提前引入复杂度。                                      |
| **测试**                      | 可继续用 Node built-in test runner；Node v25 的 `node:test` 是 Stable。([Node.js][14]) 但 route 测试通常要起本地 server 或再引入 HTTP injection 工具。                                                 | 继续用 `node:test`；Hono app 可直接 `app.request('/path')`，不需要真实 socket。([Hono][6]) 这非常适合 MVP 和 monorepo 单元测试。                                               | Fastify `.inject()` 测试体验很好，官方说明内置 fake HTTP injection，并会确保插件已 boot。([Fastify][15]) 但这是 Fastify 全框架的一部分。                                                                                    |
| **依赖体积**                    | 零用户态依赖，最小。                                                                                                                                                                     | Hono core 零依赖，Node 侧只需要再加 adapter；整体仍是很小的 surface。([GitHub][1])                                                                                       | 明显更重：Fastify 是完整 Node web framework，包含 plugin lifecycle、hooks、schema validation、serialization、logging 等能力；这些能力强，但不是阶段 2 read-only API 的核心需求。([Fastify][16])                                |
| **维护活跃度**                   | 跟 Node 走；但当前 Node 25 自身已 EOL。([Node.js][2])                                                                                                                                    | 活跃。Hono GitHub releases 显示 v4.12.26 于 2026-06-18 发布；v4.12.25 还包含 CORS 相关安全修复。([GitHub][17])                                                           | 活跃且企业级成熟。Fastify releases 显示 v5.8.5 于 2026-04-14 发布，且是 security release；Fastify 还有明确 LTS 策略。([GitHub][18])                                                                                 |
| **长期维护**                    | 初期最少依赖，但长期容易积累隐式框架：router、middleware、error mapper、CORS、streaming helper、test harness。                                                                                          | 最符合“最小依赖 + 清晰边界”。可以把 Hono 限制在 HTTP adapter 层，业务逻辑和 API contract 仍由你自己的 package 管。                                                                     | 长期最稳健，但只有当 Worker API 会快速增长为复杂服务时才值得：复杂 auth、schema validation、OpenAPI、插件隔离、多种 content parser、结构化日志、rate limit、proxy trust 等。                                                              |

---

## 推荐方案

### 采用 Hono，但把它限制在 HTTP 边界层

建议结构：

```txt
apps/worker/src/
  api/
    contract.ts          # 唯一事实源：response envelope、DTO、route shape
    handlers.ts          # 纯业务 handler：不依赖 Hono/Fastify/Node req-res
    errors.ts            # ApiError -> envelope/status 的唯一映射
  http/
    app.ts               # createWorkerHttpApp(deps, config): Hono
    middleware/
      auth.ts
      origin.ts
      error.ts
    server.ts            # @hono/node-server serve()，唯一 Node adapter 入口
```

关键原则：

1. **Hono 只做 transport，不做事实源。**
   `contract.ts` 定义 `HealthResponse`、`CapabilitiesResponse`、`ConversationListResponse`、`TimelineResponse`、`ApiEnvelope<T>`。Hono route 只是把 URL/headers 映射到纯 handler。

2. **token auth 先自写或用 Hono Bearer Auth，不要上 JWT。**
   自托管 Worker 的第一版 token 通常是静态 API token。JWT/OIDC/Cookie session 都是过早抽象。Hono 的 Bearer Auth 不要求 token 必须是 JWT。([Hono][12])

3. **Origin allowlist 和 CORS 分开看。**
   CORS 是浏览器访问控制，不是认证。建议先写自己的 `originGuard`：对带 `Origin` 的浏览器请求做 allowlist；对 CLI / server-to-server 无 `Origin` 请求，按配置决定允许或拒绝。然后再接 Hono `cors({ origin })` 负责响应头和 preflight。Hono CORS 默认 `*`，生产不要用默认值。([Hono][10])

4. **统一错误响应用 `app.onError` + `app.notFound`，但 SSE 单独处理。**
   普通 JSON API 可以统一 envelope；SSE 一旦 headers/stream 已开始，就不能再改成 JSON error。Hono 文档明确说 streaming callback 抛错不会触发 `onError`，因为响应已经开始。([Hono][8]) 对 SSE 应写 `event: error` 后关闭流。

5. **测试继续用 Node built-in test runner。**
   Node `node:test` 已稳定；Hono route 测试可直接 `app.request()`，不用开端口。([Node.js][14]) 只保留少量真正 HTTP server integration tests，验证 listen、shutdown、CORS preflight、SSE headers。

---

## 为什么不是原生 `http`

原生 `http` 对现在这 4 个 read-only endpoint 是可行的，尤其你偏好最小依赖。但已知 roadmap 包含 CORS、Origin allowlist、auth、SSE、统一错误响应后，原生 `http` 的“无依赖”会逐步变成“自研框架”。

你需要自己维护：

```txt
method/path router
path params parser
query parser
OPTIONS/preflight
CORS headers
Origin allowlist
Bearer token middleware
request id
error envelope
not found / method not allowed
SSE event formatter
SSE heartbeat
stream abort handling
stream error handling
test request harness
```

这些都不难，但它们不是 Codex Remote 的核心差异化。除非你明确希望 `apps/worker` 的 HTTP 层永远小于 200–300 行，并且愿意把这些行为都写成自有测试约束，否则原生 `http` 的长期维护性不如 Hono。

---

## 为什么不是 Fastify

Fastify 是三者里最强的 Node 后端框架，但对阶段 2 过重。它适合这些情况：

```txt
API 很快会增长到几十个 endpoint
需要 JSON schema validation / serialization 作为核心
需要 OpenAPI / Swagger
需要复杂 plugin encapsulation
需要成熟 logger / lifecycle / hooks
需要 rate limit、proxy trust、cookies、multipart 等完整 Web 服务能力
团队熟悉 Fastify 类型和插件模型
```

你的阶段 2 是 read-only Control Plane-shaped API，重点是 Worker 状态、capabilities、conversation list、timeline。此时 Fastify 的 schema compiler、plugin lifecycle、decorator/declaration merging、生态插件管理，会把“清晰边界”向框架内迁移。Fastify 的 `.inject()`、SSE plugin、CORS plugin、LTS 策略都很好，但它解决的是更大服务的问题。([Fastify][15])

---

## 版本和安全建议

1. **不要把 Node 25 作为长期运行目标。**
   迁到 Node 24 LTS；CI 可额外跑 Node 26 Current。Node 官方已列 v25 EOL，并建议生产应用只使用 Active/Maintenance LTS。([Node.js][2])

2. **Hono 版本锁到安全修复后的版本。**
   Hono v4.12.25 修复了 CORS middleware 在 wildcard origin + credentials 场景下的安全问题，v4.12.26 是最新 release。使用 CORS credentials 时必须显式 origin allowlist。([GitHub][17])

3. **Fastify 若未来引入，也要跟 security release。**
   Fastify v5.8.5 是 security release，说明项目响应活跃，但也说明完整框架需要持续跟进安全公告。([GitHub][18])

---

## 最终建议

**阶段 2：用 Hono。**

具体决策：

```txt
HTTP framework: hono
Node adapter: @hono/node-server
Test: node:test + app.request()
Runtime target: Node 24 LTS，Node 26 optional CI
Auth: static Bearer token first，JWT later only when确实需要
CORS: explicit origin allowlist，禁止默认 *
SSE: later use streamSSE，但单独定义 SSE error event
Contract: 自有 TypeScript types/envelope 作为唯一事实源
```

保留一个迁移余地：不要让业务代码依赖 Hono `Context`。只要 `handlers.ts` 保持纯函数，未来发现 Hono 不够用时迁到 Fastify，或退回原生 `http`，成本都很低。

[1]: https://github.com/honojs/hono "GitHub - honojs/hono: Web framework built on Web Standards · GitHub"
[2]: https://nodejs.org/en/about/previous-releases "Node.js — Node.js Releases"
[3]: https://nodejs.org/docs/latest-v25.x/api/http.html "HTTP | Node.js v25.9.0 Documentation"
[4]: https://github.com/honojs/node-server "GitHub - honojs/node-server: Node.js Server for Hono · GitHub"
[5]: https://fastify.dev/docs/v5.4.x/Reference/LTS/ "LTS | Fastify"
[6]: https://hono.dev/docs/guides/testing "Testing - Hono"
[7]: https://fastify.io/docs/latest/Reference/TypeScript/ "TypeScript | Fastify"
[8]: https://hono.dev/docs/helpers/streaming "Streaming Helper - Hono"
[9]: https://github.com/fastify/sse "GitHub - fastify/sse: Server-Sent Events for Fastify · GitHub"
[10]: https://hono.dev/docs/middleware/builtin/cors "CORS Middleware - Hono"
[11]: https://github.com/fastify/fastify-cors "GitHub - fastify/fastify-cors: Fastify CORS · GitHub"
[12]: https://hono.dev/docs/middleware/builtin/bearer-auth "Bearer Auth Middleware - Hono"
[13]: https://fastify.io/ecosystem/ "Fastify"
[14]: https://nodejs.org/docs/latest-v25.x/api/test.html "Test runner | Node.js v25.9.0 Documentation"
[15]: https://fastify.io/docs/v5.7.x/Guides/Testing/ "Testing | Fastify"
[16]: https://fastify.io/ "Fast and low overhead web framework, for Node.js | Fastify"
[17]: https://github.com/honojs/hono/releases "Releases · honojs/hono · GitHub"
[18]: https://github.com/fastify/fastify/releases "Releases · fastify/fastify · GitHub"
