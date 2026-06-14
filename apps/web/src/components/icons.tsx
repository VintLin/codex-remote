import type { Device } from "../mockData";

export type IconName =
  | "apple"
  | "delete"
  | "down"
  | "folder"
  | "folder-open"
  | "inbox"
  | "information-o"
  | "laptop"
  | "mobile"
  | "more"
  | "plus"
  | "reload"
  | "right"
  | "search"
  | "setting-o"
  | "shrink"
  | "time-o"
  | "up"
  | "windows";

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
