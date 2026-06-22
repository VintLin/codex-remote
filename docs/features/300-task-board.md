# 300 任务看板

状态：`active`  
负责人：`control-plane/task-board`  
最近审阅：2026-06-22

## 0. 结论

任务看板当前只承担轻量协调：把不同设备或 project 的 conversation 手动关联到一个任务，并在使用前校验链接仍然有效。它不是多 agent 调度器，也不自动迁移任务或自动选择设备。

## 1. 用户目标

用户需要把多个 Codex conversation 归到同一任务下，方便跟踪实现、验证、打包或部署工作。系统必须避免 stale conversation link 误导用户或触发错误动作。

## 2. 范围

范围内：

- 持久化 task 与 conversation link。
- 使用前验证 `deviceId` + `conversationId` 仍能在 Worker 侧解析。
- 保持 DB schema 为持久化字段唯一事实源。

范围外：

- 自动迁移任务。
- 自动选择 idle device。
- 多 agent 编排。
- 跨设备复制 prompt、token 或本地文件上下文。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 把 conversation 关联到 task | Task board | Control Plane 写入 DB link | task 显示关联 conversation |
| 打开已关联 conversation | Task board link | Control Plane 先校验 Worker 状态 | 有效则打开；无效则显示 stale/degraded |
| Worker 不可达 | Task board link | Control Plane 返回 dependency error | 不把失败渲染成空状态 |

## 4. 状态模型

```text
unlinked
  -> linked
  -> validating
  -> valid | stale | degraded
```

状态规则：

- `linked` 不等于可操作；操作前必须进入 `validating`。
- `stale` 表示链接存在但 Worker 不再能解析目标 conversation。
- `degraded` 表示 Worker 或设备依赖失败，不能当作链接不存在。

## 5. UI 表现

| 状态 | Task board 表现 | 用户动作 |
|---|---|---|
| linked | 显示 conversation 摘要 | 可打开前触发校验 |
| validating | 显示 loading | 暂停危险动作 |
| valid | 正常打开 | 可继续 |
| stale | 显示链接失效 | 提示移除或重新关联 |
| degraded | 显示依赖失败 | 保留链接，不自动删除 |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| Task link validation | Control Plane validation route | cross-check `task.conversationId` + `deviceId` against Worker state |
| Persistence | `packages/db` schema | SQLite + Drizzle + `better-sqlite3` |

## 7. 边界与安全

- DB 不保存 OpenAI API key、ChatGPT auth、Codex auth file、Worker bearer token。
- Control Plane 不直接调用 app-server。
- task link 只保存 public identifiers，不保存 raw prompt 或本机路径。

## 8. 验收标准

- [x] task link 使用前校验。
- [x] Worker unavailable 与 stale link 区分。
- [x] DB repository 测试覆盖。

## 9. 验证

当前验证入口：

- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `packages/db/src/conversationQueueRepository.test.ts`
- `packages/db/src/taskRepository.test.ts`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `300` 能力组。
- DB schema：`packages/db/src/schema.ts`。
- API contract：`packages/api-contract/openapi.yaml`。
