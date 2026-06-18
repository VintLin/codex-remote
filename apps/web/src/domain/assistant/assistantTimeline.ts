import type { RawCodexFileChange, RawCodexItem, RawCodexThread, RawCodexTurn } from "../../data/app-server/rawAppServerSnapshotTypes.ts";

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

export interface AssistantTimelineNodeBase {
  id: string;
  turnId: string;
  sourceItemIds: string[];
}

export interface AssistantTextNode extends AssistantTimelineNodeBase {
  type: "text";
  role: "assistant" | "user" | "unknown";
  text: string;
  links: LinkReference[];
}

export interface AssistantToolGroupNode extends AssistantTimelineNodeBase {
  type: "toolGroup";
  defaultCollapsed: true;
  summary: string;
  calls: AssistantToolCallNode[];
}

export interface AssistantToolCallNode extends AssistantTimelineNodeBase {
  type: "toolCall";
  kind: ToolCallKind;
  status: ToolCallStatus;
  defaultCollapsed: true;
  label: string;
  detailPlacement: DetailPlacement;
  detailTarget: DetailTarget;
}

export interface AssistantContextCompactionNode extends AssistantTimelineNodeBase {
  type: "contextCompaction";
  text: string;
}

export type ToolCallKind = "fileChange" | "mcpToolCall" | "webSearch";

export type ToolCallStatus = "completed" | "failed" | "running" | "unknown";

export type DetailPlacement = "inline" | "workspace";

export type LinkTargetType = "skill" | "file" | "image" | "url" | "anchor" | "unknown";

export interface LinkReference {
  type: LinkTargetType;
  href: string;
  label: string;
  title: string;
}

export type DetailTarget =
  | {
      type: "diff";
      title: string;
      changes: Array<{ path: string; diff: string; changeKind: string }>;
    }
  | {
      type: "file";
      title: string;
      path: string;
    }
  | {
      type: "skill";
      title: string;
      href: string;
    }
  | {
      type: "image";
      title: string;
      href: string;
    }
  | {
      type: "url";
      title: string;
      href: string;
    }
  | {
      type: "tool";
      title: string;
      detail: string;
      presentation: "inline" | "workspace";
    }
  | {
      type: "unknown";
      title: string;
      detail: string;
    };

export function deriveAssistantTimeline(thread: RawCodexThread): AssistantTimeline {
  return {
    threadId: getNonEmptyString(thread.id) ?? getNonEmptyString(thread.sessionId) ?? "unknown-thread",
    turns: (thread.turns ?? []).map(createTimelineTurn),
  };
}

export function classifyLinkTarget(label: string, href: string): LinkReference {
  const title = getPathTitle(href) ?? href;
  const normalizedHref = href.trim();

  if (normalizedHref.startsWith("#")) {
    return { type: "anchor", href, label, title: normalizedHref.slice(1) || href };
  }

  if (/^https?:\/\//i.test(normalizedHref)) {
    return { type: "url", href, label, title };
  }

  if (isSkillHref(normalizedHref)) {
    return { type: "skill", href, label, title };
  }

  if (isImageHref(normalizedHref)) {
    return { type: "image", href, label, title };
  }

  if (isFileHref(normalizedHref)) {
    return { type: "file", href, label, title };
  }

  return { type: "unknown", href, label, title };
}

function createTimelineTurn(turn: RawCodexTurn, turnIndex: number): AssistantTimelineTurn {
  const turnId = getNonEmptyString(turn.id) ?? `turn-${turnIndex}`;
  const nodes: AssistantTimelineNode[] = [];
  let pendingTools: AssistantToolCallNode[] = [];

  for (const [itemIndex, item] of (turn.items ?? []).entries()) {
    const itemId = getItemId(item, turnId, itemIndex);
    const toolCall = createToolCallNode(item, turnId, itemId);
    if (toolCall) {
      pendingTools.push(toolCall);
      continue;
    }

    flushPendingTools(nodes, pendingTools, turnId);
    pendingTools = [];

    if (isContextCompactionItem(item)) {
      nodes.push({
        type: "contextCompaction",
        id: itemId,
        turnId,
        sourceItemIds: [itemId],
        text: getItemText(item, { fallback: "上下文已压缩" }),
      });
      continue;
    }

    nodes.push({
      type: "text",
      id: itemId,
      turnId,
      sourceItemIds: [itemId],
      role: getTextRole(item),
      text: getItemText(item),
      links: collectMarkdownLinks(getItemText(item)),
    });
  }

  flushPendingTools(nodes, pendingTools, turnId);

  return {
    id: turnId,
    status: getNonEmptyString(turn.status) ?? "unknown",
    startedAt: getNullableNumber(turn.startedAt),
    completedAt: getNullableNumber(turn.completedAt),
    durationMs: getNullableNumber(turn.durationMs),
    nodes,
  };
}

