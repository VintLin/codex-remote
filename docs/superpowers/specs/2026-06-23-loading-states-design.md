# Loading States Design

Date: 2026-06-23
Status: draft for user review

## Goal

Make the initial Codex Remote load understandable and fast:

- The connection entry gates only the core workbench.
- The workbench appears only after the four connection steps complete.
- Non-core panels load inside their own surfaces after the workbench opens.
- Empty, loading, failed, and degraded states stay visually and semantically distinct.

## Non-Goals

- No global loading manager.
- No new app-wide state machine.
- No mock or fake conversation fallback.
- No blocking the homepage on Local Workbench, running settings, advanced platform readiness, search recents, or detail previews.

## Approach

Use the existing connection entry model as the only initial-load gate. Split data loading conceptually into:

1. Core workbench data that must finish before entering the homepage.
2. Local panel data that can load after entry inside each feature surface.

This keeps the user-facing flow strict without turning every component into a dependency of the startup screen.

## Startup Gate

The connection entry remains visible until all four visible steps complete:

| Step | User-facing label | Completion condition |
|---|---|---|
| 1 | 连接控制中心 | Browser can reach the configured control center and device directory. |
| 2 | 连接上次使用的设备 | Last selected device, or current selected device, is resolved. |
| 3 | 启动 Codex 本机服务 | Selected device can answer the Codex service health/core request. |
| 4 | 载入对话记录与工作区 | Projects, conversations, selected conversation identity, and selected timeline state are ready. |

Step 4 may complete with a degraded timeline only when the failure is explicit and renderable. It must not complete with fake data or by silently treating a failed core data request as empty.

After step 4 completes, the entry shows a short completed state, then opens the workbench.

## Startup Step Details

Each startup step must contain visible child steps. The summary line explains the current major step; the child steps show that work is still moving. The child steps are product-facing status text, not implementation logs.

Only the active major step needs animated loading. Completed major steps show completed child steps. Pending major steps may show their child steps muted or collapsed, but the active step must show its child list.

| Major step | Child steps shown to the user |
|---|---|
| 连接控制中心 | 读取连接配置；校验访问凭证；读取设备目录。 |
| 连接上次使用的设备 | 查找上次选择的设备；确认设备在线状态；保留设备切换入口。 |
| 启动 Codex 本机服务 | 建立设备连接；检查本机 Codex 服务响应；确认当前工作目录可访问。 |
| 载入对话记录与工作区 | 读取项目列表；读取对话列表；载入当前对话时间线；准备侧边栏与主内容区。 |

Recommended child-step states:

| State | Meaning | UI |
|---|---|---|
| `done` | This child step has completed or is implied by later progress. | Check mark or completed dot. |
| `active` | This child step is the current visible work. | Small spinner or active dot. |
| `pending` | This child step has not started. | Muted dot. |
| `failed` | This child step owns the failure. | Failure dot and concise reason. |

The current implementation only has summary details under the top summary. That is not enough: it makes the page look like a static sentence while the four major steps stay coarse. The implementation plan must add a child-step model under each major step and render it inside the step list.

## Core Data

The homepage may open when these are ready:

- Device list and selected device.
- Project list for the selected device.
- Conversation list for the selected device.
- Selected conversation key.
- Selected conversation timeline result, including explicit degraded/error state.
- Sidebar model can be built from real project/conversation data.
- Main conversation area can render selected, empty, or degraded state without mock data.

## Local Loading Surfaces

These areas must manage their own loading after the workbench opens:

| Area | State owner | Loading UI | Failure UI |
|---|---|---|---|
| Main timeline on conversation switch | Conversation/timeline surface | Timeline skeleton in main content only. | "对话记录暂不可读" with retry affordance if available. |
| Local Workbench | Local Workbench page | Section skeletons for files, preview, git, MCP, and extensions. | Per-section degraded messages; usable sections remain visible. |
| Running Settings | Running Settings page | Settings rows or section skeletons. | "运行设置暂不可读"; do not block conversation usage. |
| Advanced Platform | Advanced Platform page | Readiness card skeletons. | Degraded readiness cards with concise reason. |
| Task Board | Task Board page | Task list skeleton or previous safe data with loading indicator. | Task-specific degraded state; conversation workbench remains usable. |
| Search recents | Search dialog | Inline loading row. | Empty/degraded copy inside search dialog only. |
| Detail Pane | Detail pane | Pane-local spinner or skeleton. | Detail-only error; selected timeline remains intact. |

## UI Rules

- Connection entry uses the existing light design tokens and tab icon mark.
- Connection loading summary shows a spinner only for active connecting states.
- Failed connection states keep the failed step selected and show retry.
- Local loading never collapses the whole app shell.
- Local failures never replace Sidebar conversation data with an empty state.
- Degraded means "data could not be read"; empty means "data was read and nothing exists".
- Copy uses user-facing terms: 控制中心, 设备目录, 本机 Codex 服务, 对话记录, 工作区.
- Copy must not expose Control Plane, Worker, runtime, JSON-RPC, app-server, or raw protocol names.

## Data Flow

```text
Initial page load
  -> connection entry visible
  -> load core workbench data
  -> map request progress to four connection steps
  -> show completed step state briefly
  -> render workbench shell
  -> each non-core surface loads on mount or when opened
```

The workbench shell owns selected device, selected conversation, sidebar section state, and route-level view. Individual surfaces own their local loading/error state when the data is not required for entering the homepage.

## Error Mapping

| Failure | Connection step | Workbench behavior |
|---|---|---|
| Control center unreachable | Step 1 | Stay on connection entry; show retry. |
| No configured device / invalid device selection | Step 2 | Stay on connection entry; show device list or no-device state. |
| Codex service unavailable or timed out | Step 3 | Stay on connection entry; show retry. |
| Projects/conversations/timeline core load failed | Step 4 | Stay on connection entry unless an explicit degraded workbench state is available. |
| Local Workbench failed | Not part of startup gate | Show Local Workbench degraded section. |
| Running settings failed | Not part of startup gate | Show Settings degraded section. |
| Advanced readiness failed | Not part of startup gate | Show Advanced degraded section. |
| Detail preview failed | Not part of startup gate | Show detail-pane error only. |

## Testing

Unit tests:

- Connection entry marks each source failure to the correct step.
- Connection entry exposes child steps for each of the four startup steps.
- The active major step exposes at least one active child step.
- Step 4 does not complete before core project/conversation/timeline state is ready.
- Completed connection state appears before the workbench gate opens.
- Local loading failures are not treated as startup failures.

Component tests:

- Initial load shows connection entry and not the workbench shell.
- The active startup step renders visible child progress, not only the top summary sentence.
- Completed startup opens Sidebar and main conversation area.
- Local Workbench loading renders inside Local Workbench only.
- Runtime Settings failure does not hide Sidebar or Main conversation.

Browser smoke:

- Real local startup reaches the workbench after all four steps.
- Disconnect control center shows step 1 retry.
- Stop local Codex service shows step 3 retry.
- Make a local panel request fail after entry; the workbench remains usable.

## Acceptance

- The homepage never appears after only step 2.
- The homepage does not wait for non-core local panels.
- Every loading surface has one visible owner and one visible failure location.
- Sidebar and main conversation use real data or explicit degraded state, never fake fallback data.
- User-facing copy stays product-level and hides implementation terms.
