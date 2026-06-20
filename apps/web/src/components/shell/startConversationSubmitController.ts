import type { CommandAccepted, StartConversationInput } from "@codex-remote/api-contract";

export type StartConversationSubmitStatus = "accepted" | "failed" | "idle" | "submitting";
export type StartConversationSubmitResult = "accepted" | "failed";

export interface StartConversationWorkerClient {
  startConversation(deviceId: string, input: StartConversationInput): Promise<CommandAccepted>;
}

export interface StartConversationSubmitOptions {
  createClientRequestId: () => string;
  deviceId: string | null;
  message: string;
  projectId: string | null;
  refreshWorkbenchData: (conversationKey: string | null) => Promise<void>;
  setStatus: (status: StartConversationSubmitStatus) => void;
  workerClient: StartConversationWorkerClient;
}

export async function submitStartConversation(
  options: StartConversationSubmitOptions,
): Promise<StartConversationSubmitResult> {
  const message = options.message.trim();
  if (!options.deviceId || !options.projectId || !message) {
    options.setStatus("failed");
    return "failed";
  }

  options.setStatus("submitting");
  try {
    const accepted = await options.workerClient.startConversation(options.deviceId, {
      projectId: options.projectId,
      message,
      clientRequestId: options.createClientRequestId(),
    });
    options.setStatus("accepted");
    await options.refreshWorkbenchData(`${options.deviceId}\u001f${accepted.conversationId}`);
    return "accepted";
  } catch {
    options.setStatus("failed");
    return "failed";
  }
}