function flushPendingTools(nodes: AssistantTimelineNode[], pendingTools: AssistantToolCallNode[], turnId: string): void {
  if (pendingTools.length === 0) {
    return;
  }

  if (pendingTools.length === 1) {
    const onlyTool = pendingTools[0];
    if (onlyTool) {
      nodes.push(onlyTool);
    }
    return;
  }

  nodes.push({
    type: "toolGroup",
    id: `${turnId}-tool-group-${nodes.length}`,
    turnId,
    sourceItemIds: pendingTools.flatMap((tool) => tool.sourceItemIds),
    defaultCollapsed: true,
    summary: summarizeToolGroup(pendingTools),
    calls: pendingTools,
  });
}

function createToolCallNode(item: RawCodexItem, turnId: string, itemId: string): AssistantToolCallNode | null {
  const kind = getToolCallKind(item);
  if (!kind) {
    return null;
  }

  const detailTarget = createDetailTarget(item, kind);

  return {
    type: "toolCall",
    id: itemId,
    turnId,
    sourceItemIds: [itemId],
    kind,
    status: normalizeToolStatus(item.status),
    defaultCollapsed: true,
    label: getToolCallLabel(item, kind),
    detailPlacement: getDetailPlacement(kind, detailTarget),
    detailTarget,
  };
}

function getToolCallKind(item: RawCodexItem): ToolCallKind | null {
  const type = normalizeKindText(item.type);

  if (type.includes("filechange") || (item.changes ?? []).length > 0) {
    return "fileChange";
  }

  if (type.includes("websearch") || type.includes("web_search") || type.includes("search")) {
    return "webSearch";
  }

  if (
    type.includes("mcptool") ||
    type.includes("toolcall") ||
    type.includes("command") ||
    type.includes("exec") ||
    getCommandText(item).length > 0
  ) {
    return "mcpToolCall";
  }

  return null;
}

function getToolCallLabel(item: RawCodexItem, kind: ToolCallKind): string {
  if (kind === "fileChange") {
    return `已编辑 ${getFileChangeCount(item)} 个文件`;
  }

  if (kind === "webSearch") {
    const query = getNonEmptyString(item.query) ?? getCommandText(item);
    return query ? `已搜索 ${query}` : "已搜索网页";
  }

  const command = getCommandText(item);
  return command ? `已运行 ${command}` : "已运行命令";
}

function summarizeToolGroup(tools: AssistantToolCallNode[]): string {
  const fileCount = tools
    .filter((tool) => tool.kind === "fileChange")
    .reduce((count, tool) => count + getCountFromFileLabel(tool.label), 0);
  const commandCount = tools.filter((tool) => tool.kind === "mcpToolCall").length;
  const searchCount = tools.filter((tool) => tool.kind === "webSearch").length;
  const parts: string[] = [];

  if (fileCount > 0) {
    parts.push(`已编辑 ${fileCount} 个文件`);
  }
  if (commandCount > 0) {
    parts.push(`已运行 ${commandCount} 条命令`);
  }
  if (searchCount > 0) {
    parts.push(`已搜索 ${searchCount} 次`);
  }

  return parts.length > 0 ? parts.join(" ") : `已处理 ${tools.length} 个工具调用`;
}

