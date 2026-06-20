import type { ApprovalDecisionInput, CommandAccepted, PendingApproval } from "@codex-remote/api-contract";

export type ControlSubmitStatus = "accepted" | "failed" | "idle" | "submitting";
export type ControlSubmitResult = "accepted" | "failed";

export interface ControlWorkerClient {
  decideApproval(deviceId: string, conversationId: string, approvalRequestId: string, input: ApprovalDecisionInput): Promise<CommandAccepted>;
  interruptTurn(deviceId: string, conversationId: string, turnId: string, input: { clientRequestId: string; expectedTurnId: string }): Promise<CommandAccepted>;
  listApprovals(deviceId: string, conversationId: string): Promise<PendingApproval[]>;
  steerTurn(
    deviceId: string,
    conversationId: string,
    turnId: string,
    input: { clientRequestId: string; expectedTurnId: string; message: string },
  ): Promise<CommandAccepted>;
}

interface BaseOptions {
  conversationId: string | null;
  createClientRequestId: () => string;
  deviceId: string | null;
  refreshWorkbenchData: (conversationId: string) => Promise<void>;
  setStatus: (status: ControlSubmitStatus) => void;
  workerClient: ControlWorkerClient;
}

export async function submitInterrupt(options: BaseOptions & { turnId: string | null }): Promise<ControlSubmitResult> {
  if (!options.deviceId || !options.conversationId || !options.turnId) {
    options.setStatus("failed");
    return "failed";
  }

  options.setStatus("submitting");
  try {
    await options.workerClient.interruptTurn(options.deviceId, options.conversationId, options.turnId, {
      clientRequestId: options.createClientRequestId(),
      expectedTurnId: options.turnId,
    });
    options.setStatus("accepted");
    await options.refreshWorkbenchData(options.conversationId);
    return "accepted";
  } catch {
    options.setStatus("failed");
    return "failed";
  }
}

export async function submitSteer(options: BaseOptions & { message: string; turnId: string | null }): Promise<ControlSubmitResult> {
  if (!options.deviceId || !options.conversationId || !options.turnId) {
    options.setStatus("failed");
    return "failed";
  }

  options.setStatus("submitting");
  try {
    await options.workerClient.steerTurn(options.deviceId, options.conversationId, options.turnId, {
      clientRequestId: options.createClientRequestId(),
      expectedTurnId: options.turnId,
      message: options.message,
    });
    options.setStatus("accepted");
    await options.refreshWorkbenchData(options.conversationId);
    return "accepted";
  } catch {
    options.setStatus("failed");
    return "failed";
  }
}

export async function submitApprovalDecision(
  options: BaseOptions & { approval: PendingApproval; decision: ApprovalDecisionInput["decision"] },
): Promise<ControlSubmitResult> {
  if (!options.deviceId || !options.conversationId || options.approval.conversationId !== options.conversationId) {
    options.setStatus("failed");
    return "failed";
  }

  options.setStatus("submitting");
  try {
    await options.workerClient.decideApproval(options.deviceId, options.conversationId, options.approval.id, {
      clientRequestId: options.createClientRequestId(),
      decision: options.decision,
      expectedApprovalRequestId: options.approval.id,
      expectedConversationId: options.conversationId,
      expectedTurnId: options.approval.turnId,
    });
    options.setStatus("accepted");
    await options.refreshWorkbenchData(options.conversationId);
    return "accepted";
  } catch {
    options.setStatus("failed");
    return "failed";
  }
}
