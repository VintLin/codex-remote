# 700 高级平台能力

状态：`partial`  
负责人：`web/settings`  
最近审阅：2026-06-22

## 0. 结论

高级平台能力当前只开放 read-only readiness/watchlist：Settings -> Advanced Platform 可展示 Windows Sandbox readiness 和高级能力支持矩阵，但不提供 setup、upload、import、remote GUI、automation 或 realtime voice action。

这个能力的价值不是“马上可用”，而是明确告诉用户哪些高级平台能力适用、哪些 deferred、哪些 not-supported。

## 1. 用户目标

用户需要知道当前设备是否适用 Windows Sandbox，以及 Codex Remote 对 realtime voice、feedback upload、external agent config、remote GUI/computer use、automations 等高级能力的态度。系统必须避免把 watchlist 误表现为可点击功能。

## 2. 范围

范围内：

- project-scoped Windows Sandbox readiness read-only projection。
- 非 Windows 平台返回 `not_applicable`。
- advanced platform watchlist。
- per-section degraded/unavailable。

范围外：

- Windows Sandbox setup/start。
- realtime voice。
- feedback upload。
- external agent import。
- remote GUI / computer use。
- automations。
- action URL、import payload、automation action。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 查看 Windows Sandbox readiness | Settings -> Advanced Platform | Worker 在 platform 适用时调用 `windowsSandbox/readiness` | readiness section 显示 ready/not ready/not applicable/degraded |
| 查看高级能力支持 | Settings -> Advanced Platform | Worker 返回 watchlist support matrix | 每项显示 `deferred` 或 `not_supported`，无 action |
| app-server 不可用 | Settings -> Advanced Platform | section-level degraded | 显示脱敏 degraded，不影响其他 Settings |

## 4. 状态模型

```text
section-loading
  -> loaded-applicable
  -> loaded-not-applicable
  -> degraded

watchlist
  -> deferred | not-supported
```

状态规则：

- 非 Windows 平台必须是 `not_applicable`，不是 error。
- app-server/transport 失败只影响当前 section。
- watchlist item 不提供可点击 no-op。

## 5. UI 表现

| Section | Loaded | Not applicable | Degraded | Action |
|---|---|---|---|---|
| Windows Sandbox | 显示 readiness | macOS/Linux 显示 `not_applicable` | 显示脱敏错误 | 无 setup/start |
| Realtime voice | `deferred` | N/A | N/A | 无 |
| Feedback upload | `not_supported` 或 `deferred` | N/A | N/A | 无 upload |
| External agent config | `deferred` | N/A | N/A | 无 import |
| Remote GUI/computer use | `not_supported` 或 `deferred` | N/A | N/A | 无 remote action |
| Automations | `deferred` | N/A | N/A | 无 create/run action |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| Windows Sandbox readiness | `GET /v1/.../advanced-platform-readiness` -> `windowsSandbox/readiness` | 只读；platform 适用时调用 |
| Advanced watchlist | Worker watchlist endpoint | 只返回支持状态和原因 |
| Realtime voice deferred | N/A | 无 public route |

## 7. 边界与安全

- 不暴露 raw JSON-RPC。
- 不暴露 token、private path、prompt。
- 不提供 setup/upload/import/remote GUI/automation action。
- watchlist 不能被 UI 表现为可点击功能。

## 8. 验收标准

- [x] macOS real stack 显示 Windows Sandbox `not_applicable`。
- [x] watchlist entries 显示 `deferred` / `not_supported`。
- [x] Web desktop/mobile no-leak smoke 通过。
- [ ] Windows setup/start 仍未开放。

## 9. 验证

当前验证入口：

- `apps/worker/src/http/advancedPlatformHandlers.test.ts`
- `apps/worker/src/http/advancedPlatformProjections.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/web/e2e/real-local-smoke.spec.ts`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `700` 能力组。
- API contract：`packages/api-contract/openapi.yaml`。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
