# Codex Remote Development Overview

## 总目标

构建一个自托管的多设备 Codex Web 控制台。

核心能力是在一个 Web 工作台中管理多台设备上的 Codex：查看设备状态、项目、对话和输出流，发送 follow-up，中止任务，处理 approval，并把不同设备上的 Codex conversations 关联到任务看板。

长期拓扑：

```mermaid
flowchart LR
  Web["Web 工作台"]
  CP["Control Plane"]
  Worker["Device Worker"]
  AppServer["Codex app-server"]
  DB["DB / Task Board"]
  IOS["未来 iOS"]

  Web --> CP
  IOS --> CP
  CP --> Worker
  Worker --> AppServer
  CP --> DB
```

## 维护规则

`PLAN.md` 是项目路线图和进度综述的活文档。阶段状态、下一步建议、风险判断或调研结论变化时，必须同步更新本文件；阶段细节仍写入 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`。

目录职责和依赖方向以 `PROJECT_STRUCTURE.md` 为准。新增阶段目录或移动代码前，先更新该文件。

产品定位和 MVP 范围以 `PRODUCT.md` 为准；视觉系统和组件风格以 `DESIGN.md` 为准。

## 架构原则

- `packages/api-contract/openapi.yaml` 是 Web、Worker、Control Plane、未来 iOS 的唯一 API 事实源。
- `packages/codex-protocol` 是 Codex app-server 协议唯一事实源。
- `apps/worker` 是唯一直接连接或启动 Codex app-server 的模块。
- `apps/web` 不接触 app-server 原始协议。
- 每阶段必须有明确目标和 non-goals，避免顺手扩范围。
- 每阶段只交付一个可验证主链，不铺无用架子。
- 抽象延迟：一次使用不抽象，第二次重复再提取。

## 阶段路线

| 阶段 | 目标 | 当前状态 |
| --- | --- | --- |
| 0. 架构底座 | monorepo、包边界、contract/protocol 事实源 | 已完成 |
| 1. Read-only Worker Probe | 验证本机 app-server read-only 主链 | 已完成 |
| 2. Worker HTTP API Read-only | 把 probe 能力变成 Web 可调用 API | 已完成本地可验证切片 |
| 3. Web 接真实数据 | Web 从 Worker/Control Plane-shaped API 读取设备、项目、对话、timeline | 下一阶段 |
| 4. 写操作主链 | start、follow-up、stream 输出 | 未开始 |
| 5. 控制主链 | interrupt、steer、approval request/response | 未开始 |
| 6. Control Plane 多设备 | 多 Worker 注册、路由、状态聚合 | 未开始 |
| 7. 持久化与任务看板 | DB、任务关联、conversation 到任务映射 | 未开始 |
| 8. 产品化与扩展 | 安装、权限、安全审计、iOS API 复用 | 未开始 |

```mermaid
flowchart TB
  P0["0. Foundation - done"]
  P1["1. Read-only Probe - done"]
  P2["2. Worker HTTP Read-only API"]
  P3["3. Web Real Datasource"]
  P4["4. Write + Stream"]
  P5["5. Approval / Interrupt / Steer"]
  P6["6. Multi-device Control Plane"]
  P7["7. DB + Task Board"]
  P8["8. Product Hardening + iOS"]

  P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8
```

## 每阶段交付标准

每个阶段都必须产出：

- `docs/superpowers/specs/YYYY-MM-DD-xxx-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-xxx.md`
- 明确目标、非目标、包边界和唯一事实源。
- 最小但有效的测试。
- fresh verification：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`。

## 执行方式

```mermaid
flowchart LR
  Overview["大路线图"] --> Spec["阶段 Spec"]
  Spec --> Plan["阶段 Plan"]
  Plan --> Contract["契约先行"]
  Contract --> Impl["最小垂直实现"]
  Impl --> Tests["边界测试"]
  Tests --> Review["架构复审"]
  Review --> Archive["完成后归档"]
```

建议按主链推进，而不是按技术层铺空架子：

1. 先确认本阶段服务哪条用户主链。
2. 先写 contract，再实现 Worker/Web。
3. 每次只做一个垂直切片。
4. 用边界测试守住事实源、安全和包依赖方向。
5. 阶段完成后复审、归档，再进入下一阶段。

## 主要风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| app-server 协议变化 | Worker 调用断裂 | `codex-protocol` 生成物作为唯一事实源，协议变更先更新生成物 |
| WebSocket app-server 不稳定 | 本机 Worker 不可靠 | Stage 2 以 Worker-owned stdio 为目标方向，loopback WebSocket 仅保留为 probe/debug fallback；实现前必须用本机 Codex CLI 验证 |
| 多设备安全边界复杂 | token、project、approval 泄露风险 | Worker fail-closed，Control Plane 不保存 provider secrets |
| 过早做 Control Plane / DB | 偏离主链，产生冗余 | 先单设备 read/write 主链闭环 |
| Web 直接绑定 mock 数据 | 后续替换困难 | 先建立 datasource boundary |
| Approval 处理不严谨 | 可能误执行命令或文件操作 | approval 独立主链，显式用户决策，不自动接受 |
| streaming 不是可靠 event log | Web timeline 乱序、重复或断线后丢状态 | Worker 生成 `seq/eventId`，Web 做 snapshot reconciliation，断线补偿不依赖 app-server replay |
| DB 过早复杂化 | 分散主链实现成本 | Stage 7 默认 SQLite + Drizzle；多实例写入、remote sync、PostgreSQL 等到真实需求出现再评估 |
| 运行时版本承诺过早 | 本地可跑但产品化不可维护 | 本地开发可用当前 Node；产品/runtime 支持矩阵按 Node LTS 做阶段验证 |
| API contract 过度 Web-specific | 未来 iOS/Worker 破坏性迁移 | 保持 stable `operationId`、opaque cursor、明确 `additionalProperties` 和标准错误形态 |
| device-bound token 误降级 | 普通 bearer 被误当设备绑定凭证 | Stage 6 先写 threat model；bearer+rotation 只能作为明确降级或开发姿态 |

