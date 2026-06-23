"use client";

import type { ReactNode } from "react";
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
  ProjectSearchResult,
  TaskConversationLink,
  TaskStatus,
} from "@codex-remote/api-contract";
import type { AdvancedPlatformData, LocalWorkbenchData, RuntimeSettingsData, SearchRecent, WorkbenchData } from "../../data/workerApi/workbenchData";
import type { Locale, WebDictionary } from "../../i18n/dictionary.ts";
import { getStatusClassName, getStatusText } from "../../domain/status/statusPresentation";
import { ActionMenu } from "../sidebar/action-menu";
import { CodexAssistantThread } from "../conversation/codex-assistant-thread";
import type { SubmitFollowUpDraftResult } from "../conversation/followUpComposerSubmit";
import { DetailWorkspace } from "./detail-workspace";
import { iconForDevice } from "../shared/icons";

interface ConversationMainProps {
  actionsCopy: WebDictionary["actions"];
  assistantThread: AssistantThreadSnapshot | null;
  canStartConversation: boolean;
  canSubmitFollowUp: boolean;
  conversation: CodexConversation | null;
  conversationCopy: WebDictionary["conversation"];
  controlStatus: "accepted" | "failed" | "idle" | "submitting";
  copy: WebDictionary["mainPanels"];
  detailCopy: WebDictionary["detail"];
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
  copy: WebDictionary["mainPanels"];
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
  copy: WebDictionary["mainPanels"];
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

interface LocalWorkbenchPageProps {
  canStartReview: boolean;
  copy: WebDictionary["mainPanels"];
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  localWorkbench: LocalWorkbenchData;
  onBack?: () => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  onSubmitReviewStart: (confirmationText: string) => Promise<void>;
  onSearchLocalFiles: (query: string) => Promise<ProjectSearchResult | null>;
  reviewStartError: string | null;
  reviewStartStatus: "accepted" | "failed" | "idle" | "submitting";
  source: WorkbenchData["source"];
}

interface SettingsPageProps {
  conversations: CodexConversation[];
  copy: Pick<WebDictionary, "detail" | "mainPanels" | "settings" | "status">;
  isDetailCollapsed: boolean;
  isMobile?: boolean;
  isSidebarCollapsed: boolean;
  locale: Locale;
  onBack?: () => void;
  onExpandDetail: () => void;
  onExpandSidebar: () => void;
  onLocaleChange: (locale: Locale) => void;
  onRestoreConversation: (conversation: CodexConversation) => Promise<void>;
  advancedPlatform: AdvancedPlatformData;
  runtimeSettings: RuntimeSettingsData;
}

interface SearchDialogProps {
  copy: WebDictionary["mainPanels"];
  onClose: () => void;
  onSelectConversation: (conversationKey: string) => void;
  open: boolean;
  selectedConversationKey: string | null;
  searchRecents: SearchRecent[];
}

export function ConversationMain({
  actionsCopy,
  assistantThread,
  canStartConversation,
  canSubmitFollowUp,
  conversation,
  conversationCopy,
  controlStatus,
  copy,
  detailCopy,
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
  const conversationTitle = conversation === null ? conversationCopy.empty : conversation.title;
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
            <HeaderBackButton copy={copy} label={copy.backToNavigation} onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <div className="conversation-collapsed-sidebar-controls">
              <SidebarToggleButton collapsed copy={copy} direction="left" label={copy.expandLeftSidebar} onClick={onExpandSidebar} />
              <button
                aria-label={copy.expandLeftSidebar}
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
                aria-label={copy.expandLeftSidebar}
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
                aria-label={copy.renameConversation}
                className="conversation-rename-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onRenameConversation(conversation, renameDraft);
                }}
              >
                <input
                  aria-label={copy.conversationTitle}
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  value={renameDraft}
                />
                <button disabled={controlStatus === "submitting" || renameDraft.trim() === ""} type="submit">
                  {copy.save}
                </button>
                <button onClick={onCancelRenameConversation} type="button">
                  {copy.cancel}
                </button>
              </form>
            ) : (
              <h1>{conversationTitle}</h1>
            )}
            <ConversationStatusBadges conversation={conversation} />
            {!isMobile ? (
              <ActionMenu
                {...(actionsCopy ? { copy: actionsCopy } : {})}
                archived={conversation?.archived === true}
                ariaLabel={copy.openConversationMenu}
                className="conversation-title-menu"
                group="conversation"
                {...(conversation ? { onArchive: () => void onArchiveConversation(conversation) } : {})}
                {...(conversation ? { onRename: onBeginRenameConversation } : {})}
                {...(conversation ? { onRestore: () => void onRestoreConversation(conversation) } : {})}
              />
            ) : null}
          </div>
        </div>
        <div aria-label={copy.conversationControls} className="toolbar conversation-toolbar">
          <span className="datasource-status" title={datasourceStatus.join(" · ")}>
            {datasourceStatus.join(" · ")}
          </span>
          {!isMobile ? (
            <button aria-label={copy.layoutList} className="icon-button conversation-layout-button" type="button">
              <Icon name="layout-list" />
            </button>
          ) : null}
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="right" label={copy.expandRightSidebar} onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>

      <div className="content-scroll conversation-content-scroll">
        {isExampleData ? (
          <section aria-label={copy.datasourceStatus} className="conversation-source-banner">
            <strong>{copy.notConnectedToControlPlane}</strong>
            <span>{copy.showingSampleData(datasourceStatus.join(" · "))}</span>
          </section>
        ) : null}
        <CodexAssistantThread
          activeTurnId={activeTurnId}
          approvalCards={approvalCards}
          canStartConversation={canStartConversation}
          canSubmitFollowUp={canSubmitFollowUp}
          controlStatus={controlStatus}
          dictionary={conversationCopy}
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
  copy,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  locale,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onLocaleChange,
  onRestoreConversation,
  advancedPlatform,
  runtimeSettings,
}: SettingsPageProps) {
  const archivedConversations = conversations.filter((conversation) => conversation.archived === true);

  return (
    <main className="main-pane settings-page">
      <header className="topbar">
        <div className="topbar-leading">
          {isMobile && onBack ? <HeaderBackButton copy={copy.mainPanels} label={copy.mainPanels.backToNavigation} onClick={onBack} /> : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed copy={copy.mainPanels} direction="left" label={copy.mainPanels.expandLeftSidebar} onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title">
            <h1>{copy.mainPanels.settings}</h1>
          </div>
        </div>
        <div className="toolbar">
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed copy={copy.mainPanels} direction="right" label={copy.mainPanels.expandRightSidebar} onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll settings-content">
        <section aria-label={copy.settings.languageLabel} className="settings-section">
          <h2>{copy.settings.languageLabel}</h2>
          <div className="settings-language-options" role="group" aria-label={copy.settings.languageLabel}>
            <button
              aria-pressed={locale === "zh-CN"}
              className="secondary-button"
              onClick={() => onLocaleChange("zh-CN")}
              type="button"
            >
              {copy.settings.languageChinese}
            </button>
            <button
              aria-pressed={locale === "en-US"}
              className="secondary-button"
              onClick={() => onLocaleChange("en-US")}
              type="button"
            >
              {copy.settings.languageEnglish}
            </button>
          </div>
        </section>
        <RuntimeSettingsPanel copy={copy.mainPanels} runtimeSettings={runtimeSettings} />
        <AdvancedPlatformPanel advancedPlatform={advancedPlatform} copy={copy.mainPanels} />
        <section aria-label={copy.mainPanels.archivedConversations} className="settings-section">
          <h2>{copy.mainPanels.archivedConversations}</h2>
          {archivedConversations.length === 0 ? (
            <p className="empty-state">{copy.mainPanels.noArchivedConversations}</p>
          ) : (
            <div className="settings-list">
              {archivedConversations.map((conversation) => (
                <article className="settings-row" key={`${conversation.deviceId}:${conversation.id}`}>
                  <span>
                    <strong>{conversation.title}</strong>
                    <span>{conversation.projectName} · {conversation.updatedAt}</span>
                  </span>
                  <button className="button secondary" onClick={() => void onRestoreConversation(conversation)} type="button">
                    {copy.mainPanels.restore}
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

function AdvancedPlatformPanel({ advancedPlatform, copy }: { advancedPlatform: AdvancedPlatformData; copy: WebDictionary["mainPanels"] }) {
  if (advancedPlatform.status === "empty" || advancedPlatform.status === "unavailable") {
    return (
      <section aria-label={copy.advancedPlatform} className="settings-section runtime-settings-panel advanced-platform-panel">
        <h2>{copy.advancedPlatform}</h2>
        <p className="empty-state">{copy.advancedPlatformEmpty}</p>
      </section>
    );
  }

  if (!advancedPlatform.summary) {
    return (
      <section aria-label={copy.advancedPlatform} className="settings-section runtime-settings-panel advanced-platform-panel">
        <h2>{copy.advancedPlatform}</h2>
        <p className="empty-state">{advancedPlatform.error?.code ? copy.advancedPlatformWithCode(advancedPlatform.error.code) : copy.advancedPlatformMissing}</p>
      </section>
    );
  }

  const summary = advancedPlatform.summary;

  return (
    <section aria-label={copy.advancedPlatform} className="settings-section runtime-settings-panel advanced-platform-panel">
      <header className="runtime-settings-header">
        <h2>{copy.advancedPlatform}</h2>
        <code>{advancedPlatform.status}</code>
      </header>
      <div className="runtime-settings-grid">
        <RuntimeSettingsCard title={copy.advancedPlatformWindowsSandbox} status={toRuntimeSettingsCardStatus(advancedPlatform.status)}>
          {summary.readinessSections.length ? summary.readinessSections.map((section) => (
            <RuntimeSettingsRow
              key={section.id}
              label={section.label}
              value={section.error?.code ? `${section.status} · ${section.error.code}` : section.status}
            />
          )) : <p className="empty-state">{copy.runtimeNoReadinessSection}</p>}
          <RuntimeSettingsRow label="Platform" value={summary.platform} />
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.advancedPlatformSupportMatrix} status="loaded">
          {summary.watchlistItems.length ? summary.watchlistItems.map((item) => (
            <RuntimeSettingsRow key={item.id} label={item.label} value={item.support} />
          )) : <p className="empty-state">{copy.runtimeNoWatchlistItem}</p>}
        </RuntimeSettingsCard>
      </div>
    </section>
  );
}

function RuntimeSettingsPanel({ copy, runtimeSettings }: { copy: WebDictionary["mainPanels"]; runtimeSettings: RuntimeSettingsData }) {
  if (runtimeSettings.status === "empty" || runtimeSettings.status === "unavailable") {
    return (
      <section aria-label={copy.runtimeSettings} className="settings-section runtime-settings-panel">
        <h2>{copy.runtimeSettings}</h2>
        <p className="empty-state">{copy.runtimeSettingsEmpty}</p>
      </section>
    );
  }

  if (!runtimeSettings.summary) {
    return (
      <section aria-label={copy.runtimeSettings} className="settings-section runtime-settings-panel">
        <h2>{copy.runtimeSettings}</h2>
        <p className="empty-state">{runtimeSettings.error?.code ? copy.runtimeSettingsWithCode(runtimeSettings.error.code) : copy.runtimeSettingsMissing}</p>
      </section>
    );
  }

  const summary = runtimeSettings.summary;
  const defaultModel = summary.models.find((model) => model.isDefault) ?? summary.models[0] ?? null;
  const missing = copy.missingValue;

  return (
    <section aria-label={copy.runtimeSettings} className="settings-section runtime-settings-panel">
      <header className="runtime-settings-header">
        <h2>{copy.runtimeSettings}</h2>
        <code>{runtimeSettings.status}</code>
      </header>
      <div className="runtime-settings-grid">
        <RuntimeSettingsCard title={copy.runtimeModels} status={findRuntimeSectionStatus(summary, "models")}>
          <RuntimeSettingsRow label={copy.runtimeDefaultModel} value={defaultModel ? `${defaultModel.displayName} (${defaultModel.id})` : missing} />
          <RuntimeSettingsRow label={copy.runtimeModelCount} value={String(summary.models.length)} />
          <RuntimeSettingsRow label={copy.runtimeReasoningStrength} value={defaultModel?.supportedReasoningEfforts.join(", ") || missing} />
          <RuntimeSettingsRow label={copy.runtimeInputModalities} value={defaultModel?.inputModalities.join(", ") || missing} />
          <RuntimeSettingsRow label={copy.runtimeServiceTiers} value={defaultModel?.serviceTiers.join(", ") || missing} />
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimeProviderCapabilities} status={findRuntimeSectionStatus(summary, "providerCapabilities")}>
          <RuntimeSettingsRow label="Reasoning" value={formatBoolean(copy, summary.providerCapabilities.supportsReasoning)} />
          <RuntimeSettingsRow label="Images" value={formatBoolean(copy, summary.providerCapabilities.supportsImages)} />
          <RuntimeSettingsRow label="Web search" value={formatBoolean(copy, summary.providerCapabilities.supportsWebSearch)} />
          <RuntimeSettingsRow label="Structured output" value={formatBoolean(copy, summary.providerCapabilities.supportsStructuredOutput)} />
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimeAccount} status={findRuntimeSectionStatus(summary, "account")}>
          <RuntimeSettingsRow label={copy.runtimeAccountType} value={summary.account.type} />
          <RuntimeSettingsRow label={copy.runtimeAccountPlan} value={summary.account.planType ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeAccountEmailDomain} value={summary.account.emailDomain ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeAccountRequiresOpenaiAuth} value={formatBoolean(copy, summary.account.requiresOpenaiAuth)} />
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimeConfigPosture} status={findRuntimeSectionStatus(summary, "config")}>
          <RuntimeSettingsRow label={copy.runtimeConfigModel} value={summary.config.model ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigReviewModel} value={summary.config.reviewModel ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigProvider} value={summary.config.modelProvider ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigApproval} value={summary.config.approvalPolicy ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigReviewer} value={summary.config.approvalsReviewer ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigSandbox} value={summary.config.sandboxMode ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigReasoning} value={summary.config.reasoningEffort ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigServiceTier} value={summary.config.serviceTier ?? missing} />
          <RuntimeSettingsRow label={copy.runtimeConfigWebSearch} value={summary.config.webSearch === null ? missing : formatBoolean(copy, summary.config.webSearch)} />
          <RuntimeSettingsRow label={copy.runtimeConfigCustomGuidance} value={formatBoolean(copy, summary.config.customGuidanceOmitted)} />
          <RuntimeSettingsRow label={copy.runtimeConfigDeveloperGuidance} value={formatBoolean(copy, summary.config.developerGuidanceOmitted)} />
          <RuntimeSettingsRow label={copy.runtimeConfigCompactionGuidance} value={formatBoolean(copy, summary.config.compactionGuidanceOmitted)} />
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimePermissionProfiles} status={findRuntimeSectionStatus(summary, "permissionProfiles")}>
          {summary.permissionProfiles.length ? summary.permissionProfiles.map((profile) => (
            <RuntimeSettingsRow key={profile.id} label={profile.id} value={profile.description ?? copy.runtimeNoDescription} />
          )) : <p className="empty-state">{copy.runtimeNoPermissionProfiles}</p>}
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimeExperimentalFeatures} status={findRuntimeSectionStatus(summary, "experimentalFeatures")}>
          {summary.experimentalFeatures.length ? summary.experimentalFeatures.map((feature) => (
            <RuntimeSettingsRow
              key={feature.name}
              label={feature.displayName ?? feature.name}
              value={copy.runtimeExperimentalFeatureState(feature.stage, feature.enabled, feature.defaultEnabled)}
            />
          )) : <p className="empty-state">{copy.runtimeNoExperimentalFeatures}</p>}
        </RuntimeSettingsCard>

        <RuntimeSettingsCard title={copy.runtimeSectionStatuses} status={runtimeSettings.status}>
          {summary.sections.map((section) => (
            <RuntimeSettingsRow
              key={section.section}
              label={section.section}
              value={section.error?.code ? `${section.status} · ${section.error.code}` : section.status}
            />
          ))}
        </RuntimeSettingsCard>
      </div>
    </section>
  );
}

function RuntimeSettingsCard({
  children,
  status,
  title,
}: {
  children: ReactNode;
  status: "degraded" | "loaded" | "unavailable";
  title: string;
}) {
  return (
    <article className="runtime-settings-card" data-status={status}>
      <header>
        <h3>{title}</h3>
        <code>{status}</code>
      </header>
      <div className="runtime-settings-list">{children}</div>
    </article>
  );
}

function RuntimeSettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="runtime-settings-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toRuntimeSettingsCardStatus(status: AdvancedPlatformData["status"]): "degraded" | "loaded" | "unavailable" {
  if (status === "loaded") {
    return "loaded";
  }

  if (status === "degraded") {
    return "degraded";
  }

  return "unavailable";
}

function findRuntimeSectionStatus(
  summary: NonNullable<RuntimeSettingsData["summary"]>,
  section: NonNullable<RuntimeSettingsData["summary"]>["sections"][number]["section"],
): "degraded" | "loaded" | "unavailable" {
  return summary.sections.find((item) => item.section === section)?.status ?? "unavailable";
}

function formatBoolean(copy: WebDictionary["mainPanels"], value: boolean): string {
  return value ? copy.yes : copy.no;
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
  detailCopy,
  isCollapsed,
  isMobile,
  onBack,
  onCollapse,
  target,
}: {
  conversationTitle: string;
  detailCopy: WebDictionary["detail"];
  isCollapsed: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  onCollapse: () => void;
  target: DetailTarget | LinkReference | null;
}) {
  return (
    <DetailWorkspace
      conversationTitle={conversationTitle}
      copy={detailCopy}
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      target={target}
    />
  );
}

