import { basename } from "node:path";

import type {
  CodexConversation,
  ConversationApprovalCard,
  ConversationTimeline,
  ConversationTimelineTurn,
  ConversationWorkbenchEvent,
  ConversationStatus,
  ConversationRuntimeStatus,
  LatestTurnStatus,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import type { ApprovalRegistryRecord } from "./approvalRegistry.ts";

export interface ConversationProjectionContext {
  deviceId: string;
  allowedProjectRoot: string;
  projectId: string;
  projectName: string;
  archived?: boolean;
  loadedThreadIds?: ReadonlySet<string>;
  approvals?: readonly ApprovalRegistryRecord[];
  lifecycleEventKind?: ConversationWorkbenchEvent["kind"];
  readStartedAt?: string;
  readCompletedAt?: string;
}

export function projectThreadToConversation(
  thread: v2.Thread,
  context: ConversationProjectionContext,
): CodexConversation {
  return {
    id: thread.id,
    title: getConversationTitle(thread, context),
    deviceId: context.deviceId,
    projectId: context.projectId,
    projectName: getProjectName(context),
    status: mapConversationStatus(thread),
    updatedAt: unixSecondsToIso(thread.updatedAt),
    summary: "",
    sandbox: "unknown",
    approval: "unknown",
    archived: context.archived ?? false,
    loaded: isThreadLoaded(thread, context),
    live: isThreadLive(thread, context),
  };
}

export function projectThreadToTimeline(
  thread: v2.Thread,
  context: Required<Pick<ConversationProjectionContext, "deviceId" | "readStartedAt" | "readCompletedAt">> &
    Pick<
      ConversationProjectionContext,
      "allowedProjectRoot" | "projectId" | "archived" | "loadedThreadIds" | "approvals" | "lifecycleEventKind"
    >,
): ConversationTimeline {
  const turns = thread.turns.map(projectTurnToTimelineTurn);

  return {
    deviceId: context.deviceId,
    conversationId: thread.id,
    projectId: context.projectId,
    readStartedAt: context.readStartedAt,
    readCompletedAt: context.readCompletedAt,
    snapshotRevision: `${thread.id}:${context.readCompletedAt}`,
    runtimeStatus: mapRuntimeStatus(thread.status),
    latestTurnStatus: getLatestTurnStatus(turns),
    loaded: isThreadLoaded(thread, context),
    live: isThreadLive(thread, context),
    archived: context.archived ?? false,
    turns,
    events: projectWorkbenchEvents(thread, context),
  };
}

export function projectTurnToTimelineTurn(turn: v2.Turn): ConversationTimelineTurn {
  return {
    id: turn.id,
    status: mapTurnStatus(turn.status),
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs ?? deriveDurationMs(turn.startedAt, turn.completedAt),
    itemsView: mapTurnItemsView(turn.itemsView),
    nodes: projectTurnItemsToTimelineNodes(turn),
  };
}

function projectTurnItemsToTimelineNodes(turn: v2.Turn): ConversationTimelineTurn["nodes"] {
  const nodes = turn.items.flatMap((item) => projectThreadItemToTimelineNodes(turn.id, item));
  if (nodes.length > 0) {
    return nodes;
  }

  return [
    {
      id: `${turn.id}:status`,
      type: "context",
      text: `turn ${mapTurnStatus(turn.status)}`,
    },
  ];
}

function projectThreadItemToTimelineNodes(
  turnId: string,
  item: v2.ThreadItem,
): ConversationTimelineTurn["nodes"] {
  switch (item.type) {
    case "userMessage":
      return item.content.flatMap((content, index) => {
        if (content.type !== "text") {
          const nodes: ConversationTimelineTurn["nodes"] = [{
            id: `${item.id}:${index}`,
            type: "context",
            text: "User added non-text context",
          }];
          return nodes;
        }

        const nodes: ConversationTimelineTurn["nodes"] = [{
          id: `${item.id}:${index}`,
          type: "text",
          role: "user",
          text: content.text,
        }];
        return nodes;
      });
    case "agentMessage":
      return [{
        id: item.id,
        type: "text",
        role: "assistant",
        text: item.text,
      }];
    case "plan":
      return [{
        id: item.id,
        type: "text",
        role: "assistant",
        text: item.text,
      }];
    case "contextCompaction":
      return [{
        id: item.id,
        type: "context",
        text: "上下文已压缩",
      }];
    case "commandExecution":
      return [{
        id: item.id,
        type: "tool",
        kind: "command",
        status: mapToolStatus(item.status),
        label: "Command execution",
      }];
    case "fileChange":
      return [{
        id: item.id,
        type: "tool",
        kind: "file_change",
        status: mapToolStatus(item.status),
        label: `File changes · ${item.changes.length}`,
      }];
    case "mcpToolCall":
      return [{
        id: item.id,
        type: "tool",
        kind: "mcp",
        status: mapToolStatus(item.status),
        label: item.tool,
      }];
    case "dynamicToolCall":
      return [{
        id: item.id,
        type: "tool",
        kind: "other",
        status: mapToolStatus(item.status),
        label: item.tool,
      }];
    case "webSearch":
      return [{
        id: item.id,
        type: "tool",
        kind: "web_search",
        status: "completed",
        label: "Web search",
      }];
    case "imageView":
      return [{
        id: item.id,
        type: "tool",
        kind: "image",
        status: "completed",
        label: "Image viewed",
      }];
    case "imageGeneration":
      return [{
        id: item.id,
        type: "tool",
        kind: "image",
        status: mapToolStatus(item.status),
        label: "Image generation",
      }];
    case "reasoning":
      return [{
        id: item.id,
        type: "context",
        text: "Reasoning",
      }];
    case "hookPrompt":
      return [{
        id: item.id,
        type: "context",
        text: "Hook prompt",
      }];
    case "collabAgentToolCall":
      return [{
        id: `${turnId}:${item.id}`,
        type: "context",
        text: "Agent task",
      }];
    case "enteredReviewMode":
      return [{
        id: item.id,
        type: "context",
        text: "Entered review mode",
      }];
    case "exitedReviewMode":
      return [{
        id: item.id,
        type: "context",
        text: "Exited review mode",
      }];
  }
}

function mapToolStatus(status: string): "completed" | "failed" | "running" | "unknown" {
  switch (status) {
    case "completed":
    case "success":
    case "succeeded":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "running":
    case "inProgress":
    case "in_progress":
    case "pending":
      return "running";
    default:
      return "unknown";
  }
}

function mapTurnItemsView(itemsView: v2.Turn["itemsView"]): ConversationTimelineTurn["itemsView"] {
  if (itemsView === "full") {
    return "full";
  }
  if (itemsView === "summary" || itemsView === "notLoaded") {
    return "partial";
  }
  return "unknown";
}

function getConversationTitle(thread: v2.Thread, context: ConversationProjectionContext): string {
  const threadName = normalizeText(thread.name);
  if (threadName) {
    return threadName;
  }

  const previewTitle = normalizeText(thread.preview);
  return previewTitle ?? "Untitled conversation";
}

function getProjectName(context: ConversationProjectionContext): string {
  return normalizeText(context.projectName) ?? normalizeText(basename(context.allowedProjectRoot)) ?? "Allowed project";
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function unixSecondsToIso(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString();
}

function mapConversationStatus(thread: v2.Thread): ConversationStatus {
  const runtimeStatus = mapRuntimeStatus(thread.status);
  if (runtimeStatus === "running") {
    return "running";
  }
  if (runtimeStatus === "waiting_approval" || runtimeStatus === "waiting_input") {
    return "waiting";
  }
  if (runtimeStatus !== "idle") {
    return "unknown";
  }

  const latestTurnStatus = getLatestTurnStatus(thread.turns.map(projectTurnToTimelineTurn));
  if (latestTurnStatus === "failed") {
    return "failed";
  }
  if (latestTurnStatus === "completed" || latestTurnStatus === "interrupted") {
    return "done";
  }

  return "unknown";
}

function mapRuntimeStatus(status: v2.Thread["status"] | { type: string; activeFlags?: string[] }): ConversationRuntimeStatus {
  switch (status.type) {
    case "notLoaded":
      return "not_loaded";
    case "idle":
      return "idle";
    case "systemError":
      return "unknown";
    case "active":
      if ((status.activeFlags ?? []).includes("waitingOnApproval")) {
        return "waiting_approval";
      }
      if ((status.activeFlags ?? []).includes("waitingOnUserInput")) {
        return "waiting_input";
      }
      return "running";
    default:
      return "unknown";
  }
}

function isThreadLoaded(thread: v2.Thread, context: Pick<ConversationProjectionContext, "loadedThreadIds">): boolean {
  return context.loadedThreadIds?.has(thread.id) ?? false;
}

function isThreadLive(thread: v2.Thread, context: Pick<ConversationProjectionContext, "loadedThreadIds">): boolean {
  if (!isThreadLoaded(thread, context)) {
    return false;
  }

  return ["running", "waiting_approval", "waiting_input"].includes(mapRuntimeStatus(thread.status));
}

function projectWorkbenchEvents(
  thread: v2.Thread,
  context: Required<Pick<ConversationProjectionContext, "deviceId" | "readCompletedAt">> &
    Pick<ConversationProjectionContext, "approvals" | "lifecycleEventKind">,
): ConversationWorkbenchEvent[] {
  const events: ConversationWorkbenchEvent[] = [];
  let seq = 1;

  for (const approval of context.approvals ?? []) {
    if (approval.conversationId !== thread.id) {
      continue;
    }
    const resolvedAt = "resolvedAt" in approval ? approval.resolvedAt : null;
    const statusSuffix = resolvedAt === null ? "pending" : "resolved";
    events.push({
      eventId: `${thread.id}:${seq}:${approval.id}:${statusSuffix}`,
      seq,
      deviceId: context.deviceId,
      conversationId: thread.id,
      kind: resolvedAt === null ? "approval_pending" : "approval_resolved",
      createdAt: resolvedAt ?? approval.startedAt,
      source: "snapshot",
      approvalCard: projectApprovalCard(approval),
    });
    seq += 1;
  }

  if (context.lifecycleEventKind) {
    events.push({
      eventId: `${thread.id}:${seq}:${context.lifecycleEventKind}`,
      seq,
      deviceId: context.deviceId,
      conversationId: thread.id,
      kind: context.lifecycleEventKind,
      createdAt: context.readCompletedAt,
      source: "live",
    });
  }

  return events;
}

function projectApprovalCard(approval: ApprovalRegistryRecord): ConversationApprovalCard {
  return {
    id: approval.id,
    conversationId: approval.conversationId,
    turnId: approval.turnId,
    itemId: approval.itemId,
    kind: approval.kind,
    status: approval.status,
    title: approval.summary,
    summary: approval.summary,
    risk: approval.risk,
    createdAt: approval.startedAt,
    ...("resolvedAt" in approval ? { resolvedAt: approval.resolvedAt } : {}),
  };
}

function getLatestTurnStatus(turns: ConversationTimelineTurn[]): LatestTurnStatus {
  const latestTurn = turns.at(-1);
  if (!latestTurn) {
    return "unknown";
  }

  switch (latestTurn.status) {
    case "completed":
    case "interrupted":
    case "failed":
      return latestTurn.status;
    default:
      return "unknown";
  }
}

function deriveDurationMs(startedAt: number | null, completedAt: number | null): number | null {
  if (startedAt === null || completedAt === null) {
    return null;
  }

  return Math.max(0, completedAt - startedAt) * 1000;
}

function mapTurnStatus(status: string): ConversationTimelineTurn["status"] {
  if (status === "in_progress" || status === "completed" || status === "interrupted" || status === "failed") {
    return status;
  }

  if (status === "inProgress") {
    return "in_progress";
  }

  return "unknown";
}
