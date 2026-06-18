"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { Icon } from "@codex-remote/ui";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AssistantContextCompactionNode,
  AssistantTextNode,
  AssistantTimelineNode,
  AssistantTimelineTurn,
  AssistantThreadSnapshot,
  DetailTarget,
  LinkReference,
} from "../../domain/assistant/assistantTimeline";
import { CodexMarkdownText } from "./codex-markdown-text";
import { CodexToolCallRow, CodexToolGroupRow } from "./codex-tool-call-row";

interface CodexAssistantThreadProps {
  onOpenDetail?: (target: DetailTarget | LinkReference) => void;
  thread: AssistantThreadSnapshot | null;
}

interface RuntimeMessageSnapshot {
  id: string;
  role: "assistant" | "system" | "user";
  content: ThreadMessageLike["content"];
  status?: ThreadMessageLike["status"];
}

interface ProcessedRunRow {
  id: string;
  label: string;
  nodes: AssistantTimelineNode[];
  type: "processedRun";
}

const accessModeOptions = [
  { key: "approval-request", label: "请求批准", icon: "hand" },
  { key: "approval-delegate", label: "替我审批", icon: "shield-check" },
  { key: "full-access", label: "完全访问", icon: "shield-alert" },
] as const;

type TimelineRow =
  | ProcessedRunRow
  | {
      id: string;
      node: AssistantTimelineNode;
      type: "node";
    };

const noopOpenDetail = () => {};

export function CodexAssistantThread({ onOpenDetail = noopOpenDetail, thread }: CodexAssistantThreadProps) {
  return (
    <CodexAssistantRuntimeThread
      key={thread?.id ?? "empty-thread"}
      onOpenDetail={onOpenDetail}
      thread={thread}
    />
  );
}

