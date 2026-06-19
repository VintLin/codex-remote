import type { BoardTask, CodexConversation, Device, DiffLine, RemoteProject } from "@codex-remote/api-contract";
import type { SearchRecent } from "../workerApi/workbenchData.ts";
import {
  classifyLinkTarget,
  type AssistantThreadSnapshot,
} from "../../domain/assistant/assistantTimeline.ts";

export const devices: Device[] = [
  {
    id: "macbook",
    icon: "MB",
    name: "MacBook Pro M4",
    status: "Connected",
    ip: "192.168.1.24",
    lastOnlineAt: "10 分钟前",
    currentProject: "codex-remote",
    model: "GPT-5.4",
  },
];

export const sidebarProjects: RemoteProject[] = [
  {
    id: "project-codex-remote",
    name: "codex-remote",
    deviceId: "macbook",
    path: "/workspace/codex-remote",
    branch: "main",
    hasChanges: false,
    pinned: false,
    expanded: true,
  },
  {
    id: "project-example-worker",
    name: "Example worker",
    deviceId: "macbook",
    path: "/workspace/example-worker",
    branch: "main",
    hasChanges: false,
    pinned: true,
    expanded: false,
  },
];

export const conversations: CodexConversation[] = [
  {
    id: "demo-thread-running",
    title: "Worker probe spike",
    deviceId: "macbook",
    projectId: "project-codex-remote",
    projectName: "codex-remote",
    status: "running",
    updatedAt: "10 分钟前",
    summary: "Implement Worker probe and local app-server connection",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "demo-thread-review",
    title: "Status model review",
    deviceId: "macbook",
    projectId: "project-codex-remote",
    projectName: "codex-remote",
    status: "done",
    updatedAt: "2 小时前",
    summary: "Review app-server status projection and approval handling",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "demo-thread-projectless",
    title: "Loose planning note",
    deviceId: "macbook",
    projectName: "对话",
    status: "done",
    updatedAt: "3 小时前",
    summary: "Quick note without a project root",
    sandbox: "workspace-write",
    approval: "never",
  },
];

export const searchRecents: SearchRecent[] = conversations.map((conversation) => ({
  conversationId: conversation.id,
  title: conversation.title,
  project: conversation.projectName,
  ...(conversation.status === "waiting" ? { marker: true } : {}),
}));

export const tasks: BoardTask[] = [
  {
    id: "task-worker-probe",
    title: "codex-remote worker probe",
    status: "in_progress",
    linkedConversationIds: ["demo-thread-running", "demo-thread-review"],
  },
  {
    id: "task-loose-notes",
    title: "independent planning notes",
    status: "done",
    linkedConversationIds: ["demo-thread-projectless"],
  },
];