export function DevicesPage({
  copy,
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
            <HeaderBackButton copy={copy} label={copy.backToNavigation} onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="left" label={copy.expandLeftSidebar} onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title devices-title">
            <h1>{copy.device}</h1>
            <button aria-label={copy.addDevice} className="icon-button devices-add-button" disabled type="button">
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <div className="toolbar devices-toolbar">
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="right" label={copy.expandRightSidebar} onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>

      <div className="content-scroll">
        <section aria-label={copy.deviceList} className="device-grid">
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
                    {device.ip} - {copy.deviceLastOnline(device.lastOnlineAt)}
                  </span>
                </span>
              </button>
              <div className="device-card-actions">
                <button aria-label={copy.editDevice} className="icon-button device-action-button" disabled type="button">
                  <Icon name="pencil" />
                </button>
                <button aria-label={copy.deleteDevice} className="icon-button device-action-button device-action-button-danger" disabled type="button">
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
  copy,
  isCollapsed,
  isMobile = false,
  onBack,
  onCollapse,
  selectedDeviceId,
  devices,
  detailCopy,
}: {
  copy: WebDictionary["mainPanels"];
  detailCopy: WebDictionary["detail"];
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
        backLabel={copy.backToDeviceList}
        className="device-detail-pane"
        isCollapsed={isCollapsed}
        isMobile={isMobile}
        onBack={onBack}
        onCollapse={onCollapse}
        title={detailCopy.deviceDetails}
        titleIcon="laptop"
      >
        <section className="linked-task">
          <h2>{copy.noDeviceData}</h2>
        </section>
      </RightDetailPane>
    );
  }

  return (
    <RightDetailPane
      ariaLabel="Device detail"
      backLabel={copy.backToDeviceList}
      className="device-detail-pane"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title={detailCopy.deviceDetails}
      titleIcon={iconForDevice(selectedDevice)}
    >
      <section className="linked-task">
        <h2>{selectedDevice.name}</h2>
        <p>{copy.deviceStatus(getStatusText(FALLBACK_STATUS_DICTIONARY, selectedDevice.status))}</p>
        <p>{copy.deviceIp(selectedDevice.ip)}</p>
        <p>{copy.deviceLastOnline(selectedDevice.lastOnlineAt)}</p>
      </section>
      <section className="linked-task">
        <h2>{copy.deviceCurrentContext}</h2>
        <p>{copy.deviceProject(selectedDevice.currentProject)}</p>
        <p>{copy.deviceModel(selectedDevice.model)}</p>
        <p>{copy.deviceEditLater}</p>
      </section>
    </RightDetailPane>
  );
}

