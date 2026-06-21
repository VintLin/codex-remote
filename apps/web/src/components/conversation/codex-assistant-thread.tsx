"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { Icon } from "@codex-remote/ui";
import type { ConversationApprovalCard, PendingApproval } from "@codex-remote/api-contract";
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
import { submitFollowUpDraft, type SubmitFollowUpDraftResult } from "./followUpComposerSubmit";

interface CodexAssistantThreadProps {
  activeTurnId?: string | null;
  canStartConversation?: boolean;
  canSubmitFollowUp?: boolean;
  controlStatus?: "accepted" | "failed" | "idle" | "submitting";
  followUpStatus?: "accepted" | "failed" | "idle" | "submitting";
  onOpenDetail?: (target: DetailTarget | LinkReference) => void;
  onSubmitApprovalDecision?: (approval: PendingApproval, decision: "accept" | "decline" | "cancel") => Promise<void>;
  onSubmitInterrupt?: () => Promise<void>;
  onSubmitFollowUp?: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
  onSubmitStart?: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
  onSubmitSteer?: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
  startStatus?: "accepted" | "failed" | "idle" | "submitting";
  approvalCards?: ConversationApprovalCard[];
  pendingApprovals?: PendingApproval[];
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

type TimelineRow =
  | ProcessedRunRow
  | {
      id: string;
      node: AssistantTimelineNode;
      type: "node";
    };

const noopOpenDetail = () => {};
const noopSubmitApprovalDecision = async () => {};
const noopSubmitInterrupt = async () => {};
const noopSubmitFollowUp = async () => {};
type ComposerMode = "send" | "start" | "steer" | "queue";

const accessModeOptions = [
  { key: "approval-request", label: "请求批准", icon: "hand" },
  { key: "approval-delegate", label: "替我审批", icon: "shield-check" },
  { key: "full-access", label: "完全访问", icon: "shield-alert" },
] as const;

export function CodexAssistantThread({
  activeTurnId = null,
  canStartConversation = false,
  canSubmitFollowUp = false,
  controlStatus = "idle",
  followUpStatus = "idle",
  onOpenDetail = noopOpenDetail,
  onSubmitApprovalDecision = noopSubmitApprovalDecision,
  onSubmitInterrupt = noopSubmitInterrupt,
  onSubmitFollowUp = noopSubmitFollowUp,
  onSubmitStart = noopSubmitFollowUp,
  onSubmitSteer = noopSubmitFollowUp,
  startStatus = "idle",
  approvalCards = [],
  pendingApprovals = [],
  thread,
}: CodexAssistantThreadProps) {
  return (
    <CodexAssistantRuntimeThread
      activeTurnId={activeTurnId}
      canStartConversation={canStartConversation}
      canSubmitFollowUp={canSubmitFollowUp}
      controlStatus={controlStatus}
      followUpStatus={followUpStatus}
      key={thread?.id ?? "empty-thread"}
      onOpenDetail={onOpenDetail}
      onSubmitApprovalDecision={onSubmitApprovalDecision}
      onSubmitInterrupt={onSubmitInterrupt}
      onSubmitFollowUp={onSubmitFollowUp}
      onSubmitStart={onSubmitStart}
      onSubmitSteer={onSubmitSteer}
      startStatus={startStatus}
      approvalCards={approvalCards}
      pendingApprovals={pendingApprovals}
      thread={thread}
    />
  );
}

function CodexAssistantRuntimeThread({
  activeTurnId,
  canStartConversation,
  canSubmitFollowUp,
  controlStatus,
  followUpStatus,
  onOpenDetail,
  onSubmitApprovalDecision,
  onSubmitInterrupt,
  onSubmitFollowUp,
  onSubmitStart,
  onSubmitSteer,
  startStatus,
  approvalCards,
  pendingApprovals,
  thread,
}: Required<CodexAssistantThreadProps>) {
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("send");
  const [selectedAccessMode] = useState<(typeof accessModeOptions)[number]["key"]>("approval-request");
  const [draft, setDraft] = useState("");
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [expandedRunIds, setExpandedRunIds] = useState(() => new Set<string>());
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const accessMenuRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => getRuntimeMessages(thread), [thread]);
  const rows = useMemo(() => getTimelineRows(thread), [thread]);
  const convertMessage = useCallback((message: RuntimeMessageSnapshot): ThreadMessageLike => {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.status ? { status: message.status } : {}),
    };
  }, []);
  const isSubmitting = followUpStatus === "submitting";
  const isInterrupting = controlStatus === "submitting";
  const canInterrupt = canSubmitFollowUp && activeTurnId !== null;
  const canCompose = canSubmitFollowUp || canStartConversation || canInterrupt;
  const runtime = useExternalStoreRuntime<RuntimeMessageSnapshot>({
    messages,
    convertMessage,
    isDisabled: !canCompose,
    isSendDisabled: !canCompose,
    onNew: async () => {},
  });
  const canSendNow =
    (composerMode === "steer" && canInterrupt) ||
    (composerMode === "queue" && canInterrupt) ||
    (composerMode === "start" && canStartConversation) ||
    (composerMode === "send" && (canSubmitFollowUp || canStartConversation));
  const canSend = canSendNow && !isSubmitting && controlStatus !== "submitting" && startStatus !== "submitting" && draft.trim().length > 0;
  const selectedAccessModeOption = accessModeOptions.find((option) => option.key === selectedAccessMode) ?? accessModeOptions[2]!;
  const syncDraftFromComposer = useCallback(() => {
    setDraft(composerInputRef.current?.textContent ?? "");
  }, []);
  const submitComposerDraft = useCallback(async () => {
    const message = draft.trim();
    if (!canSend) {
      return;
    }

    if (composerMode === "queue") {
      // ponytail: local queue, move to Control Plane state when queued messages must survive refresh/device handoff.
      setQueuedMessage(message);
      setDraft("");
      if (composerInputRef.current) {
        composerInputRef.current.textContent = "";
      }
      return;
    }

    const submittedMode = composerMode;
    if (submittedMode === "start") {
      setComposerMode("send");
    }
    const submitMessage =
      submittedMode === "steer"
        ? onSubmitSteer
        : submittedMode === "start" || !canSubmitFollowUp
          ? onSubmitStart
          : canSubmitFollowUp
            ? onSubmitFollowUp
            : onSubmitStart;
    await submitFollowUpDraft({
      canSend,
      message,
      onSubmitFollowUp: submitMessage,
      onClearDraft: () => {
        setDraft("");
        setComposerMode("send");
        if (composerInputRef.current) {
          composerInputRef.current.textContent = "";
        }
      },
    });
  }, [canSend, canStartConversation, canSubmitFollowUp, composerMode, draft, onSubmitFollowUp, onSubmitStart, onSubmitSteer]);
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
  const submitInterrupt = useCallback(async () => {
    if (!canInterrupt || isInterrupting) {
      return;
    }
    await onSubmitInterrupt();
  }, [canInterrupt, isInterrupting, onSubmitInterrupt]);

  useEffect(() => {
    if (!queuedMessage || activeTurnId !== null || !canSubmitFollowUp) {
      return;
    }
    const message = queuedMessage;
    setQueuedMessage(null);
    void onSubmitFollowUp(message);
  }, [activeTurnId, canSubmitFollowUp, onSubmitFollowUp, queuedMessage]);

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
                  <ConversationRequestCards
                    canControl={canSubmitFollowUp}
                    controlStatus={controlStatus}
                    onSubmitApprovalDecision={onSubmitApprovalDecision}
                    approvalCards={approvalCards}
                    pendingApprovals={pendingApprovals}
                  />
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
            <ComposerPrimitive.Root aria-disabled={!canCompose} className="codex-assistant-composer">
              <div
                aria-label="Follow-up message"
                aria-disabled={!canCompose || isSubmitting}
                className="codex-assistant-composer-input"
                contentEditable={canCompose && !isSubmitting}
                onInput={syncDraftFromComposer}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submitComposerDraft();
                  }
                }}
                onKeyUp={syncDraftFromComposer}
                ref={composerInputRef}
                role="textbox"
                suppressContentEditableWarning
              >
                {draft}
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
                      <Icon name={selectedAccessModeOption.icon} />
                      {selectedAccessModeOption.label}
                      <Icon name="down" />
                    </button>
                    {accessMenuOpen ? (
                      <div aria-label="权限模式" className="codex-assistant-access-menu" role="menu">
	                        {accessModeOptions.map((option) => (
	                          <button
	                            aria-pressed={option.key === selectedAccessMode}
	                            className={`codex-assistant-access-option${option.key === selectedAccessMode ? " is-selected" : ""}`}
                              disabled
	                            key={option.key}
                              // TODO: review required - wire only after OpenAPI exposes a public permission/profile model.
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
		                  {canInterrupt || (canStartConversation && canSubmitFollowUp) ? (
		                    <div aria-label="发送模式" className="codex-assistant-send-modes">
                          {canStartConversation ? (
                            <button
                              aria-pressed={composerMode === "start"}
                              className="codex-assistant-mode"
                              onClick={() => setComposerMode("start")}
                              type="button"
                            >
                              新对话
                            </button>
                          ) : null}
                          {canInterrupt ? (
                            <>
		                        <button
		                          aria-pressed={composerMode === "steer"}
		                          className="codex-assistant-mode"
		                          onClick={() => setComposerMode("steer")}
		                          type="button"
		                        >
		                          引导当前执行
		                        </button>
		                        <button
		                          aria-pressed={composerMode === "queue"}
		                          className="codex-assistant-mode"
			                          onClick={() => setComposerMode("queue")}
		                          type="button"
		                        >
		                          排队发送
		                        </button>
                            </>
                          ) : null}
		                    </div>
		                  ) : null}
	                  <span className="codex-assistant-composer-status">
		                    {getComposerStatusLabel(followUpStatus, controlStatus, startStatus, composerMode, canSubmitFollowUp)}
                        {queuedMessage ? " · 已排队 1 条" : ""}
	                  </span>
	                </div>
	                <div className="codex-assistant-composer-right">
	                  {canInterrupt ? (
	                    <button
	                      aria-label="中断"
	                      className="codex-assistant-send codex-assistant-interrupt"
	                      disabled={isInterrupting}
	                      onClick={() => void submitInterrupt()}
	                      type="button"
                    >
                      <Icon name="x" />
                    </button>
	                  ) : null}
                    <button
                      aria-label="发送"
                      className="codex-assistant-send"
                      disabled={!canSend}
                      onClick={() => void submitComposerDraft()}
                      type="button"
                    >
                      <Icon name="arrow-up" />
                    </button>
	                </div>
              </div>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.ViewportProvider>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}

function getComposerStatusLabel(
  status: Required<CodexAssistantThreadProps>["followUpStatus"],
  controlStatus: Required<CodexAssistantThreadProps>["controlStatus"],
  startStatus: Required<CodexAssistantThreadProps>["startStatus"],
  composerMode: ComposerMode,
  canSubmitFollowUp: boolean,
): string {
  if (controlStatus === "submitting") {
    return composerMode === "steer" ? "正在引导" : "正在中断";
  }
  if (controlStatus === "failed") {
    return composerMode === "steer" ? "引导失败" : "中断失败";
  }
  if (startStatus === "submitting") {
    return "正在开始";
  }
  if (startStatus === "failed") {
    return "开始失败";
  }
  if (startStatus === "accepted") {
    return "已开始，正在刷新";
  }
  if (status === "submitting") {
    return "正在发送";
  }
  if (status === "accepted") {
    return "已接受，正在刷新";
  }
  if (status === "failed") {
    return "发送失败";
  }
  if (composerMode === "queue") {
    return "排队发送将在当前执行后提交";
  }
  if (composerMode === "start") {
    return "输入后开始新对话";
  }
  if (composerMode === "steer") {
    return "输入后引导当前执行";
  }
  return canSubmitFollowUp ? "输入后发送" : "输入后开始";
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
      {role === "assistant" ? <AssistantMessageActions text={props.node.text} /> : null}
    </div>
  );
}

function AssistantMessageActions(props: { text: string }) {
  return (
    <div aria-label="Assistant message actions" className="codex-assistant-message-actions">
      <button
        aria-label="复制"
        className="codex-assistant-message-action"
        onClick={() => void navigator.clipboard?.writeText(props.text)}
        type="button"
      >
        copy
      </button>
      <button aria-label="赞" className="codex-assistant-message-action" disabled type="button">
        up
      </button>
      <button aria-label="踩" className="codex-assistant-message-action" disabled type="button">
        down
      </button>
      <button aria-label="派生" className="codex-assistant-message-action" disabled type="button">
        派生
      </button>
      <button aria-label="Hooks" className="codex-assistant-message-action" disabled type="button">
        hooks
      </button>
      <span className="codex-assistant-message-action" title="public timestamp pending">
        timestamp
      </span>
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

function ConversationRequestCards(props: {
  canControl: boolean;
  controlStatus: Required<CodexAssistantThreadProps>["controlStatus"];
  onSubmitApprovalDecision: (approval: PendingApproval, decision: "accept" | "decline" | "cancel") => Promise<void>;
  approvalCards: ConversationApprovalCard[];
  pendingApprovals: PendingApproval[];
}) {
  if (props.pendingApprovals.length === 0 && props.approvalCards.length === 0) {
    return null;
  }

  return (
    <div aria-label="Conversation requests" className="conversation-request-cards">
      {props.pendingApprovals.map((approval) => (
        <div className="conversation-approval-card" data-state="pending" key={approval.id}>
          <span className="conversation-control-meta">
            {approval.kind} · {approval.risk} · {approval.summary}
          </span>
          <div className="conversation-request-actions">
            {(["accept", "decline", "cancel"] as const).map((decision) => (
              <button
                className="button secondary conversation-control-button"
                disabled={!props.canControl || props.controlStatus === "submitting"}
                key={decision}
                onClick={() => void props.onSubmitApprovalDecision(approval, decision)}
                type="button"
              >
                {decision}
              </button>
            ))}
          </div>
        </div>
      ))}
      {props.approvalCards.map((card) => (
        <div className="conversation-approval-card" data-state={card.status} key={card.id}>
          <span className="conversation-control-meta">
            {card.status === "resolved" ? "resolved" : "pending"} · {card.risk} · {card.title}
          </span>
          <span className="conversation-approval-summary">{card.summary}</span>
        </div>
      ))}
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
