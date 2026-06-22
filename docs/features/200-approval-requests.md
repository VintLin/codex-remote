# 200 审批与请求

状态：`partial`  
负责人：`worker/approval`  
最近审阅：2026-06-22

## 0. 结论

审批与请求能力目前只完成“捕获和展示脱敏 pending approval”的一部分。用户决策路径有代码和测试，但真实安全 pending approval sample 尚未稳定产生，因此 approval decision 不能声明 product-ready。

这个能力必须保守：审批卡片可以告诉用户“需要处理什么类型的请求”，但不能泄漏完整命令、完整 diff、prompt、raw JSON-RPC 或本机路径。

## 1. 用户目标

当 Codex app-server 请求用户确认时，用户希望在 Web timeline 中看到 request card，判断风险，并进行 accept / decline / cancel。系统必须保证请求对应当前 conversation 和 turn，避免 stale decision。

## 2. 范围

范围内：

- 捕获 command/file/legacy approval request 的脱敏 metadata。
- 在 Worker / Control Plane API 中列出 pending approvals。
- 在 timeline 显示 request card。
- 提交 approval decision 的 public API 形状。
- 收到 `serverRequest/resolved` 后清理 process-local registry。

范围外：

- `item/permissions/requestApproval`。
- 自动接受。
- 生产级 approval safety model。
- DB-backed approval state。
- 展示完整 command、完整 diff、cwd、patch body、permissions grant。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 查看待审批请求 | Timeline request card | Worker 从 process-local registry 投影 pending request | 卡片显示请求类型、脱敏摘要、等待状态 |
| 接受/拒绝/取消 | Request card actions | Worker 校验 expected ids，再调用 app-server response path | action pending；成功变 resolved；失败保留 retry |
| 请求被 app-server resolve | app-server notification | Worker 处理 `serverRequest/resolved` | request card 从 pending 移除或转 resolved |

## 4. 状态模型

```text
no-request
  -> pending-captured
  -> decision-submitting
  -> resolved

pending-captured
  -> app-server-resolved
  -> cleaned

decision-submitting
  -> failed-retryable
  -> pending-captured
```

状态规则：

- pending request 存在于 Worker process-local registry。
- Worker restart 后 pending state 丢失是当前设计。
- 决策提交失败时不能清理 pending request。
- expected ids mismatch 必须 fail closed。

## 5. UI 表现

| 状态 | Timeline card | Actions | 错误表现 |
|---|---|---|---|
| pending-captured | 显示 request type 和脱敏摘要 | accept / decline / cancel | 无 |
| decision-submitting | 保持卡片，按钮 loading | disabled | 无 |
| resolved | 卡片标记 resolved 或移除 pending | disabled | 无 |
| failed-retryable | 保留 pending 卡片 | 可重试 | 显示脱敏错误 |
| degraded | 显示 dependency issue | disabled | 不展示 raw cause |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| Approval capture | pending approval list endpoint | 只暴露脱敏 metadata |
| Approval decision | approval decision endpoint | `expectedConversationId`、`expectedTurnId`、`expectedApprovalId` 全部必填 |
| Auto cleanup | `serverRequest/resolved` | 只清理 process-local registry |

## 7. 边界与安全

- list 和 decision 都必须证明 conversation 在 `allowedProjectRoot` 内。
- 不暴露 command output、full diff、prompt echo、raw JSON-RPC、stack/cause、provider secrets。
- permissions approval 不开放。
- approval decision real-gap 必须保留在 `docs/verification/README.md`。

## 8. 验收标准

- [x] pending approval list 有 Worker / Control Plane 测试。
- [x] approval registry 支持 resolved cleanup。
- [x] decision endpoint 要求 expected ids。
- [ ] 真实安全 pending approval sample 尚未稳定产生，decision 仍为 `partial`。

## 9. 验证

当前验证入口：

- `apps/worker/src/http/approvalRegistry.test.ts`
- `apps/worker/src/http/approvalRegistry.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `docs/verification/README.md`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `200` 能力组。
- API contract：`packages/api-contract/openapi.yaml`。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
- 来源快照：`docs/archives/references/2026-06-22-feature-support-matrix-snapshot.md`。
