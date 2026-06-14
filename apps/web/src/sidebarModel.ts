import type { Conversation, SidebarProject } from "./mockData";

export interface SidebarProjectGroup extends SidebarProject {
  conversations: Conversation[];
  expanded: boolean;
}

export interface SidebarModel {
  pinnedProjects: SidebarProjectGroup[];
  projects: SidebarProjectGroup[];
  freeConversations: Conversation[];
}

export type SidebarSectionId = "pinned" | "projects" | "conversations";

export type SidebarSectionState = Record<SidebarSectionId, boolean>;

export interface CreateSidebarModelParams {
  conversations: Conversation[];
  expandedProjectIds: ReadonlySet<string>;
  projects: SidebarProject[];
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
