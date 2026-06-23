"use client";

import { PopoverMenu, type IconName } from "@codex-remote/ui";

import type { WebDictionary } from "../../i18n/dictionary.ts";

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

type ActionCopy = WebDictionary["actions"];

function getActionItems(copy: ActionCopy): Record<SidebarActionGroup, ActionMenuItem[]> {
  return {
    project: [
      { icon: "message-circle-plus", label: copy.newConversation, disabled: true },
      { icon: "shrink", label: copy.createWorktree, disabled: true },
      { icon: "pin", label: copy.pin, disabled: true },
      { icon: "pencil", label: copy.rename, disabled: true },
      { icon: "inbox", label: copy.archive, disabled: true },
      { icon: "delete", label: copy.remove, disabled: true },
    ],
    conversation: [
      { icon: "pin", label: copy.pin, disabled: true },
      { icon: "inbox", label: copy.archive, disabled: true },
    ],
    "section-pinned": [
      { icon: "clock", label: copy.sortByCreatedAt, disabled: true },
      { icon: "reload", label: copy.sortByUpdatedAt, disabled: true },
    ],
    "section-projects": [
      { icon: "inbox", label: copy.archiveAllChats, disabled: true },
      { icon: "clock", label: copy.sortByCreatedAt, disabled: true },
      { icon: "reload", label: copy.sortByUpdatedAt, disabled: true },
    ],
    "section-conversations": [
      { icon: "inbox", label: copy.archiveAllChats, disabled: true },
      { icon: "clock", label: copy.sortByCreatedAt, disabled: true },
      { icon: "reload", label: copy.sortByUpdatedAt, disabled: true },
    ],
  } satisfies Record<SidebarActionGroup, ActionMenuItem[]>;
}

interface ActionMenuProps {
  ariaLabel?: string;
  archived?: boolean;
  className?: string;
  copy: ActionCopy;
  group: SidebarActionGroup;
  onArchive?: () => void;
  onRename?: () => void;
  onRestore?: () => void;
}

export function ActionMenu({
  archived = false,
  ariaLabel,
  className,
  copy,
  group,
  onArchive,
  onRename,
  onRestore,
}: ActionMenuProps) {
  const actionItems = getActionItems(copy);
  const actions = group === "conversation"
    ? [
        { icon: "pencil", label: copy.rename, disabled: !onRename, ...(onRename ? { onSelect: onRename } : {}) },
        archived
          ? { icon: "reload", label: copy.restore, disabled: !onRestore, ...(onRestore ? { onSelect: onRestore } : {}) }
          : { icon: "inbox", label: copy.archive, disabled: !onArchive, ...(onArchive ? { onSelect: onArchive } : {}) },
      ] satisfies ActionMenuItem[]
    : actionItems[group];
  return <PopoverMenu actions={actions} ariaLabel={ariaLabel ?? copy.openMenu} className={className} />;
}
