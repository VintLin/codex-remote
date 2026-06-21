import type {
  ConversationTimeline,
  ConversationApprovalCard,
  ConversationWorkbenchEvent,
  ConversationTimelineTurn,
  BoardTask,
  Device,
  RemoteProject,
  CodexConversation,
  ErrorEnvelope,
} from "@codex-remote/api-contract";

import type {
  AssistantTimelineNode,
  AssistantTimelineTurn,
  AssistantThreadSnapshot,
} from "../../domain/assistant/assistantTimeline.ts";
import { createConversationKey, findConversationByKey } from "../../domain/sidebar/conversationIdentity.ts";

import {
  conversations as mockConversations,
  devices as mockDevices,
  sidebarProjects as mockProjects,
  tasks as mockTasks,
} from "../app-server/mockData.ts";

import { WorkerApiClient, WorkerApiRequestError } from "./client.ts";

export interface SearchRecent {
  conversationId: string;
  conversationKey: string;
  title: string;
  project: string;
  active?: boolean;
  marker?: boolean;
}

type SourceErrorEnvelope = Pick<ErrorEnvelope, "code" | "message" | "details" | "requestId">;

export interface WorkbenchData {
  source: {
    reason:
      | "loaded"
      | "not_configured"
      | "unauthorized"
      | "forbidden"
      | "app_server_unavailable"
      | "request_failure";
    error?: SourceErrorEnvelope;
  };
  taskSource: {
    status: "failed" | "loaded";
  };
  devices: Device[];
  projects: RemoteProject[];
  conversations: CodexConversation[];
  approvalCards: ConversationApprovalCard[];
  tasks: BoardTask[];
  assistantThreads: AssistantThreadSnapshot[];
  searchRecents: SearchRecent[];
}

export interface LoadWorkbenchDataOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  selectedConversationKey?: string | null;
}

export type LoadReason = WorkbenchData["source"]["reason"];

export function createFallbackWorkbenchData(
  reason: WorkbenchData["source"]["reason"],
  selectedConversationKey?: string | null,
  sourceError?: SourceErrorEnvelope,
): WorkbenchData {
  const conversations = [...mockConversations];

  return {
    source: createWorkbenchSource(reason, sourceError),
    taskSource: { status: "loaded" },
    devices: [...mockDevices],
    projects: [...mockProjects],
    conversations,
    approvalCards: [],
    tasks: [...mockTasks],
    assistantThreads: createMetadataOnlyAssistantThreads(conversations),
    searchRecents: createSearchRecents(conversations, selectedConversationKey),
  };
}

function createWorkbenchSource(
  reason: WorkbenchData["source"]["reason"],
  sourceError?: SourceErrorEnvelope,
): WorkbenchData["source"] {
  return sourceError ? { reason, error: sourceError } : { reason };
}

function createMetadataOnlyAssistantThreads(conversations: readonly CodexConversation[]): AssistantThreadSnapshot[] {
  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    deviceId: conversation.deviceId,
    ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
    projectName: conversation.projectName,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
    forkedFromId: null,
    parentThreadId: null,
    loadState: "empty",
    timeline: {
      threadId: conversation.id,
      turns: [],
    },
  }));
}

function createMetadataOnlyAssistantTurn(turn: ConversationTimelineTurn): AssistantTimelineTurn {
  const label = `turn ${turn.status}`;

  return {
    id: turn.id,
    status: turn.status,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs,
    nodes: turn.nodes.length > 0 ? turn.nodes.map((node) => projectTimelineNode(turn.id, node)) : [
      {
        type: "contextCompaction",
        id: `${turn.id}-metadata`,
        turnId: turn.id,
        sourceItemIds: [turn.id],
        text: label,
      },
    ],
  };
}

