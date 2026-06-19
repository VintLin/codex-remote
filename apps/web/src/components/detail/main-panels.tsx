"use client";

import { Badge as UiBadge, Icon, RightDetailPane, StatusDot } from "@codex-remote/ui";
import type { AssistantThreadSnapshot, DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import type { CodexConversation, Device, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";
import type { SearchRecent, WorkbenchData } from "../../data/workerApi/workbenchData";
import { getStatusClassName, statusText } from "../../domain/status/statusPresentation";
import { ActionMenu } from "../sidebar/action-menu";
import { CodexAssistantThread } from "../conversation/codex-assistant-thread";
import { DetailWorkspace } from "./detail-workspace";
import { iconForDevice } from "../shared/icons";

interface ConversationMainProps {
  assistantThread: AssistantThreadSnapshot | null;
  conversation: CodexConversation | null;
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onOpenDetail: (target: DetailTarget | LinkReference) => void;
  onSelectAdjacentConversation: (conversationId: string) => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  previousConversationId: string | null;
  nextConversationId: string | null;
  source: WorkbenchData["source"];
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

interface SearchDialogProps {
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  open: boolean;
  selectedConversationId: string | null;
  searchRecents: SearchRecent[];
}

export function ConversationMain({
  assistantThread,
  conversation,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  nextConversationId,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onOpenDetail,
  onSelectAdjacentConversation,
  previousConversationId,
  source,
}: ConversationMainProps) {
  const conversationTitle = conversation === null ? "对话" : conversation.title;
  const datasourceStatus: string[] = [source.reason];
  if (source.error?.code) {
    datasourceStatus.push(source.error.code);
  }
  if (source.error?.message) {
    datasourceStatus.push(source.error.message);
  }

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
                disabled={!previousConversationId}
                onClick={() => {
                  if (previousConversationId) {
                    onSelectAdjacentConversation(previousConversationId);
                  }
                }}
                type="button"
              >
                <Icon name="arrow-left" />
              </button>
              <button
                aria-label="切换到下一条对话"
                className="icon-button conversation-nav-button"
                disabled={!nextConversationId}
                onClick={() => {
                  if (nextConversationId) {
                    onSelectAdjacentConversation(nextConversationId);
                  }
                }}
                type="button"
              >
                <Icon name="arrow-right" />
              </button>
            </div>
          ) : null}
          <div className="workspace-title conversation-title">
            <h1>{conversationTitle}</h1>
            {!isMobile ? <ActionMenu ariaLabel="打开对话操作菜单" className="conversation-title-menu" group="conversation" /> : null}
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
        <CodexAssistantThread onOpenDetail={onOpenDetail} thread={assistantThread} />
      </div>
    </main>
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

export function AutomationsPage({
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  onBack,
  onExpandDetail,
  onExpandSidebar,
}: {
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  onBack?: () => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
}) {
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
          <div className="workspace-title automations-title">
            <h1>自动化</h1>
          </div>
        </div>
        <div className="toolbar automations-toolbar">
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed direction="right" label="展开右侧边栏" onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll">
        <section className="empty-state automation-empty-state">
          <h2>暂无自动化 mock</h2>
          <p>此处只保留入口和空状态样式，避免提前定义不稳定的数据结构。</p>
        </section>
      </div>
    </main>
  );
}

export function AutomationDetailPane({
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
      ariaLabel="Automation detail"
      backLabel="返回自动化列表"
      className="device-detail-pane"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title="自动化详情"
      titleIcon="reload"
    />
  );
}

export function SearchDialog({
  onClose,
  onSelectConversation,
  open,
  searchRecents,
  selectedConversationId,
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
              className={`search-result${item.conversationId === selectedConversationId ? " is-active" : ""}`}
              key={item.conversationId}
              onClick={() => {
                onSelectConversation(item.conversationId);
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
