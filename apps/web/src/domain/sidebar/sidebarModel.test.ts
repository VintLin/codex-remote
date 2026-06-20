import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultSidebarSectionState,
  createProjectKey,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "./sidebarModel.ts";
import { createConversationKey } from "./conversationIdentity.ts";
import type { CodexConversation, RemoteProject } from "@codex-remote/api-contract";

const fixtureProjects: RemoteProject[] = [
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

const fixtureConversations: CodexConversation[] = [
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

test("when project ids collide across devices, should group by device-scoped project key", () => {
  const projects: RemoteProject[] = [
    {
      id: "shared-project",
      name: "Shared A",
      deviceId: "device-a",
      path: "/projects/shared",
      branch: "main",
      hasChanges: false,
      pinned: false,
    },
    {
      id: "shared-project",
      name: "Shared B",
      deviceId: "device-b",
      path: "/projects/shared",
      branch: "main",
      hasChanges: false,
      pinned: false,
    },
  ];
  const conversations: CodexConversation[] = [
    {
      id: "conversation-a",
      title: "Shared project on A",
      deviceId: "device-a",
      projectId: "shared-project",
      projectName: "Shared A",
      status: "running",
      updatedAt: "刚刚",
      summary: "A device project.",
      sandbox: "workspace-write",
      approval: "never",
    },
    {
      id: "conversation-b",
      title: "Shared project on B",
      deviceId: "device-b",
      projectId: "shared-project",
      projectName: "Shared B",
      status: "running",
      updatedAt: "刚刚",
      summary: "B device project.",
      sandbox: "workspace-write",
      approval: "never",
    },
  ];

  const model = createSidebarModel({
    conversations,
    expandedProjectIds: new Set([createProjectKey(projects[1]!)]),
    projects,
  });

  assert.deepEqual(
    model.projects.map((project) => project.projectKey),
    projects.map((project) => createProjectKey(project)),
  );
  assert.deepEqual(model.projects[0]?.conversations.map((conversation) => createConversationKey(conversation)), [
    createConversationKey(conversations[0]!),
  ]);
  assert.deepEqual(model.projects[1]?.conversations.map((conversation) => createConversationKey(conversation)), [
    createConversationKey(conversations[1]!),
  ]);
  assert.equal(model.projects[0]?.expanded, false);
  assert.equal(model.projects[1]?.expanded, true);
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
  const conversationA = createConversationKey(fixtureConversations[0]!);
  const conversationB = createConversationKey(fixtureConversations[1]!);

  assert.deepEqual(resolveConversationNavigator(model, conversationA), {
    nextConversationKey: conversationB,
    previousConversationKey: null,
  });
  assert.deepEqual(resolveConversationNavigator(model, conversationB), {
    nextConversationKey: null,
    previousConversationKey: conversationA,
  });
});

test("when resolving free conversations, should navigate inside the conversation section", () => {
  const model = createFixtureModel();
  const conversationC = createConversationKey(fixtureConversations[2]!);
  const conversationD = createConversationKey(fixtureConversations[3]!);

  assert.deepEqual(resolveConversationNavigator(model, conversationC), {
    nextConversationKey: conversationD,
    previousConversationKey: null,
  });
  assert.deepEqual(resolveConversationNavigator(model, conversationD), {
    nextConversationKey: null,
    previousConversationKey: conversationC,
  });
});

test("when resolving an unknown conversation, should disable both adjacent controls", () => {
  const model = createFixtureModel();

  assert.deepEqual(resolveConversationNavigator(model, "missing-conversation"), {
    nextConversationKey: null,
    previousConversationKey: null,
  });
});
