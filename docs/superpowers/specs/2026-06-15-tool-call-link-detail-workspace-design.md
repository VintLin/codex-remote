# Tool Call And Link Detail Workspace Design

## Goal

Design the next display-only slice for Codex Remote's conversation UI: richer app-server tool-call rendering, Markdown link routing, and a unified right-side detail workspace that matches Codex-style interactions while keeping app-server raw items as the only source of truth.

This design does not introduce live app-server logic, filesystem reads, command execution, external navigation side effects, or real streaming subscriptions. It shapes the UI model so those can be added later without replacing the display layer.

## Current Evidence

The current snapshot fixture contains these app-server item types:

- `agentMessage`
- `userMessage`
- `mcpToolCall`
- `fileChange`
- `webSearch`
- `contextCompaction`

`mcpToolCall` items already include useful display fields: `server`, `tool`, `status`, `arguments`, `result`, `error`, `durationMs`, and `pluginId`.

`fileChange` items include `changes[]`, where each change includes `path`, `kind`, and `diff`.

`webSearch` items include `query` and `action`.

Current `RawCodexTurn.itemsView` values in the fixture are `"full"`. That field is not a grouping structure today. The UI must not assume it contains Codex display groups. If a future app-server response provides structured grouping, it can replace the fallback grouping source.

## Scope

In scope:

- Replace scattered display derivation with one `AssistantTimeline` derivation layer.
- Render tool calls with Codex-like collapsed hierarchy.
- Route Markdown links by target type.
- Add a right-side detail workspace model for file, skill, image, URL, diff, and tool detail targets.
- Keep all behavior display-only for this slice.
- Write tests for grouping, link classification, detail target generation, and source traceability.

Out of scope:

- Live app-server streaming transport.
- Real file reads from arbitrary local paths.
- Opening external URLs or transmitting browser actions.
- Editing, reverting, applying, approving, or executing anything.
- Persisting right-side tab state outside React state.

## Architecture

Use a single display derivation path:

```text
app-server snapshot / future app-server event
  ↓
RawCodexThread / RawCodexTurn / RawCodexItem
  ↓ deriveAssistantTimeline(thread)
AssistantTimeline
  ↓
Chat Thread + Detail Workspace
```

`RawCodexThread`, `RawCodexTurn`, and `RawCodexItem` remain the source of truth.

`AssistantTimeline` is a derived view model. It may describe display nodes, grouping, labels, link targets, and detail targets, but every node must preserve `turnId` and `sourceItemIds` so it can be traced back to raw app-server data.

The UI must consume `AssistantTimeline`. React components must not each implement their own `itemType.includes(...)` detection or independent link classification.

## Timeline Model

The derived model should include:

```ts
export interface AssistantTimeline {
  threadId: string;
  turns: AssistantTimelineTurn[];
}

export interface AssistantTimelineTurn {
  id: string;
  status: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  nodes: AssistantTimelineNode[];
}

export type AssistantTimelineNode =
  | AssistantTextNode
  | AssistantToolGroupNode
  | AssistantToolCallNode
  | AssistantContextCompactionNode;
```

Text nodes represent `userMessage` and `agentMessage`. Tool group nodes represent consecutive tool-like raw items. Single isolated tool calls may render as a collapsed `AssistantToolCallNode` without an aggregate group wrapper, matching Codex's "start from the second level" behavior.

## Tool Call Rules

Tool-like raw item types:

- `mcpToolCall`
- `fileChange`
- `webSearch`

Fallback grouping rule:

- Walk `turn.items[]` in raw order.
- Consecutive tool-like items form one group.
- A non-tool item ends the current group.
- If a group has more than one item, render a collapsed aggregate row.
- If a group has exactly one item and is surrounded by text, render a collapsed single tool-call row directly.

Default state:

- Aggregate tool groups are collapsed.
- Single tool-call rows are collapsed.
- Expanding an aggregate group reveals collapsed single tool-call rows.
- Expanding a single tool-call row reveals details inline or opens the right-side detail workspace depending on type and content.

Summary labels:

- `fileChange`: `已创建 N 个文件`, `已编辑 N 个文件`, or mixed `已创建 X 个文件 已编辑 Y 个文件`.
- `mcpToolCall` command-like calls: `已运行 N 条命令`.
- Browser/desktop-oriented MCP calls: `操作电脑` or a tool-specific label from `server` and `tool`.
- `webSearch`: `已搜索`.
- Mixed groups combine concise labels in raw order, for example `已编辑 1 个文件 已运行 3 条命令`.

Status:

- `completed`: show success state.
- `failed` or `error`: show error state and make error details available.
- `running` or future in-progress status: show running state in the same row model, even though current implementation uses snapshot data only.

## Tool Detail Placement

Use a mixed placement rule:

- File creation and edit details open in the right-side detail workspace as a diff/file-change target.
- Long diffs, screenshots, large JSON, or long command output may open in the right-side detail workspace.
- Short command output, MCP result snippets, browser/desktop operation summaries, and web search summaries render as inline cards.
- A tool row can expose an "open detail" action when a right-side target exists.

The current display slice may render sample or raw embedded details only. It must not read arbitrary local files or execute commands.

## Markdown Link Routing

Markdown links are classified in the timeline derivation layer into `DetailTarget` values:

- `skill`: local `SKILL.md` or skill-style paths.
- `file`: absolute or relative local file paths.
- `image`: local or relative image paths.
- `url`: `http` or `https` URLs.
- `anchor`: same-document anchors.
- `unknown`: anything not confidently classified.

Click behavior:

- `skill`, `file`, and `image` targets activate the right-side detail workspace.
- `url` targets use display-only URL detail for this slice. Real external navigation is out of scope.
- `anchor` targets may be displayed as link detail or ignored if no target is available.
- Unknown targets show a minimal detail card with the raw href and label.

## Right-Side Detail Workspace

The current right-side review pane becomes a unified detail workspace.

It supports at most one active preview/detail tab plus any existing static context such as review mode. Clicking a new link or tool detail replaces the current detail tab content and activates it. It must not keep opening one tab per resource.

Detail workspace header:

- Active resource label, such as `SKILL.md`, `styles.css`, `命令`, `操作电脑`, or `审查`.
- Breadcrumb/path row when available.
- Lightweight actions as display-only controls: open, copy path, more.

Detail body variants:

- Markdown preview for skill and markdown-like file targets.
- Diff preview for `fileChange`.
- Code/text preview for command output and JSON.
- Image preview for image targets.
- URL summary card for external links.
- Unknown target card for unsupported hrefs.

## State Ownership

React owns only interaction state:

- Expanded tool group ids.
- Expanded single tool-call ids.
- Current detail target.

Derived display facts belong to `AssistantTimeline`.

No component should duplicate raw app-server item facts into local state.

## Testing Strategy

Unit tests:

- `deriveAssistantTimeline` preserves raw turn order.
- Consecutive tool-like items are grouped.
- Text items break tool groups.
- Single isolated tool calls render as single collapsed tool rows.
- File changes generate right-side diff detail targets.
- Command-like MCP calls generate inline detail first.
- Markdown links classify into skill, file, image, url, anchor, and unknown.
- Every timeline node contains `turnId` and `sourceItemIds`.

Integration/source tests:

- Chat thread component imports and renders timeline nodes rather than re-implementing item-type detection.
- Detail workspace accepts only `DetailTarget | null`.

Browser verification:

- Tool groups are collapsed by default.
- Expanding a group shows collapsed child rows.
- Clicking a file change opens the right-side detail workspace.
- Clicking a skill/file Markdown link replaces the current detail tab.
- Clicking another link replaces the same detail tab instead of opening another one.

## Implementation Boundary

This design should be implemented as a clean replacement of the current display derivation path. Existing `AssistantMessageSnapshot` and `AssistantThreadDisplay` code may be used during migration, but the final implementation should have one display source for the chat UI: `AssistantTimeline`.

The implementation must not add parallel mock-only data structures for tool calls or links. Mock display content must be derived from app-server snapshot fields or from explicitly declared static UI placeholders for out-of-scope live behavior.
