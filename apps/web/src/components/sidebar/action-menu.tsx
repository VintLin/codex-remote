"use client";

import { PopoverMenu, type IconName } from "@codex-remote/ui";

export type SidebarActionGroup =
  | "project"
  | "conversation"
  | "section-pinned"
  | "section-projects"
  | "section-conversations";

interface ActionMenuItem {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onSelect?: () => void;
}

const actionItems = {
  project: [
    { icon: "message-circle-plus", label: "新对话", disabled: true },
    { icon: "shrink", label: "创建工作树", disabled: true },
    { icon: "pin", label: "置顶", disabled: true },
    { icon: "pencil", label: "重命名", disabled: true },
    { icon: "inbox", label: "归档", disabled: true },
    { icon: "delete", label: "移除", disabled: true },
  ],
  conversation: [
    { icon: "pin", label: "置顶", disabled: true },
    { icon: "inbox", label: "归档", disabled: true },
  ],
  "section-pinned": [
    { icon: "clock", label: "按创建时间排序", disabled: true },
    { icon: "reload", label: "按更新时间排序", disabled: true },
  ],
  "section-projects": [
    { icon: "inbox", label: "归档所有聊天", disabled: true },
    { icon: "clock", label: "按创建时间排序", disabled: true },
    { icon: "reload", label: "按更新时间排序", disabled: true },
  ],
  "section-conversations": [
    { icon: "inbox", label: "归档所有聊天", disabled: true },
    { icon: "clock", label: "按创建时间排序", disabled: true },
    { icon: "reload", label: "按更新时间排序", disabled: true },
  ],
} satisfies Record<SidebarActionGroup, ActionMenuItem[]>;

interface ActionMenuProps {
  ariaLabel?: string;
  archived?: boolean;
  className?: string;
  group: SidebarActionGroup;
  onArchive?: () => void;
  onRename?: () => void;
  onRestore?: () => void;
}

export function ActionMenu({
  archived = false,
  ariaLabel = "打开操作菜单",
  className,
  group,
  onArchive,
  onRename,
  onRestore,
}: ActionMenuProps) {
  const actions = group === "conversation"
    ? [
        { icon: "pencil", label: "重命名", disabled: !onRename, ...(onRename ? { onSelect: onRename } : {}) },
        archived
          ? { icon: "reload", label: "恢复", disabled: !onRestore, ...(onRestore ? { onSelect: onRestore } : {}) }
          : { icon: "inbox", label: "归档", disabled: !onArchive, ...(onArchive ? { onSelect: onArchive } : {}) },
      ] satisfies ActionMenuItem[]
    : actionItems[group];
  return <PopoverMenu actions={actions} ariaLabel={ariaLabel} className={className} />;
}