function createDetailTarget(item: RawCodexItem, kind: ToolCallKind): DetailTarget {
  if (kind === "fileChange") {
    return createFileChangeDetailTarget(item.changes ?? []);
  }

  if (kind === "webSearch") {
    const query = getNonEmptyString(item.query) ?? getCommandText(item);
    return {
      type: "url",
      title: query || "Web search",
      href: query && /^https?:\/\//i.test(query) ? query : `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    };
  }

  const detail = createToolDetail(item);
  return {
    type: "tool",
    title: getCommandText(item) || getNonEmptyString(item.tool) || getNonEmptyString(item.name) || "Tool call",
    detail,
    presentation: detail.length > 160 ? "workspace" : "inline",
  };
}

function createToolDetail(item: RawCodexItem): string {
  const parts = [
    getCommandText(item) || getItemText(item),
    formatDiagnosticBlock("output", item.output),
    formatDiagnosticBlock("result", item.result),
    formatDiagnosticBlock("error", item.error),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join("\n\n");
}

function formatDiagnosticBlock(label: string, value: unknown): string | null {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return `${label}:\n${value}`;
  }

  return `${label}:\n${JSON.stringify(value, null, 2)}`;
}

function createFileChangeDetailTarget(changes: RawCodexFileChange[]): DetailTarget {
  const normalizedChanges = changes.map((change) => {
    const path = getNonEmptyString(change.path) ?? "unknown-file";
    return {
      path,
      diff: getNonEmptyString(change.diff) ?? "",
      changeKind: getFileChangeKind(change),
    };
  });

  if (normalizedChanges.length === 0) {
    return {
      type: "unknown",
      title: "File change",
      detail: "No file changes were provided.",
    };
  }

  return {
    type: "diff",
    title: getFileChangeDetailTitle(normalizedChanges),
    changes: normalizedChanges,
  };
}

function getFileChangeDetailTitle(changes: Array<{ path: string }>): string {
  if (changes.length > 1) {
    return `已编辑 ${changes.length} 个文件`;
  }

  const firstChange = changes[0];
  if (!firstChange) {
    return "File change";
  }

  return getPathTitle(firstChange.path) ?? firstChange.path;
}

function getDetailPlacement(kind: ToolCallKind, detailTarget: DetailTarget): DetailPlacement {
  if (kind === "fileChange") {
    return "workspace";
  }

  if (detailTarget.type === "tool") {
    return detailTarget.presentation;
  }

  return "workspace";
}

function normalizeToolStatus(status: string | undefined): ToolCallStatus {
  const normalized = normalizeKindText(status);
  if (normalized.includes("complete") || normalized.includes("success")) {
    return "completed";
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "failed";
  }
  if (normalized.includes("run") || normalized.includes("progress")) {
    return "running";
  }

  return "unknown";
}

function getItemText(item: RawCodexItem, options: { fallback?: string } = {}): string {
  const directText = getNonEmptyString(item.text);
  if (directText) {
    return directText;
  }

  const contentText = getContentText(item.content);
  if (contentText) {
    return contentText;
  }

  if (typeof item.content === "string" && item.content.trim().length > 0) {
    return item.content;
  }

  const title = getNonEmptyString(item.title);
  if (title) {
    return title;
  }

  return options.fallback ?? `Unsupported Codex item: ${getNonEmptyString(item.type) ?? "unknown"}`;
}

function getContentText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  const texts = content.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const text = entry["text"];
    return typeof text === "string" && text.length > 0 ? [text] : [];
  });

  return texts.length > 0 ? texts.join("\n") : null;
}

function collectMarkdownLinks(text: string): LinkReference[] {
  const links: LinkReference[] = [];
  const markdownLinkPattern = /\[([^\]]+)]\(([^)\s]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const label = match[1];
    const href = match[2];
    if (label && href) {
      links.push(classifyLinkTarget(label, href));
    }
  }

  return links;
}

function getCommandText(item: RawCodexItem): string {
  const fromArguments = getCommandTextFromArguments(item.arguments);
  if (fromArguments) {
    return fromArguments;
  }

  if (Array.isArray(item.command)) {
    return item.command.join(" ");
  }

  return getNonEmptyString(item.command) ?? getNonEmptyString(item.tool) ?? "";
}

function getCommandTextFromArguments(args: unknown): string | null {
  if (!isRecord(args)) {
    return null;
  }

  for (const key of ["cmd", "command", "tool"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
      return value.join(" ");
    }
  }

  return null;
}

function getFileChangeCount(item: RawCodexItem): number {
  return Math.max(1, item.changes?.length ?? 0);
}

function getCountFromFileLabel(label: string): number {
  const match = /^已编辑 (\d+) 个文件$/.exec(label);
  return match ? Number.parseInt(match[1] ?? "1", 10) : 1;
}

function getFileChangeKind(change: RawCodexFileChange): string {
  if (typeof change.kind === "string") {
    return change.kind;
  }

  if (isRecord(change.kind)) {
    const type = change.kind["type"];
    if (typeof type === "string") {
      return type;
    }
  }

  return "unknown";
}

function getTextRole(item: RawCodexItem): "assistant" | "user" | "unknown" {
  const explicitRole = getNonEmptyString(item.role);
  if (explicitRole === "assistant" || explicitRole === "user") {
    return explicitRole;
  }

  const type = normalizeKindText(item.type);
  if (type.includes("agent") || type.includes("assistant")) {
    return "assistant";
  }
  if (type.includes("user")) {
    return "user";
  }

  return "unknown";
}

function getItemId(item: RawCodexItem, turnId: string, itemIndex: number): string {
  return getNonEmptyString(item.id) ?? `${turnId}-item-${itemIndex}`;
}

function isContextCompactionItem(item: RawCodexItem): boolean {
  const type = normalizeKindText(item.type);
  return type.includes("compact") || type.includes("contextcompaction");
}

function isSkillHref(href: string): boolean {
  return /(^|\/)SKILL\.md$/i.test(href);
}

function isImageHref(href: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(href);
}

function isFileHref(href: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return false;
  }

  return href.startsWith("/") || href.startsWith("./") || href.startsWith("../") || href.includes("/");
}

function getPathTitle(path: string): string | null {
  const normalized = path.split(/[?#]/)[0] ?? path;
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.at(-1) ?? null;
}

function normalizeKindText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getNonEmptyString(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function getNullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
