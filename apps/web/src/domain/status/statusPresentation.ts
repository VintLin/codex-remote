import type { ConversationStatus, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";

import type { WebDictionary } from "../../i18n/dictionary.ts";

export type StatusPresentationStatus = DeviceConnectionStatus | ConversationStatus | TaskStatus;

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
