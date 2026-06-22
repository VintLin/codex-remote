# 600 运行时、账号与配置

状态：`not-supported`  
负责人：`(none)`  
最近审阅：2026-06-22

## 0. 结论

运行时、账号与配置能力当前不作为可操作产品面开放。虽然 app-server protocol 中存在 `model/list`、`account/*`、`getAuthStatus`、`config/*` 等能力，但 Codex Remote 不把它们直接映射为 Web 设置项。

核心原因是安全边界：模型、账号、认证、配置都靠近 provider secret 和本机 Codex 配置，必须先有明确 public contract、脱敏策略、UI 状态和 Worker-only 边界。

## 1. 用户目标

长期目标是让用户理解设备运行时状态，例如模型/profile、账号状态、权限配置、实验功能。但当前阶段只记录边界，不提供登录、登出、token、config write 或 model switch。

## 2. 范围

范围内：

- 明确 `model/list` 未开放。
- 明确 account authentication 未开放。
- 明确 config management 未开放。
- 记录未来启用前的必要边界。

范围外：

- model switch。
- login/logout。
- token refresh。
- externally supplied token。
- config read/write。
- experimental enablement。
- permission mutation。
- usage/rate/credits。

## 3. 预期未来流程

| 用户意图 | 当前状态 | 未来必须满足的条件 |
|---|---|---|
| 查看模型 | `not-supported` | public contract 定义 model catalog；Worker 脱敏 provider capability |
| 切换模型 | `not-supported` | 明确 project/conversation 作用域和失败回滚 |
| 查看账号 | `not-supported` | 只读 sanitized account/auth status，不返回 token |
| 登录/登出 | `not-supported` | 设计 OAuth/login flow，不把 secret 写入 Control Plane |
| 读取配置 | `not-supported` | cwd 来自 Worker 验证后的 allowed root |
| 写配置 | `not-supported` | 明确确认、审计、回滚和本机安全边界 |

## 4. 状态模型

```text
not-supported
  -> future-readonly-spec
  -> readonly-active
  -> future-controlled-mutation-spec
```

状态规则：

- protocol 存在不代表产品能力存在。
- 任何账号或配置能力必须先经过 public API contract。
- Control Plane 不保存 provider secrets。

## 5. UI 表现

当前 UI 表现：

- 不显示可点击 login/logout/config write/model switch。
- 如需展示 future affordance，只能 disabled，并说明 `not-supported`。
- 不使用假数据模拟账号或配置状态。

## 6. 契约与边界

| 子能力 | 当前状态 | 原因 |
|---|---|---|
| Model list | `not-supported` | 尚无公开产品路径 |
| Config management | `not-supported` | 本机配置是高信任边界 |
| Account authentication | `not-supported` | secret 必须留在 Worker device |

## 7. 边界与安全

- 不保存 OpenAI API key。
- 不保存 ChatGPT auth。
- 不保存 Codex auth file。
- 不把 provider secrets 写入 Control Plane DB。
- 不在日志、fixture、截图或文档示例中写真实 token。

## 8. 验收标准

- [x] 当前无 public mutation route。
- [x] Feature index 明确标记 `not-supported`。
- [x] future work 必须先写 spec/plan。

## 9. 验证

当前验证入口：

- `docs/FEATURE_INDEX.md`
- `docs/verification/README.md`
- `scripts/product-readiness-check.mjs`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `600` 能力组。
- 安全规则：`AGENTS.md` Secrets。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
