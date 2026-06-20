import type { PendingApproval } from "@codex-remote/api-contract";
import type {
  ApplyPatchApprovalResponse,
  ExecCommandApprovalResponse,
  ServerRequest,
  v2,
} from "@codex-remote/codex-protocol";

import { WorkerHttpError } from "./errors.ts";

export type PublicApprovalDecision = "accept" | "decline" | "cancel";

export interface CapturedApprovalDecision {
  requestId: string | number;
  result: unknown;
}

export interface WorkerApprovalRegistry {
  captureServerRequest(request: ServerRequest): PendingApproval | null;
  completeApproval(approvalRequestId: string): void;
  listPendingApprovals(conversationId: string): PendingApproval[];
  resolveApproval(params: {
    approvalRequestId: string;
    conversationId: string;
    decision: PublicApprovalDecision;
    expectedApprovalRequestId: string;
    expectedTurnId: string;
  }): CapturedApprovalDecision;
  markResolved(notification: v2.ServerRequestResolvedNotification): void;
}

type SupportedApprovalKind = PendingApproval["kind"];

type CapturedApproval = {
  publicApproval: PendingApproval;
  requestId: string | number;
};

const maxPendingApprovals = 100;

export function createWorkerApprovalRegistry(options: { now?: () => string } = {}): WorkerApprovalRegistry {
  const pending = new Map<string, CapturedApproval>();
  let nextApprovalId = 1;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    captureServerRequest: (request) => {
      const captured = projectServerRequest(request, nextApprovalId, now());
      if (!captured) {
        return null;
      }

      nextApprovalId += 1;
      pending.set(captured.publicApproval.id, captured);
      trimPendingApprovals(pending);
      return captured.publicApproval;
    },
    completeApproval: (approvalRequestId) => {
      pending.delete(approvalRequestId);
    },
    listPendingApprovals: (conversationId) => Array.from(pending.values())
      .map((entry) => entry.publicApproval)
      .filter((approval) => approval.conversationId === conversationId),
    resolveApproval: (params) => {
      const captured = pending.get(params.approvalRequestId);
      if (!captured) {
        throw approvalNotFound();
      }

      const approval = captured.publicApproval;
      if (params.expectedApprovalRequestId !== params.approvalRequestId) {
        throw invalidApprovalDecision("expectedApprovalRequestId");
      }

      if (approval.conversationId !== params.conversationId || approval.turnId !== params.expectedTurnId) {
        throw approvalNotFound();
      }

      return {
        requestId: captured.requestId,
        result: createDecisionResult(approval.kind, params.decision),
      };
    },
    markResolved: (notification) => {
      for (const [approvalId, captured] of pending) {
        if (
          captured.requestId === notification.requestId &&
          captured.publicApproval.conversationId === notification.threadId
        ) {
          pending.delete(approvalId);
        }
      }
    },
  };
}

function projectServerRequest(request: ServerRequest, nextApprovalId: number, capturedAt: string): CapturedApproval | null {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return createCapturedApproval({
        kind: "command_execution",
        requestId: request.id,
        conversationId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        startedAtMs: request.params.startedAtMs,
        capturedAt,
        summary: "Command execution approval",
        risk: request.params.proposedExecpolicyAmendment || request.params.proposedNetworkPolicyAmendments ? "high" : "medium",
        nextApprovalId,
      });
    case "item/fileChange/requestApproval":
      return createCapturedApproval({
        kind: "file_change",
        requestId: request.id,
        conversationId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        startedAtMs: request.params.startedAtMs,
        capturedAt,
        summary: "File change approval",
        risk: request.params.grantRoot ? "high" : "medium",
        nextApprovalId,
      });
    case "execCommandApproval":
      return createCapturedApproval({
        kind: "legacy_exec",
        requestId: request.id,
        conversationId: request.params.conversationId,
        turnId: request.params.callId,
        itemId: request.params.callId,
        startedAtMs: null,
        capturedAt,
        summary: "Command execution approval",
        risk: "medium",
        nextApprovalId,
      });
    case "applyPatchApproval":
      return createCapturedApproval({
        kind: "legacy_apply_patch",
        requestId: request.id,
        conversationId: request.params.conversationId,
        turnId: request.params.callId,
        itemId: request.params.callId,
        startedAtMs: null,
        capturedAt,
        summary: "File change approval",
        risk: request.params.grantRoot ? "high" : "medium",
        nextApprovalId,
      });
    case "item/permissions/requestApproval":
    default:
      return null;
  }
}

function createCapturedApproval(params: {
  kind: SupportedApprovalKind;
  requestId: string | number;
  conversationId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number | null;
  capturedAt: string;
  summary: string;
  risk: PendingApproval["risk"];
  nextApprovalId: number;
}): CapturedApproval {
  return {
    requestId: params.requestId,
    publicApproval: {
      id: `approval-${params.nextApprovalId}`,
      conversationId: params.conversationId,
      turnId: params.turnId,
      itemId: params.itemId,
      kind: params.kind,
      status: "pending",
      startedAt: params.startedAtMs === null ? params.capturedAt : new Date(params.startedAtMs).toISOString(),
      summary: params.summary,
      risk: params.risk,
    },
  };
}

function createDecisionResult(kind: SupportedApprovalKind, decision: PublicApprovalDecision): unknown {
  switch (kind) {
    case "command_execution":
      return {
        decision: mapModernDecision(decision),
      } satisfies v2.CommandExecutionRequestApprovalResponse;
    case "file_change":
      return {
        decision: mapModernDecision(decision),
      } satisfies v2.FileChangeRequestApprovalResponse;
    case "legacy_exec":
      return {
        decision: mapLegacyDecision(decision),
      } satisfies ExecCommandApprovalResponse;
    case "legacy_apply_patch":
      return {
        decision: mapLegacyDecision(decision),
      } satisfies ApplyPatchApprovalResponse;
  }
}

function mapModernDecision(decision: PublicApprovalDecision): "accept" | "decline" | "cancel" {
  switch (decision) {
    case "accept":
      return "accept";
    case "decline":
      return "decline";
    case "cancel":
      return "cancel";
  }
}

function mapLegacyDecision(decision: PublicApprovalDecision): "approved" | "denied" | "abort" {
  switch (decision) {
    case "accept":
      return "approved";
    case "decline":
      return "denied";
    case "cancel":
      return "abort";
  }
}

function trimPendingApprovals(pending: Map<string, CapturedApproval>): void {
  while (pending.size > maxPendingApprovals) {
    const oldestKey = pending.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }

    pending.delete(oldestKey);
  }
}

function approvalNotFound(): WorkerHttpError {
  return new WorkerHttpError(404, "approval_not_found", "approval_not_found", {
    operation: "approval",
    retryable: false,
  });
}

function invalidApprovalDecision(field: string): WorkerHttpError {
  return new WorkerHttpError(409, "invalid_request", "invalid_request", {
    operation: "approval",
    field,
    retryable: false,
  });
}
