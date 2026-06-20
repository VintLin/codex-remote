import type { CommandAccepted, FollowUpInput } from "@codex-remote/api-contract";

export type FollowUpSubmitStatus = "accepted" | "failed" | "idle" | "submitting";
export type FollowUpSubmitResult = "accepted" | "failed";

export interface FollowUpWorkerClient {
  followUpConversation(deviceId: string, conversationId: string, input: FollowUpInput): Promise<CommandAccepted>;
}

export interface SubmitConversationFollowUpOptions {
  conversationId: string | null;
  createClientRequestId: () => string;
  deviceId: string | null;
  message: string;
  refreshWorkbenchData: (conversationId: string) => Promise<void>;
  setFollowUpStatus: (status: FollowUpSubmitStatus) => void;
  workerClient: FollowUpWorkerClient;
}

export async function submitConversationFollowUp(
  options: SubmitConversationFollowUpOptions,
): Promise<FollowUpSubmitResult> {
  if (!options.deviceId || !options.conversationId) {
    options.setFollowUpStatus("failed");
    return "failed";
  }

  options.setFollowUpStatus("submitting");
  try {
    await options.workerClient.followUpConversation(options.deviceId, options.conversationId, {
      message: options.message,
      clientRequestId: options.createClientRequestId(),
      expectedConversationId: options.conversationId,
    });
    options.setFollowUpStatus("accepted");
    await options.refreshWorkbenchData(options.conversationId);
    return "accepted";
  } catch {
    options.setFollowUpStatus("failed");
    return "failed";
  }
}
