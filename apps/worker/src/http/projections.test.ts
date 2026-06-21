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
  projectId: "local-project",
  projectName: "050_codex_remote",
  readCompletedAt: "2026-06-19T10:00:02.000Z",
  readStartedAt: "2026-06-19T10:00:00.000Z",
} as const;

test("worker http projections when projecting conversations, should use safe title fallbacks and ISO updatedAt", async (t) => {
  await t.test("when thread name and preview are present, should use trimmed name and hide preview", () => {
    const conversation = projectThreadToConversation(
      createThread({
        name: "  Named conversation  ",
        preview: "preview should not win",
        updatedAt: 1_718_791_234,
      }),
      defaultContext,
    );

    assert.deepEqual(conversation, {
      id: "thread-123",
      title: "Named conversation",
      deviceId: "device-local",
      projectId: "local-project",
      projectName: "050_codex_remote",
      status: "running",
      updatedAt: new Date(1_718_791_234 * 1000).toISOString(),
      summary: "",
      sandbox: "unknown",
      approval: "unknown",
      archived: false,
      loaded: false,
      live: false,
    });
  });

  await t.test("when thread name is empty, should fall back to project basename, then untitled without using preview", () => {
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

  await t.test("when app-server preview contains prompt text, should not expose it publicly", () => {
    const conversation = projectThreadToConversation(
      createThread({
        name: "Safe thread name",
        preview: "codex-remote-calibration start: reply with one short sentence.",
      }),
      defaultContext,
    );

    assert.equal(conversation.title, "Safe thread name");
    assert.equal(conversation.summary, "");
  });
});

test("worker http projections when projecting timeline, should expose safe nodes and derive deterministic snapshot revision", () => {
  const leakMarkers = {
    assistant: "LEAK_ASSISTANT_TEXT",
    command: "echo LEAK_COMMAND",
    commandOutput: "LEAK_COMMAND_OUTPUT",
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
              id: "user-1",
              clientId: null,
              type: "userMessage",
              content: [{ type: "text", text: "User visible text", text_elements: [] }],
            },
            {
              id: "assistant-1",
              type: "agentMessage",
              text: leakMarkers.assistant,
              phase: null,
              memoryCitation: null,
            },
            {
              id: "command-1",
              type: "commandExecution",
              command: leakMarkers.command,
              cwd: leakMarkers.path,
              processId: null,
              source: "agent",
              status: "completed",
              commandActions: [],
              aggregatedOutput: leakMarkers.commandOutput,
              exitCode: 0,
              durationMs: 12,
            },
          ] satisfies v2.Turn["items"],
          itemsView: "full",
          startedAt: 20,
          status: "completed",
        }),
        createTurn({
          completedAt: null,
          durationMs: null,
          id: "turn-in-progress",
          items: [
            {
              id: "file-1",
              type: "fileChange",
              changes: [{ path: leakMarkers.path, kind: { type: "update", move_path: leakMarkers.path }, diff: leakMarkers.diff }],
              status: "inProgress",
            },
            {
              id: "mcp-1",
              type: "mcpToolCall",
              server: "safe-server",
              tool: "safe-tool",
              status: "completed",
              arguments: { leak: leakMarkers.toolArgs },
              pluginId: null,
              result: null,
              error: null,
              durationMs: null,
            },
            {
              id: "agent-1",
              type: "collabAgentToolCall",
              tool: "spawnAgent",
              status: "inProgress",
              senderThreadId: "thread-123",
              receiverThreadIds: [],
              prompt: leakMarkers.prompt,
              model: null,
              reasoningEffort: null,
              agentsStates: {},
            },
          ] satisfies v2.Turn["items"],
          itemsView: "summary",
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
    projectId: "local-project",
    readStartedAt: "2026-06-19T10:00:00.000Z",
    readCompletedAt: "2026-06-19T10:00:02.000Z",
    snapshotRevision: "thread-123:2026-06-19T10:00:02.000Z",
    runtimeStatus: "waiting_approval",
    latestTurnStatus: "unknown",
    loaded: false,
    live: false,
    archived: false,
    turns: [
      {
        id: "turn-completed",
        status: "completed",
        startedAt: 20,
        completedAt: 60,
        durationMs: 40_000,
        itemsView: "full",
        nodes: [
          {
            id: "user-1:0",
            type: "text",
            role: "user",
            text: "User visible text",
          },
          {
            id: "assistant-1",
            type: "text",
            role: "assistant",
            text: leakMarkers.assistant,
          },
          {
            id: "command-1",
            type: "tool",
            kind: "command",
            status: "completed",
            label: "Command execution",
          },
        ],
      },
      {
        id: "turn-in-progress",
        status: "in_progress",
        startedAt: 80,
        completedAt: null,
        durationMs: null,
        itemsView: "partial",
        nodes: [
          {
            id: "file-1",
            type: "tool",
            kind: "file_change",
            status: "running",
            label: "File changes · 1",
          },
          {
            id: "mcp-1",
            type: "tool",
            kind: "mcp",
            status: "completed",
            label: "safe-tool",
          },
          {
            id: "turn-in-progress:agent-1",
            type: "context",
            text: "Agent task",
          },
        ],
      },
    ],
    events: [],
  });

  const serialized = JSON.stringify(timeline);

  assert.doesNotMatch(serialized, /LEAK_PROMPT_TEXT/);
  assert.match(serialized, /LEAK_ASSISTANT_TEXT/);
  assert.match(serialized, /User visible text/);
  assert.doesNotMatch(serialized, /echo LEAK_COMMAND/);
  assert.doesNotMatch(serialized, /LEAK_COMMAND_OUTPUT/);
  assert.doesNotMatch(serialized, /LEAK_FULL_DIFF/);
  assert.doesNotMatch(serialized, /LEAK_TOOL_ARGS/);
  assert.doesNotMatch(serialized, /LEAK_RAW_ITEM_PAYLOAD/);
  assert.doesNotMatch(serialized, /\/outside\/root\/LEAK_PATH/);
});

