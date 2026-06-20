import { useEffect, useState } from "react";
import { Icon, type IconName } from "@codex-remote/ui";

import type { CodexConversation, Device } from "@codex-remote/api-contract";
import type {
  ConversationNavigatorState,
  SidebarProjectGroup,
  SidebarModel,
  SidebarSectionId,
  SidebarSectionState,
} from "../../domain/sidebar/sidebarModel";
import { createConversationKey } from "../../domain/sidebar/conversationIdentity";
import { getStatusClassName } from "../../domain/status/statusPresentation";
import { ActionMenu, type SidebarActionGroup } from "./action-menu";
import { iconForDevice } from "../shared/icons";

export type AppView = "conversation" | "devices" | "tasks";
export type SidebarPressedItem = { kind: "project" | "conversation"; id: string } | null;

interface SidebarProps {
  activeView: AppView;
  conversationNavigator: ConversationNavigatorState;
  device: Device;
  isCollapsed: boolean;
  isMobile?: boolean;
  model: SidebarModel;
  onCollapseSidebar: () => void;
  onOpenSearch: () => void;
  onArchiveConversation: (conversationKey: string) => void;
  onRenameConversation: (conversationKey: string) => void;
  onRestoreConversation: (conversationKey: string) => void;
  onSelectAdjacentConversation: (conversationKey: string) => void;
  onSelectView: (view: AppView) => void;
  onToggleProject: (projectKey: string, options?: { restoreFocus?: boolean }) => void;
  onToggleSection: (sectionId: SidebarSectionId) => void;
  onSelectConversation: (conversationKey: string) => void;
  pressedItem: SidebarPressedItem;
  sectionState: SidebarSectionState;
  selectedConversationKey: string;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
}

interface SidebarListItemProps {
  actionGroup?: SidebarActionGroup;
  actionMenuProps?: {
    archived?: boolean;
    onArchive?: () => void;
    onRename?: () => void;
    onRestore?: () => void;
  };
  contentAttributes?: Record<string, string>;
  expanded?: boolean;
  inline?: React.ReactNode;
  itemAttributes?: Record<string, string | number | boolean>;
  kind: "project" | "conversation" | "empty";
  left?: React.ReactNode;
  muted?: boolean;
  nested?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  pressed?: boolean;
  selected?: boolean;
  title: string;
  trailing?: string;
}

