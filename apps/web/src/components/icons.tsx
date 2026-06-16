import type { Device } from "../mockData";

export type IconName =
  | "apple"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "clock"
  | "delete"
  | "down"
  | "folder"
  | "folder-open"
  | "globe"
  | "inbox"
  | "information-o"
  | "laptop"
  | "layout-list"
  | "message-circle-plus"
  | "mic"
  | "mobile"
  | "more"
  | "panel-left-close"
  | "panel-left-open"
  | "panel-right-close"
  | "panel-right-open"
  | "pencil"
  | "pin"
  | "plus"
  | "reload"
  | "right"
  | "search"
  | "setting-o"
  | "shrink"
  | "square-terminal"
  | "windows"
  | "x";

interface IconProps {
  className?: string;
  name: IconName;
}

export function Icon({ className, name }: IconProps) {
  return <span aria-hidden="true" className={`icon icon-${name}${className ? ` ${className}` : ""}`} />;
}

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
