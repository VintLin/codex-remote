import { useState } from "react";
import { Icon, RightDetailPane } from "@codex-remote/ui";

import type { DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";

interface DetailWorkspaceProps {
  conversationTitle: string;
  isCollapsed: boolean;
  isMobile?: boolean | undefined;
  onBack?: (() => void) | undefined;
  onCollapse?: (() => void) | undefined;
  target: DetailTarget | LinkReference | null;
}

export function DetailWorkspace({ conversationTitle, isCollapsed, isMobile = false, onBack, onCollapse, target }: DetailWorkspaceProps) {
  const [selectedTool, setSelectedTool] = useState<WorkspaceToolKey>("review");
  const workspaceMeta = getWorkspaceMeta(target);
  const showWorkspaceMeta = target !== null;

  return (
    <RightDetailPane
      ariaLabel={`${conversationTitle} detail workspace`}
      backLabel="返回对话"
      className="detail-workspace"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title={showWorkspaceMeta ? workspaceMeta.label : undefined}
      titleIcon={showWorkspaceMeta ? workspaceMeta.icon : undefined}
    >
      {target ? <DetailContent target={target} /> : <DetailEmptyState selectedTool={selectedTool} onSelectTool={setSelectedTool} />}
    </RightDetailPane>
  );
}

type WorkspaceToolKey = "browser" | "chat" | "file" | "review" | "terminal";

interface WorkspaceToolDefinition {
  icon: "folder" | "globe" | "layout-list" | "message-circle-plus" | "square-terminal";
  key: WorkspaceToolKey;
  meta: string;
  title: string;
}

const workspaceTools: WorkspaceToolDefinition[] = [
  {
    key: "review",
    title: "审查",
    meta: "代码与结果检查",
    icon: "layout-list",
  },
  {
    key: "terminal",
    title: "终端",
    meta: "命令与日志",
    icon: "square-terminal",
  },
  {
    key: "browser",
    title: "浏览器",
    meta: "页面与 tab",
    icon: "globe",
  },
  {
    key: "file",
    title: "文件",
    meta: "路径与资源",
    icon: "folder",
  },
  {
    key: "chat",
    title: "侧边聊天",
    meta: "补充沟通",
    icon: "message-circle-plus",
  },
];

function DetailEmptyState({
  onSelectTool,
  selectedTool,
}: {
  onSelectTool: (tool: WorkspaceToolKey) => void;
  selectedTool: WorkspaceToolKey;
}) {
  return (
    <section className="detail-empty-shell">
      <div className="detail-tool-list" role="list">
        {workspaceTools.map((tool) => (
          <button
            aria-pressed={tool.key === selectedTool}
            className={`detail-tool-item${tool.key === selectedTool ? " is-active" : ""}`}
            key={tool.key}
            onClick={() => {
              onSelectTool(tool.key);
            }}
            type="button"
          >
            <span className="detail-tool-icon">
              <Icon name={tool.icon} />
            </span>
            <span className="detail-tool-copy">
              <span className="detail-tool-title">{tool.title}</span>
              <span className="detail-tool-meta">{tool.meta}</span>
            </span>
            <span className="detail-tool-arrow">
              <Icon name="right" />
            </span>
          </button>
        ))}
      </div>
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
      <section className="linked-task detail-module">
        <div className="detail-section-heading">文件</div>
        <div className="detail-target-row">
          <span className="detail-target-icon">
            <Icon name="folder" />
          </span>
          <div className="detail-target-copy">
            <h2>{target.title}</h2>
            <p>{target.href}</p>
          </div>
        </div>
        <p className="detail-empty-note">当前先展示链接目标，后续再接入真实读取。</p>
      </section>
    );
  }

  if (target.type === "image") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">浏览器</div>
        <div className="detail-target-row">
          <span className="detail-target-icon">
            <Icon name="globe" />
          </span>
          <div className="detail-target-copy">
            <h2>{target.title}</h2>
            <p>{target.href}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="linked-task detail-module">
      <div className="detail-section-heading">{target.type === "url" ? "浏览器" : "上下文"}</div>
      <div className="detail-target-row">
        <span className="detail-target-icon">
          <Icon name={target.type === "url" ? "globe" : "information-o"} />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{target.href}</p>
        </div>
      </div>
    </section>
  );
}

function DiffDetail({ target }: { target: Extract<DetailTarget, { type: "diff" }> }) {
  return (
    <section className="diff-panel detail-module">
      <div className="detail-section-heading">审查</div>
      <div className="detail-target-row detail-target-row-compact">
        <span className="detail-target-icon">
          <Icon name="layout-list" />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{target.changes.length} 个文件变更</p>
        </div>
      </div>
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
    <section className="linked-task detail-module">
      <div className="detail-section-heading">终端</div>
      <div className="detail-target-row">
        <span className="detail-target-icon">
          <Icon name="square-terminal" />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{target.presentation === "workspace" ? "工作区输出" : "内联输出"}</p>
        </div>
      </div>
      <pre>
        <code>{target.detail}</code>
      </pre>
    </section>
  );
}

function TargetDetail({ target }: { target: Exclude<DetailTarget, { type: "diff" } | { type: "tool" }> }) {
  if (target.type === "file") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">文件</div>
        <div className="detail-target-row">
          <span className="detail-target-icon">
            <Icon name="folder" />
          </span>
          <div className="detail-target-copy">
            <h2>{target.title}</h2>
            <p>{target.path}</p>
          </div>
        </div>
      </section>
    );
  }

  if (target.type === "unknown") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">上下文</div>
        <h2>{target.title}</h2>
        <pre>
          <code>{target.detail}</code>
        </pre>
      </section>
    );
  }

  return (
    <section className="linked-task detail-module">
      <div className="detail-section-heading">{target.type === "image" || target.type === "url" ? "浏览器" : "文件"}</div>
      <div className="detail-target-row">
        <span className="detail-target-icon">
          <Icon name={target.type === "image" || target.type === "url" ? "globe" : "folder"} />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{target.href}</p>
        </div>
      </div>
    </section>
  );
}

function getWorkspaceMeta(target: DetailTarget | LinkReference | null): { icon: "folder" | "globe" | "information-o" | "layout-list" | "square-terminal"; label: string } {
  if (!target) {
    return {
      label: "工具",
      icon: "layout-list",
    };
  }

  if (isLinkReference(target)) {
    if (target.type === "file" || target.type === "skill") {
      return { label: "文件", icon: "folder" };
    }

    if (target.type === "image" || target.type === "url") {
      return { label: "浏览器", icon: "globe" };
    }

    return { label: "上下文", icon: "information-o" };
  }

  if (target.type === "diff") {
    return { label: "审查", icon: "layout-list" };
  }

  if (target.type === "tool") {
    return { label: "终端", icon: "square-terminal" };
  }

  if (target.type === "file" || target.type === "skill") {
    return { label: "文件", icon: "folder" };
  }

  if (target.type === "image" || target.type === "url") {
    return { label: "浏览器", icon: "globe" };
  }

  return { label: "上下文", icon: "information-o" };
}

function isLinkReference(target: DetailTarget | LinkReference): target is LinkReference {
  return "label" in target;
}
