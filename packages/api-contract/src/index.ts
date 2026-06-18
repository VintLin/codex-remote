export type DeviceConnectionStatus = "Connected" | "Not connected";

export type ConversationStatus = "running" | "waiting" | "done" | "failed" | "unknown";

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
