# Task 4 Report: Stage 13 Web API And Minimal UI

## 结果

- `WorkerApiClient` 新增 `startReview(deviceId, conversationId, input)`，只调用 Control Plane-shaped `POST /v1/devices/{deviceId}/conversations/{conversationId}/local-actions/review-start`。
- request body 使用 public contract `StartReviewInput`：`projectId`、`expectedConversationId`、`clientRequestId`、`confirmationText`。
- fake Worker smoke server 新增 `/v1/conversations/{conversationId}/local-actions/review-start`，接受 fixed confirmation，并拒绝 unknown fields、conversation guard mismatch、project mismatch、bad confirmation。
- Local Tools 的 Git/Review section 新增最小 review-start UI：确认文本、按钮、pending disabled、accepted 状态、sanitized error message。
- Web 成功或失败后都会 refresh 当前 selected conversation key 的 workbench data，成功后显示 accepted。
- Web source-boundary tests 覆盖不导入 `@codex-remote/codex-protocol`，不暴露 `ReviewTarget`、`baseBranch`、`thread/shellCommand`、`command/exec`、`shellCommand` 等第一切片禁用能力。

## TDD 记录

### RED

先写失败测试：

```bash
pnpm --filter @codex-remote/web test -- src/data/workerApi/client.test.ts src/data/workerApi/fakeWorkerSmokeServer.test.ts src/components/shell/codexRemoteAppWriteFlow.test.ts src/components/shell/localWorkbenchBoundary.test.ts
```

首次有效 RED 结果：exit code 1，31 pass / 6 fail。

失败点符合预期：

- `client.startReview is not a function`
- fake Worker review-start route 返回 404
- UI/source tests 缺少 `reviewStartStatus`、`confirmationText`、`StartReviewInput`、disabled guard 等 wiring

### GREEN

实现最小代码后 focused tests 通过：

```bash
pnpm --filter @codex-remote/web test -- src/data/workerApi/client.test.ts src/data/workerApi/fakeWorkerSmokeServer.test.ts src/components/shell/codexRemoteAppWriteFlow.test.ts src/components/shell/localWorkbenchBoundary.test.ts
```

结果：exit code 0，37 tests pass。

## 关键决策

### 1. 结论

Web 只新增 `startReview` public-client 方法，不创建 shell/command/exec 泛化入口。

### 原因

Stage 13 first slice 只允许 fixed-target review start；泛化 action API 会把 deferred shell-like 能力提前带进 Web。

### 风险

当前 UI 只支持 `START REVIEW` 固定确认文本；后续如 Worker confirmation 文案变化，需要同步 public contract/Worker/Web。

### 下一步

后续能力继续从 `packages/api-contract/openapi.yaml` 开始，不在 Web 平行定义 DTO。

### 2. 结论

Local Tools Git/Review card 内直接承载最小 action UI。

### 原因

brief 要求最小 UI，现有 Git/Review section 已是本地工作工具上下文；新增 feature 目录或复杂 controller 会超出切片。

### 风险

当前 source tests 验证 wiring 和 boundary，不等同真实浏览器交互测试。

### 下一步

如果后续要求 Chrome smoke，再用 fake Worker/Control Plane 验证 disabled、accepted、failed 状态。

## 范围外

- 未实现 `shell-command`、`thread/shellCommand`、`command/exec`、terminal stream。
- 未实现 base branch、commit、custom review target。
- 未改 Worker、Control Plane、OpenAPI contract、DB 或 protocol package。
- 未做 browser smoke。

## 验证

- `pnpm --filter @codex-remote/web test -- src/data/workerApi/client.test.ts src/data/workerApi/fakeWorkerSmokeServer.test.ts src/components/shell/codexRemoteAppWriteFlow.test.ts src/components/shell/localWorkbenchBoundary.test.ts`：RED exit code 1，31 pass / 6 fail；GREEN exit code 0，37 tests pass。
- `pnpm --filter @codex-remote/web test`：exit code 0，125 tests pass。
- `pnpm --filter @codex-remote/web typecheck`：exit code 0。
- `pnpm --filter @codex-remote/web lint`：exit code 0；当前脚本执行 `tsc --noEmit --pretty false`。

## Concerns

- 未运行全仓 `pnpm test` / `pnpm build`；brief 明确要求 Web package test，本切片额外跑了 Web typecheck/lint。
- 未做 Chrome/browser smoke。
