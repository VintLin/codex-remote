"use client";

import { ThreadPrimitive } from "@assistant-ui/react";

import type { AssistantMessageSnapshot, AssistantThreadSnapshot } from "../appServerMockAdapter";

interface CodexAssistantThreadProps {
  thread: AssistantThreadSnapshot | null;
}

export function CodexAssistantThread({ thread }: CodexAssistantThreadProps) {
  const messages = thread?.messages ?? [];

  return (
    <section aria-label="Conversation thread" className="codex-assistant-thread">
      <ThreadPrimitive.Root className="codex-assistant-scroll">
        {messages.length > 0 ? (
          <div className="codex-assistant-message-list">
            {messages.map((message) => (
              <article className="codex-assistant-message" data-role={message.role} key={message.id}>
                <header className="codex-assistant-message-header">
                  <span>{message.role === "user" ? "User" : "Codex"}</span>
                  <span>{message.itemType}</span>
                </header>
                <p>{message.contentText}</p>
                {isToolLikeItem(message) ? <ToolItemCard message={message} /> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="codex-assistant-empty">暂无历史消息</div>
        )}
      </ThreadPrimitive.Root>

      <form aria-disabled="true" className="codex-assistant-composer">
        <textarea
          aria-label="Follow-up message"
          disabled
          placeholder="Streaming transport unavailable: 当前仅展示 app-server 历史快照，follow-up 发送暂不可用。"
        />
        <div className="codex-assistant-composer-actions">
          <span>Live app-server streaming 尚未接入</span>
          <button disabled type="button">
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function ToolItemCard({ message }: { message: AssistantMessageSnapshot }) {
  return (
    <div className="codex-assistant-item-card">
      <span>{getToolItemLabel(message.itemType)}</span>
      <code>{message.itemType}</code>
    </div>
  );
}

function isToolLikeItem(message: AssistantMessageSnapshot): boolean {
  const itemType = message.itemType.toLowerCase();
  return (
    itemType.includes("tool") ||
    itemType.includes("exec") ||
    itemType.includes("patch") ||
    itemType.includes("filechange") ||
    itemType.includes("command") ||
    itemType.includes("search")
  );
}

function getToolItemLabel(itemType: string): string {
  const normalized = itemType.toLowerCase();
  if (normalized.includes("patch") || normalized.includes("filechange")) {
    return "File or patch item";
  }
  if (normalized.includes("search")) {
    return "Search item";
  }
  if (normalized.includes("exec") || normalized.includes("command")) {
    return "Execution item";
  }
  return "Tool item";
}
