import listFixture from "./fixtures/demo.thread-list.json" with { type: "json" };
import readFixture from "./fixtures/demo.thread-read.json" with { type: "json" };
import sidebarStateFixture from "./fixtures/demo.sidebar-state.json" with { type: "json" };
import { createAppServerMockData } from "./appServerMockAdapter.ts";
import type { BoardTask, CodexConversation, Device, DiffLine, RemoteProject } from "@codex-remote/api-contract";
import type { RawSidebarProjectStateFixture, RawThreadListFixture, RawThreadReadFixture } from "./rawAppServerSnapshotTypes.ts";

const appServerMockData = createAppServerMockData({
  list: listFixture as unknown as RawThreadListFixture,
  reads: readFixture as unknown as RawThreadReadFixture,
  sidebarState: sidebarStateFixture as unknown as RawSidebarProjectStateFixture,
});

export const devices: Device[] = appServerMockData.devices;
export const sidebarProjects: RemoteProject[] = appServerMockData.sidebarProjects;
export const conversations: CodexConversation[] = appServerMockData.conversations;
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
