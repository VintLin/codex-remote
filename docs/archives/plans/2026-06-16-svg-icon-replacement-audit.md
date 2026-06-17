# SVG Icon Replacement Audit

日期：2026-06-16

## 范围

本次变更只处理 `apps/web/public/` 下 SVG 资源与其在 Web UI 中的使用映射。

当前项目公开 SVG 文件：

- `apps/web/public/codex.svg`
- `apps/web/public/icons/apple.svg`
- `apps/web/public/icons/delete.svg`
- `apps/web/public/icons/down.svg`
- `apps/web/public/icons/folder-open.svg`
- `apps/web/public/icons/folder.svg`
- `apps/web/public/icons/inbox.svg`
- `apps/web/public/icons/information-o.svg`
- `apps/web/public/icons/laptop.svg`
- `apps/web/public/icons/mobile.svg`
- `apps/web/public/icons/more.svg`
- `apps/web/public/icons/plus.svg`
- `apps/web/public/icons/reload.svg`
- `apps/web/public/icons/right.svg`
- `apps/web/public/icons/search.svg`
- `apps/web/public/icons/setting-o.svg`
- `apps/web/public/icons/shrink.svg`
- `apps/web/public/icons/time-o.svg`
- `apps/web/public/icons/up.svg`
- `apps/web/public/icons/windows.svg`

新的候选 SVG 来源目录：

- `/path/to/svg`

## 当前使用审计

| 当前图标名 | 主要使用位置 | 当前功能语义 | 本次建议替换 |
| --- | --- | --- | --- |
| `search` | 侧边主导航；工具调用 `webSearch` | 搜索 / web search | `search.svg` |
| `reload` | 自动化主导航；按更新时间排序；`mcpToolCall` | 刷新 / 重新同步 / 更新时间排序 | `timer-reset.svg` |
| `folder` | 项目列表；工具调用兜底 | 项目 / 文件夹 / 通用资源 | `folder.svg` |
| `folder-open` | 项目菜单“创建工作树” | 打开目录 / worktree | `folder-open.svg` |
| `more` | 各类更多操作按钮 | 更多操作 | `ellipsis.svg` |
| `plus` | 新对话；新增设备；附件按钮 | 新增 / 添加 | `plus.svg` |
| `information-o` | 对话概览；详情面板；工具分组说明 | 信息 / 说明 | `info.svg` |
| `setting-o` | 设置；重命名 | 设置 / 配置 | `settings.svg` |
| `inbox` | 归档；运行上下文按钮 | 归档 / 收纳 / 上下文入口 | `archive.svg` |
| `time-o` | 按创建时间排序；语音输入占位 | 时间 / 历史 / 语音占位 | 拆分为 `clock-4.svg` 与 `mic.svg` |
| `right` | 侧栏折叠；移动端返回；项目尾箭头；工具展开 | 右箭头 / 展开 / 进入 | `chevron-right.svg` |
| `down` | 分组展开；下拉选择；滚到最新 | 向下 / 展开 / 下拉 | `chevron-down.svg` |
| `delete` | 删除设备；移除项目；清空详情 | 删除 / 移除 | 主删改为 `trash-2.svg`；关闭型动作改 `x.svg` |
| `shrink` | 切换布局 | 布局切换 | `split.svg` |
| `up` | 置顶；发送 | 置顶 / 发送 | 拆分为 `pin.svg` 与 `arrow-up.svg` |
| `laptop` | 主导航设备入口；设备 fallback | 通用电脑 | `laptop-minimal.svg` |
| `mobile` | 移动设备 | 手机 | `smartphone.svg` |
| `apple` | Mac 设备 | Apple / Mac | `laptop-minimal.svg` |
| `windows` | Windows 设备 | Windows / PC | `computer.svg` |

## 代码位置

图标类型与渲染：

- `apps/web/src/components/icons.tsx`

SVG URL 映射：

- `packages/ui/src/styles.css`

主要使用组件：

- `apps/web/src/components/sidebar.tsx`
- `apps/web/src/components/action-menu.tsx`
- `apps/web/src/components/main-panels.tsx`
- `apps/web/src/components/detail-workspace.tsx`
- `apps/web/src/components/codex-assistant-thread.tsx`
- `apps/web/src/components/codex-tool-call-row.tsx`

站点图标：

- `apps/web/src/app/layout.tsx`

## 执行策略

1. 删除 `apps/web/public/icons/` 下旧 SVG。
2. 将 `/path/to/svg` 中 SVG 全量复制到 `apps/web/public/icons/`。
3. 将 `/path/to/svg/codex.svg` 覆盖到 `apps/web/public/codex.svg`。
4. 更新 `IconName` 与 CSS URL 映射。
5. 对语义冲突的场景做最小拆分：
   - `time-o` 拆为 `clock` 与 `mic`
   - `up` 拆为 `pin` 与 `arrow-up`
   - `delete` 区分删除与关闭
6. 跑测试与类型检查后，再输出最终替换清单供人工核对。
