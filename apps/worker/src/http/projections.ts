import { basename } from "node:path";

import type {
  CodexConversation,
  ConversationTimeline,
  ConversationTimelineTurn,
  ConversationStatus,
  ConversationRuntimeStatus,
  LatestTurnStatus,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

export interface ConversationProjectionContext {
  deviceId: string;
  allowedProjectRoot: string;
  projectName: string;
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
    projectName: getProjectName(context),
    status: mapConversationStatus(thread),
    updatedAt: unixSecondsToIso(thread.updatedAt),
    summary: getSafePreview(thread.preview),
    sandbox: "unknown",
    approval: "unknown",
  };
}

export function projectThreadToTimeline(
  thread: v2.Thread,
  context: Required<Pick<ConversationProjectionContext, "deviceId" | "readStartedAt" | "readCompletedAt">> &
    Pick<ConversationProjectionContext, "allowedProjectRoot">,
): ConversationTimeline {
  const turns = thread.turns.map(projectTurnToTimelineTurn);

  return {
    deviceId: context.deviceId,
    conversationId: thread.id,
    readStartedAt: context.readStartedAt,
    readCompletedAt: context.readCompletedAt,
    snapshotRevision: `${thread.id}:${context.readCompletedAt}`,
    runtimeStatus: mapRuntimeStatus(thread.status),
    latestTurnStatus: getLatestTurnStatus(turns),
    turns,
  };
}

export function projectTurnToTimelineTurn(turn: v2.Turn): ConversationTimelineTurn {
  return {
    id: turn.id,
    status: mapTurnStatus(turn.status),
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs ?? deriveDurationMs(turn.startedAt, turn.completedAt),
  };
}

function getConversationTitle(thread: v2.Thread, context: ConversationProjectionContext): string {
  const normalizedName = normalizeText(thread.name);
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedPreview = normalizeText(thread.preview);
  if (normalizedPreview) {
    return normalizedPreview;
  }

  const normalizedProjectName = normalizeText(context.projectName) ?? normalizeText(basename(context.allowedProjectRoot));
  return normalizedProjectName ?? "Untitled conversation";
}

function getProjectName(context: ConversationProjectionContext): string {
  return normalizeText(context.projectName) ?? normalizeText(basename(context.allowedProjectRoot)) ?? "Allowed project";
}

function getSafePreview(preview: string): string {
  return normalizeText(preview) ?? "";
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
  if (latestTurnStatus === "completed" || latestTurnStatus === "interrupted" || latestTurnStatus === "unknown") {
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
