import type { BoardTask, Conversation, ConversationStatus, Device, SidebarProject } from "@codex-remote/api-contract";
import type {
  RawCodexThread,
  RawSidebarProjectStateFixture,
  RawThreadListFixture,
  RawThreadReadFixture,
} from "./rawAppServerSnapshotTypes.ts";
import { deriveAssistantTimeline, type AssistantTimeline } from "../../domain/assistant/assistantTimeline.ts";

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
  loadState: AssistantThreadLoadState;
  timeline: AssistantTimeline;
}

export type AssistantThreadLoadState = "empty" | "loaded" | "missingRead" | "readError";

export interface SearchRecent {
  conversationId: string;
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
  sidebarState?: RawSidebarProjectStateFixture;
}

const DEVICE_ID = "macbook";
const DEVICE_ICON = "MB";
const DEVICE_NAME = "MacBook Pro M4";
const DEVICE_IP = "192.168.1.24";
const DEVICE_MODEL = "GPT-5.4";
const DEFAULT_SANDBOX = "workspace-write";
const DEFAULT_APPROVAL = "never";

export function createAppServerMockData({ list, reads, sidebarState }: CreateAppServerMockDataInput): AppServerMockData {
  const listedThreads = collectListedThreads(list);
  const visibleThreads = listedThreads.filter((thread) => !isArchivedThread(getReadableThread(getThreadId(thread), reads) ?? thread));
  const projects = createSidebarProjects({ list, reads, sidebarState, threads: visibleThreads });
  const projectByPath = new Map(projects.map((project) => [project.path, project]));
  const primaryProject = projects.find((project) => project.path === list.projectCwd) ?? projects[0] ?? createFallbackProject(list.projectCwd);
  const conversations = listedThreads.map((thread) =>
    createConversation({
      thread,
      defaultProject: primaryProject,
      projectByPath,
      reads,
      sidebarState,
    }),
  ).filter((conversation): conversation is Conversation => conversation !== null);
  const assistantThreads = conversations.map((conversation) => {
    const thread = getReadableThread(conversation.id, reads) ?? findListedThread(conversation.id, listedThreads);
    return {
      id: conversation.id,
      title: conversation.title,
      deviceId: conversation.deviceId,
      projectId: conversation.projectId ?? primaryProject.id,
      projectName: conversation.projectName,
      status: conversation.status,
      updatedAt: conversation.updatedAt,
      forkedFromId: thread?.forkedFromId ?? null,
      parentThreadId: thread?.parentThreadId ?? null,
      loadState: getThreadReadState(conversation.id, reads),
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
        lastOnlineAt: formatRelativeTime(list.capturedAt, latestUpdatedAt(visibleThreads)),
        currentProject: primaryProject.name,
        model: DEVICE_MODEL,
      },
    ],
    sidebarProjects: projects,
    conversations,
    assistantThreads,
    searchRecents: conversations.map((conversation) => ({
      conversationId: conversation.id,
      title: conversation.title,
      project: conversation.projectName,
      ...(conversation.status === "waiting" ? { marker: true } : {}),
    })),
    tasks: createTasks(projects, conversations),
  };
}

export function getThreadTitle(thread: Pick<RawCodexThread, "id" | "name" | "preview">): string {
  const name = getTitleCandidate(thread.name);
  if (name) {
    return name;
  }

  const preview = getTitleCandidate(thread.preview);
  if (preview) {
    return preview;
  }

  return "Untitled thread";
}

