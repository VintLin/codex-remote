import type { BoardTask, Conversation, Device, DeviceConnectionStatus, TaskStatus } from "../mockData";
import { conversations, devices, diffLines, searchRecents, tasks } from "../mockData";
import { Icon, iconForDevice } from "./icons";
import { statusToClass } from "./sidebar";

interface ConversationMainProps {
  conversation: Conversation;
  device: Device;
  selectedTaskId: string;
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

export function ConversationMain({ conversation, device, selectedTaskId }: ConversationMainProps) {
  const task = tasks.find((item) => item.id === selectedTaskId) ?? tasks[0]!;
  const linkedConversations = task.linkedConversationIds
    .map((id) => conversations.find((conversationItem) => conversationItem.id === id))
    .filter((conversationItem): conversationItem is Conversation => Boolean(conversationItem));

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
          <div aria-label="Conversation controls" className="toolbar">
            <div aria-label="View mode" className="segmented">
              <button className="segmented-button is-active" type="button">
                Stream
              </button>
              <button className="segmented-button" type="button">
                Board
              </button>
            </div>
            <button className="button secondary" type="button">
              Interrupt
            </button>
            <button aria-label="More actions" className="icon-button" type="button">
              <Icon name="more" />
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <section aria-label="Current run summary" className="run-card">
            <div>
              <h2>{conversation.title}</h2>
              <p>{conversation.summary}</p>
            </div>
            <div className="run-facts">
              <Badge status={conversation.status} />
              <span className="badge">{conversation.sandbox}</span>
              <span className="badge">{conversation.approval}</span>
            </div>
          </section>

          <section aria-label="Conversation stream" className="message-stack">
            <article className="message">
              <div className="message-header">
                <span className="speaker">User</span>
                <span className="message-time">09:38</span>
              </div>
              <p>请调整侧边栏结构，保留设备、搜索、自动化入口，并将项目和对话记录按当前设备归组。</p>
            </article>

            <article className="message">
              <div className="message-header">
                <span className="speaker">Codex on {device.name}</span>
                <span className="message-time">{conversation.updatedAt}</span>
              </div>
              <p>我会把这部分保持在前端 mock 层，菜单和弹窗先只承载交互形态，不绑定真实 app-server 操作。</p>
              <FileChange path="apps/web/src/mockData.ts" />
              <FileChange path="packages/ui/src/styles.css" />
            </article>
          </section>
        </div>

        <div className="composer-wrap">
          <form className="composer">
            <textarea aria-label="Follow-up message" placeholder="Ask for follow-up changes on the selected device" />
            <div className="composer-actions">
              <div className="composer-options">
                <span className="badge">{device.name}</span>
                <span className="badge">{conversation.sandbox}</span>
                <span className="badge">{device.model}</span>
              </div>
              <button className="button primary" type="button">
                Send
              </button>
            </div>
          </form>
        </div>
      </main>

      <ReviewPane device={device} linkedConversations={linkedConversations} task={task} />
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

function ReviewPane(props: { device: Device; linkedConversations: Conversation[]; task: BoardTask }) {
  return (
    <aside aria-label="Review and task details" className="review-pane">
      <header className="review-header">
        <div className="review-title">
          <span className="nav-glyph">
            <Icon name="information-o" />
          </span>
          <span>Review</span>
        </div>
        <button aria-label="Open review actions" className="icon-button" type="button">
          <Icon name="more" />
        </button>
      </header>

      <div className="review-scroll">
        <section className="approval-box">
          <h2>Pending approval</h2>
          <p>{props.device.name} requests permission before exposing local project paths outside the confirmed allowlist.</p>
        </section>

        <section className="linked-task">
          <h2>{props.task.title}</h2>
          <p>
            {props.linkedConversations
              .map((item) => `${item.title} on ${devices.find((deviceItem) => deviceItem.id === item.deviceId)?.name ?? "Unknown device"}`)
              .join(", ")}
          </p>
        </section>

        <section className="diff-panel">
          <h2>Unstaged changes</h2>
          <div className="diff-file">
            {diffLines.map((line) => {
              const className = line.kind === "context" ? "diff-line" : `diff-line ${line.kind}`;
              const prefix = line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  ";
              return (
                <div className={className} key={`${line.kind}-${line.line}-${line.text}`}>
                  <span className="line-number">{line.line}</span>
                  <span>{prefix + line.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}

function Badge(props: { status: DeviceConnectionStatus | Conversation["status"] | TaskStatus }) {
  return <span className={`badge ${statusToClass(props.status)}`}>{statusText[props.status]}</span>;
}

function FileChange(props: { path: string }) {
  return (
    <div className="file-change">
      <code>{props.path}</code>
      <span>
        <span className="diff-count">+228</span> <span className="diff-count remove">-0</span>
      </span>
    </div>
  );
}