export function Sidebar(props: SidebarProps) {
  const [scrollMaskState, setScrollMaskState] = useState({ atBottom: true, atTop: true });

  useEffect(() => {
    const scrollElement = props.sidebarScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const updateScrollMaskState = () => {
      const { clientHeight, scrollHeight, scrollTop } = scrollElement;
      const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
      setScrollMaskState({
        atBottom: scrollTop >= maxScrollTop - 1,
        atTop: scrollTop <= 1,
      });
    };

    updateScrollMaskState();
    scrollElement.addEventListener("scroll", updateScrollMaskState, { passive: true });
    window.addEventListener("resize", updateScrollMaskState);

    return () => {
      scrollElement.removeEventListener("scroll", updateScrollMaskState);
      window.removeEventListener("resize", updateScrollMaskState);
    };
  }, [props.sidebarScrollRef, props.model, props.sectionState]);

  return (
    <aside aria-label="Workspace navigation" className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-controls">
          {props.isMobile ? <span /> : (
            <button
              aria-label={props.isCollapsed ? "展开左侧边栏" : "收起左侧边栏"}
              className="sidebar-header-control sidebar-header-control-button sidebar-toggle-button"
              data-direction="left"
              data-state={props.isCollapsed ? "collapsed" : "expanded"}
              onClick={props.onCollapseSidebar}
              type="button"
            >
              <Icon className="sidebar-toggle-icon" name={props.isCollapsed ? "panel-left-open" : "panel-left-close"} />
            </button>
          )}
          <div className="sidebar-header-nav">
            <button
              aria-label="切换到上一条对话"
              className="sidebar-header-control sidebar-header-control-button"
              disabled={!props.conversationNavigator.previousConversationKey}
              onClick={() => {
                if (props.conversationNavigator.previousConversationKey) {
                  props.onSelectAdjacentConversation(props.conversationNavigator.previousConversationKey);
                }
              }}
              type="button"
            >
              <Icon name="arrow-left" />
            </button>
            <button
              aria-label="切换到下一条对话"
              className="sidebar-header-control sidebar-header-control-button"
              disabled={!props.conversationNavigator.nextConversationKey}
              onClick={() => {
                if (props.conversationNavigator.nextConversationKey) {
                  props.onSelectAdjacentConversation(props.conversationNavigator.nextConversationKey);
                }
              }}
              type="button"
            >
              <Icon name="arrow-right" />
            </button>
          </div>
        </div>

        <nav aria-label="Primary" className="primary-nav">
          <NavButton
            active={props.activeView === "devices"}
            icon="laptop"
            label="设备"
            onClick={() => props.onSelectView("devices")}
            trailing={
              <span className="nav-device-status">
                <span aria-hidden="true" className={`status-dot ${getStatusClassName(props.device.status)}`} />
                <span>{props.device.name}</span>
              </span>
            }
          />
          <NavButton icon="search" label="搜索" onClick={props.onOpenSearch} />
          <NavButton
            active={props.activeView === "tasks"}
            icon="reload"
            label="任务"
            onClick={() => props.onSelectView("tasks")}
          />
        </nav>

        <div className="sidebar-header-separator" />
      </div>

      <div
        className="sidebar-scroll sidebar-scroll-mask"
        data-bottom={scrollMaskState.atBottom ? "true" : "false"}
        data-top={scrollMaskState.atTop ? "true" : "false"}
        ref={props.sidebarScrollRef}
      >
        <DeviceWorkspaceNav
          model={props.model}
          onArchiveConversation={props.onArchiveConversation}
          onRenameConversation={props.onRenameConversation}
          onSelectConversation={props.onSelectConversation}
          onToggleSection={props.onToggleSection}
          onToggleProject={props.onToggleProject}
          onRestoreConversation={props.onRestoreConversation}
          pressedItem={props.pressedItem}
          sectionState={props.sectionState}
          selectedConversationKey={props.selectedConversationKey}
        />
      </div>

      <div className="sidebar-footer">
        <button className="nav-button" type="button">
          <span className="nav-glyph">
            <Icon name="setting-o" />
          </span>
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

function NavButton(props: { active?: boolean; icon: IconName; label: string; onClick: () => void; trailing?: React.ReactNode }) {
  return (
    <button className={`nav-button${props.active ? " is-active" : ""}`} onClick={props.onClick} type="button">
      <span className="nav-glyph">
        <Icon name={props.icon} />
      </span>
      <span>{props.label}</span>
      {props.trailing ? <span className="nav-button-trailing">{props.trailing}</span> : null}
    </button>
  );
}

function DeviceWorkspaceNav(props: {
  model: SidebarModel;
  onArchiveConversation: (conversationKey: string) => void;
  onRenameConversation: (conversationKey: string) => void;
  onRestoreConversation: (conversationKey: string) => void;
  onSelectConversation: (conversationKey: string) => void;
  onToggleProject: (projectKey: string, options?: { restoreFocus?: boolean }) => void;
  onToggleSection: (sectionId: SidebarSectionId) => void;
  pressedItem: SidebarPressedItem;
  sectionState: SidebarSectionState;
  selectedConversationKey: string;
}) {
  return (
    <>
      <section aria-label="置顶" className="sidebar-section">
        <SectionHeading
          actionGroup="section-pinned"
          expanded={props.sectionState.pinned}
          label="置顶"
          onToggle={() => props.onToggleSection("pinned")}
        />
        {props.sectionState.pinned ? (
          props.model.pinnedProjects.length > 0
          ? props.model.pinnedProjects.map((project) => <ProjectGroup key={project.projectKey} {...props} project={project} />)
          : <EmptyProjectRow />
        ) : null}
      </section>

      <section aria-label="项目" className="sidebar-section">
        <SectionHeading
          actionGroup="section-projects"
          expanded={props.sectionState.projects}
          label="项目"
          onToggle={() => props.onToggleSection("projects")}
        />
        {props.sectionState.projects ? (
          props.model.projects.length > 0
          ? props.model.projects.map((project) => <ProjectGroup key={project.projectKey} {...props} project={project} />)
          : <EmptyProjectRow />
        ) : null}
      </section>

      <section aria-label="对话" className="sidebar-section">
        <SectionHeading
          actionGroup="section-conversations"
          expanded={props.sectionState.conversations}
          label="对话"
          onToggle={() => props.onToggleSection("conversations")}
        />
        {props.sectionState.conversations ? (
          props.model.freeConversations.length > 0
          ? props.model.freeConversations.map((conversation) => (
              <ConversationRow
                key={createConversationKey(conversation)}
                conversation={conversation}
                onArchiveConversation={props.onArchiveConversation}
                onRenameConversation={props.onRenameConversation}
                onRestoreConversation={props.onRestoreConversation}
                onSelectConversation={props.onSelectConversation}
                pressedItem={props.pressedItem}
                selectedConversationKey={props.selectedConversationKey}
              />
            ))
          : <EmptyConversationRow />
        ) : null}
      </section>

      <div className="sidebar-separator" />
    </>
  );
}

function SectionHeading(props: {
  actionGroup: SidebarActionGroup;
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className={`sidebar-heading${props.expanded ? " is-expanded" : " is-collapsed"}`}>
      <button
        aria-expanded={props.expanded}
        className="sidebar-heading-toggle"
        onClick={props.onToggle}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <span className="sidebar-heading-label">{props.label}</span>
        <span className="sidebar-heading-chevron">
          <Icon name="down" />
        </span>
      </button>
      <ActionMenu group={props.actionGroup} />
    </div>
  );
}

function ProjectGroup(props: {
  onArchiveConversation: (conversationKey: string) => void;
  onRenameConversation: (conversationKey: string) => void;
  onRestoreConversation: (conversationKey: string) => void;
  onSelectConversation: (conversationKey: string) => void;
  onToggleProject: (projectKey: string, options?: { restoreFocus?: boolean }) => void;
  pressedItem: SidebarPressedItem;
  project: SidebarProjectGroup;
  selectedConversationKey: string;
}) {
  return (
    <>
      <ProjectRow
        onToggleProject={props.onToggleProject}
        project={props.project}
        selected={props.project.conversations.some((conversation) => createConversationKey(conversation) === props.selectedConversationKey)}
      />
      {props.project.expanded ? (
        <div className="nested-list">
          {props.project.conversations.length > 0
            ? props.project.conversations.map((conversation) => (
                <ConversationRow
                  key={createConversationKey(conversation)}
                  conversation={conversation}
                  nested
                  onArchiveConversation={props.onArchiveConversation}
                  onRenameConversation={props.onRenameConversation}
                  onRestoreConversation={props.onRestoreConversation}
                  onSelectConversation={props.onSelectConversation}
                  pressedItem={props.pressedItem}
                  selectedConversationKey={props.selectedConversationKey}
                />
              ))
            : <EmptyConversationRow />}
        </div>
      ) : null}
    </>
  );
}

function ProjectRow(props: {
  onToggleProject: (projectKey: string, options?: { restoreFocus?: boolean }) => void;
  project: SidebarProjectGroup;
  selected: boolean;
}) {
  const expandedLabel = props.project.expanded ? "收起项目" : "展开项目";
  return (
    <SidebarListItem
      actionGroup="project"
      expanded={props.project.expanded}
      inline={<Icon name="right" />}
      itemAttributes={{
        "aria-expanded": props.project.expanded,
        "aria-label": expandedLabel,
        "data-toggle-project": props.project.projectKey,
        role: "button",
        tabIndex: 0,
      }}
      kind="project"
      left={<Icon name={props.project.expanded ? "folder-open" : "folder"} />}
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".action-menu")) {
          return;
        }
        props.onToggleProject(props.project.projectKey, { restoreFocus: false });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        props.onToggleProject(props.project.projectKey);
      }}
      onMouseDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".action-menu")) {
          return;
        }
        event.preventDefault();
      }}
      selected={props.selected}
      title={props.project.name}
    />
  );
}

