"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon, type IconName } from "./icons";

export type SidebarActionGroup =
  | "project"
  | "conversation"
  | "section-pinned"
  | "section-projects"
  | "section-conversations";

interface ActionMenuItem {
  icon: IconName;
  label: string;
}

const actionItems = {
  project: [
    { icon: "plus", label: "新对话" },
    { icon: "folder-open", label: "创建工作树" },
    { icon: "up", label: "置顶" },
    { icon: "setting-o", label: "重命名" },
    { icon: "inbox", label: "归档" },
    { icon: "delete", label: "移除" },
  ],
  conversation: [
    { icon: "up", label: "置顶" },
    { icon: "inbox", label: "归档" },
  ],
  "section-pinned": [
    { icon: "time-o", label: "按创建时间排序" },
    { icon: "reload", label: "按更新时间排序" },
  ],
  "section-projects": [
    { icon: "inbox", label: "归档所有聊天" },
    { icon: "time-o", label: "按创建时间排序" },
    { icon: "reload", label: "按更新时间排序" },
  ],
  "section-conversations": [
    { icon: "inbox", label: "归档所有聊天" },
    { icon: "time-o", label: "按创建时间排序" },
    { icon: "reload", label: "按更新时间排序" },
  ],
} satisfies Record<SidebarActionGroup, ActionMenuItem[]>;

interface ActionMenuProps {
  group: SidebarActionGroup;
}

interface PopoverPosition {
  left: number;
  top: number;
}

const actionMenuWidth = 188;
const viewportPadding = 8;
const triggerGap = 6;

export function ActionMenu({ group }: ActionMenuProps) {
  const actions = actionItems[group];
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const updatePosition = () => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? estimatePopoverHeight(actions.length);
    const availableBelow = window.innerHeight - buttonRect.bottom - viewportPadding;
    const shouldOpenAbove = availableBelow < popoverHeight && buttonRect.top > popoverHeight;
    const top = shouldOpenAbove
      ? Math.max(viewportPadding, buttonRect.top - popoverHeight - triggerGap)
      : Math.min(buttonRect.bottom + triggerGap, window.innerHeight - popoverHeight - viewportPadding);
    const left = Math.min(
      Math.max(viewportPadding, buttonRect.right - actionMenuWidth),
      window.innerWidth - actionMenuWidth - viewportPadding,
    );

    setPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const closeOnLayoutChange = () => setOpen(false);

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnLayoutChange);
    window.addEventListener("scroll", closeOnLayoutChange, true);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnLayoutChange);
      window.removeEventListener("scroll", closeOnLayoutChange, true);
    };
  }, [open]);

  return (
    <div className={`action-menu${open ? " is-open" : ""}`}>
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="打开操作菜单"
        className="action-menu-trigger"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          setPosition(null);
          setOpen(true);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        type="button"
      >
        <Icon name="more" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              className="action-popover"
              role="menu"
              style={{ left: position.left, top: position.top }}
            >
              {actions.map((action) => (
                <button key={action.label} onClick={() => setOpen(false)} role="menuitem" type="button">
                  <Icon name={action.icon} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function estimatePopoverHeight(actionCount: number): number {
  return 10 + actionCount * 30 + Math.max(0, actionCount - 1) * 2;
}
