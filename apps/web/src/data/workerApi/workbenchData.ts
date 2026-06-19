import type { Device, RemoteProject, CodexConversation } from "@codex-remote/api-contract";
import type { AssistantThreadSnapshot } from "../../domain/assistant/assistantTimeline.ts";

import { conversations as mockConversations, devices as mockDevices, sidebarProjects as mockProjects } from "../app-server/mockData.ts";

import { WorkerApiClient } from "./client.ts";

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

  new WorkerApiClient({
    baseUrl: options.baseUrl,
    token: options.token,
    fetchImpl: options.fetchImpl,
  });

  return createFallbackWorkbenchData("request_failure", options.selectedConversationId);
}
