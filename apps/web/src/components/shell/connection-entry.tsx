import type { WebDictionary } from "../../i18n/dictionary.ts";
import type { ConnectionEntryModel } from "../../domain/connection/connectionEntry.ts";

interface ConnectionEntryProps {
  copy: WebDictionary["connection"];
  model: ConnectionEntryModel;
  onRetry: () => void;
  onSelectDevice: (deviceId: string) => void;
}

export function ConnectionEntry({ copy, model, onRetry, onSelectDevice }: ConnectionEntryProps) {
  return (
    <main className="connection-entry-shell" aria-label={copy.shellLabel}>
      <header className="connection-entry-topbar">
        <div className="workspace-title">
          <h1>Codex Remote</h1>
        </div>
      </header>

      <section className="connection-entry-stage" aria-label={copy.stageLabel}>
        <div className="connection-entry-center">
          <aside className="connection-entry-devices" aria-label={copy.devicesLabel}>
            <p className="connection-entry-label">{copy.devicesLabel}</p>
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
              <p className="connection-entry-empty">{copy.noDevices}</p>
            )}
          </aside>

          <section className="connection-entry-main" aria-label={copy.stepsLabel}>
            <div className="connection-entry-brand" aria-hidden="true">
              <span className="connection-entry-mark" />
              <h2>{model.title}</h2>
            </div>
            <div className="connection-entry-summary" role={model.summaryLoading ? "status" : undefined}>
              {model.summaryLoading ? <span className="connection-entry-summary-spinner" aria-hidden="true" /> : null}
              <span className="connection-entry-summary-copy">
                <span className="connection-entry-summary-title">{model.summary}</span>
                {model.summaryDetails.length ? (
                  <span className="connection-entry-summary-details">
                    {model.summaryDetails.map((detail) => (
                      <span className={`connection-entry-summary-detail is-${detail.status}`} key={detail.label}>
                        <span aria-hidden="true" className="connection-entry-summary-detail-dot" />
                        <span>{detail.label}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </div>

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
                <button onClick={onRetry} type="button">{copy.retry}</button>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <footer className="connection-entry-statusbar">
        <span>{model.status === "failed" ? copy.failed : copy.connecting}</span>
        <span>{copy.deviceLimit}</span>
      </footer>
    </main>
  );
}