const FALLBACK_STATUS_DICTIONARY = {
  Connected: "Connected",
  "Not connected": "Not connected",
  done: "Done",
  failed: "Failed",
  in_progress: "In progress",
  running: "Running",
  unknown: "Unknown",
  waiting: "Waiting",
} as const;

export function TaskBoardPage({
  conversations,
  copy,
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
            <HeaderBackButton copy={copy} label={copy.backToNavigation} onClick={onBack} />
          ) : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="left" label={copy.expandLeftSidebar} onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title tasks-title">
            <h1>{copy.tasks}</h1>
          </div>
        </div>
        <div className="toolbar tasks-toolbar">
          <span className="datasource-status">{taskStatus}</span>
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="right" label={copy.expandRightSidebar} onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll">
        {isExampleData ? (
          <section aria-label={copy.taskBoardSource} className="conversation-source-banner">
            <strong>{copy.notConnectedToControlPlane}</strong>
            <span>{copy.showingSampleTasks(datasourceStatus.join(" · "))}</span>
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
              aria-label={copy.taskTitle}
              className="conversation-control-input"
              disabled={disabled}
              onChange={(event) => setTaskTitle(event.target.value)}
              value={taskTitle}
            />
            <button className="button secondary conversation-control-button" disabled={disabled || !taskTitle.trim()} type="submit">
              {copy.createTask}
            </button>
          </div>
        </form>
        <section aria-label={copy.taskBoard} className="device-grid">
          {taskLoadState === "failed" ? (
            <article className="empty-state">
              <h2>{copy.cannotLoadTasks}</h2>
              <p>{copy.retryTasks}</p>
            </article>
          ) : tasks.length === 0 ? (
            <article className="empty-state">
              <h2>{copy.noTasks}</h2>
              <p>{copy.createTaskHint}</p>
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
                    <span className="device-card-meta">{copy.linksCount(task.linkedConversations.length)}</span>
                  </span>
                </div>
                <div className="device-card-actions">
                  <button
                    className="button secondary conversation-control-button"
                    disabled={disabled || !selectedConversation?.projectId || selectedLinked}
                    onClick={() => void onLinkSelectedConversation(task)}
                    type="button"
                  >
                    {copy.link}
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
                          {copy.unlink}
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

export function LocalWorkbenchPage({
  canStartReview,
  copy,
  isDetailCollapsed,
  isMobile = false,
  isSidebarCollapsed,
  localWorkbench,
  onBack,
  onExpandDetail,
  onExpandSidebar,
  onSubmitReviewStart,
  onSearchLocalFiles,
  reviewStartError,
  reviewStartStatus,
  source,
}: LocalWorkbenchPageProps) {
  const [reviewConfirmation, setReviewConfirmation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"failed" | "idle" | "submitting">("idle");
  const datasourceStatus = localWorkbench.status === "degraded" ? "degraded" : source.reason;
  const reviewDisabled = !canStartReview || reviewConfirmation !== "START REVIEW" || reviewStartStatus === "submitting";

  return (
    <main className="main-pane local-workbench-page">
      <header className="topbar">
        <div className="topbar-leading">
          {isMobile && onBack ? <HeaderBackButton copy={copy} label={copy.backToNavigation} onClick={onBack} /> : null}
          {!isMobile && isSidebarCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="left" label={copy.expandLeftSidebar} onClick={onExpandSidebar} />
          ) : null}
          <div className="workspace-title">
            <h1>{copy.localTools}</h1>
          </div>
        </div>
        <div className="toolbar">
          <span className="datasource-status">{datasourceStatus}</span>
          {!isMobile && isDetailCollapsed ? (
            <SidebarToggleButton collapsed copy={copy} direction="right" label={copy.expandRightSidebar} onClick={onExpandDetail} />
          ) : null}
        </div>
      </header>
      <div className="content-scroll local-workbench-content">
        {localWorkbench.status === "degraded" ? (
          <section aria-label={copy.localToolsDegradedRegion} className="conversation-source-banner">
            <strong>{copy.localToolsDegraded}</strong>
            <span>{copy.localToolsDegradedHint}</span>
          </section>
        ) : null}
        {localWorkbench.status === "empty" || localWorkbench.status === "unavailable" ? (
          <section aria-label={copy.localToolsEmptyRegion} className="empty-state">
            <h2>{copy.localToolsEmpty}</h2>
            <p>{copy.localToolsEmptyHint}</p>
          </section>
        ) : (
          <>
            <section aria-label={copy.localToolsSummaryRegion} className="local-workbench-summary">
              <MetricPill label={copy.localFiles} value={localWorkbench.summary ? `${localWorkbench.summary.directoryCount}/${localWorkbench.summary.fileCount}` : "0/0"} />
              <MetricPill label={copy.localGitReview} value={localWorkbench.summary?.gitStatus ?? "unknown"} />
              <MetricPill label={copy.localSearch} value={String(localWorkbench.search.data?.matches.length ?? localWorkbench.summary?.searchResultCount ?? 0)} />
              <MetricPill label={copy.localMcp} value={String(localWorkbench.summary?.mcpServerCount ?? localWorkbench.mcp.data?.servers.length ?? 0)} />
              <MetricPill label={copy.localExtensions} value={String(localWorkbench.summary?.extensionCount ?? 0)} />
            </section>
            <section aria-label={copy.localToolsSectionsRegion} className="local-workbench-grid">
              <LocalWorkbenchCard title={copy.localFiles} status={localWorkbench.files.status}>
                <div className="local-workbench-list">
                  {localWorkbench.files.data?.entries.length ? localWorkbench.files.data.entries.map((entry) => (
                    <div className="local-workbench-row" key={entry.path}>
                      <Icon name={entry.kind === "directory" ? "folder" : "information-o"} />
                      <span>{entry.path}</span>
                      <code>{entry.kind}</code>
                    </div>
                  )) : <p className="empty-state">{copy.noLocalFileEntries}</p>}
                </div>
                {localWorkbench.preview.data ? (
                  <pre className="local-workbench-preview">
                    <code>{localWorkbench.preview.data.previewKind === "text" ? localWorkbench.preview.data.previewText : localWorkbench.preview.data.reason}</code>
                  </pre>
                ) : null}
              </LocalWorkbenchCard>

              <LocalWorkbenchCard title={copy.localGitReview} status={localWorkbench.git.status}>
                {localWorkbench.git.data ? (
                  <div className="local-workbench-list">
                    <div className="local-workbench-row">
                      <Icon name="layout-list" />
                      <span>{localWorkbench.git.data.branch}</span>
                      <code>{localWorkbench.git.data.status}</code>
                    </div>
                    {localWorkbench.git.data.changedFiles.map((file) => (
                      <div className="local-workbench-row" key={`${file.status}:${file.path}`}>
                        <span>{file.path}</span>
                        <code>{file.status}</code>
                      </div>
                    ))}
                    <form
                      aria-label={copy.localReviewActionTitle}
                      className="local-review-action"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (reviewDisabled) {
                          return;
                        }
                        void onSubmitReviewStart(reviewConfirmation);
                      }}
                    >
                      <label>
                        <span>{copy.localReviewActionHelp}</span>
                        <input
                          aria-label={copy.localReviewConfirmation}
                          disabled={reviewStartStatus === "submitting"}
                          onChange={(event) => setReviewConfirmation(event.target.value)}
                          placeholder={copy.localReviewPlaceholder}
                          value={reviewConfirmation}
                        />
                      </label>
                      <button disabled={!canStartReview || reviewConfirmation !== "START REVIEW" || reviewStartStatus === "submitting"} type="submit">
                        {copy.localReviewStartButton}
                      </button>
                      {reviewStartStatus === "accepted" ? (
                        <p className="local-review-action-status" data-state="accepted">{copy.localReviewAccepted}</p>
                      ) : null}
                      {reviewStartStatus === "failed" && reviewStartError ? (
                        <p className="local-review-action-status" data-state="failed">{reviewStartError}</p>
                      ) : null}
                    </form>
                  </div>
                ) : <p className="empty-state">{copy.noLocalGitSummary}</p>}
              </LocalWorkbenchCard>

              <LocalWorkbenchCard title={copy.localSearch} status={localWorkbench.search.status}>
                <form
                  className="local-workbench-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const query = searchQuery.trim();
                    if (!query || searchStatus === "submitting") {
                      return;
                    }
                    setSearchStatus("submitting");
                    void onSearchLocalFiles(query).then((result) => {
                      setSearchStatus(result ? "idle" : "failed");
                    });
                  }}
                >
                  <input
                    aria-label={copy.searchLocalFiles}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={copy.searchLocalFiles}
                    value={searchQuery}
                  />
                  <button disabled={!searchQuery.trim() || searchStatus === "submitting"} type="submit">
                    {copy.searchButton}
                  </button>
                </form>
                <div className="local-workbench-list">
                  {localWorkbench.search.data?.matches.map((match) => (
                    <div className="local-workbench-row" key={`${match.path}:${match.lineNumber}:${match.columnNumber ?? 0}`}>
                      <span>{match.path}</span>
                      <code>{match.lineNumber}</code>
                    </div>
                  ))}
                </div>
              </LocalWorkbenchCard>

              <LocalWorkbenchCard title={copy.localMcp} status={localWorkbench.mcp.status}>
                <div className="local-workbench-list">
                  {localWorkbench.mcp.data?.servers.map((server) => (
                    <div className="local-workbench-row" key={server.name}>
                      <Icon name="reload" />
                      <span>{server.name}</span>
                      <code>{server.status}</code>
                    </div>
                  ))}
                </div>
              </LocalWorkbenchCard>

              <LocalWorkbenchCard title={copy.localExtensions} status={localWorkbench.extensions.status}>
                <ExtensionGroup label="Skills" values={localWorkbench.extensions.data?.skills.map((skill) => skill.name) ?? []} />
                <ExtensionGroup label="Hooks" values={localWorkbench.extensions.data?.hooks.map((hook) => hook.name) ?? []} />
                <ExtensionGroup label="Plugins" values={localWorkbench.extensions.data?.plugins.map((plugin) => plugin.name) ?? []} />
                <ExtensionGroup label="Apps" values={localWorkbench.extensions.data?.apps.map((app) => app.name) ?? []} />
              </LocalWorkbenchCard>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="local-workbench-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LocalWorkbenchCard({
  children,
  status,
  title,
}: {
  children: ReactNode;
  status: "failed" | "loaded" | "unavailable";
  title: string;
}) {
  return (
    <article className="local-workbench-card" data-status={status}>
      <header>
        <h2>{title}</h2>
        <code>{status}</code>
      </header>
      {children}
    </article>
  );
}

function ExtensionGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="local-workbench-extension-group">
      <strong>{label}</strong>
      <span>{values.length ? values.join(", ") : "None"}</span>
    </div>
  );
}

export function TaskDetailPane({
  copy,
  detailCopy,
  isCollapsed,
  isMobile = false,
  onBack,
  onCollapse,
}: {
  copy: WebDictionary["mainPanels"];
  detailCopy: WebDictionary["detail"];
  isCollapsed: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  onCollapse: () => void;
}) {
  return (
    <RightDetailPane
      ariaLabel="Task detail"
      backLabel={copy.backToTaskList}
      className="device-detail-pane"
      isCollapsed={isCollapsed}
      isMobile={isMobile}
      onBack={onBack}
      onCollapse={onCollapse}
      title={detailCopy.taskDetails}
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
  copy,
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
      <section aria-label={copy.searchDialogTitle} aria-modal="true" className="search-dialog" data-search-dialog role="dialog">
        <div className="search-input-shell">
          <input aria-label={copy.searchDialogTitle} autoFocus className="search-input" placeholder={copy.searchInputPlaceholder} />
        </div>
        <div className="search-section-title">{copy.recentConversations}</div>
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
      <UiBadge ariaLabel={FALLBACK_STATUS_DICTIONARY[props.status]} className={`badge-device-status ${statusClassName}`}>
        <StatusDot statusClassName={statusClassName} />
      </UiBadge>
    );
  }
  return <UiBadge className={statusClassName}>{FALLBACK_STATUS_DICTIONARY[props.status]}</UiBadge>;
}

function SidebarToggleButton(props: {
  collapsed?: boolean;
  copy: WebDictionary["mainPanels"];
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

function HeaderBackButton(props: { copy: WebDictionary["mainPanels"]; label: string; onClick: () => void }) {
  void props.copy;
  return (
    <button aria-label={props.label} className="icon-button mobile-back-button" onClick={props.onClick} type="button">
      <Icon className="mobile-back-icon" name="right" />
    </button>
  );
}
