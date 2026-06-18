import type { Device } from "@codex-remote/api-contract";
import type { IconName } from "@codex-remote/ui";

export function iconForDevice(device: Device): IconName {
  const name = device.name.toLowerCase();
  if (name.includes("windows")) {
    return "windows";
  }
  if (name.includes("mac")) {
    return "apple";
  }
  if (name.includes("mobile")) {
    return "mobile";
  }
  return "laptop";
}
