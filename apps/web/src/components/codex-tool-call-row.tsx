"use client";

import { useState } from "react";

import type { AssistantToolCallNode, AssistantToolGroupNode, DetailTarget, LinkReference } from "../assistantTimeline";
import { Icon, type IconName } from "./icons";

interface CodexToolGroupRowProps {
  group: AssistantToolGroupNode;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
}

interface CodexToolCallRowProps {
  call: AssistantToolCallNode;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
  variant?: "grouped" | "nested";
}

export function CodexToolGroupRow({ group, onOpenDetail }: CodexToolGroupRowProps) {
  const [expanded, setExpanded] = useState(() => !group.defaultCollapsed);

  return (
    <div className="codex-assistant-message is-tool" data-role="assistant">
      <button
        aria-expanded={expanded}
        className="codex-assistant-tool-row"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <Icon name="information-o" />
        <span>{group.summary}</span>
        <Icon name="right" />
      </button>
      {expanded ? (
        <div className="codex-assistant-tool-children">
          {group.calls.map((call) => (
            <CodexToolCallRow call={call} key={call.id} onOpenDetail={onOpenDetail} variant="grouped" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodexToolCallRow({ call, onOpenDetail, variant = "nested" }: CodexToolCallRowProps) {
  const [expanded, setExpanded] = useState(() => !call.defaultCollapsed);
  const inlineDetail = call.detailPlacement === "inline" ? getInlineDetail(call.detailTarget) : null;
  const canOpenWorkspace = call.detailPlacement === "workspace";

  return (
    <div className="codex-assistant-message is-tool" data-role="assistant" data-tool-row={variant}>
      <button
        aria-expanded={expanded}
        className="codex-assistant-tool-row"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <Icon name={getToolIconName(call)} />
        <span>{call.label}</span>
        <code>{getStatusLabel(call.status)}</code>
        <Icon name="right" />
      </button>
      {expanded ? (
        <div className="codex-assistant-item-card">
          {inlineDetail ? <code>{inlineDetail}</code> : null}
          {canOpenWorkspace ? (
            <button
              className="codex-assistant-tool-detail"
              onClick={() => onOpenDetail(call.detailTarget)}
              type="button"
            >
              <Icon name="right" />
              <span>{call.detailTarget.title}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getToolIconName(call: AssistantToolCallNode): IconName {
  if (call.kind === "webSearch") {
    return "search";
  }

  if (call.kind === "mcpToolCall") {
    return "reload";
  }

  return "folder";
}

function getStatusLabel(status: AssistantToolCallNode["status"]): string {
  if (status === "completed") {
    return "完成";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "running") {
    return "运行中";
  }
  return "未知";
}

function getInlineDetail(target: DetailTarget): string | null {
  if (target.type === "tool" || target.type === "unknown") {
    return target.detail;
  }

  return null;
}
