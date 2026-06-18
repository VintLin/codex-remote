import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultSidebarSectionState,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "./sidebarModel.ts";
import type { Conversation, SidebarProject } from "@codex-remote/api-contract";

const fixtureProjects: SidebarProject[] = [
  {
    id: "project-a",
    name: "Pinned A",
    deviceId: "device-a",
    path: "/projects/a",
    branch: "main",
    hasChanges: false,
    pinned: true,
  },
  {
    id: "project-b",
    name: "Pinned B",
    deviceId: "device-a",
    path: "/projects/b",
    branch: "main",
    hasChanges: true,
    pinned: true,
  },
  {
    id: "project-c",
    name: "Active Project",
    deviceId: "device-a",
    path: "/projects/c",
    branch: "feature/sidebar",
    hasChanges: false,
    pinned: false,
  },
];

const fixtureConversations: Conversation[] = [
  {
    id: "conversation-a",
    title: "Project conversation A",
    deviceId: "device-a",
    projectId: "project-c",
    projectName: "Active Project",
    status: "running",
    updatedAt: "刚刚",
    summary: "First project-scoped conversation.",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "conversation-b",
    title: "Project conversation B",
    deviceId: "device-a",
    projectId: "project-c",
    projectName: "Active Project",
    status: "done",
    updatedAt: "3 分钟前",
    summary: "Second project-scoped conversation.",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "conversation-c",
    title: "Free conversation C",
    deviceId: "device-a",
    projectName: "Loose work",
    status: "waiting",
    updatedAt: "6 分钟前",
    summary: "First free conversation.",
    sandbox: "read-only",
    approval: "on-request",
  },
  {
    id: "conversation-d",
    title: "Free conversation D",
    deviceId: "device-a",
    projectName: "Loose work",
    status: "failed",
    updatedAt: "9 分钟前",
    summary: "Second free conversation.",
    sandbox: "workspace-write",
    approval: "on-request",
  },
  {
    id: "conversation-pinned",
    title: "Pinned conversation",
    deviceId: "device-a",
    projectName: "Loose work",
    status: "done",
    updatedAt: "12 分钟前",
    summary: "Pinned free conversation should not appear in the free section.",
    sandbox: "workspace-write",
    approval: "never",
    pinned: true,
  },
];

function createFixtureModel() {
  return createSidebarModel({
    conversations: fixtureConversations,
    expandedProjectIds: new Set(["project-c"]),
    projects: fixtureProjects,
  });
}

test("when called with local fixtures, should group projects and conversations for the sidebar", () => {
  const model = createFixtureModel();

  assert.deepEqual(
    model.pinnedProjects.map((project) => project.id),
    ["project-a", "project-b"],
  );
  assert.deepEqual(
    model.projects.find((project) => project.id === "project-c")?.conversations.map((conversation) => conversation.id),
    ["conversation-a", "conversation-b"],
  );
  assert.deepEqual(
    model.freeConversations.map((conversation) => conversation.id),
    ["conversation-c", "conversation-d"],
  );
});

test("when toggling a sidebar section, should only change that section", () => {
  const state = createDefaultSidebarSectionState();
  const collapsedProjects = toggleSidebarSection(state, "projects");
  const expandedProjects = toggleSidebarSection(collapsedProjects, "projects");

  assert.equal(state.pinned, true);
  assert.equal(state.projects, true);
  assert.equal(state.conversations, true);
  assert.deepEqual(collapsedProjects, {
    conversations: true,
    pinned: true,
    projects: false,
  });
  assert.deepEqual(expandedProjects, state);
});

test("when resolving project conversations, should navigate only inside the selected project", () => {
  const model = createFixtureModel();

  assert.deepEqual(resolveConversationNavigator(model, "conversation-a"), {
    nextConversationId: "conversation-b",
    previousConversationId: null,
  });
  assert.deepEqual(resolveConversationNavigator(model, "conversation-b"), {
    nextConversationId: null,
    previousConversationId: "conversation-a",
  });
});

test("when resolving free conversations, should navigate inside the conversation section", () => {
  const model = createFixtureModel();

  assert.deepEqual(resolveConversationNavigator(model, "conversation-c"), {
    nextConversationId: "conversation-d",
    previousConversationId: null,
  });
  assert.deepEqual(resolveConversationNavigator(model, "conversation-d"), {
    nextConversationId: null,
    previousConversationId: "conversation-c",
  });
});

test("when resolving an unknown conversation, should disable both adjacent controls", () => {
  const model = createFixtureModel();

  assert.deepEqual(resolveConversationNavigator(model, "missing-conversation"), {
    nextConversationId: null,
    previousConversationId: null,
  });
});
