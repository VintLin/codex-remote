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
    "review/start",
    "mcpServer/tool/call",
    "plugin install",
    "shell command",
    "写入文件",
  ];
  const unsupported = unsupportedActionMarkers.filter((marker) => mainPanelsSource.includes(marker));

  assert.deepEqual(missing, []);
  assert.deepEqual(unsupported, []);
});
