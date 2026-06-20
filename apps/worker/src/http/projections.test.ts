import assert from "node:assert/strict";
import test from "node:test";

import type { v2 } from "@codex-remote/codex-protocol";

import {
  projectThreadToConversation,
  projectThreadToTimeline,
  projectTurnToTimelineTurn,
} from "./projections.ts";

const defaultContext = {
  allowedProjectRoot: "/Users/Vint/Repos/01_Project_Personal/050_codex_remote",
  deviceId: "device-local",
  projectName: "050_codex_remote",
  readCompletedAt: "2026-06-19T10:00:02.000Z",
  readStartedAt: "2026-06-19T10:00:00.000Z",
} as const;

test("worker http projections when projecting conversations, should use safe title fallbacks and ISO updatedAt", async (t) => {
  await t.test("when thread name and preview are present, should use project fallback and hide preview", () => {
    const conversation = projectThreadToConversation(
      createThread({
        name: "Named conversation",
        preview: "preview should not win",
        updatedAt: 1_718_791_234,
      }),
      defaultContext,
    );

    assert.deepEqual(conversation, {
      id: "thread-123",
      title: "050_codex_remote",
      deviceId: "device-local",
      projectName: "050_codex_remote",
      status: "running",
      updatedAt: new Date(1_718_791_234 * 1000).toISOString(),
      summary: "",
      sandbox: "unknown",
      approval: "unknown",
    });
  });

  await t.test("when thread name is empty, should fall back to project basename, then untitled", () => {
    const previewConversation = projectThreadToConversation(
      createThread({
        name: "",
        preview: "Preview title",
      }),
      defaultContext,
    );
    const projectConversation = projectThreadToConversation(
      createThread({
        cwd: "/outside/root/path-that-must-not-leak",
        name: null,
        preview: "",
      }),
      defaultContext,
    );
    const untitledConversation = projectThreadToConversation(
      createThread({
        cwd: "/outside/root/path-that-must-not-leak",
        name: null,
        preview: "   ",
      }),
      { ...defaultContext, allowedProjectRoot: "/", projectName: "" },
    );

    assert.equal(previewConversation.title, "050_codex_remote");
    assert.equal(previewConversation.summary, "");
    assert.equal(projectConversation.title, "050_codex_remote");
    assert.equal(untitledConversation.title, "Untitled conversation");
    assert.equal(untitledConversation.summary, "");
  });

  await t.test("when project name differs from allowed project root basename, should use basename for title fallback", () => {
    const conversation = projectThreadToConversation(
      createThread({
        name: null,
        preview: "",
      }),
      {
        ...defaultContext,
        allowedProjectRoot: "/tmp/real-project-root",
        projectName: "Display Name That Must Not Be Used For Title",
      },
    );

    assert.equal(conversation.title, "real-project-root");
    assert.equal(conversation.projectName, "Display Name That Must Not Be Used For Title");
  });

  await t.test("when app-server name and preview contain prompt text, should not expose them publicly", () => {
    const conversation = projectThreadToConversation(
      createThread({
        name: "codex-remote-calibration start: reply with one short sentence.",
        preview: "codex-remote-calibration start: reply with one short sentence.",
      }),
      defaultContext,
    );

    assert.equal(conversation.title, "050_codex_remote");
    assert.equal(conversation.summary, "");
  });
});