function projectTimelineNode(
  turnId: string,
  node: ConversationTimelineTurn["nodes"][number],
): AssistantTimelineNode {
  if (node.type === "text") {
    return {
      id: node.id,
      turnId,
      sourceItemIds: [node.id],
      type: "text",
      role: node.role,
      text: node.text,
      links: [],
    };
  }

  if (node.type === "tool") {
    return {
      id: node.id,
      turnId,
      sourceItemIds: [node.id],
      type: "toolCall",
      kind: projectToolKind(node.kind),
      status: node.status,
      defaultCollapsed: true,
      label: node.label,
      detailPlacement: "inline",
      detailTarget: {
        type: "tool",
        title: node.label,
        detail: node.label,
        presentation: "inline",
      },
    };
  }

  return {
    id: node.id,
    turnId,
    sourceItemIds: [node.id],
    type: "contextCompaction",
    text: node.text,
  };
}

function projectToolKind(kind: Extract<ConversationTimelineTurn["nodes"][number], { type: "tool" }>["kind"]) {
  switch (kind) {
    case "command":
      return "command";
    case "file_change":
      return "fileChange";
    case "image":
      return "image";
    case "mcp":
      return "mcpToolCall";
    case "web_search":
      return "webSearch";
    case "neutral":
      return "neutral";
    default:
      return "other";
  }
}

function createAssistantThreadsFromConversations(
  conversations: readonly CodexConversation[],
  selectedTimelineConversationKey?: string | null,
  timeline?: ConversationTimeline,
  timelineErrorConversationKey?: string | null,
): AssistantThreadSnapshot[] {
  return conversations.map((conversation) => {
    const conversationKey = createConversationKey(conversation);
    if (timelineErrorConversationKey === conversationKey) {
      return {
        id: conversation.id,
        title: conversation.title,
        deviceId: conversation.deviceId,
        ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
        projectName: conversation.projectName,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
        forkedFromId: null,
        parentThreadId: null,
        loadState: "readError",
        timeline: {
          threadId: conversation.id,
          turns: [],
        },
      };
    }

    if (selectedTimelineConversationKey !== conversationKey || !timeline) {
      return {
        id: conversation.id,
        title: conversation.title,
        deviceId: conversation.deviceId,
        ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
        projectName: conversation.projectName,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
        forkedFromId: null,
        parentThreadId: null,
        loadState: "missingRead",
        timeline: {
          threadId: conversation.id,
          turns: [],
        },
      };
    }

    return {
      id: conversation.id,
      title: conversation.title,
      deviceId: conversation.deviceId,
      ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
      projectName: conversation.projectName,
      status: conversation.status,
      updatedAt: conversation.updatedAt,
      forkedFromId: null,
      parentThreadId: null,
      loadState: "loaded",
      timeline: {
        threadId: conversation.id,
        turns: timeline.turns.map((turn) => createMetadataOnlyAssistantTurn(turn)),
      },
    };
  });
}

function projectApprovalCards(timeline: ConversationTimeline | null): ConversationApprovalCard[] {
  if (!timeline?.events?.length) {
    return [];
  }

  const eventsById = new Map<string, ConversationWorkbenchEvent>();
  for (const event of timeline.events) {
    if (!eventsById.has(event.eventId)) {
      eventsById.set(event.eventId, event);
    }
  }

  const cardsById = new Map<string, { card: ConversationApprovalCard; seq: number }>();
  for (const event of [...eventsById.values()].sort((left, right) => left.seq - right.seq)) {
    if (!event.approvalCard) {
      continue;
    }
    const existing = cardsById.get(event.approvalCard.id);
    if (!existing || event.seq > existing.seq || (event.seq === existing.seq && event.approvalCard.status === "resolved")) {
      cardsById.set(event.approvalCard.id, { card: event.approvalCard, seq: event.seq });
    }
  }

  return [...cardsById.values()]
    .sort((left, right) => left.seq - right.seq)
    .map((entry) => entry.card);
}

function mapSourceReasonFromError(error: unknown): LoadReason {
  if (error instanceof WorkerApiRequestError) {
    if (error.status === 401 || error.envelope.code === "unauthorized") {
      return "unauthorized";
    }

    if (error.status === 403 || error.envelope.code === "forbidden") {
      return "forbidden";
    }

    if (error.status === 424 || error.envelope.code === "app_server_unavailable") {
      return "app_server_unavailable";
    }
  }

  return "request_failure";
}

