import assert from "node:assert/strict";
import test from "node:test";

import { readWebSource } from "../../test-support/sourcePaths.ts";

test("codex remote app when follow-up submit is wired, should call Worker API and refresh selected conversation", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const controllerSource = readWebSource("components/shell/followUpSubmitController.ts");
  const startControllerSource = readWebSource("components/shell/startConversationSubmitController.ts");

  assert.match(shellSource, /new WorkerApiClient/);
  assert.match(shellSource, /submitConversationFollowUp/);
  assert.match(shellSource, /crypto\.randomUUID/);
  assert.match(shellSource, /loadWorkbenchData/);
  assert.match(shellSource, /setWorkbenchData/);
  assert.match(controllerSource, /followUpConversation/);
  assert.match(controllerSource, /clientRequestId/);
  assert.match(controllerSource, /expectedConversationId/);
  assert.match(`${shellSource}\n${startControllerSource}`, /startConversation/);
  assert.match(shellSource, /selectedProject/);
});

test("write flow: when selected device has no project, should not fall back to another device project", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");

  assert.ok(shellSource.includes("const selectedProject = projects.find((project) => project.deviceId === selectedDeviceId) ?? null;"));
  assert.ok(!shellSource.includes("selectedProject = projects.find((project) => project.deviceId === selectedDeviceId) ?? projects[0]"));
  assert.match(shellSource, /selectedProject !== null/);
  assert.ok(shellSource.includes("deviceId: selectedProject?.deviceId ?? null"));
  assert.ok(shellSource.includes("projectId: selectedProject?.id ?? null"));
});

test("write flow: when selected device or project changes, should reset start status", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");

  assert.match(shellSource, /setStartStatus\("idle"\);/);
  assert.ok(shellSource.includes("}, [selectedDeviceId, selectedProject?.id]);"));
});

test("codex remote app when selection changes, should refresh device-scoped approvals by conversation key", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");

  assert.match(shellSource, /refreshApprovals\(conversation \? createConversationKey\(conversation\) : null\)/);
  assert.match(shellSource, /\}, \[selectedConversationKey\]\);/);
  assert.doesNotMatch(shellSource, /refreshApprovals\(conversation\?\.id \?\? null\)/);
  assert.doesNotMatch(shellSource, /\[assistantThread\?\.id, conversation\?\.id\]/);
});

test("codex remote app when task board is wired, should create tasks and link the selected device conversation", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const sidebarSource = readWebSource("components/sidebar/sidebar.tsx");

  assert.match(sidebarSource, /label="任务"/);
  assert.doesNotMatch(mainPanelsSource, /暂无自动化 mock/);
  assert.match(mainPanelsSource, /TaskBoardPage/);
  assert.match(mainPanelsSource, /aria-label="Task title"/);
  assert.match(mainPanelsSource, /onCreateTask/);
  assert.match(mainPanelsSource, /onLinkSelectedConversation/);
  assert.match(mainPanelsSource, /\$\{title\} · \$\{link\.deviceId\}/);
  assert.match(shellSource, /tasks/);
  assert.match(shellSource, /createTask\(\{ title: taskTitle, clientRequestId: crypto\.randomUUID\(\) \}\)/);
  assert.match(shellSource, /projectId: conversation\.projectId/);
  assert.match(shellSource, /unlinkTaskConversation\(task\.id, link\.deviceId, link\.conversationId\)/);
});

test("codex remote app when task loading fails, should render task failure separately from empty task success", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");

  assert.match(shellSource, /taskSource/);
  assert.match(mainPanelsSource, /taskLoadState/);
  assert.match(mainPanelsSource, /无法加载任务/);
  assert.match(mainPanelsSource, /稍后刷新或重试任务操作。/);
  assert.match(mainPanelsSource, /暂无任务/);
  assert.match(mainPanelsSource, /taskLoadState === "failed"/);
  assert.doesNotMatch(mainPanelsSource, /taskSource\.error|taskLoadError|taskError/);
});

test("codex remote app when conversation is selected, should open conversation before refreshing snapshot", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");

  assert.match(shellSource, /openConversation/);
  assert.match(shellSource, /await workerClient\.openConversation/);
  assert.match(shellSource, /await refreshWorkbenchData\(conversationKey\)/);
  assert.match(shellSource, /await workerClient\.openConversation[\s\S]+await refreshWorkbenchData\(conversationKey\)/);
});

