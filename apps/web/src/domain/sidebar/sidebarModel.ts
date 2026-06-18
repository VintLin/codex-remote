import type { CodexConversation, RemoteProject } from "@codex-remote/api-contract";

export interface SidebarProjectGroup extends RemoteProject {
  conversations: CodexConversation[];
  expanded: boolean;
}

export interface SidebarModel {
  pinnedProjects: SidebarProjectGroup[];
  projects: SidebarProjectGroup[];
  freeConversations: CodexConversation[];
}

export interface ConversationNavigatorState {
  nextConversationId: string | null;
  previousConversationId: string | null;
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

export function createSidebarModel(params: CreateSidebarModelParams): SidebarModel {
  const projectGroups = params.projects.map((project) => ({
    ...project,
    conversations: params.conversations.filter((conversation) => conversation.projectId === project.id),
    expanded: params.expandedProjectIds.has(project.id),
  }));

  return {
    pinnedProjects: projectGroups.filter((project) => project.pinned),
    projects: projectGroups.filter((project) => !project.pinned),
    freeConversations: params.conversations.filter((conversation) => !conversation.projectId && !conversation.pinned),
  };
}

export function resolveConversationNavigator(model: SidebarModel, selectedConversationId: string): ConversationNavigatorState {
  const projectGroup = [...model.pinnedProjects, ...model.projects].find((project) =>
    project.conversations.some((conversation) => conversation.id === selectedConversationId),
  );
  const conversationScope = projectGroup?.conversations ?? model.freeConversations;
  const selectedIndex = conversationScope.findIndex((conversation) => conversation.id === selectedConversationId);

  if (selectedIndex === -1) {
    return {
      nextConversationId: null,
      previousConversationId: null,
    };
  }

  return {
    nextConversationId: conversationScope[selectedIndex + 1]?.id ?? null,
    previousConversationId: conversationScope[selectedIndex - 1]?.id ?? null,
  };
}