export const assistantThreads: AssistantThreadSnapshot[] = [
  createAssistantThread("demo-thread-running", {
    forkedFromId: null,
    parentThreadId: null,
    loadState: "loaded",
    timeline: {
      turns: [
        {
          id: "turn-running-1",
          status: "inProgress",
          startedAt: 1_781_653_300,
          completedAt: null,
          durationMs: null,
          nodes: [
            {
              type: "text",
              id: "user-running-1",
              turnId: "turn-running-1",
              sourceItemIds: ["user-running-1"],
              role: "user",
              text: "Create a read-only Worker probe.",
              links: [],
            },
            {
              type: "text",
              id: "agent-running-1",
              turnId: "turn-running-1",
              sourceItemIds: ["agent-running-1"],
              role: "assistant",
              text: "I will verify the first read-only calls before adding write actions.",
              links: [],
            },
            {
              type: "toolCall",
              id: "tool-running-1",
              turnId: "turn-running-1",
              sourceItemIds: ["tool-running-1"],
              kind: "mcpToolCall",
              status: "completed",
              defaultCollapsed: true,
              label: "已运行 codegraph Worker probe entrypoints",
              detailPlacement: "inline",
              detailTarget: {
                type: "tool",
                title: "codegraph",
                detail: "query: Worker probe entrypoints\n\nresult:\n{\"matches\":3}",
                presentation: "inline",
              },
            },
          ],
        },
      ],
    },
  }),
  createAssistantThread("demo-thread-review", {
    forkedFromId: null,
    parentThreadId: null,
    loadState: "loaded",
    timeline: {
      turns: [
        {
          id: "turn-review-1",
          status: "completed",
          startedAt: 1_781_646_500,
          completedAt: 1_781_647_200,
          durationMs: 700_000,
          nodes: [
            {
              type: "text",
              id: "user-review-1",
              turnId: "turn-review-1",
              sourceItemIds: ["user-review-1"],
              role: "user",
              text: "Check whether waiting approval should be an error.",
              links: [],
            },
            {
              type: "text",
              id: "agent-review-1",
              turnId: "turn-review-1",
              sourceItemIds: ["agent-review-1"],
              role: "assistant",
              text: "Approval should be projected as a pending server request, not a WorkerErrorKind.",
              links: [],
            },
            {
              type: "toolCall",
              id: "file-review-1",
              turnId: "turn-review-1",
              sourceItemIds: ["file-review-1"],
              kind: "fileChange",
              status: "completed",
              defaultCollapsed: true,
              label: "已编辑 1 个文件",
              detailPlacement: "workspace",
              detailTarget: {
                type: "diff",
                title: "status-model.md",
                changes: [
                  {
                    path: "/workspace/codex-remote/docs/specs/status-model.md",
                    changeKind: "modify",
                    diff: "@@ -1 +1 @@\n-status: done\n+runtimeStatus: idle\n",
                  },
                ],
              },
            },
            {
              type: "contextCompaction",
              id: "compact-review-1",
              turnId: "turn-review-1",
              sourceItemIds: ["compact-review-1"],
              text: "上下文已压缩",
            },
          ],
        },
      ],
    },
  }),
  createAssistantThread("demo-thread-projectless", {
    forkedFromId: null,
    parentThreadId: null,
    loadState: "empty",
    timeline: {
      turns: [
        {
          id: "turn-projectless-1",
          status: "completed",
          startedAt: 1_781_633_000,
          completedAt: 1_781_633_600,
          durationMs: 600_000,
          nodes: [
            {
              type: "text",
              id: "agent-projectless-1",
              turnId: "turn-projectless-1",
              sourceItemIds: ["agent-projectless-1"],
              role: "assistant",
              text: "Quick note without a project root. See [Worker plan](docs/plans/worker-probe.md).",
              links: [classifyLinkTarget("Worker plan", "docs/plans/worker-probe.md")],
            },
          ],
        },
      ],
    },
  }),
];

export const diffLines: DiffLine[] = [
  { line: 18, kind: "context", text: "export interface Device {" },
  { line: 19, kind: "remove", text: "  status: string;" },
  { line: 19, kind: "add", text: "  status: DeviceConnectionStatus;" },
  { line: 20, kind: "add", text: "  lastHeartbeatAt: string;" },
  { line: 21, kind: "context", text: "  workerVersion: string;" },
];

function createAssistantThread(
  conversationId: string,
  details: Pick<AssistantThreadSnapshot, "forkedFromId" | "loadState" | "parentThreadId"> & {
    timeline: { turns: AssistantThreadSnapshot["timeline"]["turns"] };
  },
): AssistantThreadSnapshot {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error(`Missing demo conversation for assistant thread: ${conversationId}`);
  }

  return {
    id: conversation.id,
    title: conversation.title,
    deviceId: conversation.deviceId,
    ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
    projectName: conversation.projectName,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
    forkedFromId: details.forkedFromId,
    parentThreadId: details.parentThreadId,
    loadState: details.loadState,
    timeline: {
      threadId: conversation.id,
      turns: details.timeline.turns,
    },
  };
}