test("worker http projections when projecting timeline, should keep metadata only and derive deterministic snapshot revision", () => {
  const leakMarkers = {
    assistant: "LEAK_ASSISTANT_TEXT",
    command: "LEAK_COMMAND_OUTPUT",
    diff: "LEAK_FULL_DIFF",
    path: "/outside/root/LEAK_PATH",
    payload: "LEAK_RAW_ITEM_PAYLOAD",
    prompt: "LEAK_PROMPT_TEXT",
    toolArgs: "LEAK_TOOL_ARGS",
  } as const;

  const timeline = projectThreadToTimeline(
    createThread({
      cwd: leakMarkers.path,
      preview: leakMarkers.prompt,
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
      turns: [
        createTurn({
          completedAt: 60,
          durationMs: 40_000,
          id: "turn-completed",
          items: [
            {
              id: "item-1",
              payload: leakMarkers.payload,
              text: leakMarkers.assistant,
              toolArgs: leakMarkers.toolArgs,
            },
          ] as unknown as v2.Turn["items"],
          startedAt: 20,
          status: "completed",
        }),
        createTurn({
          completedAt: null,
          durationMs: null,
          id: "turn-in-progress",
          items: [
            {
              commandOutput: leakMarkers.command,
              diff: leakMarkers.diff,
              prompt: leakMarkers.prompt,
            },
          ] as unknown as v2.Turn["items"],
          startedAt: 80,
          status: "inProgress",
        }),
      ],
    }),
    defaultContext,
  );

  assert.deepEqual(timeline, {
    deviceId: "device-local",
    conversationId: "thread-123",
    readStartedAt: "2026-06-19T10:00:00.000Z",
    readCompletedAt: "2026-06-19T10:00:02.000Z",
    snapshotRevision: "thread-123:2026-06-19T10:00:02.000Z",
    runtimeStatus: "waiting_approval",
    latestTurnStatus: "unknown",
    turns: [
      {
        id: "turn-completed",
        status: "completed",
        startedAt: 20,
        completedAt: 60,
        durationMs: 40_000,
      },
      {
        id: "turn-in-progress",
        status: "in_progress",
        startedAt: 80,
        completedAt: null,
        durationMs: null,
      },
    ],
  });

  const serialized = JSON.stringify(timeline);

  assert.doesNotMatch(serialized, /LEAK_PROMPT_TEXT/);
  assert.doesNotMatch(serialized, /LEAK_ASSISTANT_TEXT/);
  assert.doesNotMatch(serialized, /LEAK_COMMAND_OUTPUT/);
  assert.doesNotMatch(serialized, /LEAK_FULL_DIFF/);
  assert.doesNotMatch(serialized, /LEAK_TOOL_ARGS/);
  assert.doesNotMatch(serialized, /LEAK_RAW_ITEM_PAYLOAD/);
  assert.doesNotMatch(serialized, /\/outside\/root\/LEAK_PATH/);
});

test("worker http projections when statuses are unknown, should map thread and turn states to unknown", () => {
  const conversation = projectThreadToConversation(
    createThread({
      status: { type: "mystery" } as unknown as v2.Thread["status"],
    }),
    defaultContext,
  );
  const timeline = projectThreadToTimeline(
    createThread({
      status: { type: "systemError" },
      turns: [createTurn({ status: "mystery" as unknown as v2.Turn["status"] })],
    }),
    defaultContext,
  );
  const turn = projectTurnToTimelineTurn(
    createTurn({
      status: "mystery" as unknown as v2.Turn["status"],
    }),
  );

  assert.equal(conversation.status, "unknown");
  assert.equal(timeline.runtimeStatus, "unknown");
  assert.equal(timeline.latestTurnStatus, "unknown");
  assert.deepEqual(turn, {
    id: "turn-123",
    status: "unknown",
    startedAt: 10,
    completedAt: 15,
    durationMs: 5_000,
  });
});

test("worker http projections when idle conversation has no supported latest turn status, should stay unknown instead of done", () => {
  const noTurnsConversation = projectThreadToConversation(
    createThread({
      status: { type: "idle" },
      turns: [],
    }),
    defaultContext,
  );
  const unknownLatestTurnConversation = projectThreadToConversation(
    createThread({
      status: { type: "idle" },
      turns: [createTurn({ status: "mystery" as unknown as v2.Turn["status"] })],
    }),
    defaultContext,
  );

  assert.equal(noTurnsConversation.status, "unknown");
  assert.equal(unknownLatestTurnConversation.status, "unknown");
});

function createThread(overrides: Partial<v2.Thread> = {}): v2.Thread {
  return {
    id: "thread-123",
    sessionId: "session-123",
    forkedFromId: null,
    parentThreadId: null,
    preview: "Thread preview",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1_718_791_200,
    updatedAt: 1_718_791_205,
    status: { type: "active", activeFlags: [] },
    path: "/tmp/thread.json",
    cwd: "/Users/Vint/Repos/01_Project_Personal/050_codex_remote" as v2.Thread["cwd"],
    cliVersion: "1.0.0",
    source: "cli",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
  };
}

function createTurn(overrides: Partial<v2.Turn> = {}): v2.Turn {
  return {
    id: "turn-123",
    items: [],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 10,
    completedAt: 15,
    durationMs: 5_000,
    ...overrides,
  };
}
