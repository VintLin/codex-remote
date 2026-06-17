# Tool Call And Link Detail Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat assistant message display path with a single `AssistantTimeline` display derivation that supports collapsed tool-call groups, Markdown link routing, and a unified right-side detail workspace.

**Architecture:** App-server raw snapshot data remains the only source of truth. `deriveAssistantTimeline(thread)` is the only display derivation layer; chat components and the right-side detail workspace consume timeline nodes and `DetailTarget` values. This slice is display-only and does not add live streaming, real filesystem reads, external navigation, command execution, or persistence.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Node test runner, `react-markdown`, `remark-gfm`, assistant-ui runtime primitives, existing `packages/ui/src/styles.css` tokens.

---

## File Structure

Create:

- `apps/web/src/assistantTimeline.ts` - single display derivation layer from `RawCodexThread` to chat timeline nodes, tool-call groups, link references, and detail targets.
- `apps/web/src/assistantTimeline.test.ts` - unit tests for grouping, link classification, detail target generation, source traceability, and fixture coverage.
- `apps/web/src/components/codex-markdown-text.tsx` - shared Markdown renderer that receives a link click handler and routes links through timeline-derived `LinkReference` values.
- `apps/web/src/components/codex-tool-call-row.tsx` - aggregate and single tool-call rows, collapsed by default.
- `apps/web/src/components/detail-workspace.tsx` - right-side detail workspace that replaces the existing review pane content with the current detail target.

Modify:

- `apps/web/src/appServerSnapshotTypes.ts` - widen raw item types to include observed app-server fields without inventing parallel DTOs.
- `apps/web/src/appServerMockAdapter.ts` - expose `AssistantThreadSnapshot.timeline` and remove long-term dependency on `AssistantMessageSnapshot` / `AssistantTurnSnapshot`.
- `apps/web/src/appServerMockAdapter.test.ts` - update adapter assertions to prove assistant threads carry timeline data.
- `apps/web/src/components/codex-assistant-thread.tsx` - render `AssistantTimeline` nodes, own expansion state, and emit `DetailTarget` selections.
- `apps/web/src/components/main-panels.tsx` - own the current detail target and render `DetailWorkspace`.
- `packages/ui/src/styles.css` - add restrained Codex-like styles for tool rows, inline cards, detail workspace tabs, diff previews, image previews, and link affordances.

Delete after migration:

- `apps/web/src/assistantThreadDisplay.ts`
- `apps/web/src/assistantThreadDisplay.test.ts`

Do not modify:

- Raw fixture JSON files.
- Real app-server threads.
- Live streaming transport.
- Control Plane API contracts.

## Task 1: Widen Raw Snapshot Types

**Files:**

- Modify: `apps/web/src/appServerSnapshotTypes.ts`

- [ ] **Step 1: Update raw item types**

Replace the current `RawCodexItem` interface in `apps/web/src/appServerSnapshotTypes.ts` with:

