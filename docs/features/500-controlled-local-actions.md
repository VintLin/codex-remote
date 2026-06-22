# 500 受控本地动作

状态：`active`  
负责人：`web/local-tools`  
最近审阅：2026-06-22

## 0. 结论

受控本地动作当前只开放一个低风险切片：用户显式确认后启动 fixed-target uncommitted-changes review。Shell execution、Git mutation、filesystem write、plugin/MCP/account/config mutation 都不开放。

该能力的原则是：先证明一个明确、固定、可回滚语义清晰的动作链路，再考虑扩大动作集合。

## 1. 用户目标

用户在查看本地 Git 摘要后，希望让 Codex 对未提交变更发起 review。系统必须确保用户知道动作目标，并防止 stale conversation/project 或路径越界。

## 2. 范围

范围内：

- fixed target：uncommitted changes。
- 显式 confirmation text。
- Web -> Control Plane -> Worker -> Codex app-server `review/start`。
- stale context / disabled / fallback no-leak。

范围外：

- arbitrary review target。
- `thread/shellCommand`。
- `command/exec`。
- filesystem write/create/remove/copy/watch。
- Git stage/unstage/revert。
- plugin/MCP/account/config mutation。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 启动 review | Local Tools Git/Review | Web 要求确认，Control Plane 路由，Worker 调 `review/start` | action pending；成功显示 accepted |
| 上下文已变 | Local Tools Git/Review | Worker 校验 conversation/project/allowed-root 失败 | 显示脱敏失败，不执行 |
| 能力不可用 | Local Tools Git/Review | route 或 app-server 不可用 | disabled 或 degraded |

## 4. 状态模型

```text
disabled
  -> ready
  -> confirming
  -> submitting
  -> accepted | failed
```

状态规则：

- 未满足上下文时必须 disabled。
- 用户未确认时不能提交。
- 失败不暴露 raw diff、command output、stack/cause、app-server URL。

## 5. UI 表现

| 状态 | 表现 | 动作 |
|---|---|---|
| disabled | 按钮禁用并说明原因 | 无 |
| ready | 显示 review start 动作 | 可打开确认 |
| confirming | 显示固定目标和确认文本 | confirm/cancel |
| submitting | loading | 防重复提交 |
| accepted | 显示 review 已启动 | 可查看后续 conversation |
| failed | 显示脱敏错误 | 可重试或取消 |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| Review start | `POST /v1/.../local-actions/review-start` -> `review/start` | target 固定为 `{ type: "uncommittedChanges" }` |
| Shell execution deferred | N/A | `command/exec` / `thread/shellCommand` 不开放 |

## 7. 边界与安全

- Worker 验证 conversation/project/allowed-root/confirmation 后才能调用 app-server。
- 不暴露 raw diff。
- 不暴露 command output。
- 不暴露 raw shell syntax 控制面。
- Shell 未来必须先有 allowlisted action policy。

## 8. 验收标准

- [x] confirmed review-start 主链可用。
- [x] disabled / stale-context / failure no-leak 有测试。
- [x] Shell execution 明确为 `not-supported`。

## 9. 验证

当前验证入口：

- `apps/worker/src/http/localActionHandlers.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/web/e2e/real-local-smoke.spec.ts`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `500` 能力组。
- API contract：`packages/api-contract/openapi.yaml`。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
