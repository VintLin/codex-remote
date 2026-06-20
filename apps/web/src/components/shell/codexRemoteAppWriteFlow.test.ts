import assert from "node:assert/strict";
import test from "node:test";

import { readWebSource } from "../../test-support/sourcePaths.ts";

test("codex remote app when follow-up submit is wired, should call Worker API and refresh selected conversation", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const controllerSource = readWebSource("components/shell/followUpSubmitController.ts");

  assert.match(shellSource, /new WorkerApiClient/);
  assert.match(shellSource, /submitConversationFollowUp/);
  assert.match(shellSource, /crypto\.randomUUID/);
  assert.match(shellSource, /loadWorkbenchData/);
  assert.match(shellSource, /setWorkbenchData/);
  assert.match(controllerSource, /followUpConversation/);
  assert.match(controllerSource, /clientRequestId/);
  assert.match(controllerSource, /expectedConversationId/);
  assert.doesNotMatch(`${shellSource}\n${controllerSource}`, /StartConversationInput|startConversation/);
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