function createConversation({
  defaultProject,
  projectByPath,
  thread,
  reads,
  sidebarState,
}: {
  defaultProject: SidebarProject;
  projectByPath: Map<string, SidebarProject>;
  thread: RawCodexThread;
  reads: RawThreadReadFixture;
  sidebarState: RawSidebarProjectStateFixture | undefined;
}): Conversation | null {
  const threadId = getThreadId(thread);
  const readableThread = getReadableThread(threadId, reads);
  const sourceThread = readableThread ?? thread;
  if (isArchivedThread(sourceThread)) {
    return null;
  }
  const isProjectless = isProjectlessThread(threadId, sidebarState);
  const projectPath = getThreadProjectPath(sourceThread) ?? defaultProject.path;
  const project = projectByPath.get(projectPath) ?? defaultProject;
  const timeline = deriveAssistantTimeline(sourceThread);

  return {
    id: threadId,
    title: getThreadTitle(sourceThread),
    deviceId: DEVICE_ID,
    ...(isProjectless ? {} : { projectId: project.id }),
    projectName: isProjectless ? "对话" : project.name,
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

function createSidebarProjects({
  list,
  reads,
  sidebarState,
  threads,
}: {
  list: RawThreadListFixture;
  reads: RawThreadReadFixture;
  sidebarState: RawSidebarProjectStateFixture | undefined;
  threads: RawCodexThread[];
}): SidebarProject[] {
  const threadByProjectPath = new Map<string, RawCodexThread>();

  for (const listedThread of threads) {
    const threadId = getThreadId(listedThread);
    if (isProjectlessThread(threadId, sidebarState)) {
      continue;
    }
    const sourceThread = getReadableThread(threadId, reads) ?? listedThread;
    const projectPath = getThreadProjectPath(sourceThread);
    if (!projectPath || threadByProjectPath.has(projectPath)) {
      continue;
    }
    threadByProjectPath.set(projectPath, sourceThread);
  }

  const projectsByPath = new Map<string, SidebarProject>();
  const orderedProjectPaths = getOrderedProjectPaths({
    list,
    sidebarState,
    threadProjectPaths: [...threadByProjectPath.keys()],
  });

  for (const projectPath of orderedProjectPaths) {
    const sourceThread = threadByProjectPath.get(projectPath);
    const isCurrentProject = projectPath === list.projectCwd;
    const isCollapsed = sidebarState?.collapsedGroups[projectPath] === true;

    projectsByPath.set(projectPath, {
      id: getProjectId(projectPath),
      name: getProjectName(projectPath, sidebarState?.labels[projectPath]),
      deviceId: DEVICE_ID,
      path: projectPath,
      branch: getThreadBranch(sourceThread) ?? "main",
      hasChanges: false,
      pinned: sidebarState?.pinnedProjectIds.includes(projectPath) === true,
      expanded: isCurrentProject ? true : !isCollapsed,
    });
  }

  if (projectsByPath.size === 0) {
    return [createFallbackProject(list.projectCwd)];
  }

  return [...projectsByPath.values()];
}

function getOrderedProjectPaths({
  list,
  sidebarState,
  threadProjectPaths,
}: {
  list: RawThreadListFixture;
  sidebarState: RawSidebarProjectStateFixture | undefined;
  threadProjectPaths: string[];
}): string[] {
  const paths = [
    ...(sidebarState?.projectOrder ?? []),
    ...(sidebarState?.savedWorkspaceRoots ?? []),
    ...(sidebarState?.activeWorkspaceRoots ?? []),
    ...threadProjectPaths,
    list.projectCwd,
  ];

  return paths.filter((value, index, values) => getNonEmptyString(value) !== undefined && values.indexOf(value) === index);
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
  const activeFlags = getStatusActiveFlags(status);
  const statusType = normalizeStatusText(extractStatusType(status));

  if (
    activeFlags.some((flag) => {
      const normalizedFlag = normalizeStatusText(flag);
      return normalizedFlag.includes("waiting") || normalizedFlag.includes("approval") || normalizedFlag.includes("input");
    })
  ) {
    return "waiting";
  }

  if (
    statusType.includes("active") ||
    statusType.includes("running") ||
    statusType.includes("inprogress") ||
    statusType.includes("processing")
  ) {
    return "running";
  }

  if (statusType.includes("waiting") || statusType.includes("approval") || statusType.includes("blocked")) {
    return "waiting";
  }

  if (statusType.includes("failed") || statusType.includes("error")) {
    return "failed";
  }

  if (statusType.includes("complete") || statusType.includes("done") || statusType.includes("idle") || statusType.includes("notloaded")) {
    return "done";
  }

  return "unknown";
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

function getStatusActiveFlags(status: unknown): string[] {
  if (!isRecord(status)) {
    return [];
  }

  const activeFlags = status["activeFlags"];
  if (!Array.isArray(activeFlags)) {
    return [];
  }

  return activeFlags.filter((flag): flag is string => typeof flag === "string");
}

function normalizeStatusText(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function summarizeThread(thread: RawCodexThread, timeline: AssistantTimeline): string {
  const sourceText = getLatestTimelineText(timeline) ?? firstLine(thread.preview) ?? getThreadTitle(thread);
  return truncate(sourceText.replace(/\s+/g, " ").trim(), 96);
}

function getThreadReadState(threadId: string, reads: RawThreadReadFixture): AssistantThreadLoadState {
  const result = reads.threads[threadId];
  if (!result) {
    return "missingRead";
  }

  if (typeof result.error !== "undefined") {
    return "readError";
  }

  if ((result.thread?.turns ?? []).length === 0) {
    return "empty";
  }

  return "loaded";
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

function createTasks(projects: SidebarProject[], conversations: Conversation[]): BoardTask[] {
  return projects
    .map<BoardTask | null>((project) => {
      const projectConversations = conversations.filter((conversation) => conversation.projectId === project.id);
      if (projectConversations.length === 0) {
        return null;
      }

      const hasActiveConversation = projectConversations.some(
        (conversation) => conversation.status === "running" || conversation.status === "waiting",
      );

      return {
        id: `${project.id}-task`,
        title: `${project.name} app-server snapshot`,
        status: hasActiveConversation ? "in_progress" : "done",
        linkedConversationIds: projectConversations.map((conversation) => conversation.id),
      };
    })
    .filter((task): task is BoardTask => task !== null);
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

function getProjectName(projectCwd: string, label?: string): string {
  const normalizedLabel = getNonEmptyString(label);
  if (normalizedLabel) {
    return normalizedLabel;
  }

  const segments = projectCwd.split("/").filter(Boolean);
  return segments.at(-1) ?? "unknown-project";
}

function getProjectId(projectPath: string): string {
  const slug = projectPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `project-${slug || "app-server"}-${hashProjectPath(projectPath)}`;
}

function hashProjectPath(projectPath: string): string {
  let hash = 2166136261;

  for (let index = 0; index < projectPath.length; index += 1) {
    hash ^= projectPath.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function getThreadProjectPath(thread: RawCodexThread): string | undefined {
  return getNonEmptyString(thread.cwd);
}

function isProjectlessThread(threadId: string, sidebarState: RawSidebarProjectStateFixture | undefined): boolean {
  return sidebarState?.projectlessThreadIds?.includes(threadId) === true;
}

function getThreadBranch(thread: RawCodexThread | undefined): string | undefined {
  if (!isRecord(thread)) {
    return undefined;
  }
  const gitInfo = thread["gitInfo"];
  if (!isRecord(gitInfo)) {
    return undefined;
  }
  return getNonEmptyString(typeof gitInfo.branch === "string" ? gitInfo.branch : undefined);
}

function isArchivedThread(thread: RawCodexThread): boolean {
  if (!isRecord(thread)) {
    return false;
  }

  return thread["archived"] === true || thread["isArchived"] === true;
}

function createFallbackProject(projectCwd: string): SidebarProject {
  return {
    id: getProjectId(projectCwd),
    name: getProjectName(projectCwd),
    deviceId: DEVICE_ID,
    path: projectCwd,
    branch: "main",
    hasChanges: false,
    pinned: true,
    expanded: true,
  };
}

function getTitleCandidate(value: string | null | undefined): string | undefined {
  const text = getNonEmptyString(value);
  if (!text) {
    return undefined;
  }

  return firstLine(renderMarkdownTextForTitle(text));
}

function renderMarkdownTextForTitle(value: string): string {
  return value
    .replace(/^\s*(?:\[\$[^\]]+\]\([^)]+\)\s*)+/u, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
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
