import type { CodexConversation, RemoteProject } from "@codex-remote/api-contract";

import { createConversationKey } from "./conversationIdentity.ts";

export interface SidebarProjectGroup extends RemoteProject {
  conversations: CodexConversation[];
  expanded: boolean;
  projectKey: string;
}

export interface SidebarModel {
  pinnedProjects: SidebarProjectGroup[];
  projects: SidebarProjectGroup[];
  freeConversations: CodexConversation[];
}

export interface ConversationNavigatorState {
  nextConversationKey: string | null;
  previousConversationKey: string | null;
}

export type SidebarSectionId = "pinned" | "projects" | "conversations";

export type SidebarSectionState = Record<SidebarSectionId, boolean>;

export interface CreateSidebarModelParams {
  conversations: CodexConversation[];
  expandedProjectIds: ReadonlySet<string>;
  projects: RemoteProject[];
}

export function createDefaultSidebarSectionState(): SidebarSectionState {
  return {
    conversations: true,
    pinned: true,
    projects: true,
  };
}

export function toggleSidebarSection(state: SidebarSectionState, sectionId: SidebarSectionId): SidebarSectionState {
  return {
    ...state,
    [sectionId]: !state[sectionId],
  };
}

export function createProjectKey(project: Pick<RemoteProject, "deviceId" | "id">): string {
  return `${project.deviceId}\u001f${project.id}`;
}

export function createSidebarModel(params: CreateSidebarModelParams): SidebarModel {
  const projectGroups = params.projects.map((project) => {
    const projectKey = createProjectKey(project);

    return {
      ...project,
      conversations: params.conversations.filter(
        (conversation) => conversation.projectId === project.id && conversation.deviceId === project.deviceId,
      ),
      expanded: params.expandedProjectIds.has(projectKey),
      projectKey,
    };
  });

  return {
    pinnedProjects: projectGroups.filter((project) => project.pinned),
    projects: projectGroups.filter((project) => !project.pinned),
    freeConversations: params.conversations.filter((conversation) => !conversation.projectId && !conversation.pinned),
  };
}

export function resolveConversationNavigator(model: SidebarModel, selectedConversationKey: string): ConversationNavigatorState {
  const projectGroup = [...model.pinnedProjects, ...model.projects].find((project) =>
    project.conversations.some((conversation) => createConversationKey(conversation) === selectedConversationKey),
  );
  const conversationScope = projectGroup?.conversations ?? model.freeConversations;
  const selectedIndex = conversationScope.findIndex((conversation) => createConversationKey(conversation) === selectedConversationKey);

  if (selectedIndex === -1) {
    return {
      nextConversationKey: null,
      previousConversationKey: null,
    };
  }

  return {
    nextConversationKey: conversationScope[selectedIndex + 1] ? createConversationKey(conversationScope[selectedIndex + 1]!) : null,
    previousConversationKey: conversationScope[selectedIndex - 1] ? createConversationKey(conversationScope[selectedIndex - 1]!) : null,
  };
}
