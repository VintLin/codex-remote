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
  | "hand"
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
  | "shield-alert"
  | "shield-check"
  | "shrink"
  | "square-terminal"
  | "windows"
  | "x";

export interface IconProps {
  className?: string;
  name: IconName;
}

export function Icon({ className, name }: IconProps) {
  return <span aria-hidden="true" className={`icon icon-${name}${className ? ` ${className}` : ""}`} />;
}