```ts
export interface RawCodexItem {
  id?: string;
  type?: string;
  role?: string;
  text?: string;
  content?: unknown;
  title?: string;
  status?: string;
  command?: string | string[];
  name?: string;
  arguments?: unknown;
  output?: unknown;
  clientId?: string;
  server?: string;
  tool?: string;
  pluginId?: string | null;
  result?: unknown;
  error?: unknown;
  durationMs?: number | null;
  query?: string;
  action?: unknown;
  changes?: RawCodexFileChange[];
}

export interface RawCodexFileChange {
  path?: string;
  kind?: RawCodexFileChangeKind;
  diff?: string;
}

export type RawCodexFileChangeKind =
  | string
  | {
      type?: string;
    };
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected:

```text
> @codex-remote/web@0.0.0 typecheck
> tsc --noEmit --pretty false
```

with exit code `0`.

- [ ] **Step 3: Commit raw type widening**

Run:

```bash
git add apps/web/src/appServerSnapshotTypes.ts
git commit -m "feat: widen app-server raw item types"
```

## Task 2: Add AssistantTimeline Derivation

**Files:**

- Create: `apps/web/src/assistantTimeline.ts`
- Create: `apps/web/src/assistantTimeline.test.ts`

- [ ] **Step 1: Write failing tests for timeline derivation**

Create `apps/web/src/assistantTimeline.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import readFixture from "./fixtures/app-server/demo.thread-read.json" with { type: "json" };
import {
  classifyLinkTarget,
  deriveAssistantTimeline,
  type AssistantTimelineNode,
} from "./assistantTimeline.ts";
import type { RawCodexThread, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";

const reads = readFixture as unknown as RawThreadReadFixture;

test("when deriving timeline, should preserve text and tool order from raw items", () => {
  const timeline = deriveAssistantTimeline(createThreadWithMixedItems());
  const nodeSummary = timeline.turns[0]?.nodes.map((node) => {
    if (node.type === "text") return `text:${node.sourceItemIds.join(",")}`;
    if (node.type === "toolGroup") return `toolGroup:${node.calls.map((call) => call.sourceItemIds[0]).join(",")}`;
    return `${node.type}:${node.sourceItemIds.join(",")}`;
  });

  assert.deepEqual(nodeSummary, [
    "text:user-a",
    "text:assistant-a",
    "toolGroup:file-a,mcp-a",
    "text:assistant-b",
    "toolCall:mcp-b",
    "text:assistant-c",
  ]);
});

test("when tool calls are consecutive, should group them and keep child calls collapsed by default", () => {
  const timeline = deriveAssistantTimeline(createThreadWithMixedItems());
  const group = timeline.turns[0]?.nodes.find((node): node is Extract<AssistantTimelineNode, { type: "toolGroup" }> => node.type === "toolGroup");

  assert.ok(group);
  assert.equal(group.defaultCollapsed, true);
  assert.equal(group.calls.length, 2);
  assert.ok(group.calls.every((call) => call.defaultCollapsed));
  assert.deepEqual(group.sourceItemIds, ["file-a", "mcp-a"]);
  assert.equal(group.summary, "已编辑 1 个文件 已运行 1 条命令");
});

test("when one isolated tool call is surrounded by text, should render a single collapsed tool call node", () => {
  const timeline = deriveAssistantTimeline(createThreadWithMixedItems());
  const toolCall = timeline.turns[0]?.nodes.find((node): node is Extract<AssistantTimelineNode, { type: "toolCall" }> => node.type === "toolCall");

  assert.ok(toolCall);
  assert.equal(toolCall.defaultCollapsed, true);
  assert.equal(toolCall.label, "已运行 node --test sample.test.ts");
  assert.equal(toolCall.detailPlacement, "inline");
});

test("when file changes are present, should generate right-side diff detail targets", () => {
  const timeline = deriveAssistantTimeline(createThreadWithMixedItems());
  const group = timeline.turns[0]?.nodes.find((node): node is Extract<AssistantTimelineNode, { type: "toolGroup" }> => node.type === "toolGroup");
  const fileCall = group?.calls.find((call) => call.kind === "fileChange");

  assert.equal(fileCall?.detailPlacement, "workspace");
  assert.equal(fileCall?.detailTarget?.type, "diff");
  assert.equal(fileCall?.detailTarget?.title, "sample.ts");
});

test("when classifying links, should route skill file image url anchor and unknown targets", () => {
  assert.deepEqual(classifyLinkTarget("Skill", "/workspace/skills/foo/SKILL.md"), {
    type: "skill",
    href: "/workspace/skills/foo/SKILL.md",
    label: "Skill",
    title: "SKILL.md",
  });
  assert.equal(classifyLinkTarget("Styles", "packages/ui/src/styles.css").type, "file");
  assert.equal(classifyLinkTarget("Screenshot", "docs/链接点击-侧边栏展示.png").type, "image");
  assert.equal(classifyLinkTarget("OpenAI", "https://openai.com").type, "url");
  assert.equal(classifyLinkTarget("Section", "#setup").type, "anchor");
  assert.equal(classifyLinkTarget("Mail", "mailto:test@example.com").type, "unknown");
});

test("when deriving from fixture, every node should preserve source traceability", () => {
  const thread = Object.values(reads.threads).find((entry) => entry.thread?.turns?.some((turn) => (turn.items ?? []).length > 5))?.thread;
  assert.ok(thread);

  const timeline = deriveAssistantTimeline(thread);
  const nodes = timeline.turns.flatMap((turn) => turn.nodes);

  assert.ok(nodes.length > 0);
  assert.ok(nodes.every((node) => node.turnId.length > 0));
  assert.ok(nodes.every((node) => node.sourceItemIds.length > 0));
});

function createThreadWithMixedItems(): RawCodexThread {
  return {
    id: "thread-a",
    turns: [
      {
        id: "turn-a",
        status: "completed",
        startedAt: 1_797_249_000,
        completedAt: 1_797_249_030,
        durationMs: 30_000,
        items: [
          { id: "user-a", type: "userMessage", content: [{ type: "text", text: "Please update [Skill](/workspace/skills/foo/SKILL.md)" }] },
          { id: "assistant-a", type: "agentMessage", text: "我先编辑文件。" },
          {
            id: "file-a",
            type: "fileChange",
            status: "completed",
            changes: [{ path: "/repo/sample.ts", kind: { type: "modify" }, diff: "@@ -1 +1\\n-old\\n+new\\n" }],
          },
          {
            id: "mcp-a",
            type: "mcpToolCall",
            server: "functions",
            tool: "exec_command",
            status: "completed",
            arguments: { cmd: "pnpm test" },
            result: { content: [{ type: "text", text: "pass" }] },
            durationMs: 1000,
          },
          { id: "assistant-b", type: "agentMessage", text: "接下来单独跑一个测试。" },
          {
            id: "mcp-b",
            type: "mcpToolCall",
            server: "functions",
            tool: "exec_command",
            status: "completed",
            arguments: { cmd: "node --test sample.test.ts" },
            result: { content: [{ type: "text", text: "ok" }] },
            durationMs: 2000,
          },
          { id: "assistant-c", type: "agentMessage", text: "完成。" },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @codex-remote/web test
```

Expected:

```text
Cannot find module './assistantTimeline.ts'
```

or an equivalent module-not-found failure for the new timeline module.

- [ ] **Step 3: Create timeline derivation implementation**

Create `apps/web/src/assistantTimeline.ts` with:

```ts
import type { RawCodexFileChange, RawCodexItem, RawCodexThread, RawCodexTurn } from "./appServerSnapshotTypes.ts";

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

export type AssistantTimelineNode = AssistantTextNode | AssistantToolGroupNode | AssistantToolCallNode | AssistantContextCompactionNode;

export interface AssistantTextNode extends AssistantTimelineNodeBase {
  type: "text";
  role: "assistant" | "user";
  text: string;
  links: LinkReference[];
}

export interface AssistantToolGroupNode extends AssistantTimelineNodeBase {
  type: "toolGroup";
  calls: AssistantToolCallNode[];
  defaultCollapsed: true;
  summary: string;
}

export interface AssistantToolCallNode extends AssistantTimelineNodeBase {
  type: "toolCall";
  kind: ToolCallKind;
  label: string;
  status: ToolCallStatus;
  defaultCollapsed: true;
  detailPlacement: "inline" | "workspace";
  detailText: string;
  detailTarget: DetailTarget | null;
}

export interface AssistantContextCompactionNode extends AssistantTimelineNodeBase {
  type: "contextCompaction";
  label: string;
}

interface AssistantTimelineNodeBase {
  id: string;
  turnId: string;
  sourceItemIds: string[];
}

export type ToolCallKind = "fileChange" | "mcpToolCall" | "webSearch";
export type ToolCallStatus = "completed" | "failed" | "running" | "unknown";

export type LinkTargetType = "skill" | "file" | "image" | "url" | "anchor" | "unknown";

export interface LinkReference {
  type: LinkTargetType;
  href: string;
  label: string;
  title: string;
}

export type DetailTarget =
  | DiffDetailTarget
  | FileDetailTarget
  | ImageDetailTarget
  | UrlDetailTarget
  | ToolDetailTarget
  | UnknownDetailTarget;

export interface DetailTargetBase {
  id: string;
  title: string;
  subtitle: string;
  sourceItemIds: string[];
}

export interface DiffDetailTarget extends DetailTargetBase {
  type: "diff";
  changes: Array<{ path: string; changeType: string; diff: string }>;
}

export interface FileDetailTarget extends DetailTargetBase {
  type: "file" | "skill";
  href: string;
  previewText: string;
}

export interface ImageDetailTarget extends DetailTargetBase {
  type: "image";
  href: string;
}

export interface UrlDetailTarget extends DetailTargetBase {
  type: "url";
  href: string;
}

export interface ToolDetailTarget extends DetailTargetBase {
  type: "tool";
  body: string;
}

export interface UnknownDetailTarget extends DetailTargetBase {
  type: "unknown";
  href: string;
}

export function deriveAssistantTimeline(thread: RawCodexThread): AssistantTimeline {
  return {
    threadId: getNonEmptyString(thread.id) ?? getNonEmptyString(thread.sessionId) ?? "unknown-thread",
    turns: (thread.turns ?? []).map((turn, turnIndex) => deriveTimelineTurn(turn, turnIndex)),
  };
}

export function classifyLinkTarget(label: string, href: string): LinkReference {
  const title = getPathTitle(href) || href;
  if (href.startsWith("#")) return { type: "anchor", href, label, title };
  if (/^https?:\/\//i.test(href)) return { type: "url", href, label, title };
  if (isImageHref(href)) return { type: "image", href, label, title };
  if (href.endsWith("/SKILL.md") || href.endsWith("SKILL.md")) return { type: "skill", href, label, title };
  if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../") || href.includes("/")) return { type: "file", href, label, title };
  return { type: "unknown", href, label, title };
}

function deriveTimelineTurn(turn: RawCodexTurn, turnIndex: number): AssistantTimelineTurn {
  const turnId = getNonEmptyString(turn.id) ?? `turn-${turnIndex}`;
  return {
    id: turnId,
    status: getNonEmptyString(turn.status) ?? "unknown",
    startedAt: getNullableNumber(turn.startedAt),
    completedAt: getNullableNumber(turn.completedAt),
    durationMs: getNullableNumber(turn.durationMs),
    nodes: deriveTimelineNodes(turn.items ?? [], turnId),
  };
}

function deriveTimelineNodes(items: RawCodexItem[], turnId: string): AssistantTimelineNode[] {
  const nodes: AssistantTimelineNode[] = [];
  let pendingToolItems: Array<{ item: RawCodexItem; index: number }> = [];

  const flushToolItems = () => {
    if (pendingToolItems.length === 0) return;
    const calls = pendingToolItems.map(({ item, index }) => createToolCallNode(item, turnId, index));
    if (calls.length === 1) {
      nodes.push(calls[0]!);
    } else {
      nodes.push({
        type: "toolGroup",
        id: `${turnId}-tool-group-${nodes.length}`,
        turnId,
        sourceItemIds: calls.flatMap((call) => call.sourceItemIds),
        calls,
        defaultCollapsed: true,
        summary: summarizeToolCalls(calls),
      });
    }
    pendingToolItems = [];
  };

  items.forEach((item, index) => {
    if (isToolLikeItem(item)) {
      pendingToolItems.push({ item, index });
      return;
    }

    flushToolItems();
    const node = createNonToolNode(item, turnId, index);
    if (node) nodes.push(node);
  });

  flushToolItems();
  return nodes;
}

function createNonToolNode(item: RawCodexItem, turnId: string, index: number): AssistantTimelineNode | null {
  const itemType = getNonEmptyString(item.type) ?? "unknown";
  const itemId = getItemId(item, turnId, index);
  if (itemType === "contextCompaction") {
    return { type: "contextCompaction", id: itemId, turnId, sourceItemIds: [itemId], label: "上下文已压缩" };
  }
  const role = itemType === "userMessage" || item.role === "user" ? "user" : "assistant";
  const text = getItemText(item, itemType);
  return { type: "text", id: itemId, turnId, sourceItemIds: [itemId], role, text, links: extractMarkdownLinks(text) };
}

function createToolCallNode(item: RawCodexItem, turnId: string, index: number): AssistantToolCallNode {
  const itemType = getNonEmptyString(item.type) ?? "unknown";
  const itemId = getItemId(item, turnId, index);
  const kind = getToolKind(itemType);
  const status = normalizeToolStatus(item.status);
  const detailText = getToolDetailText(item, itemType);
  const detailTarget = createDetailTarget(item, itemId, kind, detailText);
  return {
    type: "toolCall",
    id: itemId,
    turnId,
    sourceItemIds: [itemId],
    kind,
    label: getToolLabel(item, kind),
    status,
    defaultCollapsed: true,
    detailPlacement: detailTarget?.type === "diff" ? "workspace" : "inline",
    detailText,
    detailTarget,
  };
}

function createDetailTarget(item: RawCodexItem, itemId: string, kind: ToolCallKind, detailText: string): DetailTarget | null {
  if (kind === "fileChange") {
    const changes = (item.changes ?? []).map((change) => ({
      path: getNonEmptyString(change.path) ?? "unknown",
      changeType: getChangeType(change),
      diff: getNonEmptyString(change.diff) ?? "",
    }));
    const title = getPathTitle(changes[0]?.path ?? "") || "文件变更";
    return { type: "diff", id: `${itemId}-detail`, title, subtitle: summarizeFileChanges(item.changes ?? []), sourceItemIds: [itemId], changes };
  }
  if (detailText.length > 800) {
    return { type: "tool", id: `${itemId}-detail`, title: getToolTitle(item), subtitle: getToolSubtitle(item), sourceItemIds: [itemId], body: detailText };
  }
  return null;
}

function extractMarkdownLinks(text: string): LinkReference[] {
  const links: LinkReference[] = [];
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    links.push(classifyLinkTarget(label, href));
  }
  return links;
}

function summarizeToolCalls(calls: AssistantToolCallNode[]): string {
  const parts: string[] = [];
  const fileCalls = calls.filter((call) => call.kind === "fileChange");
  const commandCalls = calls.filter((call) => call.kind === "mcpToolCall");
  const searchCalls = calls.filter((call) => call.kind === "webSearch");
  if (fileCalls.length > 0) parts.push(summarizeFileChangeCalls(fileCalls));
  if (commandCalls.length > 0) parts.push(`已运行 ${commandCalls.length} 条命令`);
  if (searchCalls.length > 0) parts.push(searchCalls.length === 1 ? "已搜索" : `已搜索 ${searchCalls.length} 次`);
  return parts.join(" ");
}

function summarizeFileChangeCalls(calls: AssistantToolCallNode[]): string {
  const total = calls.length;
  return `已编辑 ${total} 个文件`;
}

function summarizeFileChanges(changes: RawCodexFileChange[]): string {
  const created = changes.filter((change) => getChangeType(change) === "add").length;
  const edited = changes.length - created;
  const parts = [];
  if (created > 0) parts.push(`已创建 ${created} 个文件`);
  if (edited > 0) parts.push(`已编辑 ${edited} 个文件`);
  return parts.join(" ") || "文件变更";
}

function getToolLabel(item: RawCodexItem, kind: ToolCallKind): string {
  if (kind === "fileChange") return summarizeFileChanges(item.changes ?? []);
  if (kind === "webSearch") return `已搜索 ${getNonEmptyString(item.query) ?? ""}`.trim();
  const command = getCommandText(item.arguments) || getCommandText(item.command) || getNonEmptyString(item.tool) || "命令";
  return `已运行 ${truncate(command, 96)}`;
}

function getToolDetailText(item: RawCodexItem, itemType: string): string {
  if (itemType === "fileChange") return JSON.stringify(item.changes ?? [], null, 2);
  const result = item.result ?? item.output ?? item.error ?? item.arguments ?? item.action ?? itemType;
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

function getToolTitle(item: RawCodexItem): string {
  return getNonEmptyString(item.tool) ?? getNonEmptyString(item.server) ?? "工具调用";
}

function getToolSubtitle(item: RawCodexItem): string {
  return [getNonEmptyString(item.server), getNonEmptyString(item.status)].filter(Boolean).join(" / ");
}

function getCommandText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(" ");
  if (isRecord(value) && typeof value["cmd"] === "string") return value["cmd"];
  return null;
}

function getToolKind(itemType: string): ToolCallKind {
  if (itemType === "fileChange") return "fileChange";
  if (itemType === "webSearch") return "webSearch";
  return "mcpToolCall";
}

function normalizeToolStatus(status: unknown): ToolCallStatus {
  const value = typeof status === "string" ? status.toLowerCase() : "";
  if (value.includes("complete") || value.includes("success")) return "completed";
  if (value.includes("fail") || value.includes("error")) return "failed";
  if (value.includes("run") || value.includes("progress")) return "running";
  return "unknown";
}

function isToolLikeItem(item: RawCodexItem): boolean {
  const itemType = getNonEmptyString(item.type);
  return itemType === "fileChange" || itemType === "mcpToolCall" || itemType === "webSearch";
}

function getItemText(item: RawCodexItem, itemType: string): string {
  if (typeof item.text === "string" && item.text.trim()) return item.text;
  if (Array.isArray(item.content)) {
    return item.content
      .map((part) => (isRecord(part) && typeof part["text"] === "string" ? part["text"] : ""))
      .filter(Boolean)
      .join("");
  }
  if (typeof item.content === "string" && item.content.trim()) return item.content;
  if (typeof item.title === "string" && item.title.trim()) return item.title;
  return `Unsupported Codex item: ${itemType}`;
}

function getItemId(item: RawCodexItem, turnId: string, index: number): string {
  return getNonEmptyString(item.id) ?? `${turnId}-item-${index}`;
}

function getChangeType(change: RawCodexFileChange): string {
  if (typeof change.kind === "string") return change.kind;
  if (isRecord(change.kind) && typeof change.kind["type"] === "string") return change.kind["type"];
  return "modify";
}

function getPathTitle(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

function isImageHref(href: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(href);
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @codex-remote/web test
```

Expected: timeline tests pass, while older adapter/display tests may still fail because they still expect the legacy message structure.

- [ ] **Step 5: Commit timeline derivation**

Run:

```bash
git add apps/web/src/assistantTimeline.ts apps/web/src/assistantTimeline.test.ts
git commit -m "feat: derive assistant timeline from app-server items"
```

## Task 3: Migrate App-Server Adapter To Timeline

**Files:**

- Modify: `apps/web/src/appServerMockAdapter.ts`
- Modify: `apps/web/src/appServerMockAdapter.test.ts`
- Delete: `apps/web/src/assistantThreadDisplay.ts`
- Delete: `apps/web/src/assistantThreadDisplay.test.ts`

- [ ] **Step 1: Update adapter exports**

In `apps/web/src/appServerMockAdapter.ts`, import the timeline type and derivation:

```ts
import { deriveAssistantTimeline, type AssistantTimeline } from "./assistantTimeline.ts";
```

Replace `AssistantMessageSnapshot`, `AssistantTurnSnapshot`, and `AssistantThreadSnapshot` with:

```ts
export interface AssistantThreadSnapshot {
  id: string;
  title: string;
  deviceId: string;
  projectId: string;
  projectName: string;
  status: ConversationStatus;
  updatedAt: string;
  forkedFromId: string | null;
  parentThreadId: string | null;
  timeline: AssistantTimeline;
}
```

Update the `assistantThreads` mapping:

```ts
const assistantThreads = conversations.map((conversation) => {
  const thread = getReadableThread(conversation.id, reads) ?? findListedThread(conversation.id, listedThreads);
  return {
    id: conversation.id,
    title: conversation.title,
    deviceId: conversation.deviceId,
    projectId: conversation.projectId ?? projectId,
    projectName: conversation.projectName,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
    forkedFromId: thread?.forkedFromId ?? null,
    parentThreadId: thread?.parentThreadId ?? null,
    timeline: deriveAssistantTimeline(thread ?? { id: conversation.id, turns: [] }),
  };
});
```

Keep `deriveAssistantMessages` temporarily only if an existing test still imports it during this task. If it remains, implement it as a legacy test helper derived from timeline text nodes and remove it in Step 4.

- [ ] **Step 2: Update adapter tests for timeline**

Replace the "when deriving assistant threads, should expose complete app-server turn snapshots" assertion in `apps/web/src/appServerMockAdapter.test.ts` with:

```ts
test("when deriving assistant threads, should expose timeline snapshots from app-server turns", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/codex-remote",
    capturedAt: "2026-06-15T00:00:00.000Z",
    pages: [
      {
        data: [{ id: "thread-with-turns", name: "Thread with turns", updatedAt: 1_797_249_600 }],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {
      "thread-with-turns": {
        thread: {
          id: "thread-with-turns",
          name: "Thread with turns",
          updatedAt: 1_797_249_600,
          turns: [
            {
              id: "turn-a",
              status: "completed",
              startedAt: 1_797_249_500,
              completedAt: 1_797_249_545,
              durationMs: 45_250,
              items: [{ id: "item-a", type: "agentMessage", text: "Turn A" }],
            },
          ],
        },
      },
    },
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.equal(data.assistantThreads[0]?.timeline.threadId, "thread-with-turns");
  assert.deepEqual(data.assistantThreads[0]?.timeline.turns[0]?.nodes, [
    {
      type: "text",
      id: "item-a",
      turnId: "turn-a",
      sourceItemIds: ["item-a"],
      role: "assistant",
      text: "Turn A",
      links: [],
    },
  ]);
});
```

Remove tests that assert `deriveAssistantMessages` and `deriveAssistantTurns` as public display sources. Their coverage now belongs in `assistantTimeline.test.ts`.

- [ ] **Step 3: Remove legacy display derivation files**

Run:

```bash
rm apps/web/src/assistantThreadDisplay.ts apps/web/src/assistantThreadDisplay.test.ts
```

- [ ] **Step 4: Remove legacy exports**

In `apps/web/src/appServerMockAdapter.ts`, remove:

```ts
export function deriveAssistantMessages(...)
export function deriveAssistantTurns(...)
interface AssistantMessageSnapshot
interface AssistantTurnSnapshot
```

Also remove helper functions that only supported assistant-ui `ThreadMessageLike` content if no remaining code imports them.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
```

Expected: failures now point only to UI files still importing legacy message/display types.

- [ ] **Step 6: Commit adapter migration**

Run after UI imports are fixed in Task 4 if this task cannot pass alone:

```bash
git add apps/web/src/appServerMockAdapter.ts apps/web/src/appServerMockAdapter.test.ts apps/web/src/assistantThreadDisplay.ts apps/web/src/assistantThreadDisplay.test.ts
git commit -m "refactor: migrate assistant snapshots to timeline"
```

If the deleted files were already removed before staging, `git add -A apps/web/src` is acceptable only after running `git status --short apps/web/src` and confirming it contains no unrelated user edits.

## Task 4: Split Chat Rendering Components

**Files:**

- Create: `apps/web/src/components/codex-markdown-text.tsx`
- Create: `apps/web/src/components/codex-tool-call-row.tsx`
- Modify: `apps/web/src/components/codex-assistant-thread.tsx`

- [ ] **Step 1: Create shared Markdown renderer**

Create `apps/web/src/components/codex-markdown-text.tsx`:

```tsx
"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { classifyLinkTarget, type LinkReference } from "../assistantTimeline";

interface CodexMarkdownTextProps {
  onOpenDetail: (target: LinkReference) => void;
  text: string;
}

export function CodexMarkdownText({ onOpenDetail, text }: CodexMarkdownTextProps) {
  const components = createMarkdownComponents(onOpenDetail);
  return (
    <div className="codex-markdown">
      <Markdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </Markdown>
    </div>
  );
}

function createMarkdownComponents(onOpenDetail: (target: LinkReference) => void): Components {
  return {
    a({ children, href }) {
      const label = flattenChildren(children);
      const target = classifyLinkTarget(label, href ?? "");
      return (
        <button className="codex-markdown-link" onClick={() => onOpenDetail(target)} type="button">
          {children}
        </button>
      );
    },
    input({ ...props }) {
      return <input disabled {...props} />;
    },
    img({ alt, src }) {
      return (
        <button
          className="codex-markdown-image-reference"
          onClick={() => onOpenDetail(classifyLinkTarget(alt ?? "图片", src ?? ""))}
          type="button"
        >
          {alt ? `图片：${alt}` : "图片"}
          {src ? ` (${src})` : ""}
        </button>
      );
    },
  };
}

function flattenChildren(children: unknown): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(flattenChildren).join("");
  return "链接";
}
```

- [ ] **Step 2: Create tool-call row component**

Create `apps/web/src/components/codex-tool-call-row.tsx`:

```tsx
"use client";

import { type AssistantToolCallNode, type AssistantToolGroupNode, type DetailTarget } from "../assistantTimeline";
import { Icon } from "./icons";

interface ToolGroupRowProps {
  expanded: boolean;
  group: AssistantToolGroupNode;
  isCallExpanded: (callId: string) => boolean;
  onOpenDetail: (target: DetailTarget) => void;
  onToggleCall: (callId: string) => void;
  onToggleGroup: (groupId: string) => void;
}

interface ToolCallRowProps {
  call: AssistantToolCallNode;
  expanded: boolean;
  onOpenDetail: (target: DetailTarget) => void;
  onToggle: (callId: string) => void;
}

export function CodexToolGroupRow(props: ToolGroupRowProps) {
  return (
    <div className="codex-tool-group">
      <button
        aria-expanded={props.expanded}
        className="codex-tool-row codex-tool-row-group"
        onClick={() => props.onToggleGroup(props.group.id)}
        type="button"
      >
        <Icon name="reload" />
        <span>{props.group.summary}</span>
        <Icon name="down" />
      </button>
      {props.expanded ? (
        <div className="codex-tool-children">
          {props.group.calls.map((call) => (
            <CodexToolCallRow
              call={call}
              expanded={props.isCallExpanded(call.id)}
              key={call.id}
              onOpenDetail={props.onOpenDetail}
              onToggle={props.onToggleCall}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodexToolCallRow(props: ToolCallRowProps) {
  return (
    <div className="codex-tool-call">
      <button
        aria-expanded={props.expanded}
        className={`codex-tool-row codex-tool-row-${props.call.status}`}
        onClick={() => props.onToggle(props.call.id)}
        type="button"
      >
        <Icon name={getToolIcon(props.call.kind)} />
        <span>{props.call.label}</span>
        <Icon name="down" />
      </button>
      {props.expanded ? (
        <div className="codex-tool-detail-card">
          {props.call.detailPlacement === "workspace" && props.call.detailTarget ? (
            <button className="codex-tool-open-detail" onClick={() => props.onOpenDetail(props.call.detailTarget!)} type="button">
              在右侧查看
            </button>
          ) : (
            <pre>{props.call.detailText}</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getToolIcon(kind: AssistantToolCallNode["kind"]): "edit" | "reload" | "search" {
  if (kind === "fileChange") return "edit";
  if (kind === "webSearch") return "search";
  return "reload";
}
```

- [ ] **Step 3: Migrate assistant thread component to timeline**

In `apps/web/src/components/codex-assistant-thread.tsx`:

1. Remove imports from `../assistantThreadDisplay`.
2. Remove local `CodexMarkdownText`, `CodexAssistantToolSummary`, `isToolLikeItemType`, `getToolItemLabelByType`, `getToolIconName`, and `getToolDetail`.
3. Import timeline types and new components:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AssistantTimelineNode, DetailTarget, LinkReference } from "../assistantTimeline";
import type { AssistantThreadSnapshot } from "../appServerMockAdapter";
import { CodexMarkdownText } from "./codex-markdown-text";
import { CodexToolCallRow, CodexToolGroupRow } from "./codex-tool-call-row";
import { Icon } from "./icons";
```

4. Change props:

```ts
interface CodexAssistantThreadProps {
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
  thread: AssistantThreadSnapshot | null;
}
```

5. Replace display rows with timeline nodes:

```tsx
const timeline = thread?.timeline ?? null;
const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set<string>());
const [expandedCallIds, setExpandedCallIds] = useState(() => new Set<string>());
const runtimeMessages = useMemo(() => getRuntimeMessages(timeline), [timeline]);
```

6. Render nodes:

```tsx
<div className="codex-assistant-message-list">
  {timeline?.turns.flatMap((turn) =>
    turn.nodes.map((node) => (
      <CodexTimelineNode
        isCallExpanded={(callId) => expandedCallIds.has(callId)}
        isGroupExpanded={(groupId) => expandedGroupIds.has(groupId)}
        key={node.id}
        node={node}
        onOpenDetail={onOpenDetail}
        onToggleCall={toggleCall}
        onToggleGroup={toggleGroup}
      />
    )),
  )}
</div>
```

Add helpers in the same file:

```tsx
function CodexTimelineNode(props: {
  isCallExpanded: (callId: string) => boolean;
  isGroupExpanded: (groupId: string) => boolean;
  node: AssistantTimelineNode;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
  onToggleCall: (callId: string) => void;
  onToggleGroup: (groupId: string) => void;
}) {
  if (props.node.type === "toolGroup") {
    return (
      <CodexToolGroupRow
        expanded={props.isGroupExpanded(props.node.id)}
        group={props.node}
        isCallExpanded={props.isCallExpanded}
        onOpenDetail={props.onOpenDetail}
        onToggleCall={props.onToggleCall}
        onToggleGroup={props.onToggleGroup}
      />
    );
  }

  if (props.node.type === "toolCall") {
    return (
      <CodexToolCallRow
        call={props.node}
        expanded={props.isCallExpanded(props.node.id)}
        onOpenDetail={props.onOpenDetail}
        onToggle={props.onToggleCall}
      />
    );
  }

  if (props.node.type === "contextCompaction") {
    return <div className="codex-assistant-run-status">{props.node.label}</div>;
  }

  return (
    <div className="codex-assistant-message" data-role={props.node.role}>
      <CodexMarkdownText onOpenDetail={props.onOpenDetail} text={props.node.text} />
    </div>
  );
}

function getRuntimeMessages(timeline: AssistantThreadSnapshot["timeline"] | null) {
  return (timeline?.turns ?? []).flatMap((turn) =>
    turn.nodes
      .filter((node): node is Extract<AssistantTimelineNode, { type: "text" }> => node.type === "text")
      .map((node) => ({
        id: node.id,
        role: node.role,
        contentText: node.text,
        itemType: node.role === "user" ? "userMessage" : "agentMessage",
        content: [{ type: "text" as const, text: node.text }],
        ...(node.role === "assistant" ? { status: { type: "complete" as const, reason: "stop" as const } } : {}),
      })),
  );
}
```

- [ ] **Step 4: Run typecheck and fix exact imports**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected: failures identify any remaining legacy `AssistantMessageSnapshot` imports. Remove those imports rather than reintroducing the legacy type.

- [ ] **Step 5: Commit chat rendering split**

Run:

```bash
git add apps/web/src/components/codex-assistant-thread.tsx apps/web/src/components/codex-markdown-text.tsx apps/web/src/components/codex-tool-call-row.tsx
git commit -m "feat: render assistant timeline tool rows"
```

## Task 5: Add Detail Workspace

**Files:**

- Create: `apps/web/src/components/detail-workspace.tsx`
- Modify: `apps/web/src/components/main-panels.tsx`

- [ ] **Step 1: Create detail workspace component**

Create `apps/web/src/components/detail-workspace.tsx`:

```tsx
"use client";

import type { DetailTarget, LinkReference } from "../assistantTimeline";
import { Icon } from "./icons";

interface DetailWorkspaceProps {
  target: DetailTarget | LinkReference | null;
}

export function DetailWorkspace({ target }: DetailWorkspaceProps) {
  return (
    <aside aria-label="Detail workspace" className="detail-workspace">
      <header className="detail-workspace-header">
        <div className="detail-workspace-tabs">
          <span className="detail-workspace-tab is-active">{target ? target.title : "详情"}</span>
        </div>
        <div className="detail-workspace-actions">
          <button aria-label="打开" className="icon-button" type="button">
            <Icon name="inbox" />
          </button>
          <button aria-label="更多" className="icon-button" type="button">
            <Icon name="more" />
          </button>
        </div>
      </header>
      <div className="detail-workspace-scroll">{target ? <DetailTargetBody target={target} /> : <DetailEmptyState />}</div>
    </aside>
  );
}

function DetailTargetBody({ target }: { target: DetailTarget | LinkReference }) {
  if ("sourceItemIds" in target) {
    if (target.type === "diff") return <DiffDetail target={target} />;
    if (target.type === "tool") return <TextDetail title={target.subtitle} text={target.body} />;
    if (target.type === "image") return <ImageDetail href={target.href} title={target.title} />;
    if (target.type === "url") return <UrlDetail href={target.href} title={target.title} />;
    if (target.type === "file" || target.type === "skill") return <TextDetail title={target.subtitle} text={target.previewText} />;
    return <UrlDetail href={target.href} title={target.title} />;
  }

  if (target.type === "image") return <ImageDetail href={target.href} title={target.title} />;
  if (target.type === "url") return <UrlDetail href={target.href} title={target.title} />;
  return <UrlDetail href={target.href} title={target.title} />;
}

function DiffDetail({ target }: { target: Extract<DetailTarget, { type: "diff" }> }) {
  return (
    <div className="detail-diff-stack">
      {target.changes.map((change) => (
        <section className="detail-diff-file" key={`${change.path}-${change.changeType}`}>
          <header>
            <span>{change.path}</span>
            <span>{change.changeType}</span>
          </header>
          <pre>{change.diff || "无 diff 内容"}</pre>
        </section>
      ))}
    </div>
  );
}

function TextDetail({ text, title }: { text: string; title: string }) {
  return (
    <section className="detail-text-card">
      <div className="detail-breadcrumb">{title}</div>
      <pre>{text || "当前显示切片没有可预览内容"}</pre>
    </section>
  );
}

function ImageDetail({ href, title }: { href: string; title: string }) {
  return (
    <section className="detail-image-card">
      <div className="detail-breadcrumb">{href}</div>
      <img alt={title} src={href} />
    </section>
  );
}

function UrlDetail({ href, title }: { href: string; title: string }) {
  return (
    <section className="detail-url-card">
      <h2>{title}</h2>
      <p>{href}</p>
      <span>当前为显示适配，不执行外部打开。</span>
    </section>
  );
}

function DetailEmptyState() {
  return (
    <section className="detail-empty">
      <h2>暂无详情</h2>
      <p>点击 Markdown 链接、文件变更或工具调用详情后，会在这里替换显示当前资源。</p>
    </section>
  );
}
```

- [ ] **Step 2: Wire detail state in main panels**

In `apps/web/src/components/main-panels.tsx`:

1. Add imports:

```tsx
import { useState } from "react";
import type { DetailTarget, LinkReference } from "../assistantTimeline";
import { DetailWorkspace } from "./detail-workspace";
```

2. Add state in `ConversationMain`:

```tsx
const [detailTarget, setDetailTarget] = useState<DetailTarget | LinkReference | null>(null);
```

3. Pass handler:

```tsx
<CodexAssistantThread onOpenDetail={setDetailTarget} thread={assistantThread} />
```

4. Replace the current `<ReviewPane ... />` call with:

```tsx
<DetailWorkspace target={detailTarget} />
```

Keep `ReviewPane` in the file only if another page still imports it. If no page uses `ReviewPane`, delete the component and remove `diffLines` from the `mockData` import.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected: no type errors.

- [ ] **Step 4: Commit detail workspace**

Run:

```bash
git add apps/web/src/components/detail-workspace.tsx apps/web/src/components/main-panels.tsx
git commit -m "feat: add right-side detail workspace"
```

## Task 6: Add Styles For Tool Rows And Detail Workspace

**Files:**

- Modify: `packages/ui/src/styles.css`

- [ ] **Step 1: Add tool-call styles**

Append near existing `.codex-assistant-*` rules in `packages/ui/src/styles.css`:

```css
.codex-tool-group,
.codex-tool-call {
  display: grid;
  gap: 8px;
}

.codex-tool-row {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  border-radius: var(--cr-radius-md);
  background: transparent;
  color: var(--cr-muted);
  font-size: var(--cr-text-body);
  line-height: 1.45;
  padding: 4px 0;
}

.codex-tool-row:hover {
  color: var(--cr-ink);
}

.codex-tool-row .icon {
  width: 15px;
  height: 15px;
  color: currentColor;
}

.codex-tool-row .icon:last-child {
  width: 13px;
  height: 13px;
  transition: transform 160ms ease;
}

.codex-tool-row[aria-expanded="true"] .icon:last-child {
  transform: rotate(180deg);
}

.codex-tool-children {
  display: grid;
  gap: 8px;
  padding-left: 23px;
}

.codex-tool-detail-card {
  max-width: min(100%, 760px);
  border-radius: var(--cr-radius-lg);
  background: var(--cr-surface);
  color: var(--cr-muted);
  padding: 12px;
}

.codex-tool-detail-card pre {
  margin: 0;
  overflow: auto;
  color: var(--cr-muted);
  font-family: var(--cr-font-mono);
  font-size: var(--cr-text-meta);
  line-height: 1.55;
  white-space: pre-wrap;
}

.codex-tool-open-detail {
  color: var(--cr-accent);
  font-size: var(--cr-text-body);
}
```

- [ ] **Step 2: Add Markdown link button reset**

Add:

```css
.codex-markdown-link,
.codex-markdown-image-reference {
  display: inline;
  background: transparent;
  color: var(--cr-accent);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
  text-decoration: none;
}

.codex-markdown-link:hover,
.codex-markdown-image-reference:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
```

- [ ] **Step 3: Add detail workspace styles**

Add near the existing `.review-pane` styles:

```css
.detail-workspace {
  display: grid;
  min-width: 0;
  min-height: 100vh;
  grid-template-rows: var(--cr-topbar-height) minmax(0, 1fr);
  border-left: 1px solid var(--cr-line-soft);
  background: var(--cr-surface-raised);
  color: var(--cr-ink);
  font-size: var(--cr-text-body);
}

.detail-workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--cr-line-soft);
}

.detail-workspace-tabs,
.detail-workspace-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.detail-workspace-tab {
  overflow: hidden;
  border-radius: var(--cr-radius-md);
  background: var(--cr-surface);
  color: var(--cr-ink);
  font-size: var(--cr-text-body);
  padding: 7px 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-workspace-scroll {
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.detail-breadcrumb {
  overflow: hidden;
  margin-bottom: 10px;
  color: var(--cr-muted);
  font-size: var(--cr-text-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-text-card,
.detail-url-card,
.detail-image-card,
.detail-empty,
.detail-diff-file {
  border-radius: var(--cr-radius-lg);
  background: var(--cr-surface);
  padding: 12px;
}

.detail-text-card pre,
.detail-diff-file pre {
  margin: 0;
  overflow: auto;
  color: var(--cr-ink);
  font-family: var(--cr-font-mono);
  font-size: var(--cr-text-meta);
  line-height: 1.55;
  white-space: pre-wrap;
}

.detail-diff-stack {
  display: grid;
  gap: 12px;
}

.detail-diff-file header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: var(--cr-muted);
  font-size: var(--cr-text-meta);
}

.detail-image-card img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--cr-radius-md);
}

.detail-url-card h2,
.detail-empty h2 {
  margin: 0 0 8px;
  color: var(--cr-ink);
  font-size: var(--cr-text-body);
  font-weight: var(--cr-weight-regular);
}

.detail-url-card p,
.detail-url-card span,
.detail-empty p {
  margin: 0;
  color: var(--cr-muted);
  font-size: var(--cr-text-body);
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected: no type errors.

- [ ] **Step 5: Commit styles**

Run:

```bash
git add packages/ui/src/styles.css
git commit -m "style: add tool call and detail workspace styles"
```

## Task 7: Verify Behavior And Remove Legacy Paths

**Files:**

- Modify only files required by failures found in this task.

- [ ] **Step 1: Scan for legacy display imports**

Run:

```bash
rg -n "assistantThreadDisplay|AssistantMessageSnapshot|AssistantTurnSnapshot|deriveAssistantMessages|deriveAssistantTurns|isToolLikeItemType" apps/web/src
```

Expected: no output, except `isToolLikeItemType` may remain only inside `assistantTimeline.ts` if it is local and not exported.

- [ ] **Step 2: Run web tests**

Run:

```bash
pnpm --filter @codex-remote/web test
```

Expected:

```text
tests ... pass
```

with exit code `0`.

- [ ] **Step 3: Run web typecheck**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected:

```text
> @codex-remote/web@0.0.0 typecheck
> tsc --noEmit --pretty false
```

with exit code `0`.

- [ ] **Step 4: Browser verify**

Start or reuse the dev server:

```bash
pnpm --filter @codex-remote/web dev
```

Open `http://127.0.0.1:5173/` in the in-app browser and verify:

- Chat content still opens at the latest message.
- Tool groups are collapsed by default.
- Expanding a multi-tool group reveals collapsed child tool rows.
- Expanding a child command row shows an inline card.
- Expanding a file-change row exposes an action to view detail.
- Clicking file-change detail replaces the right-side detail workspace.
- Clicking a Markdown skill/file/image/URL link replaces the same right-side detail workspace tab.
- Re-clicking a different link does not create another resource tab.
- Browser console has no errors.

- [ ] **Step 5: Commit verification fixes**

If verification required fixes, run:

```bash
git add apps/web/src apps/web/src/components packages/ui/src/styles.css
git commit -m "fix: stabilize timeline detail workspace"
```

If no fixes were required, do not create an empty commit.

## Self-Review Checklist

- Spec coverage:
  - `Raw → AssistantTimeline → UI` is implemented in Tasks 2 through 5.
  - `itemsView` is not used as grouping because current fixture only has `"full"`.
  - Consecutive tool-like items are grouped in Task 2.
  - Text breaks tool groups in Task 2 tests.
  - Tool groups and single rows are collapsed by default in Tasks 2 and 4.
  - File changes open right-side detail workspace in Tasks 2, 4, and 5.
  - Other tool calls render inline unless their detail target is large in Task 2.
  - Markdown links classify into skill/file/image/url/anchor/unknown in Task 2.
  - Right-side detail tab replacement is implemented in Task 5.
  - Display-only scope is preserved in Tasks 5 and 7.

- Placeholder scan:
  - This plan contains no unfinished placeholder tokens.
  - This plan contains no deferred implementation markers.
  - This plan contains no vague fill-in instructions.

- Type consistency:
  - `AssistantThreadSnapshot.timeline` is introduced in Task 3 and consumed in Task 4.
  - `DetailTarget` and `LinkReference` are defined in Task 2 and consumed in Tasks 4 and 5.
  - Legacy `AssistantMessageSnapshot` and `AssistantThreadDisplay` are removed before final verification.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-15-tool-call-link-detail-workspace.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
