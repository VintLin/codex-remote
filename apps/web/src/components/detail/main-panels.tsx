"use client";

import { useEffect, useState } from "react";

import { Badge as UiBadge, Icon, RightDetailPane, StatusDot } from "@codex-remote/ui";
import type { AssistantThreadSnapshot, DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import type {
  BoardTask,
  CodexConversation,
  ConversationApprovalCard,
  ConversationQueuedMessage,
  Device,
  DeviceConnectionStatus,
  PendingApproval,
  TaskConversationLink,
  TaskStatus,
} from "@codex-remote/api-contract";
import type { SearchRecent, WorkbenchData } from "../../data/workerApi/workbenchData";
import { getStatusClassName, statusText } from "../../domain/status/statusPresentation";
import { ActionMenu } from "../sidebar/action-menu";
import { CodexAssistantThread } from "../conversation/codex-assistant-thread";
import type { SubmitFollowUpDraftResult } from "../conversation/followUpComposerSubmit";
import { DetailWorkspace } from "./detail-workspace";
import { iconForDevice } from "../shared/icons";

interface ConversationMainProps {
  assistantThread: AssistantThreadSnapshot | null;
  canStartConversation: boolean;
  canSubmitFollowUp: boolean;
  conversation: CodexConversation | null;
  controlStatus: "accepted" | "failed" | "idle" | "submitting";
  followUpStatus: "accepted" | "failed" | "idle" | "submitting";
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
  onSelectAdjacentConversation: (conversationKey: string) => void;
  onSubmitApprovalDecision: (approval: PendingApproval, decision: "accept" | "decline" | "cancel") => Promise<void>;
  onCancelQueuedMessage: (message: ConversationQueuedMessage) => Promise<void>;
  onQueueMessage: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
  onSendQueuedMessage: (message: ConversationQueuedMessage) => Promise<void>;
  onSubmitFollowUp: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
  onSubmitInterrupt: () => Promise<void>;
  onSubmitStart: (message: string) => Promise<"accepted" | "failed">;
  onSubmitSteer: (message: string) => Promise<"accepted" | "failed">;
  onArchiveConversation: (conversation: CodexConversation) => Promise<void>;
  onBeginRenameConversation: () => void;
  onCancelRenameConversation: () => void;
  onRenameConversation: (conversation: CodexConversation, title: string) => Promise<void>;
  onRestoreConversation: (conversation: CodexConversation) => Promise<void>;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  previousConversationKey: string | null;
  nextConversationKey: string | null;
  renaming: boolean;
  pendingApprovals: PendingApproval[];
  approvalCards: ConversationApprovalCard[];
  queuedMessages: ConversationQueuedMessage[];
  source: WorkbenchData["source"];
  startStatus: "accepted" | "failed" | "idle" | "submitting";
  activeTurnId: string | null;
}

interface DevicesPageProps {
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  onOpenDetail?: (deviceId: string) => void;
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  devices: Device[];
}

interface TaskBoardPageProps {
  conversations: CodexConversation[];
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onCreateTask: (title: string) => Promise<void>;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  onLinkSelectedConversation: (task: BoardTask) => Promise<void>;
  onUnlinkConversation: (task: BoardTask, link: TaskConversationLink) => Promise<void>;
  selectedConversation: CodexConversation | null;
  source: WorkbenchData["source"];
  taskLoadState: WorkbenchData["taskSource"]["status"];
  taskStatus: "failed" | "idle" | "submitting";
  tasks: BoardTask[];
}

interface SettingsPageProps {
  conversations: CodexConversation[];
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  onRestoreConversation: (conversation: CodexConversation) => Promise<void>;
}

interface SearchDialogProps {
  onClose: () => void;
  onSelectConversation: (conversationKey: string) => void;
  open: boolean;
  selectedConversationKey: string | null;
  searchRecents: SearchRecent[];
}

export function ConversationMain({
  assistantThread,
  canStartConversation,
  canSubmitFollowUp,
  conversation,
  controlStatus,
  followUpStatus,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  nextConversationKey,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onOpenDetail,
  onSelectAdjacentConversation,
  onCancelQueuedMessage,
  onQueueMessage,
  onSendQueuedMessage,
  onSubmitApprovalDecision,
  onSubmitFollowUp,
  onSubmitInterrupt,
  onSubmitStart,
  onSubmitSteer,
  onArchiveConversation,
  onBeginRenameConversation,
  onCancelRenameConversation,
  onRenameConversation,
  onRestoreConversation,
  previousConversationKey,
  renaming,
  pendingApprovals,
  approvalCards,
  queuedMessages,
  source,
  startStatus,
  activeTurnId,
}: ConversationMainProps) {
  const conversationTitle = conversation === null ? "对话" : conversation.title;
  const [renameDraft, setRenameDraft] = useState(conversationTitle);
  const isExampleData = source.reason !== "loaded";
  const datasourceStatus: string[] = [source.reason];
  if (source.error?.code) {
    datasourceStatus.push(source.error.code);
  }
  if (source.error?.message) {
    datasourceStatus.push(source.error.message);
  }

  useEffect(() => {
    setRenameDraft(conversationTitle);
  }, [conversationTitle, renaming]);

  return (
    <main className="main-pane">
      <header className="topbar">
        <div className="topbar-leading conversation-topbar-leading">
          {isMobile && onBack ? (
            <HeaderBackButton label="返回导航" onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <div className="conversation-collapsed-sidebar-controls">
              <SidebarToggleButton collapsed direction="left" label="展开左侧边栏" onClick={onExpandSidebar} />
              <button
                aria-label="切换到上一条对话"
                className="icon-button conversation-nav-button"
                disabled={!previousConversationKey}
                onClick={() => {
                  if (previousConversationKey) {
                    onSelectAdjacentConversation(previousConversationKey);
                  }
                }}
                type="button"
              >
                <Icon name="arrow-left" />
              </button>
              <button
                aria-label="切换到下一条对话"
                className="icon-button conversation-nav-button"
                disabled={!nextConversationKey}
                onClick={() => {
                  if (nextConversationKey) {
                    onSelectAdjacentConversation(nextConversationKey);
                  }
                }}
                type="button"
              >
                <Icon name="arrow-right" />
              </button>
            </div>
          ) : null}
          <div className="workspace-title conversation-title">
            {renaming && conversation ? (
              <form
                aria-label="重命名对话"
                className="conversation-rename-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onRenameConversation(conversation, renameDraft);
                }}
              >
                <input
                  aria-label="Conversation title"
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  value={renameDraft}
                />
                <button disabled={controlStatus === "submitting" || renameDraft.trim() === ""} type="submit">
                  保存
                </button>
                <button onClick={onCancelRenameConversation} type="button">
                  取消
                </button>
              </form>
            ) : (
              <h1>{conversationTitle}</h1>
            )}
            <ConversationStatusBadges conversation={conversation} />
            {!isMobile ? (
              <ActionMenu
                archived={conversation?.archived === true}
                ariaLabel="打开对话操作菜单"
                className="conversation-title-menu"
                group="conversation"
                {...(conversation ? { onArchive: () => void onArchiveConversation(conversation) } : {})}
                {...(conversation ? { onRename: onBeginRenameConversation } : {})}
                {...(conversation ? { onRestore: () => void onRestoreConversation(conversation) } : {})}
              />
            ) : null}
          </div>
        </div>
        <div aria-label="Conversation controls" className="toolbar conversation-toolbar">
          <span className="datasource-status" title={datasourceStatus.join(" · ")}>
            {datasourceStatus.join(" · ")}
          </span>
          {!isMobile ? (
            <button aria-label="布局列表" className="icon-button conversation-layout-button" type="button">
              <Icon name="layout-list" />
            </button>
          ) : null}
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed direction="right" label="展开右侧边栏" onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>

      <div className="content-scroll conversation-content-scroll">
        {isExampleData ? (
          <section aria-label="数据源状态" className="conversation-source-banner">
            <strong>未连接真实 Control Plane</strong>
            <span>当前显示示例数据 · {datasourceStatus.join(" · ")}</span>
          </section>
        ) : null}
        <CodexAssistantThread
          activeTurnId={activeTurnId}
          approvalCards={approvalCards}
          canStartConversation={canStartConversation}
          canSubmitFollowUp={canSubmitFollowUp}
          controlStatus={controlStatus}
          followUpStatus={followUpStatus}
          onOpenDetail={onOpenDetail}
          onCancelQueuedMessage={onCancelQueuedMessage}
          onQueueMessage={onQueueMessage}
          onSendQueuedMessage={onSendQueuedMessage}
          onSubmitApprovalDecision={onSubmitApprovalDecision}
          onSubmitFollowUp={onSubmitFollowUp}
          onSubmitInterrupt={onSubmitInterrupt}
          onSubmitStart={onSubmitStart}
          onSubmitSteer={onSubmitSteer}
          startStatus={startStatus}
          pendingApprovals={pendingApprovals}
          queuedMessages={queuedMessages}
          thread={assistantThread}
        />
      </div>
    </main>
  );
}

