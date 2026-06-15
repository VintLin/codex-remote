"use client";

import { useEffect, useState } from "react";

import type { DetailTarget, LinkReference } from "../assistantTimeline";
import type { AssistantThreadSnapshot } from "../appServerMockAdapter";
import type { Conversation, Device, DeviceConnectionStatus, TaskStatus } from "../mockData";
import { devices, searchRecents } from "../mockData";
import { CodexAssistantThread } from "./codex-assistant-thread";
import { DetailWorkspace } from "./detail-workspace";
import { Icon, iconForDevice } from "./icons";
import { statusToClass } from "./sidebar";

interface ConversationMainProps {
  assistantThread: AssistantThreadSnapshot | null;
  conversation: Conversation;
  device: Device;
}

interface DevicesPageProps {
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
}

interface SearchDialogProps {
  onClose: () => void;
  open: boolean;
}

const statusText = {
  Connected: "Connected",
  "Not connected": "Not connected",
  done: "Done",
  failed: "Failed",
  in_progress: "In progress",
  running: "Running",
  waiting: "Waiting",
} satisfies Record<DeviceConnectionStatus | Conversation["status"] | TaskStatus, string>;

export function ConversationMain({ assistantThread, conversation, device }: ConversationMainProps) {
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<DetailTarget | LinkReference | null>(null);

  useEffect(() => {
    setSelectedDetailTarget(null);
  }, [assistantThread?.id, conversation.id]);

  return (
    <>
      <main className="main-pane">
        <header className="topbar">
          <div className="workspace-title">
            <h1>{conversation.title}</h1>
            <span>
              {device.name} / {conversation.projectName}
            </span>
          </div>
          <div aria-label="Conversation controls" className="toolbar conversation-toolbar">
            <button aria-label="运行上下文" className="icon-button is-raised" type="button">
              <Icon name="inbox" />
              <Icon name="down" />
            </button>
            <button aria-label="对话概览" className="icon-button" type="button">
              <Icon name="information-o" />
            </button>
            <button aria-label="切换布局" className="icon-button" type="button">
              <Icon name="shrink" />
            </button>
            <button aria-label="More actions" className="icon-button" type="button">
              <Icon name="more" />
            </button>
          </div>
        </header>

        <div className="content-scroll conversation-content-scroll">
          <CodexAssistantThread onOpenDetail={setSelectedDetailTarget} thread={assistantThread} />
        </div>
      </main>

      <DetailWorkspace
        conversationTitle={conversation.title}
        onClose={() => setSelectedDetailTarget(null)}
        target={selectedDetailTarget}
      />
    </>
  );
}

export function DevicesPage({ onSelectDevice, selectedDeviceId }: DevicesPageProps) {
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0]!;
  return (
    <>
      <main className="main-pane devices-page">
        <header className="topbar">
          <div className="workspace-title">
            <h1>设备</h1>
            <span>管理当前 Control Plane 可见的设备</span>
          </div>
          <button className="button primary" type="button">
            <Icon name="plus" />
            新增设备
          </button>
        </header>

        <div className="content-scroll">
          <section aria-label="Device list" className="device-grid">
            {devices.map((device) => (
              <article className={`device-card${device.id === selectedDeviceId ? " is-selected" : ""}`} key={device.id}>
                <button className="device-card-main" data-select-device={device.id} onClick={() => onSelectDevice(device.id)} type="button">
                  <span className="device-icon">
                    <Icon name={iconForDevice(device)} />
                  </span>
                  <span className="device-card-copy">
                    <span className="device-card-title">{device.name}</span>
                    <span className="device-card-meta">
                      {device.ip} - 最后上线 {device.lastOnlineAt}
                    </span>
                  </span>
                  <Badge status={device.status} />
                </button>
                <div className="device-card-actions">
                  <button className="button secondary" type="button">
                    编辑
                  </button>
                  <button className="button secondary danger" type="button">
                    <Icon name="delete" />
                    删除
                  </button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
      <aside aria-label="Device detail" className="review-pane device-detail-pane">
        <header className="review-header">
          <div className="review-title">
            <span className="nav-glyph">
              <Icon name={iconForDevice(selectedDevice)} />
            </span>
            <span>设备详情</span>
          </div>
        </header>
        <div className="review-scroll">
          <section className="linked-task">
            <h2>{selectedDevice.name}</h2>
            <p>这里只展示设备选择页面的样式状态。真实编辑、删除和新增设备逻辑后续接入 Control Plane API。</p>
          </section>
        </div>
      </aside>
    </>
  );
}

export function AutomationsPage() {
  return (
    <>
      <main className="main-pane devices-page">
        <header className="topbar">
          <div className="workspace-title">
            <h1>自动化</h1>
            <span>后续用于展示当前设备上的自动化任务</span>
          </div>
        </header>
        <div className="content-scroll">
          <section className="empty-state">
            <h2>暂无自动化 mock</h2>
            <p>此处只保留入口和空状态样式，避免提前定义不稳定的数据结构。</p>
          </section>
        </div>
      </main>
      <aside aria-label="Automation detail" className="review-pane device-detail-pane" />
    </>
  );
}

export function SearchDialog({ onClose, open }: SearchDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="search-overlay" data-close-search onClick={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-label="搜索对话" aria-modal="true" className="search-dialog" data-search-dialog role="dialog">
        <input aria-label="搜索对话" autoFocus className="search-input" placeholder="搜索对话" />
        <div className="search-section-title">近期对话</div>
        <div className="search-results">
          {searchRecents.map((item, index) => (
            <button className={`search-result${item.active ? " is-active" : ""}`} key={`${item.title}-${item.project}`} type="button">
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

function Badge(props: { status: DeviceConnectionStatus | Conversation["status"] | TaskStatus }) {
  return <span className={`badge ${statusToClass(props.status)}`}>{statusText[props.status]}</span>;
}
