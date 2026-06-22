import type { ConnectionEntryModel } from "../../domain/connection/connectionEntry";

interface ConnectionEntryProps {
  model: ConnectionEntryModel;
  onRetry: () => void;
  onSelectDevice: (deviceId: string) => void;
}

export function ConnectionEntry({ model, onRetry, onSelectDevice }: ConnectionEntryProps) {
  return (
    <main className="connection-entry-shell" aria-label="连接状态">
      <header className="connection-entry-topbar">
        <div className="workspace-title">
          <h1>Codex Remote</h1>
        </div>
      </header>

      <section className="connection-entry-stage" aria-label="正在连接">
        <div className="connection-entry-center">
          <aside className="connection-entry-devices" aria-label="设备">
            <p className="connection-entry-label">设备</p>
            {model.devices.length ? (
              <div className="connection-entry-device-list">
                {model.devices.slice(0, 3).map((device) => (
                  <button
                    aria-label={device.ariaLabel}
                    className={`connection-entry-device${device.selected ? " is-selected" : ""}`}
                    key={device.id}
                    onClick={() => onSelectDevice(device.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className={`status-dot ${device.statusClassName}`} />
                    <span className="connection-entry-device-copy">
                      <span className="connection-entry-device-name">{device.name}</span>
                      <span className="connection-entry-device-meta">{device.meta}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="connection-entry-empty">暂无可显示设备</p>
            )}
          </aside>

          <section className="connection-entry-main" aria-label="连接步骤">
            <div className="connection-entry-brand" aria-hidden="true">
              <span className="connection-entry-mark" />
              <h2>{model.title}</h2>
            </div>
            <p className="connection-entry-summary">{model.summary}</p>

            <ol className="connection-entry-steps">
              {model.steps.map((step, index) => (
                <li className={`connection-entry-step is-${step.status}`} key={step.id}>
                  <span className="connection-entry-step-index" aria-hidden="true">
                    {step.status === "done" ? "✓" : index + 1}
                  </span>
                  <span className="connection-entry-step-copy">
                    <span className="connection-entry-step-title">{step.label}</span>
                    <span className="connection-entry-step-description">{step.description}</span>
                  </span>
                </li>
              ))}
            </ol>

            {model.status === "failed" ? (
              <div className="connection-entry-retry">
                <p>{model.failureTitle}</p>
                <button onClick={onRetry} type="button">重试连接</button>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <footer className="connection-entry-statusbar">
        <span>{model.status === "failed" ? "连接失败" : "正在连接"}</span>
        <span>设备列表最多显示前三台</span>
      </footer>
    </main>
  );
}
