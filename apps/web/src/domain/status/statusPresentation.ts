import type { ConversationStatus, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";

export type StatusPresentationStatus = DeviceConnectionStatus | ConversationStatus | TaskStatus;

export const statusText = {
  Connected: "Connected",
  "Not connected": "Not connected",
  done: "Done",
  failed: "Failed",
  in_progress: "In progress",
  running: "Running",
  unknown: "Unknown",
  waiting: "Waiting",
} satisfies Record<StatusPresentationStatus, string>;

export function getStatusClassName(status: StatusPresentationStatus): string {
  if (status === "Connected") {
    return "online";
  }
  if (status === "Not connected") {
    return "offline";
  }
  return status;
}
