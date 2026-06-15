"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type TextMessagePartProps,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useCallback, useMemo } from "react";

import type { AssistantMessageSnapshot, AssistantThreadSnapshot } from "../appServerMockAdapter";

interface CodexAssistantThreadProps {
  thread: AssistantThreadSnapshot | null;
}

export function CodexAssistantThread({ thread }: CodexAssistantThreadProps) {
  return <CodexAssistantRuntimeThread key={thread?.id ?? "empty-thread"} thread={thread} />;
}

function CodexAssistantRuntimeThread({ thread }: CodexAssistantThreadProps) {
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const convertMessage = useCallback((message: AssistantMessageSnapshot): ThreadMessageLike => {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      metadata: {
        custom: {
          contentText: message.contentText,
          itemType: message.itemType,
          turnId: message.turnId ?? null,
        },
      },
    };
  }, []);
  const runtime = useExternalStoreRuntime<AssistantMessageSnapshot>({
    messages,
    convertMessage,
    isDisabled: true,
    isSendDisabled: true,
    onNew: async () => {},
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section aria-label="Conversation thread" className="codex-assistant-thread">
        <ThreadPrimitive.Root className="codex-assistant-root">
          <ThreadPrimitive.ViewportProvider>
            <div className="codex-assistant-scroll">
              <ThreadPrimitive.Empty>
                <div className="codex-assistant-empty">暂无历史消息</div>
              </ThreadPrimitive.Empty>
              <div className="codex-assistant-message-list">
                <ThreadPrimitive.Messages>
                  {({ message }) => <CodexAssistantMessage itemType={getMessageItemType(message)} role={message.role} />}
                </ThreadPrimitive.Messages>
              </div>
            </div>
            <ComposerPrimitive.Root aria-disabled="true" className="codex-assistant-composer">
              <div
                aria-label="Follow-up message"
                aria-disabled="true"
                className="codex-assistant-composer-input"
                role="textbox"
              >
                Streaming transport unavailable: 当前仅展示 app-server 历史快照，follow-up 发送暂不可用。
              </div>
              <div className="codex-assistant-composer-actions">
                <span>Live app-server streaming 尚未接入</span>
                <ComposerPrimitive.Send disabled type="button">
                  Send
                </ComposerPrimitive.Send>
              </div>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.ViewportProvider>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}

function CodexAssistantMessage(props: { itemType: string; role: "assistant" | "system" | "user" }) {
  return (
    <MessagePrimitive.Root className="codex-assistant-message" data-role={props.role}>
      <header className="codex-assistant-message-header">
        <span>{props.role === "user" ? "User" : "Codex"}</span>
        <span>{props.itemType}</span>
      </header>
      <MessagePrimitive.Content
        components={{
          Text: CodexAssistantTextPart,
          tools: {
            Fallback: CodexAssistantToolPart,
          },
        }}
      />
      <MessagePrimitive.Error />
    </MessagePrimitive.Root>
  );
}

function CodexAssistantTextPart(props: TextMessagePartProps) {
  return <p>{props.text}</p>;
}

function CodexAssistantToolPart(props: ToolCallMessagePartProps<Record<string, unknown>, unknown>) {
  const itemType = typeof props.args["itemType"] === "string" ? props.args["itemType"] : props.toolName;

  return (
    <div className="codex-assistant-item-card">
      <span>{getToolItemLabel(props.toolName)}</span>
      <code>{itemType}</code>
    </div>
  );
}

function getMessageItemType(message: { metadata?: { custom?: Record<string, unknown> } }): string {
  const itemType = message.metadata?.custom?.["itemType"];
  return typeof itemType === "string" ? itemType : "message";
}

function getToolItemLabel(toolName: string): string {
  if (toolName === "codex_file_change") {
    return "File or patch item";
  }
  if (toolName === "codex_search") {
    return "Search item";
  }
  if (toolName === "codex_execution") {
    return "Execution item";
  }
  return "Tool item";
}