function createSourceFromError(error: unknown): WorkbenchData["source"] {
  if (error instanceof WorkerApiRequestError) {
    return createWorkbenchSource(mapSourceReasonFromError(error), toSourceErrorEnvelope(error.envelope));
  }

  return createWorkbenchSource("request_failure");
}

function toSourceErrorEnvelope(error: {
  code: string;
  message: string;
  details?: ErrorEnvelope["details"];
  requestId?: string;
}): SourceErrorEnvelope {
  const sourceError: SourceErrorEnvelope = {
    code: error.code,
    message: error.message,
  };

  if (error.details !== undefined) {
    sourceError.details = error.details;
  }

  if (error.requestId !== undefined) {
    sourceError.requestId = error.requestId;
  }

  return sourceError;
}

function createSearchRecents(
  conversations: readonly CodexConversation[],
  selectedConversationKey?: string | null,
): SearchRecent[] {
  return conversations.map((conversation) => {
    const conversationKey = createConversationKey(conversation);
    const result: SearchRecent = {
      conversationId: conversation.id,
      conversationKey,
      title: conversation.title,
      project: conversation.projectName,
    };

    if (selectedConversationKey === conversationKey) {
      result.active = true;
    }

    if (conversation.status === "waiting") {
      result.marker = true;
    }

    return result;
  });
}

export async function loadWorkbenchData(options: LoadWorkbenchDataOptions): Promise<WorkbenchData> {
  if (!options.token) {
    return createFallbackWorkbenchData("not_configured", options.selectedConversationKey);
  }
  const client = new WorkerApiClient({
    baseUrl: options.baseUrl,
    token: options.token,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  try {
    const devices = await client.listDevices();
    const conversations = await client.listConversations();
    const projects = await client.listProjects();
    let tasks: BoardTask[] = [];
    let taskError: unknown = null;
    try {
      tasks = await client.listTasks();
    } catch (error: unknown) {
      taskError = error;
    }

    const selectedConversation = findConversationByKey(conversations, options.selectedConversationKey) ?? conversations[0];
    const timelineConversationKey = selectedConversation ? createConversationKey(selectedConversation) : conversations[0] ? createConversationKey(conversations[0]) : null;
    const timelineConversationId = selectedConversation?.id ?? conversations[0]?.id ?? null;
    const timelineDeviceId = selectedConversation?.deviceId ?? conversations[0]?.deviceId ?? null;

    let timeline: ConversationTimeline | null = null;
    let timelineError: unknown = null;
    if (timelineDeviceId && timelineConversationId) {
      try {
        timeline = await client.getTimeline(timelineDeviceId, timelineConversationId);
      } catch (error: unknown) {
        timelineError = error;
      }
    }

    const assistantThreads = createAssistantThreadsFromConversations(
      conversations,
      timelineConversationKey,
      timeline ?? undefined,
      timelineError && timelineConversationKey ? timelineConversationKey : null,
    );
    const approvalCards = projectApprovalCards(timeline);

    if (timelineError) {
      return {
        source: createSourceFromError(timelineError),
        taskSource: taskError ? { status: "failed" } : { status: "loaded" },
        devices,
        projects,
        conversations,
        approvalCards: [],
        tasks,
        assistantThreads,
        searchRecents: createSearchRecents(conversations, options.selectedConversationKey),
      };
    }

    if (taskError) {
      return {
        source: createWorkbenchSource("loaded"),
        taskSource: { status: "failed" },
        devices,
        projects,
        conversations,
        approvalCards,
        tasks: [],
        assistantThreads,
        searchRecents: createSearchRecents(conversations, options.selectedConversationKey),
      };
    }

    return {
      source: createWorkbenchSource("loaded"),
      taskSource: { status: "loaded" },
      devices,
      projects,
      conversations,
      approvalCards,
      tasks,
      assistantThreads,
      searchRecents: createSearchRecents(conversations, options.selectedConversationKey),
    };
  } catch (error: unknown) {
    const source = createSourceFromError(error);
    return createFallbackWorkbenchData(source.reason, options.selectedConversationKey, source.error);
  }
}
