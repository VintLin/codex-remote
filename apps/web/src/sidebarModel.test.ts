import assert from "node:assert/strict";
import test from "node:test";

import { conversations, sidebarProjects } from "./mockData.ts";
import { createDefaultSidebarSectionState, createSidebarModel, toggleSidebarSection } from "./sidebarModel.ts";

test("when called with mock data, should group projects and conversations for the sidebar", () => {
  const model = createSidebarModel({
    conversations,
    expandedProjectIds: new Set(["project-c"]),
    projects: sidebarProjects,
  });

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
