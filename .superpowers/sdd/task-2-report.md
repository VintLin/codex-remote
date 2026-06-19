# Task 2 Report: Reconcile OpenAPI As The Public Source Of Truth

## 结论

Task 2 的 OpenAPI 合同更新已完成，`packages/api-contract/openapi.yaml` 与生成物 `packages/api-contract/src/generated/openapi.ts` 已对齐 Stage 2 `/v1` read-only Worker API 的公共事实源要求。

## 已完成内容

- 在 `packages/api-contract/openapi.yaml` 新增 5 个 versioned Stage 2 GET 路由：
  - `/v1/worker/health`
  - `/v1/worker/capabilities`
  - `/v1/worker/probe`
  - `/v1/conversations`
  - `/v1/conversations/{conversationId}/timeline`
- 保留既有 unversioned 路由作为 legacy contract surface，未删除。
- 复用既有公共 schema：
  - `WorkerHealth`
  - `WorkerCapabilities`
  - `WorkerProbeSummary`
  - `CodexConversation`
  - `ConversationTimeline`
  - `ErrorEnvelope`
- 新增 `components.responses` 共享错误响应定义，并为所有 versioned Stage 2 路由补齐：
  - `400`
  - `401`
  - `403`
  - `408`
  - `424`
  - `500`
- 仅在 `GET /v1/conversations/{conversationId}/timeline` 增加 `404` `ErrorEnvelope` 响应。
- 收紧 `ErrorEnvelope.details`：
  - `additionalProperties: false`
  - allowlist keys:
    - `operation`
    - `retryable`
    - `diagnosticId`
    - `reason`
    - `field`
    - `limit`
- 重新生成 `packages/api-contract/src/generated/openapi.ts`

## 关键决策

### 决策 1

- 结论：仅在 `packages/api-contract` 范围内改动 `openapi.yaml` 与生成物，不触碰 worker/web 实现。
- 原因：任务所有权明确限定在公共 contract 与生成类型，Stage 2 当前目标是让合同成为唯一事实源并让 Task 1 的 guard tests 变绿。
- 风险：运行时实现尚未消费这些新增 `/v1` 路由时，合同会先于实现存在。
- 下一步：后续任务在 worker HTTP 层按这些 `operationId` 和 schema 落地实现。

### 决策 2

- 结论：错误响应统一抽到 `components.responses`，各 path 用 block-style `$ref` 引用。
- 原因：任务 brief 明确要求共享 `ErrorEnvelope` 响应组件，且现有测试依赖 block-style status entry 解析。
- 风险：未来若错误语义分化更细，需要在不破坏 ErrorEnvelope 统一形态前提下扩展 description 或 response 名称。
- 下一步：保持后续新增 Worker API 路由沿用同一错误响应组件模式。

### 决策 3

- 结论：不扩展 `ConversationEvent` 与 `ConversationTimelinePage`。
- 原因：task brief 明确禁止在本任务内实现或扩展这两个 schema。
- 风险：后续 timeline 增量分页或事件流需求需要单独任务处理。
- 下一步：等对应阶段任务再引入分页或事件 contract 约束。

## 验证结果

### 1. `pnpm --filter @codex-remote/api-contract generate`

- 结果：通过

### 2. `pnpm --filter @codex-remote/api-contract test`

- 结果：通过
- 结果摘要：8 tests, 8 pass, 0 fail

### 3. `pnpm --filter @codex-remote/api-contract typecheck`

- 结果：失败
- 原因：失败点全部位于 `packages/api-contract/src/contractGeneration.test.ts`，即 Task 1 新增测试文件中的严格类型错误。
- 说明：本任务明确要求“不要编辑 Task 1 tests；若遇到 true test bug，停止并报告 NEEDS_CONTEXT”。因此这里按约束停止，没有继续修改测试文件。

## 阻塞 / 风险

- `typecheck` 当前不能通过，不是因为本次 OpenAPI 变更，而是因为 `contractGeneration.test.ts` 本身存在多处 `string | undefined` / array index strictness 问题。
- 若要完成 brief 中的第三项验证通过，需要显式允许修复 Task 1 测试文件，或由 Task 1 所属改动先修正该测试类型问题。

## 建议下一步

