import type { ConversationStatus } from "@codex-remote/api-contract";

export interface AssistantTimeline {
  threadId: string;
  turns: AssistantTimelineTurn[];
}

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
  loadState: "empty" | "loaded" | "missingRead" | "readError";
  timeline: AssistantTimeline;
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
