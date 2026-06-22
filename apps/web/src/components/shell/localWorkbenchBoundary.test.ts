import assert from "node:assert/strict";
import test from "node:test";

import { readWebSource } from "../../test-support/sourcePaths.ts";

const webSources = [
  "data/workerApi/client.ts",
  "data/workerApi/workbenchData.ts",
  "components/sidebar/sidebar.tsx",
  "components/detail/main-panels.tsx",
  "components/shell/codex-remote-app.tsx",
].map((path) => ({ path, source: readWebSource(path) }));

test("local workbench Web source when rendered should stay on public API boundary", () => {
  const offenders = webSources
    .filter((entry) => entry.source.includes("@codex-remote/codex-protocol"))
    .map((entry) => entry.path);

  assert.deepEqual(offenders, []);
});

test("runtime settings Web source when rendered should stay on public API boundary", () => {
  const offenders = webSources
    .filter((entry) => entry.source.includes("@codex-remote/codex-protocol"))
    .map((entry) => entry.path);
  const combined = webSources.map((entry) => entry.source).join("\n");

  assert.deepEqual(offenders, []);
  assert.match(combined, /RuntimeSettingsSummary/);
  assert.match(combined, /getRuntimeSettingsSummary/);
  assert.match(combined, /runtime-settings/);
});

test("review-start Web source when rendered should stay on public contract and avoid raw protocol actions", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const clientSource = readWebSource("data/workerApi/client.ts");
  const combined = `${shellSource}\n${mainPanelsSource}\n${clientSource}`;
  const forbiddenMarkers = [
    "@codex-remote/codex-protocol",
    "ReviewTarget",
    "baseBranch",
    "commitReview",
    "customInstructions",
    "thread/shellCommand",
    "command/exec",
    "shellCommand",
  ];
  const offenders = forbiddenMarkers.filter((marker) => combined.includes(marker));

  assert.deepEqual(offenders, []);
  assert.match(clientSource, /StartReviewInput/);
  assert.match(clientSource, /local-actions\/review-start/);
  assert.doesNotMatch(mainPanelsSource, /review\/start/);
});

test("local workbench Web source when rendered should not reference raw leak marker fields", () => {
  const forbiddenMarkers = [
    "absolutePath",
    "rawCommand",
    "rawOutput",
    "commandText",
    "fullDiff",
    "diffHunk",
    "jsonRpc",
    "appServerUrl",
    "sourcePath",
    "marketplacePath",
    "contents",
  ];
  const offenders = webSources.flatMap((entry) =>
    forbiddenMarkers
      .filter((marker) => entry.source.includes(marker))
      .map((marker) => `${entry.path}:${marker}`),
  );

  assert.deepEqual(offenders, []);
});

test("runtime settings UI source should render read-only summary without raw leak marker fields", () => {
  const combined = webSources.map((entry) => entry.source).join("\n");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const expectedUiMarkers = [
    "Runtime & Settings",
    "Models",
    "Provider capabilities",
    "Account",
    "Config posture",
    "Permission profiles",
    "Experimental features",
    "section statuses",
  ];
  const forbiddenMarkers = [
    "authToken",
    "apiKey",
    "rawConfig",
    "layers",
    "developerInstructions",
    "compactPrompt",
    "cwd",
    "absolutePath",
    "jsonRpc",
    "appServerUrl",
    "stack",
    "cause",
    "stdout",
    "stderr",
    "fullDiff",
    "rawPrompt",
  ];
  const missing = expectedUiMarkers.filter((marker) => !combined.includes(marker));
  const offenders = forbiddenMarkers.filter((marker) => mainPanelsSource.includes(marker));

  assert.deepEqual(missing, []);
  assert.deepEqual(offenders, []);
});

test("runtime settings SettingsPage source should keep archive restore and avoid unsupported write controls", () => {
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const combined = `${mainPanelsSource}\n${shellSource}`;
  const unsupportedActionMarkers = [
    "login",
    "logout",
    "model switch",
    "模型切换",
    "config write",
    "写入配置",
    "experimental enable",
    "启用实验",
    "permissionProfile/list",
    "account/login",
    "account/logout",
    "config/value/write",
    "experimentalFeature/enablement/set",
  ];

  assert.match(mainPanelsSource, /RuntimeSettingsPanel/);
  assert.match(mainPanelsSource, /已归档对话/);
  assert.match(mainPanelsSource, /onRestoreConversation/);
  assert.match(shellSource, /runtimeSettings=\{runtimeSettings\}/);
  assert.deepEqual(unsupportedActionMarkers.filter((marker) => combined.includes(marker)), []);
});

