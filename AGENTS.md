# AGENTS.md

## Source Of Truth

- `PLAN.md`：项目总目标、阶段路线、风险和调研状态。
- `PROJECT_STRUCTURE.md`：目录职责、依赖方向和新增文件规则。
- `QUESTIONS.md`：调研问题和回答状态。
- `docs/references/development-context.md`：阶段性技术决策、参考项目和未来阶段上下文。

更新规则：

- 阶段状态、下一步建议、风险判断变化时，同步更新 `PLAN.md`。
- 目录职责、依赖方向或文件放置规则变化时，同步更新 `PROJECT_STRUCTURE.md`。
- 调研结论变化时，同步更新 `QUESTIONS.md` 和相关 reference。
- 阶段级设计写入 `docs/superpowers/specs/`，阶段级执行计划写入 `docs/superpowers/plans/`。
- 已完成或废弃文档统一归档到 `docs/archives/`。

## Environment

- 包管理器：`pnpm`
- Monorepo：Turborepo
- 主要语言：TypeScript
- Web：Next.js
- Contract：OpenAPI 3.1 + `openapi-typescript`
- 测试：Node built-in test runner

本地网站：

- 启动：`pnpm web:start`
- 状态：`pnpm web:status`
- 关闭：`pnpm web:stop`
- 默认地址：`http://127.0.0.1:5173`

提交前默认验证：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果某个命令尚未建立，最终说明必须明确“尚未建立该验证命令”。

## Architecture Rules

### 唯一事实源

- Codex app-server 协议类型必须从 `codex app-server generate-ts` / `generate-json-schema` 生成或显式派生。
- Control Plane API contract 必须有单一 schema 来源；Web、Worker、未来 iOS 都从该来源生成或引用。
- 数据库 schema 是持久化字段的唯一事实源；业务类型从 schema 显式派生。
- 禁止在 API handler、UI、测试中手写平行字段结构。

### 包边界

- `apps/web` 只能调用 Control Plane-shaped API，不直接调用 Codex app-server。
- `apps/control-plane` 不能直接调用 Codex app-server。
- `apps/worker` 是本机 Codex app-server、本机文件系统、本机 git、本机 terminal 的边界。
- `packages/codex-protocol` 不依赖 Web 或 Control Plane。
- `packages/api-contract` 不依赖具体 UI 框架。
- `packages/db` 不依赖 Web 组件。
- `packages/ui` 不拥有业务数据、API 调用、datasource、app-server protocol 或 DB 逻辑。

### Secrets

- 禁止将 OpenAI API key、ChatGPT auth、Codex auth file 写入 Control Plane DB。
- 禁止在日志、测试 fixture、截图、文档示例中写真实 token。
- 示例 token 只能使用 `REDACTED` 或 `example-token`。
- 普通日志禁止记录 raw prompt、raw command output、raw JSON-RPC frame、full diff、provider secrets。
- 服务配置、plist、systemd unit、Scheduled Task 参数中禁止写入 token、provider key、Codex auth。

## Development Rules

- 每个阶段开始前先读 `PLAN.md`，确认当前阶段、non-goals、风险和调研状态。
- 新增或移动文件前先读 `PROJECT_STRUCTURE.md`，确认目录职责和依赖方向。
- 阶段性技术决策查 `docs/references/development-context.md`；不要把短期决策扩写进 `AGENTS.md`。
- 复杂功能先写 `docs/superpowers/specs/`，再写 `docs/superpowers/plans/`，最后实现。
- 每次只做一个可验证垂直切片；不铺未使用的框架、抽象或扩展点。
- Contract 变更先改 schema，再生成类型，再改实现。
- 不主动回滚用户已有改动。
- 遇到异常 Git 状态，先报告观察结果和建议。
- 每次完成实现任务必须提供 fresh verification，不复用旧结果。

## Turborepo Rules

- 使用 `turbo.json` 的 `tasks` 字段，不使用旧版 `pipeline`。
- workspace 使用：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- package 之间通过 `workspace:*` 引用。
- `dev` 任务不缓存；长运行 app dev server 标记为 `persistent`。
- `build` 任务必须声明 outputs。

## Testing Rules

测试按风险分层：

- Unit：纯函数、schema mapper、contract mapper。
- Integration：跨模块协作、外部进程/服务边界、数据持久化边界。
- E2E：关键用户流程。
- Type：`tsc --noEmit` 或包级 typecheck。

边界测试优先级高于覆盖率数字；新增跨包或安全边界时，优先补边界测试。

阶段性测试关注点记录在 `docs/references/development-context.md`。

## Frontend Rules

- 前端默认服务真实工作流。
- UI 信息层次优先于装饰；状态、错误和空态必须清晰。
- 复用 `packages/ui` 的纯展示组件；业务数据、API 调用和协议逻辑留在应用层。
- 不做大 hero、不做营销型首屏。
- 不做过度装饰。
