# Task 1 Report: Versioned Project Discovery

## 实现内容

- 在 `packages/api-contract/openapi.yaml` 增加 `GET /v1/projects` 和 `GET /v1/devices/{deviceId}/projects`，复用既有 `RemoteProject` schema，并通过 `pnpm --filter @codex-remote/api-contract generate` 更新生成类型。
- Worker 新增 `listProjects()` 与 `GET /v1/projects`，只公开一个安全项目：`id: "local-project"`、`path: ""`；内部 start conversation 仍使用 `allowedProjectRoot` 作为 app-server `cwd`。
- Worker start conversation 只接受 public opaque id `local-project`，拒绝 basename public id。
- Control Plane 新增 `WorkerUpstreamClient.listProjects()`、全局 `/v1/projects` 聚合和 `/v1/devices/:deviceId/projects` 路由，并在 Control Plane 边界规范 `deviceId`。
- Web client 新增 `listProjects()`；Workbench datasource 在 loaded path 直接使用 `/v1/projects`，不再从 conversations 反推 projects。
- 在允许修改的 `controlPlaneHttpApp.test.ts` 增加 `RemoteProject` schema-key guard，避免本任务的手写 projector 字段列表静默漂移。

## TDD RED 证据

- `pnpm --filter @codex-remote/api-contract test -- --test-name-pattern "project discovery"`：先失败，缺少 `/v1/projects` 和 `/v1/devices/{deviceId}/projects` route。
- `pnpm --filter @codex-remote/worker test -- --test-name-pattern "projects|starting a conversation"`：先失败，`listProjects` 未导出、route 未实现、`local-project` 被旧 basename 校验拒绝。
- `pnpm --filter @codex-remote/control-plane test -- --test-name-pattern "projects|project fields"`：先失败，project routes 返回 404。
- `pnpm --filter @codex-remote/web test -- --test-name-pattern "project discovery|conversations are empty and projects exist"`：先失败，`client.listProjects` 不存在，projects 仍从 empty conversations 推导为 `[]`。

## GREEN / Verification

- `pnpm --filter @codex-remote/api-contract test -- --test-name-pattern "project discovery"`：PASS，1/1。
- `pnpm --filter @codex-remote/worker test -- --test-name-pattern "projects|starting a conversation"`：PASS，18/18。
- `pnpm --filter @codex-remote/control-plane test -- --test-name-pattern "projects|project fields"`：PASS，8/8。
- `pnpm --filter @codex-remote/web test -- --test-name-pattern "project discovery|conversations are empty and projects exist"`：PASS，17/17。
- `pnpm --filter @codex-remote/api-contract generate`：PASS，更新生成物。
- `pnpm --filter @codex-remote/api-contract test`：PASS，26/26。
- `pnpm --filter @codex-remote/api-contract build`：PASS。
- `pnpm --filter @codex-remote/worker test`：PASS，146/146。
- `pnpm --filter @codex-remote/control-plane test`：PASS，35/35。
- `pnpm --filter @codex-remote/web test`：PASS，89/89。

## 改动文件

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/generated/openapi.ts`
- `packages/api-contract/src/contractGeneration.test.ts`
- `apps/worker/src/http/readOnlyHandlers.ts`
- `apps/worker/src/http/writeHandlers.ts`
- `apps/worker/src/http/workerHttpApp.ts`
- `apps/worker/src/http/readOnlyHandlers.test.ts`
- `apps/worker/src/http/writeHandlers.test.ts`
- `apps/worker/src/http/workerHttpApp.test.ts`
- `apps/control-plane/src/client/workerClient.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/web/src/data/workerApi/client.ts`
- `apps/web/src/data/workerApi/client.test.ts`
- `apps/web/src/data/workerApi/workbenchData.ts`
- `apps/web/src/data/workerApi/workbenchData.test.ts`
- `.superpowers/sdd/task-1-report.md`

## 自审发现

- `allowedProjectRoot` / `cwd` 没有进入 public id/path；public project id 固定为 `local-project`，public path 固定为空字符串。
- Control Plane conversations 聚合继续保留旧的 degraded-to-empty 行为；projects 聚合按任务要求不吞掉 Worker failure。
- Web loaded path 现在以 project API 为权威来源；旧的 conversations-to-projects 推导已删除，避免第二事实源。

## 疑虑

- `RemoteProject.expanded` 在 OpenAPI schema 中不是 required，但当前 Worker 和 Control Plane projector 都要求 Worker 响应包含该字段；这与现有 UI 期望和 task brief 一致，未在本任务中调整 schema required 集合。
- 本任务没有实现 streaming、多设备实机、installer/keychain/pairing/reverse WSS/iOS/生产 auth 等 Stage 9 non-goals。

## Review Fix: Declare `/v1/projects` Device Unavailable Response

### 处理内容

- 在 `packages/api-contract/src/contractGeneration.test.ts` 的 `project discovery` focused contract test 中增加 source-of-truth 断言：`GET /v1/projects` 必须声明 `"424": "#/components/responses/DeviceUnavailableError"`。
- 在 `packages/api-contract/openapi.yaml` 的 `/v1/projects` responses 中补充 `424 DeviceUnavailableError`。
- 运行 `pnpm --filter @codex-remote/api-contract generate` 更新 `packages/api-contract/src/generated/openapi.ts`。

### RED

- `pnpm --filter @codex-remote/api-contract test -- --test-name-pattern "project discovery"`：FAIL，1/1 failed。失败点为 `extractResponseRefs(controlPlaneProjectsGet.lines).get("424")` 返回 `undefined`，证明 `/v1/projects` 未声明 424。

### GREEN / Verification

- `pnpm --filter @codex-remote/api-contract generate`：PASS，更新生成物。
- `pnpm --filter @codex-remote/api-contract test -- --test-name-pattern "project discovery"`：PASS，1/1。
- `pnpm --filter @codex-remote/api-contract test`：PASS，26/26。
- `pnpm --filter @codex-remote/api-contract build`：PASS。

### 改动文件

- `packages/api-contract/openapi.yaml`
- `packages/api-contract/src/generated/openapi.ts`
- `packages/api-contract/src/contractGeneration.test.ts`
- `.superpowers/sdd/task-1-report.md`

### 疑虑

- 未发现新增疑虑；本次只补齐 OpenAPI source-of-truth 中已存在运行时行为对应的 response 声明。
