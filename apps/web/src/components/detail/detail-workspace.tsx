import { useState } from "react";
import { Icon, RightDetailPane } from "@codex-remote/ui";

import type { DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import type { WebDictionary } from "../../i18n/dictionary.ts";

interface DetailWorkspaceProps {
  conversationTitle: string;
  copy: WebDictionary["detail"];
  isCollapsed: boolean;
  isMobile?: boolean | undefined;
  onBack?: (() => void) | undefined;
  onCollapse?: (() => void) | undefined;
  target: DetailTarget | LinkReference | null;
}

const FALLBACK_DICTIONARY: WebDictionary["detail"] = {
  review: "审查",
  terminal: "终端",
  browser: "浏览器",
  files: "文件",
  sideChat: "侧边聊天",
  deviceDetails: "设备详情",
  taskDetails: "任务详情",
  collapseRight: "收起右侧边栏",
  toolMeta: "工具",
  context: "上下文",
  fileMeta: "路径与资源",
  browserMeta: "页面与 tab",
  reviewMeta: "代码与结果检查",
  sideChatMeta: "补充沟通",
  terminalMeta: "命令与日志",
  workspaceOutput: "工作区输出",
  inlineOutput: "内联输出",
  fileChanges: (count: number) => `${count} 个文件变更`,
  temporaryFileLink: "当前先展示链接目标，后续再接入真实读取。",
  reviewRequestTitle: "Review request accepted",
};

export function DetailWorkspace({ conversationTitle, copy, isCollapsed, isMobile = false, onBack, onCollapse, target }: DetailWorkspaceProps) {
  const detailCopy = copy ?? FALLBACK_DICTIONARY;
  const [selectedTool, setSelectedTool] = useState<WorkspaceToolKey>("review");
  const workspaceMeta = getWorkspaceMeta(detailCopy, target);
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
      {target ? <DetailContent copy={detailCopy} target={target} /> : <DetailEmptyState copy={detailCopy} selectedTool={selectedTool} onSelectTool={setSelectedTool} />}
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

function getWorkspaceTools(copy: WebDictionary["detail"]): WorkspaceToolDefinition[] {
  return [
    { key: "review", title: copy.review, meta: copy.reviewMeta, icon: "layout-list" },
    { key: "terminal", title: copy.terminal, meta: copy.terminalMeta, icon: "square-terminal" },
    { key: "browser", title: copy.browser, meta: copy.browserMeta, icon: "globe" },
    { key: "file", title: copy.files, meta: copy.fileMeta, icon: "folder" },
    { key: "chat", title: copy.sideChat, meta: copy.sideChatMeta, icon: "message-circle-plus" },
  ];
}

function DetailEmptyState({
  copy,
  onSelectTool,
  selectedTool,
}: {
  copy: WebDictionary["detail"];
  onSelectTool: (tool: WorkspaceToolKey) => void;
  selectedTool: WorkspaceToolKey;
}) {
  const tools = getWorkspaceTools(copy);
  return (
    <section className="detail-empty-shell">
      <div className="detail-tool-list" role="list">
        {tools.map((tool) => (
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

function DetailContent({ copy, target }: { copy: WebDictionary["detail"]; target: DetailTarget | LinkReference }) {
  if (isLinkReference(target)) {
    return <LinkReferenceDetail copy={copy} target={target} />;
  }

  if (target.type === "diff") {
    return <DiffDetail copy={copy} target={target} />;
  }

  if (target.type === "tool") {
    return <ToolDetail copy={copy} target={target} />;
  }

  return <TargetDetail copy={copy} target={target} />;
}

function LinkReferenceDetail({ copy, target }: { copy: WebDictionary["detail"]; target: LinkReference }) {
  if (target.type === "skill" || target.type === "file") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">{copy.files}</div>
        <div className="detail-target-row">
          <span className="detail-target-icon">
            <Icon name="folder" />
          </span>
          <div className="detail-target-copy">
            <h2>{target.title}</h2>
            <p>{target.href}</p>
          </div>
        </div>
        <p className="detail-empty-note">{copy.temporaryFileLink}</p>
      </section>
    );
  }

  if (target.type === "image") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">{copy.browser}</div>
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
      <div className="detail-section-heading">{target.type === "url" ? copy.browser : copy.context}</div>
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

function DiffDetail({ copy, target }: { copy: WebDictionary["detail"]; target: Extract<DetailTarget, { type: "diff" }> }) {
  return (
    <section className="diff-panel detail-module">
      <div className="detail-section-heading">{copy.review}</div>
      <div className="detail-target-row detail-target-row-compact">
        <span className="detail-target-icon">
          <Icon name="layout-list" />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{copy.fileChanges(target.changes.length)}</p>
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

function ToolDetail({ copy, target }: { copy: WebDictionary["detail"]; target: Extract<DetailTarget, { type: "tool" }> }) {
  return (
    <section className="linked-task detail-module">
      <div className="detail-section-heading">{copy.terminal}</div>
      <div className="detail-target-row">
        <span className="detail-target-icon">
          <Icon name="square-terminal" />
        </span>
        <div className="detail-target-copy">
          <h2>{target.title}</h2>
          <p>{target.presentation === "workspace" ? copy.workspaceOutput : copy.inlineOutput}</p>
        </div>
      </div>
      <pre>
        <code>{target.detail}</code>
      </pre>
    </section>
  );
}

function TargetDetail({ copy, target }: { copy: WebDictionary["detail"]; target: Exclude<DetailTarget, { type: "diff" } | { type: "tool" }> }) {
  if (target.type === "file") {
    return (
      <section className="linked-task detail-module">
        <div className="detail-section-heading">{copy.files}</div>
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
        <div className="detail-section-heading">{copy.context}</div>
        <h2>{target.title}</h2>
        <pre>
          <code>{target.detail}</code>
        </pre>
      </section>
    );
  }

  return (
    <section className="linked-task detail-module">
      <div className="detail-section-heading">{target.type === "image" || target.type === "url" ? copy.browser : copy.files}</div>
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

function getWorkspaceMeta(copy: WebDictionary["detail"], target: DetailTarget | LinkReference | null): { icon: "folder" | "globe" | "information-o" | "layout-list" | "square-terminal"; label: string } {
  if (!target) {
    return {
      label: copy.toolMeta,
      icon: "layout-list",
    };
  }

  if (isLinkReference(target)) {
    if (target.type === "file" || target.type === "skill") {
      return { label: copy.files, icon: "folder" };
    }

    if (target.type === "image" || target.type === "url") {
      return { label: copy.browser, icon: "globe" };
    }

    return { label: copy.context, icon: "information-o" };
  }

  if (target.type === "diff") {
    return { label: copy.review, icon: "layout-list" };
  }

  if (target.type === "tool") {
    return { label: copy.terminal, icon: "square-terminal" };
  }

  if (target.type === "file" || target.type === "skill") {
    return { label: copy.files, icon: "folder" };
  }

  if (target.type === "image" || target.type === "url") {
    return { label: copy.browser, icon: "globe" };
  }

  return { label: copy.context, icon: "information-o" };
}

function isLinkReference(target: DetailTarget | LinkReference): target is LinkReference {
  return "label" in target;
}
