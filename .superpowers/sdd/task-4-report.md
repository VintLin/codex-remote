# Task 4 Report: Minimal Start Conversation UI

## 结果

- 新增 `startConversationSubmitController.ts`，Web 通过 Control Plane-shaped `WorkerApiClient.startConversation` 提交新对话。
- 新增 controller TDD 测试，覆盖 accepted 路径、opaque `local-project`、`clientRequestId`、状态顺序和刷新到 `deviceId\u001fconversationId`。
- `CodexRemoteApp` 从 `WorkbenchData.projects` 选择 `selectedProject`，只在 `source.reason === "loaded"`、有 token、且有 project 时启用 start UI。
- `ConversationMain` 增加最小 start form，复用现有 `conversation-control-strip/row` 样式；draft 只在 accepted 后清空。
- 更新 write flow source test，确认 start conversation 已 wired，且 shell 使用 `selectedProject`。

## TDD 记录

### RED

先创建 `apps/web/src/components/shell/startConversationSubmitController.test.ts`。

首次运行：

```bash
pnpm --filter @codex-remote/web test -- --test-name-pattern "start conversation submit"
```

结果按预期失败：`ERR_MODULE_NOT_FOUND`，缺少 `startConversationSubmitController.ts`。

### GREEN

实现最小 controller：

- trim message。
- 缺 `deviceId`、`projectId` 或空 message 时 fail closed。
- 成功时设置 `submitting -> accepted`，调用 `startConversation(deviceId, { projectId, message, clientRequestId })`。
- 成功后刷新 `${deviceId}\u001f${conversationId}`。
- catch 中只设置 `failed`，不外抛 raw error。

之后 focused test 通过。

## 关键决策

### 1. 结论

public project id 只从 `WorkbenchData.projects` 获取。

### 原因

Stage 9 要求 public project id 是 opaque id，示例/测试使用 `local-project`，不能用 repo basename 或路径推导。

### 风险

当前只有最小选择策略：当前设备的第一个 project，否则第一个 project。复杂项目选择器不在 Task 4 范围。

### 下一步

后续如果需要多项目选择，再在 Web datasource/project UI 层增加明确选择，不在 start controller 内推导。

### 2. 结论

start UI 与 follow-up/control 分离为独立 controller 和独立状态。

### 原因

start conversation 没有 existing conversation id，和 follow-up/steer/interrupt 的 guard 不同；独立状态避免复用 follow-up 状态导致 UI 误清空或误禁用。

### 风险

当前 UI 只显示简洁状态字符串，没有 toast 或错误详情。

### 下一步

如需产品化错误提示，只展示 sanitized short status，不引入 raw prompt、token、URL、stack/cause 或 private path。

### 3. 结论

未新增 CSS。

### 原因

现有 `conversation-control-strip` 和 `conversation-control-row` 已满足紧凑控制行需求。

### 风险

start form 与 control strip 视觉相近，后续可根据真实使用频率再调整信息层次。

### 下一步

等 real browser smoke 或用户反馈证明需要时，再做小范围 UI polish。

## 范围外

- 未做 `real:check`。
- 未做 runtime scripts。
- 未改 Worker protocol。
- 未做 streaming。
- 未做 project picker、大 redesign 或浏览器 smoke。

## 验证

- `pnpm --filter @codex-remote/web test -- --test-name-pattern "start conversation submit"`：先失败，确认为缺 controller。
- `pnpm --filter @codex-remote/web test -- --test-name-pattern "start conversation submit|startConversation|write flow"`：exit code 0，18 tests pass。
- `pnpm --filter @codex-remote/web test`：exit code 0，96 tests pass。
- `pnpm --filter @codex-remote/web typecheck`：exit code 0。

## Concerns

- 未 push，符合用户要求。
- 工作树存在其他人的文档改动；提交时只 stage Task 4 指定文件和本报告。