function ConversationRow(props: {
  conversation: CodexConversation;
  nested?: boolean;
  onArchiveConversation: (conversationKey: string) => void;
  onRenameConversation: (conversationKey: string) => void;
  onRestoreConversation: (conversationKey: string) => void;
  onSelectConversation: (conversationKey: string) => void;
  pressedItem: SidebarPressedItem;
  selectedConversationKey: string;
}) {
  const conversationKey = createConversationKey(props.conversation);
  return (
    <SidebarListItem
      actionGroup="conversation"
      actionMenuProps={{
        archived: props.conversation.archived === true,
        onArchive: () => props.onArchiveConversation(conversationKey),
        onRename: () => props.onRenameConversation(conversationKey),
        onRestore: () => props.onRestoreConversation(conversationKey),
      }}
      contentAttributes={{ "data-conversation-key": conversationKey }}
      inline={<ConversationBadges conversation={props.conversation} />}
      kind="conversation"
      nested={props.nested ?? false}
      onClick={() => props.onSelectConversation(conversationKey)}
      pressed={props.pressedItem?.kind === "conversation" && props.pressedItem.id === conversationKey}
      selected={conversationKey === props.selectedConversationKey}
      title={props.conversation.title}
      trailing={props.conversation.updatedAt}
    />
  );
}