## 调研状态

已导入并初步解析的调研回答位于 `docs/references/questions/`。

| 范围 | 状态 | 结论 |
| --- | --- | --- |
| Q1-Q4 下一阶段 P0 调研 | 已回答 | Stage 2 可进入 Worker HTTP API Read-only MVP；建议 Hono 作为 HTTP 边界、5 个 read-only endpoint、stdio 作为目标 transport、`thread/turns/list` 作为可选 experimental capability |
| Q5-Q8 写/流/控制链路调研 | 已回答，Q8 需本地验证 | streaming 需 Worker event envelope/replay；start/follow-up/steer 分开建模；approval 需 Registry/CAS/idempotency；interrupt/steer 需 `expectedTurnId` 和 per-thread 串行化 |
| Q9-Q12 多设备/DB/iOS/产品化调研 | 已回答，Q11 只采纳 guardrails | 多设备采用 one-time pairing + device identity + reverse connection；DB 默认 SQLite + Drizzle；iOS 当前只固化 API guardrails；Worker 产品化 user-mode first |
| Q13 E2E / Playwright | 已回答 | 第一个可交互用户纵切链路出现时引入 Playwright smoke；Node/API integration 仍是主验证层 |
| Q14-Q17 DB driver / reverse connection / device auth / secret storage | 已回答，Q16 需 Stage 6 threat model 裁剪 | DB driver 默认 `better-sqlite3`；reverse connection 默认 WSS + 应用层 ack/lease/resume；device-bound token 长期方向为 DPoP-compatible sender-constrained token；Worker identity secret 默认 OS keyring |

当前不新增全网调研问题。剩余工作更适合放入阶段 spec 的本地验证清单。

## 当前技术栈

- TypeScript
- pnpm
- Turborepo
- Next.js Web
- OpenAPI 3.1
- openapi-typescript
- Node built-in test runner
- Node `fetch` / `WebSocket`
- Codex CLI app-server
- `packages/api-contract`
- `packages/codex-protocol`
- `apps/worker`

产品化支持矩阵以后续阶段 spec 为准；本地开发可用当前 Node 版本，但长期运行和分发优先按 Node LTS 验证。

`docs/references/codex-app-server.md` 是 app-server 协议解释性参考；`packages/codex-protocol` 的生成物仍是 Worker 代码使用的协议类型事实源。

## 下一步建议

最近完成的 Superpowers spec：

- `docs/superpowers/specs/2026-06-19-worker-http-readonly-api-design.md`

最近完成的 Superpowers plan：

- `docs/superpowers/plans/2026-06-19-worker-http-readonly-api.md`

Stage 2 已完成：

- `packages/api-contract/openapi.yaml` 增加 5 个 versioned read-only Worker endpoint。
- `apps/worker` 增加 loopback-only HTTP config、sanitized errors、read-only handlers、Hono boundary、server CLI 和架构边界测试。
- 本地 smoke：`/v1/worker/capabilities` 返回 200；未配置本机 app-server 时 `/v1/worker/health` 返回 424 `ErrorEnvelope`，无 token、raw URL、stack、prompt、command output 或 full diff 泄漏。

下一步建议进入 Stage 3：Web 接真实数据。

范围建议：

- 建立 Web datasource boundary，用 `api-contract` 类型消费 Worker/Control Plane-shaped API。
- 保留现有 mock/factory 作为 fallback 和测试夹具，不让 UI 组件直接依赖 mock 数据结构。
- 先接只读主链：capabilities/health、conversation list、conversation timeline。
- 不做 write、stream、approval、Control Plane、DB。

Stage 3 默认设计输入：

- Web 只依赖 `@codex-remote/api-contract`，不导入 `@codex-remote/codex-protocol`。
- Datasource 返回 public contract 类型或从 public contract 明确派生的 view state。
- 首个纵切只读；Web 错误态必须展示 sanitized `ErrorEnvelope` 的 public message/code。
- Playwright 暂不大规模引入；等 Web + fake Worker datasource 能跑通首个交互纵切链路时，只加少量 smoke。
- 不创建空 `apps/control-plane`、`packages/db` 或 `packages/shared`；等对应阶段需要真实文件时再创建。

后续阶段默认设计输入：

- Stage 6：Control Plane reverse connection 默认 WSS；必须设计应用层 `msg_id/seq/ack/lease/resume/credit`，不要把 WebSocket send 当作任务完成。
- Stage 6：device-bound token 以 DPoP-compatible sender-constrained token 为长期方向，但实现前必须先写 threat model。
- Stage 7：SQLite + Drizzle 默认使用 `better-sqlite3`，driver 隔离在 `packages/db` 边界内。
- Productization：Worker device identity secret 默认 OS keyring；Linux/headless file fallback 必须显式 opt-in。
