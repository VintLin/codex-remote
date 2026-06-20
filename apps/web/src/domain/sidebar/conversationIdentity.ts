import type { CodexConversation } from "@codex-remote/api-contract";

const separator = "\u001f";

export function createConversationKey(conversation: Pick<CodexConversation, "deviceId" | "id">): string {
  return `${conversation.deviceId}${separator}${conversation.id}`;
}

export function findConversationByKey(
  conversations: readonly CodexConversation[],
  conversationKey: string | null | undefined,
): CodexConversation | null {
  if (!conversationKey) {
    return null;
  }

  return conversations.find((conversation) => createConversationKey(conversation) === conversationKey) ?? null;
}