function ConversationBadges(props: { conversation: CodexConversation }) {
  return (
    <span className="conversation-row-badges">
      {props.conversation.loaded ? <span className="conversation-state-badge">Loaded</span> : null}
      {props.conversation.live ? <span className="conversation-state-badge">Live</span> : null}
      {props.conversation.archived ? <span className="conversation-state-badge">Archived</span> : null}
    </span>
  );
}

function EmptyConversationRow() {
  return <SidebarListItem kind="empty" muted title="暂无对话" />;
}

function EmptyProjectRow() {
  return <SidebarListItem kind="empty" muted title="暂无项目" />;
}

function SidebarListItem(props: SidebarListItemProps) {
  const className = [
    "sidebar-list-item",
    `sidebar-list-item-${props.kind}`,
    props.expanded ? "is-expanded" : "",
    props.nested ? "is-nested" : "",
    props.pressed ? "is-pressed" : "",
    props.selected ? "is-selected" : "",
    props.muted ? "is-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const left = props.left ?? <span aria-hidden="true" className="sidebar-list-placeholder" />;

  return (
    <div
      className={className}
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      onMouseDown={props.onMouseDown}
      {...props.itemAttributes}
    >
      <span className="sidebar-list-icon-slot">{left}</span>
      {props.contentAttributes ? (
        <button className="sidebar-list-content" type="button" {...props.contentAttributes}>
          <SidebarListItemContent inline={props.inline} title={props.title} />
        </button>
      ) : (
        <span className="sidebar-list-content">
          <SidebarListItemContent inline={props.inline} title={props.title} />
        </span>
      )}
      <span className="sidebar-list-meta">{props.trailing ?? ""}</span>
      <span className="sidebar-list-actions">{props.actionGroup ? <ActionMenu group={props.actionGroup} {...props.actionMenuProps} /> : null}</span>
    </div>
  );
}

function SidebarListItemContent(props: { inline?: React.ReactNode; title: string }) {
  return (
    <>
      <span className="item-title">{props.title}</span>
      <span className="sidebar-list-inline">{props.inline}</span>
    </>
  );
}
