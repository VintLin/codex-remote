import type { BoardTask, Conversation, ConversationStatus, Device, SidebarProject } from "./mockData.ts";
import type { RawCodexThread, RawThreadListFixture, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";
import { deriveAssistantTimeline, type AssistantTimeline } from "./assistantTimeline.ts";

export interface AssistantThreadSnapshot {
  id: string;
  title: string;
  deviceId: string;
  projectId: string;
  projectName: string;
  status: ConversationStatus;
  updatedAt: string;
  forkedFromId: string | null;
  parentThreadId: string | null;
  timeline: AssistantTimeline;
}

export interface SearchRecent {
  title: string;
  project: string;
  active?: boolean;
  marker?: boolean;
}

export interface AppServerMockData {
  devices: Device[];
  sidebarProjects: SidebarProject[];
  conversations: Conversation[];
  assistantThreads: AssistantThreadSnapshot[];
  searchRecents: SearchRecent[];
  tasks: BoardTask[];
}

export interface CreateAppServerMockDataInput {
  list: RawThreadListFixture;
  reads: RawThreadReadFixture;
}

const DEVICE_ID = "macbook";
const DEVICE_ICON = "MB";
const DEVICE_NAME = "MacBook Pro M4";
const DEVICE_IP = "192.168.1.24";
const DEVICE_MODEL = "GPT-5.4";
const DEFAULT_SANDBOX = "workspace-write";
const DEFAULT_APPROVAL = "never";

export function createAppServerMockData({ list, reads }: CreateAppServerMockDataInput): AppServerMockData {
  const projectName = getProjectName(list.projectCwd);
  const projectId = getProjectId(projectName);
  const listedThreads = collectListedThreads(list);
  const conversations = listedThreads.map((thread) =>
    createConversation({
      thread,
      reads,
      projectId,
      projectName,
    }),
  );
  const assistantThreads = conversations.map((conversation) => {
    const thread = getReadableThread(conversation.id, reads) ?? findListedThread(conversation.id, listedThreads);
    return {
      id: conversation.id,
      title: conversation.title,
      deviceId: conversation.deviceId,
      projectId: conversation.projectId ?? projectId,
      projectName: conversation.projectName,
      status: conversation.status,
      updatedAt: conversation.updatedAt,
      forkedFromId: thread?.forkedFromId ?? null,
      parentThreadId: thread?.parentThreadId ?? null,
      timeline: deriveAssistantTimeline(thread ?? { id: conversation.id, turns: [] }),
    };
  });

  return {
    devices: [
      {
        id: DEVICE_ID,
        icon: DEVICE_ICON,
        name: DEVICE_NAME,
        status: "Connected",
        ip: DEVICE_IP,
        lastOnlineAt: formatRelativeTime(list.capturedAt, latestUpdatedAt(listedThreads)),
        currentProject: projectName,
        model: DEVICE_MODEL,
      },
    ],
    sidebarProjects: [
      {
        id: projectId,
        name: projectName,
        deviceId: DEVICE_ID,
        path: list.projectCwd,
        branch: "codex/snapshot-data-show",
        hasChanges: true,
        pinned: true,
        expanded: true,
      },
    ],
    conversations,
    assistantThreads,
    searchRecents: conversations.map((conversation, index) => ({
      title: conversation.title,
      project: conversation.projectName,
      ...(index === 0 ? { active: true } : {}),
      ...(conversation.status === "waiting" ? { marker: true } : {}),
    })),
    tasks: createTasks(projectName, conversations),
  };
}

export function getThreadTitle(thread: Pick<RawCodexThread, "id" | "name" | "preview">): string {
  const name = getNonEmptyString(thread.name);
  if (name) {
    return name;
  }

  const preview = firstLine(thread.preview);
  if (preview) {
    return preview;
  }

  return "Untitled thread";
}

function createConversation({
  thread,
  reads,
  projectId,
  projectName,
}: {
  thread: RawCodexThread;
  reads: RawThreadReadFixture;
  projectId: string;
  projectName: string;
}): Conversation {
  const threadId = getThreadId(thread);
  const readableThread = getReadableThread(threadId, reads);
  const sourceThread = readableThread ?? thread;
  const timeline = deriveAssistantTimeline(sourceThread);

  return {
    id: threadId,
    title: getThreadTitle(sourceThread),
    deviceId: DEVICE_ID,
    projectId,
    projectName,
    status: normalizeConversationStatus(sourceThread.status as unknown),
    updatedAt: formatRelativeTime(reads.capturedAt, sourceThread.updatedAt),
    summary: summarizeThread(sourceThread, timeline),
    sandbox: DEFAULT_SANDBOX,
    approval: DEFAULT_APPROVAL,
  };
}

function collectListedThreads(list: RawThreadListFixture): RawCodexThread[] {
  return list.pages.flatMap((page) => page.data ?? page.threads ?? page.items ?? []).filter(hasThreadId);
}

function findListedThread(threadId: string, threads: RawCodexThread[]): RawCodexThread | undefined {
  return threads.find((thread) => thread.id === threadId);
}

function getReadableThread(threadId: string, reads: RawThreadReadFixture): RawCodexThread | undefined {
  return reads.threads[threadId]?.thread;
}

function getThreadId(thread: RawCodexThread): string {
  if (typeof thread.id === "string" && thread.id.trim().length > 0) {
    return thread.id;
  }

  if (typeof thread.sessionId === "string" && thread.sessionId.trim().length > 0) {
    return thread.sessionId;
  }

  return "unknown-thread";
}

function hasThreadId(thread: RawCodexThread): boolean {
  return typeof thread.id === "string" && thread.id.trim().length > 0;
}

function normalizeConversationStatus(status: unknown): ConversationStatus {
  const statusType = normalizeStatusText(extractStatusType(status));

  if (statusType.includes("running") || statusType.includes("inprogress") || statusType.includes("processing")) {
    return "running";
  }

  if (statusType.includes("waiting") || statusType.includes("approval") || statusType.includes("blocked")) {
    return "waiting";
  }

  if (statusType.includes("failed") || statusType.includes("error")) {
    return "failed";
  }

  return "done";
}

function extractStatusType(status: unknown): string {
  if (typeof status === "string") {
    return status;
  }

  if (isRecord(status)) {
    const type = status["type"];
    if (typeof type === "string") {
      return type;
    }
  }

  return "";
}

function normalizeStatusText(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function summarizeThread(thread: RawCodexThread, timeline: AssistantTimeline): string {
  const sourceText = getLatestTimelineText(timeline) ?? firstLine(thread.preview) ?? getThreadTitle(thread);
  return truncate(sourceText.replace(/\s+/g, " ").trim(), 96);
}

function getLatestTimelineText(timeline: AssistantTimeline): string | undefined {
  for (const turn of [...timeline.turns].reverse()) {
    for (const node of [...turn.nodes].reverse()) {
      if (node.type === "text" && node.text.trim().length > 0) {
        return node.text;
      }

      if (node.type === "contextCompaction" && node.text.trim().length > 0) {
        return node.text;
      }
    }
  }

  return undefined;
}

function createTasks(projectName: string, conversations: Conversation[]): BoardTask[] {
  if (conversations.length === 0) {
    return [];
  }

  const hasActiveConversation = conversations.some(
    (conversation) => conversation.status === "running" || conversation.status === "waiting",
  );

  return [
    {
      id: `${getProjectId(projectName)}-task`,
      title: `${projectName} app-server snapshot`,
      status: hasActiveConversation ? "in_progress" : "done",
      linkedConversationIds: conversations.map((conversation) => conversation.id),
    },
  ];
}

function latestUpdatedAt(threads: RawCodexThread[]): number | undefined {
  const timestamps = threads.map((thread) => thread.updatedAt).filter(isNumber);
  if (timestamps.length === 0) {
    return undefined;
  }

  return Math.max(...timestamps);
}

function formatRelativeTime(capturedAt: string, unixSeconds: number | undefined): string {
  if (unixSeconds === undefined) {
    return "未知";
  }

  const capturedMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedMs)) {
    return "刚刚";
  }

  const elapsedSeconds = Math.max(0, Math.round((capturedMs - unixSeconds * 1000) / 1000));
  if (elapsedSeconds < 60) {
    return "刚刚";
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} 分钟前`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} 小时前`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `${elapsedDays} 天前`;
}

function getProjectName(projectCwd: string): string {
  const segments = projectCwd.split("/").filter(Boolean);
  return segments.at(-1) ?? "unknown-project";
}

function getProjectId(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `project-${slug || "app-server"}`;
}

function firstLine(value: string | null | undefined): string | undefined {
  const text = getNonEmptyString(value);
  return text?.split(/\r?\n/, 1)[0]?.trim();
}

function getNonEmptyString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
