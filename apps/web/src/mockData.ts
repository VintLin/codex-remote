import listFixture from "./fixtures/app-server/050_codex_remote.thread-list.json" with { type: "json" };
import readFixture from "./fixtures/app-server/050_codex_remote.thread-read.json" with { type: "json" };
import { createAppServerMockData } from "./appServerMockAdapter.ts";
import type { RawThreadListFixture, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";

export type DeviceConnectionStatus = "Connected" | "Not connected";
export type ConversationStatus = "running" | "waiting" | "done" | "failed";
export type TaskStatus = "in_progress" | "waiting" | "done";
export type DiffKind = "context" | "add" | "remove";

export interface Device {
  id: string;
  icon: string;
  name: string;
  status: DeviceConnectionStatus;
  ip: string;
  lastOnlineAt: string;
  currentProject: string;
  model: string;
}

export interface SidebarProject {
  id: string;
  name: string;
  deviceId: string;
  path: string;
  branch: string;
  hasChanges: boolean;
  pinned: boolean;
  expanded?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  deviceId: string;
  projectId?: string;
  projectName: string;
  status: ConversationStatus;
  updatedAt: string;
  summary: string;
  sandbox: string;
  approval: string;
  pinned?: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  status: TaskStatus;
  linkedConversationIds: string[];
}

export interface DiffLine {
  line: number;
  kind: DiffKind;
  text: string;
}

const appServerMockData = createAppServerMockData({
  list: listFixture as unknown as RawThreadListFixture,
  reads: readFixture as unknown as RawThreadReadFixture,
});

export const devices: Device[] = appServerMockData.devices;
export const sidebarProjects: SidebarProject[] = appServerMockData.sidebarProjects;
export const conversations: Conversation[] = appServerMockData.conversations;
export const searchRecents = appServerMockData.searchRecents;
export const tasks: BoardTask[] = appServerMockData.tasks;
export const assistantThreads = appServerMockData.assistantThreads;

export const diffLines: DiffLine[] = [
  { line: 18, kind: "context", text: "export interface Device {" },
  { line: 19, kind: "remove", text: "  status: string;" },
  { line: 19, kind: "add", text: "  status: DeviceConnectionStatus;" },
  { line: 20, kind: "add", text: "  lastHeartbeatAt: string;" },
  { line: 21, kind: "context", text: "  workerVersion: string;" },
];
