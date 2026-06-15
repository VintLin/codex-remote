import type { DetailTarget, LinkReference } from "../assistantTimeline";
import { Icon } from "./icons";

interface DetailWorkspaceProps {
  conversationTitle: string;
  onClose?: () => void;
  target: DetailTarget | LinkReference | null;
}

export function DetailWorkspace({ conversationTitle, onClose, target }: DetailWorkspaceProps) {
  const title = target?.title || "详情";

  return (
    <aside aria-label={`${conversationTitle} detail workspace`} className="review-pane detail-workspace">
      <header className="review-header">
        <div className="review-title">
          <span className="nav-glyph">
            <Icon name="information-o" />
          </span>
          <span>{title}</span>
        </div>
        {onClose ? (
          <button aria-label="清空详情" className="icon-button" onClick={onClose} type="button">
            <Icon name="delete" />
          </button>
        ) : null}
      </header>

      <div className="review-scroll">
        {target ? <DetailContent target={target} /> : <DetailEmptyState />}
      </div>
    </aside>
  );
}

function DetailEmptyState() {
  return (
    <section className="linked-task">
      <h2>详情</h2>
      <p>点击消息中的链接或工具调用后，会在这里查看目标详情。</p>
    </section>
  );
}

function DetailContent({ target }: { target: DetailTarget | LinkReference }) {
  if (isLinkReference(target)) {
    return <LinkReferenceDetail target={target} />;
  }

  if (target.type === "diff") {
    return <DiffDetail target={target} />;
  }

  if (target.type === "tool") {
    return <ToolDetail target={target} />;
  }

  return <TargetDetail target={target} />;
}

function LinkReferenceDetail({ target }: { target: LinkReference }) {
  if (target.type === "skill" || target.type === "file") {
    return (
      <section className="linked-task">
        <h2>{target.title}</h2>
        <p>{target.href}</p>
        <p>当前仅展示链接目标，后续接入真实读取。</p>
      </section>
    );
  }

  if (target.type === "image") {
    return (
      <section className="linked-task">
        <h2>{target.title}</h2>
        <p>{target.href}</p>
      </section>
    );
  }

  return (
    <section className="linked-task">
      <h2>{target.title}</h2>
      <p>{target.href}</p>
    </section>
  );
}

function DiffDetail({ target }: { target: Extract<DetailTarget, { type: "diff" }> }) {
  return (
    <section className="diff-panel">
      <h2>{target.title}</h2>
      {target.changes.map((change) => (
        <article className="diff-file" key={`${change.path}-${change.changeKind}`}>
          <h3>{change.path}</h3>
          <p>{change.changeKind}</p>
          <pre>
            <code>{change.diff}</code>
          </pre>
        </article>
      ))}
    </section>
  );
}

function ToolDetail({ target }: { target: Extract<DetailTarget, { type: "tool" }> }) {
  return (
    <section className="linked-task">
      <h2>{target.title}</h2>
      <p>{target.presentation}</p>
      <pre>
        <code>{target.detail}</code>
      </pre>
    </section>
  );
}

function TargetDetail({ target }: { target: Exclude<DetailTarget, { type: "diff" } | { type: "tool" }> }) {
  if (target.type === "file") {
    return (
      <section className="linked-task">
        <h2>{target.title}</h2>
        <p>{target.path}</p>
      </section>
    );
  }

  if (target.type === "unknown") {
    return (
      <section className="linked-task">
        <h2>{target.title}</h2>
        <pre>
          <code>{target.detail}</code>
        </pre>
      </section>
    );
  }

  return (
    <section className="linked-task">
      <h2>{target.title}</h2>
      <p>{target.href}</p>
    </section>
  );
}

function isLinkReference(target: DetailTarget | LinkReference): target is LinkReference {
  return "label" in target;
}
