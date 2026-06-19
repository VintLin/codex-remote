# Task 1 Report: Add Web Datasource Tests

## 本次改动
- 新增 `apps/web/src/data/workerApi/client.ts`
  - 新增 `WorkerApiClientConfig` 与 `WorkerApiClientLike`
  - 提供 `WorkerApiClient` 占位实现（方法抛出 placeholder 错误）
- 新增 `apps/web/src/data/workerApi/workbenchData.ts`
  - 新增 `WorkbenchData`/`LoadWorkbenchDataOptions`/`SearchRecent`
  - 新增 `createFallbackWorkbenchData`
  - 新增 `loadWorkbenchData`（当前为 task-1 占位返回逻辑）
- 新增 `apps/web/src/data/workerApi/workbenchData.test.ts`
  - 覆盖 9 条 `workbench datasource` 场景
  - 包含成功快照构建、token 缺失回退、401/403/424 回退、项目缺失不建项目、timeline 元数据化、
    fallback 不复用 rich assistant 线程、searchRecents 来自会话列表

## 执行的命令
- `pnpm --filter @codex-remote/web test -- --test-name-pattern "workbench datasource"`

## 本地结果
- 总计测试：`19`
- 通过：`11`
- 失败：`8`
- 失败原因：在 Task 1 约定的“占位实现”阶段，`loadWorkbenchData` 与 `WorkerApiClient` 还未实现真实行为（按设计，这些场景应由 Task 2 解决）。

## 主要失败断言（截图要点）
- 成功路径场景下快照不匹配（仍返回回退 mock）。
- 401/403/424 分支仍返回 `request_failure`，未按错误码映射 `unauthorized/forbidden/app_server_unavailable`。
- `projectless` 会话未按投影规则过滤。
- timeline 节点仍是现网 mock 的富文本/工具节点。
- fallback 的 timeline 未脱离 `mockData` 的 rich 内容。
- searchRecents 未与实时加载会话列表对齐。

## 自检与边界说明
- 范围严格限定为用户要求的 3 个文件。
- 没有改动 `web` 以外模块/文件。
- Web 侧现阶段未引入 `@codex-remote/codex-protocol`。
- 下一步建议：进入 Task 2 实现 `WorkerApiClient` 与 `loadWorkbenchData` 的真正投影逻辑并复测。

## 关注项
- Task 1 的目标是红/绿切换前的测试护栏；请在 Task 2 中补齐行为后再次执行同一命令，确保上述 8 条场景通过。

## 评审发现修复回填（本次）
- 变更文件：
  - `apps/web/src/data/workerApi/client.ts`
  - `apps/web/src/data/workerApi/workbenchData.ts`
  - `apps/web/src/data/workerApi/workbenchData.test.ts`
  - `apps/web/src/data/app-server/mockData.ts`（可选最小改动：`SearchRecent` 类型改为从 workbenchData 共享来源）
- 执行命令：
  - `pnpm --filter @codex-remote/web test -- --test-name-pattern "workbench datasource"`
- 本次测试输出：
  - 总计测试：`19`
  - 通过：`12`
  - 失败：`7`
- 失败仍为 Task 2 占位行为缺失相关（success、错误码映射、projectless 投影、timeline 投影、实时 search recents 派生），不属于本次修复范围。