test("conversation workbench UI when lifecycle state exists, should expose badges and lifecycle actions", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const assistantThreadSource = readWebSource("components/conversation/codex-assistant-thread.tsx");
  const sidebarSource = readWebSource("components/sidebar/sidebar.tsx");
  const actionMenuSource = readWebSource("components/sidebar/action-menu.tsx");

  assert.match(sidebarSource, /conversation\.loaded/);
  assert.match(sidebarSource, /conversation\.live/);
  assert.match(sidebarSource, /conversation\.archived/);
  assert.match(mainPanelsSource, /Loaded|Live|Archived/);
  assert.match(mainPanelsSource, /approvalCards/);
  assert.match(assistantThreadSource, /status === "resolved"/);
  assert.match(actionMenuSource, /onRename/);
  assert.match(actionMenuSource, /onArchive/);
  assert.match(actionMenuSource, /onRestore/);
  assert.match(shellSource, /renameConversation/);
  assert.match(shellSource, /renamingConversationKey/);
  assert.match(mainPanelsSource, /aria-label="重命名对话"/);
  assert.match(mainPanelsSource, /maxLength=\{120\}/);
  assert.match(mainPanelsSource, /onBeginRenameConversation/);
  assert.match(shellSource, /archiveConversation/);
  assert.match(shellSource, /unarchiveConversation/);
  assert.doesNotMatch(shellSource, /window\.prompt/);
});

test("conversation workbench UI when composing messages, should keep start follow-up interrupt and steer in the composer", () => {
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const assistantThreadSource = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.doesNotMatch(mainPanelsSource, /<StartConversationStrip/);
  assert.doesNotMatch(mainPanelsSource, /<ConversationControlStrip/);
  assert.doesNotMatch(mainPanelsSource, /function StartConversationStrip/);
  assert.doesNotMatch(mainPanelsSource, /function ConversationControlStrip/);
  assert.match(mainPanelsSource, /canStartConversation=\{canStartConversation\}/);
  assert.match(mainPanelsSource, /onSubmitStart=\{onSubmitStart\}/);
  assert.match(mainPanelsSource, /onSubmitSteer=\{onSubmitSteer\}/);
  assert.match(assistantThreadSource, /composerMode/);
  assert.match(assistantThreadSource, /onSubmitStart/);
  assert.match(assistantThreadSource, /onSubmitSteer/);
  assert.match(assistantThreadSource, /新对话/);
  assert.match(assistantThreadSource, /排队发送/);
  assert.match(assistantThreadSource, /onQueueMessage/);
  assert.doesNotMatch(assistantThreadSource, /local queue/);
});

test("conversation workbench UI when enforcing Stage 11 boundaries, should avoid Worker fallback and route archived rows through settings", () => {
  const nextConfigSource = readWebSource("../next.config.ts");
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const sidebarModelSource = readWebSource("domain/sidebar/sidebarModel.ts");
  const sidebarSource = readWebSource("components/sidebar/sidebar.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");

  assert.ok(!nextConfigSource.includes("NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL"));
  assert.ok(!nextConfigSource.includes("NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN"));
  assert.ok(!shellSource.includes("NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ??\n  process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL"));
  assert.ok(!shellSource.includes("NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ??\n  process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN"));
  assert.match(sidebarModelSource, /visibleConversations = params\.conversations\.filter/);
  assert.match(sidebarModelSource, /conversation\.archived !== true/);
  assert.match(sidebarSource, /AppView = "conversation" \| "devices" \| "settings" \| "tasks"/);
  assert.match(sidebarSource, /onSelectView\("settings"\)/);
  assert.match(mainPanelsSource, /SettingsPage/);
  assert.match(mainPanelsSource, /已归档对话/);
  assert.match(mainPanelsSource, /onRestoreConversation/);
});

test("conversation workbench UI when rendering app-like conversation content, should keep safe placeholders and partial state", () => {
  const assistantThreadSource = readWebSource("components/conversation/codex-assistant-thread.tsx");
  const assistantTimelineSource = readWebSource("domain/assistant/assistantTimeline.ts");
  const workbenchDataSource = readWebSource("data/workerApi/workbenchData.ts");

  assert.match(assistantThreadSource, /disabled[\s\S]+TODO: review required/);
  assert.match(assistantThreadSource, /AssistantMessageActions/);
  assert.match(assistantThreadSource, /navigator\.clipboard/);
  assert.match(assistantThreadSource, /aria-label="派生"[\s\S]+disabled/);
  assert.match(assistantThreadSource, /aria-label="Hooks"[\s\S]+disabled/);
  assert.match(assistantTimelineSource, /itemsView: "full" \| "partial" \| "unknown"/);
  assert.match(workbenchDataSource, /itemsView: turn\.itemsView/);
});
