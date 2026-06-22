import type { ConversationStatus, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";

import type { WebDictionary } from "../../i18n/dictionary.ts";

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

export function getStatusText(copy: WebDictionary["status"], status: StatusPresentationStatus): string {
  return copy[status];
}

export function getStatusClassName(status: StatusPresentationStatus): string {
  if (status === "Connected") {
    return "online";
  }
  if (status === "Not connected") {
    return "offline";
  }
  return status;
}