test("advanced platform Web source when rendered should stay on public API boundary", () => {
  const combined = webSources.map((entry) => entry.source).join("\n");

  assert.deepEqual(
    webSources
      .filter((entry) => entry.source.includes("@codex-remote/codex-protocol"))
      .map((entry) => entry.path),
    [],
  );
  assert.match(combined, /AdvancedPlatformReadinessSummary/);
  assert.match(combined, /getAdvancedPlatformReadinessSummary/);
  assert.match(combined, /advanced-platform-readiness/);
});

test("advanced platform SettingsPage source should render read-only panel without unsafe raw fields", () => {
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const workbenchSource = readWebSource("data/workerApi/workbenchData.ts");
  const combined = `${mainPanelsSource}\n${shellSource}\n${workbenchSource}`;
  const expectedUiMarkers = [
    "Advanced Platform",
    "Windows sandbox",
    "Support matrix",
    "AdvancedPlatformPanel",
    "advancedPlatform={advancedPlatform}",
  ];
  const forbiddenMarkers = [
    "authToken",
    "apiKey",
    "appServerUrl",
    "absolutePath",
    "privatePath",
    "cwd",
    "home",
    "hostname",
    "username",
    "env",
    "jsonRpc",
    "rawJsonRpc",
    "logs",
    "rawPrompt",
    "prompt",
    "stdout",
    "stderr",
    "command output",
    "fullDiff",
    "stack",
    "cause",
  ];

  assert.deepEqual(expectedUiMarkers.filter((marker) => !combined.includes(marker)), []);
  assert.deepEqual(forbiddenMarkers.filter((marker) => mainPanelsSource.includes(marker)), []);
});

test("advanced platform SettingsPage source should keep archive restore and avoid unsupported action controls", () => {
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const combined = `${mainPanelsSource}\n${shellSource}`;
  const unsupportedActionMarkers = [
    "feedback/upload",
    "externalAgentConfig/detect",
    "externalAgentConfig/import",
    "windowsSandbox/setupStart",
    "realtime/start",
    "remote-control",
    "automation/create",
    "Upload",
    "Import",
    "Setup",
    "Automate",
    "Start voice",
    "Remote control",
    "上传",
    "导入",
    "设置向导",
    "自动化",
    "远程控制",
  ];

  assert.match(mainPanelsSource, /RuntimeSettingsPanel/);
  assert.match(mainPanelsSource, /AdvancedPlatformPanel/);
  assert.match(mainPanelsSource, /已归档对话/);
  assert.match(mainPanelsSource, /onRestoreConversation/);
  assert.match(shellSource, /advancedPlatform=\{advancedPlatform\}/);
  assert.deepEqual(unsupportedActionMarkers.filter((marker) => combined.includes(marker)), []);
});

test("local workbench UI source should not render hooks commands skills contents command output or diff hunks", () => {
  const shellSource = [
    readWebSource("components/sidebar/sidebar.tsx"),
    readWebSource("components/detail/main-panels.tsx"),
    readWebSource("components/shell/codex-remote-app.tsx"),
  ].join("\n");
  const forbiddenUiPhrases = [
    "hook.command",
    "skill.contents",
    "command output",
    "raw diff",
    "@@",
  ];
  const offenders = forbiddenUiPhrases.filter((phrase) => shellSource.includes(phrase));

  assert.deepEqual(offenders, []);
});

test("local workbench UI source should expose compact read-only local tools without unsupported actions", () => {
  const sidebarSource = readWebSource("components/sidebar/sidebar.tsx");
  const mainPanelsSource = readWebSource("components/detail/main-panels.tsx");
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const expectedUiMarkers = [
    "Local Tools",
    "Files",
    "Git/Review",
    "Search",
    "MCP",
    "Extensions",
    "搜索本地项目文件",
    "LocalWorkbenchPage",
  ];
  const missing = expectedUiMarkers.filter((marker) => !`${sidebarSource}\n${mainPanelsSource}\n${shellSource}`.includes(marker));
  const unsupportedActionMarkers = [
    "mcpServer/tool/call",
    "plugin install",
    "shell command",
    "写入文件",
  ];
  const unsupported = unsupportedActionMarkers.filter((marker) => mainPanelsSource.includes(marker));

  assert.deepEqual(missing, []);
  assert.deepEqual(unsupported, []);
});
