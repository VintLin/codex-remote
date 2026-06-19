import type {
  ConversationTimeline,
  ConversationTimelineTurn,
  Device,
  RemoteProject,
  CodexConversation,
  WorkerHealth,
} from "@codex-remote/api-contract";

import type { AssistantTimelineTurn, AssistantThreadSnapshot } from "../../domain/assistant/assistantTimeline.ts";

import { conversations as mockConversations, devices as mockDevices, sidebarProjects as mockProjects } from "../app-server/mockData.ts";

import { WorkerApiClient, WorkerApiRequestError } from "./client.ts";

export interface SearchRecent {
  conversationId: string;
  title: string;
  project: string;
  active?: boolean;
  marker?: boolean;
}

export interface WorkbenchData {
  source: {
    reason: "not_configured" | "unauthorized" | "forbidden" | "app_server_unavailable" | "request_failure";
  };
  devices: Device[];
  projects: RemoteProject[];
  conversations: CodexConversation[];
  assistantThreads: AssistantThreadSnapshot[];
  searchRecents: SearchRecent[];
}

export interface LoadWorkbenchDataOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  selectedConversationId?: string | null;
}

type LoadReason = WorkbenchData["source"]["reason"];

const fallbackCurrentProject = "未选择项目";

export function createFallbackWorkbenchData(
  reason: WorkbenchData["source"]["reason"],
  selectedConversationId?: string | null,
): WorkbenchData {
  const conversations = [...mockConversations];

  return {
    source: { reason },
    devices: [...mockDevices],
    projects: [...mockProjects],
    conversations,
    assistantThreads: createMetadataOnlyAssistantThreads(conversations),
    searchRecents: createSearchRecents(conversations, selectedConversationId),
  };
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
    nodes: [
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

function createAssistantThreadsFromConversations(
  conversations: readonly CodexConversation[],
  selectedTimelineConversationId?: string | null,
  timeline?: ConversationTimeline,
): AssistantThreadSnapshot[] {
  return conversations.map((conversation) => {
    if (selectedTimelineConversationId !== conversation.id || !timeline) {
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

function createDeviceFromWorkerHealth(health: WorkerHealth, baseUrl: string, conversations: readonly CodexConversation[]): Device {
  const currentProject = conversations[0]?.projectName ?? fallbackCurrentProject;

  return {
    id: health.deviceId,
    icon: health.deviceId.slice(0, 2).toUpperCase(),
    name: health.deviceId,
    status: health.status === "connected" ? "Connected" : "Not connected",
    ip: safeWorkerHost(baseUrl),
    lastOnlineAt: health.checkedAt,
    currentProject,
    model: "Codex",
  };
}

function createProjectsFromConversations(conversations: readonly CodexConversation[]): RemoteProject[] {
  const seenProjects = new Set<string>();

  return conversations.flatMap((conversation) => {
    if (!conversation.projectId) {
      return [];
    }

    if (seenProjects.has(conversation.projectId)) {
      return [];
    }

    seenProjects.add(conversation.projectId);

    return [
      {
        id: conversation.projectId,
        name: conversation.projectName,
        deviceId: conversation.deviceId,
        path: "",
        branch: "unknown",
        hasChanges: false,
        pinned: false,
        expanded: seenProjects.size === 1,
      },
    ];
  });
}

function safeWorkerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "unknown";
  }
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

function createSearchRecents(
  conversations: readonly CodexConversation[],
  selectedConversationId?: string | null,
): SearchRecent[] {
  return conversations.map((conversation) => {
    const result: SearchRecent = {
      conversationId: conversation.id,
      title: conversation.title,
      project: conversation.projectName,
    };

    if (selectedConversationId === conversation.id) {
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
    return createFallbackWorkbenchData("not_configured", options.selectedConversationId);
  }
  const client = new WorkerApiClient({
    baseUrl: options.baseUrl,
    token: options.token,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  try {
    const workerHealth = await client.getHealth();
    const capabilities = await client.getCapabilities();
    const conversations = await client.listConversations();

    const selectedConversation = options.selectedConversationId
      ? conversations.find((item) => item.id === options.selectedConversationId)
      : conversations[0];
    const timelineConversationId = selectedConversation?.id ?? conversations[0]?.id ?? null;

    let timeline: ConversationTimeline | null = null;
    if (capabilities.canReadTimeline && timelineConversationId) {
      timeline = await client.getTimeline(timelineConversationId);
    }

    const assistantThreads = createAssistantThreadsFromConversations(
      conversations,
      timelineConversationId,
      timeline ?? undefined,
    );

    return {
      source: { reason: "request_failure" },
      devices: [createDeviceFromWorkerHealth(workerHealth, options.baseUrl, conversations)],
      projects: createProjectsFromConversations(conversations),
      conversations,
      assistantThreads,
      searchRecents: createSearchRecents(conversations, options.selectedConversationId),
    };
  } catch (error: unknown) {
    return createFallbackWorkbenchData(mapSourceReasonFromError(error), options.selectedConversationId);
  }
}