test("worker http projections when projecting timeline events, should include lifecycle flags and sanitized approval cards", () => {
  const timeline = projectThreadToTimeline(
    createThread({
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
    }),
    {
      ...defaultContext,
      archived: true,
      loadedThreadIds: new Set(["thread-123"]),
      approvals: [
        {
          id: "approval-1",
          conversationId: "thread-123",
          turnId: "turn-123",
          itemId: "item-1",
          kind: "command_execution",
          status: "pending",
          startedAt: "2026-06-19T09:59:59.000Z",
          summary: "Command execution approval",
          risk: "medium",
        },
      ],
    },
  );

  assert.equal(timeline.archived, true);
  assert.equal(timeline.loaded, true);
  assert.equal(timeline.live, true);
  assert.deepEqual(timeline.events, [
    {
      eventId: "thread-123:1:approval-1:pending",
      seq: 1,
      deviceId: "device-local",
      conversationId: "thread-123",
      kind: "approval_pending",
      createdAt: "2026-06-19T09:59:59.000Z",
      source: "snapshot",
      approvalCard: {
        id: "approval-1",
        conversationId: "thread-123",
        turnId: "turn-123",
        itemId: "item-1",
        kind: "command_execution",
        status: "pending",
        title: "Command execution approval",
        summary: "Command execution approval",
        risk: "medium",
        createdAt: "2026-06-19T09:59:59.000Z",
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(timeline), /SECRET_TOKEN|\/Users\/vint\/private|jsonrpc|LEAK_PROMPT/);
});

test("worker http projections when projecting resolved approvals, should emit resolved events and cards", () => {
  const timeline = projectThreadToTimeline(
    createThread({
      status: { type: "idle" },
    }),
    {
      ...defaultContext,
      approvals: [
        {
          id: "approval-1",
          conversationId: "thread-123",
          turnId: "turn-123",
          itemId: "item-1",
          kind: "command_execution",
          status: "resolved",
          startedAt: "2026-06-19T09:59:59.000Z",
          resolvedAt: "2026-06-19T10:00:03.000Z",
          summary: "Command execution approval",
          risk: "medium",
        },
      ],
    },
  );

  assert.deepEqual(timeline.events, [
    {
      eventId: "thread-123:1:approval-1:resolved",
      seq: 1,
      deviceId: "device-local",
      conversationId: "thread-123",
      kind: "approval_resolved",
      createdAt: "2026-06-19T10:00:03.000Z",
      source: "snapshot",
      approvalCard: {
        id: "approval-1",
        conversationId: "thread-123",
        turnId: "turn-123",
        itemId: "item-1",
        kind: "command_execution",
        status: "resolved",
        title: "Command execution approval",
        summary: "Command execution approval",
        risk: "medium",
        createdAt: "2026-06-19T09:59:59.000Z",
        resolvedAt: "2026-06-19T10:00:03.000Z",
      },
    },
  ]);
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
    itemsView: "full",
    nodes: [
      {
        id: "turn-123:status",
        type: "context",
        text: "turn unknown",
      },
    ],
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