1. 先确认是否允许修复 `packages/api-contract/src/contractGeneration.test.ts` 的严格类型错误。
2. 若允许，我会单独提交一个 focused test-fix commit，把 `typecheck` 拉绿。
3. 若不允许，本任务应以 contract 变更已完成、`typecheck` 被 Task 1 test bug 阻塞的状态结案。

## 验证清理补充

在获得额外授权后，本任务继续修复了 `packages/api-contract/src/contractGeneration.test.ts` 中由 Task 1 guard helper 引入的 strict TypeScript 报错。

### 修复内容

- 新增本地断言辅助：
  - `expectDefined`
  - `expectCapturedGroup`
- 将 helper 中所有“按逻辑必须存在”的数组索引访问改为显式断言后再使用。
- 将 `match()` / `exec()` 的第一捕获组访问改为显式断言，避免 `string | undefined`。
- 保持原有 guard 语义不变：
  - 仍然依赖相同的路径匹配、状态码匹配、响应组件匹配与 allowlist 断言
  - 没有放宽测试条件，也没有删除任何断言

### 再次验证结果

#### 1. `pnpm --filter @codex-remote/api-contract generate`

- 结果：通过

#### 2. `pnpm --filter @codex-remote/api-contract test`

- 结果：通过
- 结果摘要：8 tests, 8 pass, 0 fail

#### 3. `pnpm --filter @codex-remote/api-contract typecheck`

- 结果：通过
- 说明：`tsc --noEmit --pretty false` 退出码为 `0`，无额外错误输出

## Review Fix 补充

根据 Task 2 review 的重要问题，本任务对 versioned `GET /v1/conversations` 做了一个收口修复。

### 修复内容

- 从 `packages/api-contract/openapi.yaml` 中移除了 versioned `GET /v1/conversations` 的 query 参数：
  - `deviceId`
  - `projectId`
- 保留 unversioned legacy `/conversations` 上原有的 query 参数定义，不做改动。
- 重新生成了 `packages/api-contract/src/generated/openapi.ts`，使 `listWorkerConversations.parameters.query` 从带字段对象收紧为 `never`。

### 原因

- Stage 2 的 versioned `/v1/conversations` 公共 contract 不应暴露这两个筛选参数。
- legacy unversioned `/conversations` 仍保留既有 fixture contract surface，因此只修正 versioned 路由。

### 风险

- 低风险。此次变更只影响 `packages/api-contract` 公共合同和生成类型，不触碰 worker/web 实现。

### 本轮验证结果

#### 1. `pnpm --filter @codex-remote/api-contract generate`

- 结果：通过

#### 2. `pnpm --filter @codex-remote/api-contract test`

- 结果：通过
- 结果摘要：8 tests, 8 pass, 0 fail

#### 3. `pnpm --filter @codex-remote/api-contract typecheck`

- 结果：通过
- 说明：`tsc --noEmit --pretty false` 退出码为 `0`

## Task 3: Review Fix 回溯补充（2026-06-20）

### 本轮修复摘要

- `apps/web/src/data/workerApi/workbenchData.ts`
  - 将 `WorkbenchData.source.reason` 增加 `"loaded"`。
  - 成功路径返回 `source.reason = "loaded"`。
  - 成功加载 health/capabilities/conversations 后，timeline 读取失败不再整体 fallback：仍保留已加载快照（设备、项目、会话）。
  - timeline 读取失败时将目标会话的 `assistantThread.loadState` 标记为 `"readError"` 并将其 timeline 置空。
  - 将 `WorkerApiRequestError` 的 sanitized envelope（`code`、`message`、允许的 `details`、`requestId`）透传到 `source.error`。

- `apps/web/src/data/workerApi/workbenchData.test.ts`
  - 新增成功路径断言：`source.reason` 为 `"loaded"`。
  - 新增 timeline 读取失败测试，验证已加载快照保留与目标线程 `readError`。
  - 新增错误 `ErrorEnvelope` 清洗断言：校验 `source.error.code/message` 和仅保留允许的 detail 字段。

### 验证命令

- `pnpm --filter @codex-remote/web test -- --test-name-pattern "workbench datasource"`
- `pnpm --filter @codex-remote/web typecheck`