function CodexAssistantRuntimeThread({ onOpenDetail, thread }: Required<CodexAssistantThreadProps>) {
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [selectedAccessMode, setSelectedAccessMode] = useState<(typeof accessModeOptions)[number]["key"]>("full-access");
  const [expandedRunIds, setExpandedRunIds] = useState(() => new Set<string>());
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const accessMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => getRuntimeMessages(thread), [thread]);
  const rows = useMemo(() => getTimelineRows(thread), [thread]);
  const selectedAccessModeLabel = accessModeOptions.find((option) => option.key === selectedAccessMode)?.label ?? "完全访问";
  const convertMessage = useCallback((message: RuntimeMessageSnapshot): ThreadMessageLike => {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.status ? { status: message.status } : {}),
    };
  }, []);
  const runtime = useExternalStoreRuntime<RuntimeMessageSnapshot>({
    messages,
    convertMessage,
    isDisabled: true,
    isSendDisabled: true,
    onNew: async () => {},
  });
  const toggleRun = useCallback((runId: string) => {
    setExpandedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }, []);
  const updateScrollToLatestVisibility = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const distanceFromBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    setShowScrollToLatest(distanceFromBottom > scrollElement.clientHeight);
  }, []);
  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    scrollElement.scrollTo({
      behavior,
      top: scrollElement.scrollHeight,
    });
    if (behavior === "auto") {
      setShowScrollToLatest(false);
    }
  }, []);
  const handleScrollToLatest = useCallback(() => {
    setShowScrollToLatest(false);
    scrollToLatest("smooth");
  }, [scrollToLatest]);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollToLatest("auto");
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [scrollToLatest, thread?.id]);

  useEffect(() => {
    if (!accessMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (accessMenuRef.current?.contains(target)) {
        return;
      }
      setAccessMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [accessMenuOpen]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section aria-label="Conversation thread" className="codex-assistant-thread">
        <ThreadPrimitive.Root className="codex-assistant-root">
          <ThreadPrimitive.ViewportProvider>
            <div className="codex-assistant-scroll" onScroll={updateScrollToLatestVisibility} ref={scrollRef}>
              <ThreadPrimitive.Empty>
                <div className="codex-assistant-empty">暂无历史消息</div>
              </ThreadPrimitive.Empty>
              <div className="codex-assistant-message-list">
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    {row.type === "processedRun" ? (
                      <CodexAssistantProcessedRun
                        expanded={expandedRunIds.has(row.id)}
                        label={row.label}
                        onToggle={() => toggleRun(row.id)}
                      />
                    ) : (
                      renderTimelineNode(row.node, onOpenDetail)
                    )}
                    {row.type === "processedRun" && expandedRunIds.has(row.id)
                      ? row.nodes.map((node) => (
                          <Fragment key={node.id}>{renderTimelineNode(node, onOpenDetail)}</Fragment>
                        ))
                      : null}
                  </Fragment>
                ))}
              </div>
            </div>
            {showScrollToLatest ? (
              <button
                aria-label="回到最新聊天记录"
                className="codex-assistant-scroll-latest"
                onClick={handleScrollToLatest}
                type="button"
              >
                <Icon name="down" />
              </button>
            ) : null}
            <ComposerPrimitive.Root aria-disabled="true" className="codex-assistant-composer">
              <div
                aria-label="Follow-up message"
                aria-disabled="true"
                className="codex-assistant-composer-input"
                role="textbox"
              >
                要求后续变更
              </div>
              <div className="codex-assistant-composer-actions">
                <div className="codex-assistant-composer-left">
                  <button aria-label="添加附件" className="codex-assistant-composer-icon" disabled type="button">
                    <Icon name="plus" />
                  </button>
                  <div className="codex-assistant-access-wrap" ref={accessMenuRef}>
                    <button
                      aria-expanded={accessMenuOpen}
                      aria-haspopup="menu"
                      className="codex-assistant-access"
                      data-mode={selectedAccessMode}
                      onClick={() => setAccessMenuOpen((current) => !current)}
                      type="button"
                    >
                      <Icon name={accessModeOptions.find((option) => option.key === selectedAccessMode)?.icon ?? "shield-alert"} />
                      {selectedAccessModeLabel}
                      <Icon name="down" />
                    </button>
                    {accessMenuOpen ? (
                      <div aria-label="权限模式" className="codex-assistant-access-menu" role="menu">
                        {accessModeOptions.map((option) => (
                          <button
                            aria-pressed={option.key === selectedAccessMode}
                            className={`codex-assistant-access-option${option.key === selectedAccessMode ? " is-selected" : ""}`}
                            key={option.key}
                            onClick={() => {
                              setSelectedAccessMode(option.key);
                              setAccessMenuOpen(false);
                            }}
                            role="menuitemradio"
                            type="button"
                          >
                            <Icon name={option.icon} />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="codex-assistant-composer-right">
                  <button className="codex-assistant-model" disabled type="button">
                    5.5
                    <span>高</span>
                    <Icon name="down" />
                  </button>
                  <button aria-label="语音输入" className="codex-assistant-composer-icon" disabled type="button">
                    <Icon name="mic" />
                  </button>
                  <ComposerPrimitive.Send aria-label="发送" className="codex-assistant-send" disabled type="button">
                    <Icon name="arrow-up" />
                  </ComposerPrimitive.Send>
                </div>
                <span className="codex-assistant-composer-note">当前仅展示演示历史</span>
              </div>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.ViewportProvider>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}

function CodexAssistantProcessedRun(props: { expanded: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      aria-expanded={props.expanded}
      className="codex-assistant-run-status"
      onClick={props.onToggle}
      type="button"
    >
      <span>{props.label}</span>
      <Icon name="right" />
    </button>
  );
}

function renderTimelineNode(
  node: AssistantTimelineNode,
  onOpenDetail: (target: DetailTarget | LinkReference) => void,
) {
  if (node.type === "text") {
    return <CodexAssistantTextMessage node={node} onOpenDetail={onOpenDetail} />;
  }

  if (node.type === "contextCompaction") {
    return <CodexAssistantContextCompaction node={node} />;
  }

  if (node.type === "toolGroup") {
    return <CodexToolGroupRow group={node} onOpenDetail={onOpenDetail} />;
  }

  return <CodexToolCallRow call={node} onOpenDetail={onOpenDetail} variant="nested" />;
}

function CodexAssistantTextMessage(props: {
  node: AssistantTextNode;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
}) {
  const role = getRuntimeRole(props.node);

  return (
    <div className="codex-assistant-message" data-role={role}>
      <CodexMarkdownText links={props.node.links} onOpenDetail={props.onOpenDetail} text={props.node.text} />
    </div>
  );
}

function CodexAssistantContextCompaction(props: { node: AssistantContextCompactionNode }) {
  return (
    <div className="codex-assistant-run-status">
      <span>{props.node.text || "上下文已压缩"}</span>
    </div>
  );
}

function getRuntimeMessages(thread: AssistantThreadSnapshot | null): RuntimeMessageSnapshot[] {
  if (!thread) {
    return [];
  }

  return thread.timeline.turns.flatMap((turn) =>
    turn.nodes.map((node) => {
      const role = getNodeRuntimeRole(node);

      return {
        id: node.id,
        role,
        content: [{ type: "text", text: getRuntimeMessageText(node) }],
        ...(role === "assistant" ? { status: { type: "complete", reason: "stop" } } : {}),
      };
    }),
  );
}

function getTimelineRows(thread: AssistantThreadSnapshot | null): TimelineRow[] {
  if (!thread) {
    return [];
  }

  return thread.timeline.turns.flatMap(getTurnRows);
}

function getTurnRows(turn: AssistantTimelineTurn): TimelineRow[] {
  const finalAssistantIndex = getFinalAssistantTextIndex(turn.nodes);
  if (finalAssistantIndex < 1) {
    return turn.nodes.map((node) => ({ id: node.id, node, type: "node" }));
  }

  const rows: TimelineRow[] = [];
  let pendingRun: AssistantTimelineNode[] = [];
  const flushPendingRun = (beforeIndex: number) => {
    if (pendingRun.length === 0) {
      return;
    }

    const id = `${turn.id}-processed-${pendingRun[0]?.id ?? beforeIndex}-${beforeIndex}`;
    rows.push({
      id,
      label: getProcessedRunLabel(turn),
      nodes: pendingRun,
      type: "processedRun",
    });
    pendingRun = [];
  };

  turn.nodes.forEach((node, index) => {
    if (index < finalAssistantIndex && !isUserTextNode(node)) {
      pendingRun.push(node);
      return;
    }

    flushPendingRun(index);
    rows.push({ id: node.id, node, type: "node" });
  });

  flushPendingRun(turn.nodes.length);
  return rows;
}

function getFinalAssistantTextIndex(nodes: AssistantTimelineNode[]): number {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.type === "text" && node.role !== "user") {
      return index;
    }
  }

  return -1;
}

function getProcessedRunLabel(turn: AssistantTimelineTurn): string {
  const duration = formatDuration(turn.durationMs);
  return duration ? `已处理 ${duration}` : "已处理";
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function isUserTextNode(node: AssistantTimelineNode): boolean {
  return node.type === "text" && node.role === "user";
}

function getNodeRuntimeRole(node: AssistantTimelineNode): "assistant" | "system" | "user" {
  if (node.type === "text") {
    return getRuntimeRole(node);
  }

  return "assistant";
}

function getRuntimeRole(node: AssistantTextNode): "assistant" | "user" {
  return node.role === "user" ? "user" : "assistant";
}

function getRuntimeMessageText(node: AssistantTimelineNode): string {
  if (node.type === "text" || node.type === "contextCompaction") {
    return node.text;
  }

  if (node.type === "toolGroup") {
    return node.summary;
  }

  return node.label;
}