export function SettingsPage({
  conversations,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onRestoreConversation,
}: SettingsPageProps) {
  const archivedConversations = conversations.filter((conversation) => conversation.archived === true);

  return (
    <main className="main-pane settings-page">
      <header className="topbar">
        <div className="topbar-leading">
          {isMobile && onBack ? <HeaderBackButton label="返回导航" onClick={onBack} /> : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed direction="left" label="展开左侧边栏" onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title">
            <h1>设置</h1>
          </div>
        </div>
        <div className="toolbar">
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed direction="right" label="展开右侧边栏" onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll settings-content">
        <section aria-label="已归档对话" className="settings-section">
          <h2>已归档对话</h2>
          {archivedConversations.length === 0 ? (
            <p className="empty-state">暂无已归档对话</p>
          ) : (
            <div className="settings-list">
              {archivedConversations.map((conversation) => (
                <article className="settings-row" key={`${conversation.deviceId}:${conversation.id}`}>
                  <span>
                    <strong>{conversation.title}</strong>
                    <span>{conversation.projectName} · {conversation.updatedAt}</span>
                  </span>
                  <button className="button secondary" onClick={() => void onRestoreConversation(conversation)} type="button">
                    恢复
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ConversationStatusBadges(props: { conversation: CodexConversation | null }) {
  if (!props.conversation) {
    return null;
  }

  return (
    <span className="conversation-header-badges">
      {props.conversation.loaded ? <span className="conversation-state-badge">Loaded</span> : null}
      {props.conversation.live ? <span className="conversation-state-badge">Live</span> : null}
      {props.conversation.archived ? <span className="conversation-state-badge">Archived</span> : null}
    </span>
  );
}

export function ConversationDetailPane({
  conversationTitle,
  isCollapsed,
  isMobile,
  onBack,
  onCollapse,
  target,
}: {
  conversationTitle: string;
  isCollapsed: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  onCollapse: () => void;
  target: DetailTarget | LinkReference | null;
}) {
  return (
    <DetailWorkspace
      conversationTitle={conversationTitle}
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      target={target}
    />
  );
}

export function DevicesPage({
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onOpenDetail,
  onSelectDevice,
  selectedDeviceId,
  devices,
}: DevicesPageProps) {
  return (
    <main className="main-pane devices-page">
      <header className="topbar">
        <div className="topbar-leading">
          {isMobile && onBack ? (
            <HeaderBackButton label="返回导航" onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed direction="left" label="展开左侧边栏" onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title devices-title">
            <h1>设备</h1>
            <button aria-label="新增设备" className="icon-button devices-add-button" disabled type="button">
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <div className="toolbar devices-toolbar">
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed direction="right" label="展开右侧边栏" onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>

      <div className="content-scroll">
        <section aria-label="Device list" className="device-grid">
          {devices.map((device) => (
            <article className={`device-card${device.id === selectedDeviceId ? " is-selected" : ""}`} key={device.id}>
              <button
                className="device-card-main"
                data-select-device={device.id}
                onClick={() => {
                  onSelectDevice(device.id);
                  onOpenDetail?.(device.id);
                }}
                type="button"
              >
                <span className="device-icon">
                  <Icon name={iconForDevice(device)} />
                </span>
                <span className="device-card-copy">
                  <span className="device-card-title">
                    <span>{device.name}</span>
                    <StatusBadge status={device.status} />
                  </span>
                  <span className="device-card-meta">
                    {device.ip} - 最后上线 {device.lastOnlineAt}
                  </span>
                </span>
              </button>
              <div className="device-card-actions">
                <button aria-label="编辑设备" className="icon-button device-action-button" disabled type="button">
                  <Icon name="pencil" />
                </button>
                <button aria-label="删除设备" className="icon-button device-action-button device-action-button-danger" disabled type="button">
                  <Icon name="delete" />
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export function DeviceDetailPane({
  isCollapsed,
  isMobile = false,
  onBack,
  onCollapse,
  selectedDeviceId,
  devices,
}: {
  isCollapsed: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  onCollapse: () => void;
  selectedDeviceId: string;
  devices: Device[];
}) {
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0];

  if (!selectedDevice) {
    return (
      <RightDetailPane
        ariaLabel="Device detail"
        backLabel="返回设备列表"
        className="device-detail-pane"
        isCollapsed={isCollapsed}
        isMobile={isMobile}
        onBack={onBack}
        onCollapse={onCollapse}
        title="设备详情"
        titleIcon="laptop"
      >
        <section className="linked-task">
          <h2>暂无设备数据</h2>
        </section>
      </RightDetailPane>
    );
  }

  return (
    <RightDetailPane
      ariaLabel="Device detail"
      backLabel="返回设备列表"
      className="device-detail-pane"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title="设备详情"
      titleIcon={iconForDevice(selectedDevice)}
    >
        <section className="linked-task">
          <h2>{selectedDevice.name}</h2>
          <p>状态：{statusText[selectedDevice.status]}</p>
          <p>IP：{selectedDevice.ip}</p>
          <p>最后上线：{selectedDevice.lastOnlineAt}</p>
        </section>
        <section className="linked-task">
          <h2>当前上下文</h2>
          <p>项目：{selectedDevice.currentProject}</p>
          <p>模型：{selectedDevice.model}</p>
          <p>真实编辑、删除和新增设备逻辑后续接入 Control Plane API。</p>
        </section>
    </RightDetailPane>
  );
}

export function TaskBoardPage({
  conversations,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  onBack,
  onCreateTask,
  onExpandDetail,
  onExpandSidebar,
  onLinkSelectedConversation,
  onUnlinkConversation,
  selectedConversation,
  source,
  taskLoadState,
  taskStatus,
  tasks,
}: TaskBoardPageProps) {
  const [taskTitle, setTaskTitle] = useState("");
  const disabled = taskStatus === "submitting";
  const isExampleData = source.reason !== "loaded";
  const datasourceStatus: string[] = [source.reason];
  if (source.error?.code) {
    datasourceStatus.push(source.error.code);
  }
  if (source.error?.message) {
    datasourceStatus.push(source.error.message);
  }

  return (
    <main className="main-pane devices-page">
      <header className="topbar">
        <div className="topbar-leading">
          {isMobile && onBack ? (
            <HeaderBackButton label="返回导航" onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed direction="left" label="展开左侧边栏" onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title tasks-title">
            <h1>任务</h1>
          </div>
        </div>
        <div className="toolbar tasks-toolbar">
          <span className="datasource-status">{taskStatus}</span>
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed direction="right" label="展开右侧边栏" onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll">
        {isExampleData ? (
          <section aria-label="任务数据源状态" className="conversation-source-banner">
            <strong>未连接真实 Control Plane</strong>
            <span>当前显示示例任务数据 · {datasourceStatus.join(" · ")}</span>
          </section>
        ) : null}
        <form
          className="conversation-control-strip"
          onSubmit={(event) => {
            event.preventDefault();
            const title = taskTitle.trim();
            if (!title || disabled) {
              return;
            }
            void (async () => {
              await onCreateTask(title);
              setTaskTitle("");
            })();
          }}
        >
          <div className="conversation-control-row">
            <input
              aria-label="Task title"
              className="conversation-control-input"
              disabled={disabled}
              onChange={(event) => setTaskTitle(event.target.value)}
              value={taskTitle}
            />
            <button className="button secondary conversation-control-button" disabled={disabled || !taskTitle.trim()} type="submit">
              Create
            </button>
          </div>
        </form>
        <section aria-label="Task board" className="device-grid">
          {taskLoadState === "failed" ? (
            <article className="empty-state">
              <h2>无法加载任务</h2>
              <p>稍后刷新或重试任务操作。</p>
            </article>
          ) : tasks.length === 0 ? (
            <article className="empty-state">
              <h2>暂无任务</h2>
              <p>创建任务后可链接当前对话。</p>
            </article>
          ) : tasks.map((task) => {
            const selectedLinked = selectedConversation
              ? task.linkedConversations.some(
                  (link) => link.deviceId === selectedConversation.deviceId && link.conversationId === selectedConversation.id,
                )
              : false;

            return (
              <article className="device-card" key={task.id}>
                <div className="device-card-main">
                  <span className="device-card-copy">
                    <span className="device-card-title">
                      <span>{task.title}</span>
                      <StatusBadge status={task.status} />
                    </span>
                    <span className="device-card-meta">{task.linkedConversations.length} links</span>
                  </span>
                </div>
                <div className="device-card-actions">
                  <button
                    className="button secondary conversation-control-button"
                    disabled={disabled || !selectedConversation?.projectId || selectedLinked}
                    onClick={() => void onLinkSelectedConversation(task)}
                    type="button"
                  >
                    Link
                  </button>
                </div>
                {task.linkedConversations.length > 0 ? (
                  <div className="conversation-control-strip">
                    {task.linkedConversations.map((link) => (
                      <div className="conversation-control-row" key={`${link.deviceId}:${link.conversationId}`}>
                        <span className="conversation-control-meta">{formatTaskLink(link, conversations)}</span>
                        <button
                          className="button secondary conversation-control-button"
                          disabled={disabled}
                          onClick={() => void onUnlinkConversation(task, link)}
                          type="button"
                        >
                          Unlink
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export function TaskDetailPane({
  isCollapsed,
  isMobile = false,
  onBack,
  onCollapse,
}: {
  isCollapsed: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  onCollapse: () => void;
}) {
  return (
    <RightDetailPane
      ariaLabel="Task detail"
      backLabel="返回任务列表"
      className="device-detail-pane"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title="任务详情"
      titleIcon="reload"
    />
  );
}

function formatTaskLink(link: TaskConversationLink, conversations: CodexConversation[]): string {
  const title = conversations.find((conversation) => conversation.deviceId === link.deviceId && conversation.id === link.conversationId)?.title ??
    link.conversationId;

  return `${title} · ${link.deviceId}`;
}

export function SearchDialog({
  onClose,
  onSelectConversation,
  open,
  searchRecents,
  selectedConversationKey,
}: SearchDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="search-overlay" data-close-search onClick={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-label="搜索对话" aria-modal="true" className="search-dialog" data-search-dialog role="dialog">
        <div className="search-input-shell">
          <input aria-label="搜索对话" autoFocus className="search-input" placeholder="搜索对话" />
        </div>
        <div className="search-section-title">近期对话</div>
        <div className="search-results">
          {searchRecents.map((item, index) => (
            <button
              className={`search-result${item.conversationKey === selectedConversationKey ? " is-active" : ""}`}
              key={item.conversationKey}
              onClick={() => {
                onSelectConversation(item.conversationKey);
                onClose();
              }}
              type="button"
            >
              <span className="search-marker">{item.marker ? "●" : ""}</span>
              <span className="search-title">{item.title}</span>
              <span className="search-project">{item.project}</span>
              <kbd>⌘{index + 1}</kbd>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusBadge(props: { status: DeviceConnectionStatus | CodexConversation["status"] | TaskStatus }) {
  const statusClassName = getStatusClassName(props.status);
  const isDeviceStatus = props.status === "Connected" || props.status === "Not connected";
  if (isDeviceStatus) {
    return (
      <UiBadge ariaLabel={statusText[props.status]} className={`badge-device-status ${statusClassName}`}>
        <StatusDot statusClassName={statusClassName} />
      </UiBadge>
    );
  }
  return <UiBadge className={statusClassName}>{statusText[props.status]}</UiBadge>;
}

function SidebarToggleButton(props: {
  collapsed?: boolean;
  direction: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const iconName =
    props.direction === "left"
      ? props.collapsed ? "panel-left-open" : "panel-left-close"
      : props.collapsed ? "panel-right-open" : "panel-right-close";

  return (
    <button
      aria-label={props.label}
      className="icon-button sidebar-toggle-button"
      data-direction={props.direction}
      data-state={props.collapsed ? "collapsed" : "expanded"}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="sidebar-toggle-icon" name={iconName} />
    </button>
  );
}

function HeaderBackButton(props: { label: string; onClick: () => void }) {
  return (
    <button aria-label={props.label} className="icon-button mobile-back-button" onClick={props.onClick} type="button">
      <Icon className="mobile-back-icon" name="right" />
    </button>
  );
}
