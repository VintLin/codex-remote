# 400 本地只读工作台

状态：`active`  
负责人：`web/local-tools`  
最近审阅：2026-06-22

## 0. 结论

本地只读工作台让用户在 Web 中查看 Worker 设备上的项目文件、Git 摘要、搜索结果、MCP 状态、skills/hooks/plugin/app 清单。它只提供 evidence 和上下文，不提供写入、执行、安装、卸载或 OAuth 操作。

这个能力的核心边界是：本机资源只能由 Worker 访问；Web 只看 project-relative、脱敏、bounded 的投影。

## 1. 用户目标

用户需要在远程浏览器里理解某台设备上的项目上下文：有哪些文件、哪些 Git 变更、能否搜索文件、MCP/skills/plugins/apps 当前是什么状态。这些信息帮助用户决定下一步指令或是否启动受控 review。

## 2. 范围

范围内：

- project-relative directory listing。
- file metadata。
- bounded text preview。
- file-level Git diff summary。
- fuzzy search matches。
- MCP server/tool/resource summary。
- skills/hooks inventory。
- plugin/app inventory。
- dependency degraded state。

范围外：

- filesystem write/create/remove/copy/watch。
- raw diff hunk/header/body。
- shell/command execution。
- MCP tool call、OAuth、resource read。
- plugin install/uninstall/share/marketplace mutation。
- skills config write、extra roots mutation。

## 3. 主流程

| 用户意图 | 入口 | 系统行为 | UI 表现 |
|---|---|---|---|
| 查看项目文件 | File pane | Worker 读取目录和 metadata | 显示 project-relative tree 和文件信息 |
| 预览文件 | File pane | Worker 返回 bounded text preview | 显示有限文本；超限说明截断 |
| 查看 Git 变化 | Git panel | Worker 生成 file-level summary | 显示 counts/status，不显示 full diff |
| 搜索文件 | Search panel | Worker 返回 bounded matches | 显示 project-relative results |
| 查看 MCP 状态 | MCP pane | Worker 尝试读取 status | loaded 或 degraded 408 |
| 查看扩展清单 | Settings / inventory | Worker 投影 skills/hooks/plugins/apps metadata | 显示只读清单 |

## 4. 状态模型

```text
section-loading
  -> loaded-empty
  -> loaded-with-data
  -> degraded

loaded-with-data
  -> selected-item
  -> preview-loading
  -> preview-loaded | preview-unavailable
```

状态规则：

- 每个 section 独立 degraded，不阻塞整个 Local Tools。
- MCP 可短超时并显示 sanitized 408。
- file preview 必须 bounded。
- app/plugin/skill/hook 清单只能是 read-only。

## 5. UI 表现

| Section | Loaded empty | Loaded with data | Degraded | 禁止动作 |
|---|---|---|---|---|
| Files | 显示空目录说明 | tree + metadata + preview | 显示无法读取原因 | write/remove/copy/watch |
| Git | 显示 clean working tree | file-level status/counts | 显示 Git 不可用 | raw diff / stage / revert |
| Search | 显示无匹配 | bounded matches | 显示搜索不可用 | live search session control |
| MCP | 显示无 server/tool | server/tool/resource summary | sanitized 408 | OAuth/tool call/resource read |
| Inventory | 显示无条目 | skills/hooks/plugins/apps metadata | 显示 app-server 不可用 | install/uninstall/config write |

## 6. 契约与边界

| 子能力 | API / Command | 规则 |
|---|---|---|
| Filesystem readonly | local-workbench files endpoints | path 必须 project-relative；preview bounded |
| Git diff summary | Git summary endpoint / `gitDiffToRemote` | 只返回 file-level counts/status |
| Fuzzy search | fuzzy search endpoint / `fuzzyFileSearch` | 只返回 project-relative matches |
| MCP readonly | MCP status endpoint / `mcpServerStatus/list` | tool call 不开放；degraded 可接受 |
| Skills/Hooks inventory | inventory endpoint / `skills/list`, `hooks/list` | whitelist-only metadata |
| Plugin/App inventory | inventory endpoint / `plugin/list`, `plugin/read`, `app/list` | read-only metadata |

## 7. 边界与安全

- 不暴露本机绝对路径。
- 不暴露 raw command output。
- 不暴露 full diff、raw headers、raw hunks。
- 不执行 MCP tool call。
- 不安装、卸载或分享 plugin。
- 不写 config 或 skills roots。

## 8. 验收标准

- [x] 文件、Git、搜索、inventory 均通过 Worker 边界投影。
- [x] MCP degraded 不阻塞 Local Tools 主视图。
- [x] Web 不直接访问 filesystem、Git、MCP 或 app-server。
- [x] 只读能力不显示可点击写操作。

## 9. 验证

当前验证入口：

- `apps/worker/src/http/localWorkbenchHandlers.test.ts`
- `apps/worker/src/http/localWorkbenchProjections.test.ts`
- `apps/control-plane/src/http/controlPlaneHttpApp.test.ts`
- `apps/web/e2e/real-local-smoke.spec.ts`

## 10. 事实源

- 功能索引：`docs/FEATURE_INDEX.md` 中 `400` 能力组。
- API contract：`packages/api-contract/openapi.yaml`。
- Codex app-server protocol：`packages/codex-protocol` 生成物。
