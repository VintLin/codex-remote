# AGENTS.md

## Project Overview

本项目是一个自托管多设备 Codex Web 控制台。

第一版目标是在一个 Web 页面中管理多台设备上的 Codex：查看设备状态、项目列表、对话列表、输出流，发送 follow-up，中止任务，并把不同设备上的 Codex conversations 手动关联到任务看板。

核心边界：

- 不依赖同一 OpenAI / ChatGPT 账号。
- 每台设备保留自己的 Codex auth、API key、model provider 和本地配置。
- Control Plane 不保存 OpenAI / ChatGPT / provider secrets。
- Codex app-server 只应绑定 localhost 或本机 socket。
- Device Worker 是唯一对外桥接层。
- 第一版是 Web，后续预留 iOS App。

## Environment

- 包管理器：`pnpm`
- Monorepo：Turborepo
- 主要语言：TypeScript
- 第一版运行形态：Web UI + Control Plane Server + Device Worker
- 后续移动端：iOS App 复用 Control Plane API contract，不直接复用 Web UI runtime

提交前默认执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果某个命令尚未建立，需在最终说明中明确“尚未建立该验证命令”，不要假装已验证。

## Project Structure

目标结构：

```text
apps/
  web/
  control-plane/
  worker/

packages/
  shared/
  codex-protocol/
  db/
  api-contract/
  ui/

docs/
  specs/
  plans/
  references/
  archives/
```

文档分类：

- `docs/specs/`：已确认或正在确认的规格。
- `docs/plans/`：开发执行计划。
- `docs/references/`：外部资料、协议资料、参考项目调研。
- `docs/archives/`：完成或废弃的历史规格和计划。

## Architecture Rules

### 唯一事实源

- Codex app-server 协议类型必须从 `codex app-server generate-ts` / `generate-json-schema` 生成或显式派生。
- Control Plane API contract 必须有单一 schema 来源，Web、Worker、未来 iOS 都从该来源生成或引用。
- 数据库 schema 是持久化字段的唯一事实源；业务类型从 schema 显式派生。
- 禁止在 API handler、UI、测试中手写平行字段结构。

### 边界

- `apps/web` 只能调用 Control Plane API。
- `apps/control-plane` 不能直接调用 Codex app-server。
- `apps/worker` 负责连接本机 Codex app-server、本机文件系统、本机 git、本机 terminal。
- `packages/codex-protocol` 不依赖 Web 或 Control Plane。
- `packages/api-contract` 不依赖具体 UI 框架。
- `packages/db` 不依赖 Web 组件。

### Secrets

- 禁止将 OpenAI API key、ChatGPT auth、Codex auth file 写入 Control Plane DB。
- 禁止在日志、测试 fixture、截图、文档示例中写真实 token。
- 如需示例，使用 `REDACTED` 或 `example-token`。

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

- Unit：纯函数、schema normalizer、API contract mapper。
- Integration：Worker 与 app-server probe、Control Plane 与 Worker 通信。
- E2E：Web UI 控制两台 Worker 的 MVP flow。
- Type：`tsc --noEmit` 或包级 typecheck。

Worker probe 是第一阶段必须有的验证入口。它至少覆盖：

- `initialize`
- `model/list`
- `thread/list`
- `thread/read`
- `thread/resume`
- `turn/start`
- streaming notifications
- `turn/steer`
- `turn/interrupt`

## Frontend Rules

第一版 UI 是工作台，不是营销页。

- 默认三栏布局：设备 / 任务导航，列表 / 看板，conversation 操作区。
- 控件优先服务高频操作：打开对话、发送 follow-up、中止、关联 task。
- 状态必须清晰展示：online/offline、running、waiting approval、failed、done。
- 不做大 hero、不做营销型首屏。
- 不做过度装饰。

## iOS Extension Rules

后续 iOS App 只能连接 Control Plane API。

- iOS 不直接连接 Codex app-server。
- iOS 不保存 OpenAI / Codex secrets。
- iOS 类型从 API contract 生成。
- 需要配对时优先设计 QR / one-time token / trusted device flow。

## Reference Projects

参考项目位于 `project_referenecs/`。使用前先读：

- `docs/references/research/参考项目技术调研 v0.1.md`

优先参考：

- `Sunwood-ai-labs-codex-remote-control-lab`：localhost app-server + token bridge。
- `friuns2-codex-mobile`：browser-first app-server UI 和 CLI 包装。
- `getpaseo-paseo`：daemon + clients + mobile/desktop/CLI 长期结构。
- `openai-codex`：app-server 协议事实源。

不要在 MVP 中照搬：

- 多 agent 编排。
- provider proxy。
- Codex Desktop 重打包。
- Telegram / tunnel / mobile-first 扩展。

## Change Strategy

- 先读 `docs/specs/多设备 Codex 控制台 技术规格 v0.2.md` 和相关计划，再改代码。
- 复杂功能先更新 `docs/plans/`，再实现。
- 不主动回滚用户已有改动。
- 遇到异常 Git 状态，先报告观察结果和建议。
- 每次完成实现任务必须提供 fresh verification，不复用旧结果。
