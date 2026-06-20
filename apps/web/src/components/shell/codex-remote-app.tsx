"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AssistantThreadSnapshot, DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import { createFallbackWorkbenchData, loadWorkbenchData } from "../../data/workerApi/workbenchData";
import { WorkerApiClient } from "../../data/workerApi/client";
import type { PendingApproval } from "@codex-remote/api-contract";
import { createConversationKey, findConversationByKey } from "../../domain/sidebar/conversationIdentity";
import {
  createDefaultSidebarSectionState,
  createProjectKey,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "../../domain/sidebar/sidebarModel";
import { submitConversationFollowUp, type FollowUpSubmitStatus } from "./followUpSubmitController";
import {
  submitApprovalDecision,
  submitInterrupt,
  submitSteer,
  type ControlSubmitStatus,
} from "./controlSubmitController";
import { ResizableWorkspaceShell } from "./resizable-workspace-shell";
import {
  AutomationDetailPane,
  AutomationsPage,
  ConversationDetailPane,
  ConversationMain,
  DeviceDetailPane,
  DevicesPage,
  SearchDialog,
} from "../detail/main-panels";
import { type AppView, Sidebar, type SidebarPressedItem } from "../sidebar/sidebar";

type SidebarFocusTarget = { kind: "project" | "conversation"; id: string } | null;
type MobileWorkspacePane = "detail" | "main" | "sidebar";
const controlPlaneBaseUrl =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ??
  process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL ??
  "http://127.0.0.1:8786";
const controlPlaneToken =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ??
  process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN ??
  "";

export function CodexRemoteApp() {
  const [workbenchData, setWorkbenchData] = useState(() => createFallbackWorkbenchData("not_configured"));
  const [activeView, setActiveView] = useState<AppView>("conversation");
  const [selectedDeviceId, setSelectedDeviceId] = useState(workbenchData.devices[0]!.id);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(
    () => workbenchData.conversations[0] ? createConversationKey(workbenchData.conversations[0]) : null,
  );
  const [expandedProjectIds, setExpandedProjectIds] = useState(
    () => new Set(workbenchData.projects.filter((project) => project.expanded).map((project) => createProjectKey(project))),
  );
  const [sectionState, setSectionState] = useState(createDefaultSidebarSectionState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobileWorkspacePane>("sidebar");
  const [pressedItem, setPressedItem] = useState<SidebarPressedItem>(null);
  const [focusTarget, setFocusTarget] = useState<SidebarFocusTarget>(null);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpSubmitStatus>("idle");
  const [controlStatus, setControlStatus] = useState<ControlSubmitStatus>("idle");
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<DetailTarget | LinkReference | null>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const { devices, projects, conversations, assistantThreads, searchRecents, source } = workbenchData;
  const device = devices.find((deviceItem) => deviceItem.id === selectedDeviceId) ?? devices[0]!;
  const conversation =
    findConversationByKey(conversations, selectedConversationKey) ??
    conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ??
    conversations[0] ??
    null;
  const assistantThread = conversation
    ? assistantThreads.find((thread) => thread.id === conversation.id && thread.deviceId === conversation.deviceId) ?? null
    : null;
  const sidebarModel = useMemo(
    () => createSidebarModel({ conversations, expandedProjectIds, projects }),
    [expandedProjectIds, conversations, projects],
  );
  const conversationNavigator = useMemo(
    () =>
      selectedConversationKey
        ? resolveConversationNavigator(sidebarModel, selectedConversationKey)
        : { nextConversationKey: null, previousConversationKey: null },
    [selectedConversationKey, sidebarModel],
  );
  const canSubmitFollowUp = source.reason === "loaded" && conversation !== null && Boolean(controlPlaneToken);
  const activeTurnId = getActiveTurnId(assistantThread);

  const refreshWorkbenchData = useCallback(async (conversationKey: string | null) => {
    const nextWorkbenchData = await loadWorkbenchData({
      baseUrl: controlPlaneBaseUrl,
      token: controlPlaneToken,
      selectedConversationKey: conversationKey,
    });
    setWorkbenchData(nextWorkbenchData);
  }, []);

  const refreshApprovals = useCallback(async (conversationKey: string | null) => {
    const approvalConversation = findConversationByKey(conversations, conversationKey);
    if (!approvalConversation || source.reason !== "loaded" || !controlPlaneToken) {
      setPendingApprovals([]);
      return;
    }

    try {
      const approvals = await new WorkerApiClient({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
      }).listApprovals(approvalConversation.deviceId, approvalConversation.id);
      setPendingApprovals(approvals);
    } catch {
      setPendingApprovals([]);
    }
  }, [conversations, source.reason]);

  const submitFollowUp = useCallback(async (message: string) => {
    return submitConversationFollowUp({
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      deviceId: conversation?.deviceId ?? null,
      message,
      refreshWorkbenchData: async () => refreshWorkbenchData(conversation ? createConversationKey(conversation) : null),
      setFollowUpStatus,
      workerClient: new WorkerApiClient({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
      }),
    });
  }, [conversation, refreshWorkbenchData]);

  const workerClient = useMemo(() => new WorkerApiClient({
    baseUrl: controlPlaneBaseUrl,
    token: controlPlaneToken,
  }), []);

  const submitInterruptControl = useCallback(async () => {
    await submitInterrupt({
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      deviceId: conversation?.deviceId ?? null,
      refreshWorkbenchData: async () => {
        const conversationKey = conversation ? createConversationKey(conversation) : null;
        await refreshWorkbenchData(conversationKey);
        await refreshApprovals(conversationKey);
      },
      setStatus: setControlStatus,
      turnId: activeTurnId,
      workerClient,
    });
  }, [activeTurnId, conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  const submitSteerControl = useCallback(async (message: string) => submitSteer({
    conversationId: conversation?.id ?? null,
    createClientRequestId: () => crypto.randomUUID(),
    deviceId: conversation?.deviceId ?? null,
    message,
    refreshWorkbenchData: async () => {
      const conversationKey = conversation ? createConversationKey(conversation) : null;
      await refreshWorkbenchData(conversationKey);
      await refreshApprovals(conversationKey);
    },
    setStatus: setControlStatus,
    turnId: activeTurnId,
    workerClient,
  }), [activeTurnId, conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  const submitApprovalControl = useCallback(async (approval: PendingApproval, decision: "accept" | "decline" | "cancel") => {
    await submitApprovalDecision({
      approval,
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      decision,
      deviceId: conversation?.deviceId ?? null,
      refreshWorkbenchData: async () => {
        const conversationKey = conversation ? createConversationKey(conversation) : null;
        await refreshWorkbenchData(conversationKey);
        await refreshApprovals(conversationKey);
      },
      setStatus: setControlStatus,
      workerClient,
    });
  }, [conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  useEffect(() => {
    let shouldIgnore = false;
    void (async () => {
      const nextWorkbenchData = await loadWorkbenchData({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
        selectedConversationKey,
      });
      if (!shouldIgnore) {
        setWorkbenchData(nextWorkbenchData);
      }
    })();

    return () => {
      shouldIgnore = true;
    };
  }, [selectedConversationKey]);

  useEffect(() => {
    void refreshApprovals(conversation ? createConversationKey(conversation) : null);
  }, [conversation, refreshApprovals]);

  useEffect(() => {
    if (selectedDeviceId !== "" && !devices.some((deviceItem) => deviceItem.id === selectedDeviceId)) {
      const fallbackDevice = devices[0];
      if (fallbackDevice) {
        setSelectedDeviceId(fallbackDevice.id);
      }
      return;
    }

    if (!devices.length) {
      setSelectedConversationKey(null);
      return;
    }

    const fallbackConversation =
      findConversationByKey(conversations, selectedConversationKey) ??
      conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ??
      conversations[0] ??
      null;

    if (fallbackConversation && createConversationKey(fallbackConversation) !== selectedConversationKey) {
      setSelectedConversationKey(createConversationKey(fallbackConversation));
    }

    if (!fallbackConversation) {
      setSelectedConversationKey(null);
    }

    if (fallbackConversation && fallbackConversation.deviceId !== selectedDeviceId) {
      setSelectedDeviceId(fallbackConversation.deviceId);
    }
  }, [conversations, devices, selectedConversationKey, selectedDeviceId]);

  useEffect(() => {
    return () => {
      if (pressedTimerRef.current !== null) {
        window.clearTimeout(pressedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    document.querySelector<HTMLElement>(getSidebarInteractionSelector(focusTarget))?.focus({ preventScroll: true });
  }, [focusTarget, selectedConversationKey, expandedProjectIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSearchOpen]);

  useEffect(() => {
    setSelectedDetailTarget(null);
    setFollowUpStatus("idle");
    setControlStatus("idle");
  }, [selectedConversationKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const nextIsMobile = mediaQuery.matches;
      setIsMobileViewport(nextIsMobile);
      if (!nextIsMobile) {
        setMobilePane("sidebar");
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const pressSidebarItem = (nextPressedItem: Exclude<SidebarPressedItem, null>, options: { restoreFocus?: boolean } = {}) => {
    setPressedItem(nextPressedItem);
    setFocusTarget(options.restoreFocus === false ? null : nextPressedItem);
    if (pressedTimerRef.current !== null) {
      window.clearTimeout(pressedTimerRef.current);
    }
    pressedTimerRef.current = window.setTimeout(() => {
      setPressedItem((current) =>
        current?.kind === nextPressedItem.kind && current.id === nextPressedItem.id ? null : current,
      );
      pressedTimerRef.current = null;
    }, 500);
  };

  const selectView = (view: AppView) => {
    setActiveView(view);
    if (isMobileViewport) {
      setMobilePane("main");
    }
  };

  const selectDevice = (nextDeviceId: string) => {
    setSelectedDeviceId(nextDeviceId);
    const nextConversation = conversations.find((conversationItem) => conversationItem.deviceId === nextDeviceId);
    setSelectedConversationKey(nextConversation ? createConversationKey(nextConversation) : null);
  };

  const toggleProject = (projectKey: string, options: { restoreFocus?: boolean } = {}) => {
    pressSidebarItem({ kind: "project", id: projectKey }, options);
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectKey)) {
        next.delete(projectKey);
      } else {
        next.add(projectKey);
      }
      return next;
    });
  };

  const selectConversation = (conversationKey: string) => {
    pressSidebarItem({ kind: "conversation", id: conversationKey });
    setSelectedConversationKey(conversationKey);
    setActiveView("conversation");
    if (isMobileViewport) {
      setMobilePane("main");
    }
  };

  const toggleSection = (sectionId: Parameters<typeof toggleSidebarSection>[1]) => {
    setSectionState((current) => toggleSidebarSection(current, sectionId));
  };

  const mainContent = (() => {
    if (activeView === "devices") {
      return {
        detail: (
          <DeviceDetailPane
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            selectedDeviceId={selectedDeviceId}
            devices={devices}
          />
        ),
        main: (
          <DevicesPage
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onOpenDetail={() => {
              if (isMobileViewport) {
                setMobilePane("detail");
              }
            }}
            onSelectDevice={selectDevice}
            selectedDeviceId={selectedDeviceId}
            devices={devices}
          />
        ),
      };
    }

    if (activeView === "automations") {
      return {
        detail: (
          <AutomationDetailPane
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
          />
        ),
        main: (
          <AutomationsPage
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
          />
        ),
      };
    }

    if (conversation === null) {
      return {
        detail: (
          <ConversationDetailPane
            conversationTitle="对话"
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            target={selectedDetailTarget}
          />
        ),
        main: (
          <ConversationMain
            assistantThread={null}
            canSubmitFollowUp={false}
            activeTurnId={null}
            controlStatus={controlStatus}
            conversation={null}
            followUpStatus={followUpStatus}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            nextConversationKey={conversationNavigator.nextConversationKey}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onOpenDetail={(target) => {
              setSelectedDetailTarget(target);
              if (isMobileViewport) {
                setMobilePane("detail");
              }
            }}
            onSelectAdjacentConversation={selectConversation}
            onSubmitApprovalDecision={submitApprovalControl}
            onSubmitFollowUp={submitFollowUp}
            onSubmitInterrupt={submitInterruptControl}
            onSubmitSteer={submitSteerControl}
            pendingApprovals={[]}
            previousConversationKey={conversationNavigator.previousConversationKey}
            source={source}
          />
        ),
      };
    }

    return {
      detail: (
        <ConversationDetailPane
          conversationTitle={conversation.title}
          isCollapsed={isDetailCollapsed}
          isMobile={isMobileViewport}
          onBack={() => setMobilePane("main")}
          onCollapse={() => setIsDetailCollapsed(true)}
          target={selectedDetailTarget}
        />
      ),
      main: (
        <ConversationMain
          assistantThread={assistantThread}
          canSubmitFollowUp={canSubmitFollowUp}
          activeTurnId={activeTurnId}
          controlStatus={controlStatus}
          conversation={conversation}
          followUpStatus={followUpStatus}
          isDetailCollapsed={isDetailCollapsed}
          isMobile={isMobileViewport}
          isSidebarCollapsed={isSidebarCollapsed}
          nextConversationKey={conversationNavigator.nextConversationKey}
          onBack={() => setMobilePane("sidebar")}
          onExpandDetail={() => setIsDetailCollapsed(false)}
          onExpandSidebar={() => setIsSidebarCollapsed(false)}
          onOpenDetail={(target) => {
            setSelectedDetailTarget(target);
            if (isMobileViewport) {
              setMobilePane("detail");
            }
          }}
          onSelectAdjacentConversation={selectConversation}
          onSubmitApprovalDecision={submitApprovalControl}
          onSubmitFollowUp={submitFollowUp}
          onSubmitInterrupt={submitInterruptControl}
          onSubmitSteer={submitSteerControl}
          pendingApprovals={pendingApprovals}
          previousConversationKey={conversationNavigator.previousConversationKey}
          source={source}
        />
      ),
    };
  })();

  const sidebarContent = (
    <Sidebar
      activeView={activeView}
      conversationNavigator={conversationNavigator}
      device={device}
      isCollapsed={isSidebarCollapsed}
      isMobile={isMobileViewport}
      model={sidebarModel}
      onCollapseSidebar={() => setIsSidebarCollapsed(true)}
      onOpenSearch={() => setIsSearchOpen(true)}
      onSelectAdjacentConversation={selectConversation}
      onSelectConversation={selectConversation}
      onSelectView={selectView}
      onToggleProject={toggleProject}
      pressedItem={pressedItem}
      sectionState={sectionState}
      selectedConversationKey={selectedConversationKey ?? ""}
      sidebarScrollRef={sidebarScrollRef}
      onToggleSection={toggleSection}
    />
  );

  return (
    <>
      {isMobileViewport ? (
        <div className="mobile-shell">
          {mobilePane === "sidebar" ? sidebarContent : null}
          {mobilePane === "main" ? mainContent.main : null}
          {mobilePane === "detail" ? mainContent.detail : null}
        </div>
      ) : (
        <ResizableWorkspaceShell
          detail={mainContent.detail}
          isDetailCollapsed={isDetailCollapsed}
          isSidebarCollapsed={isSidebarCollapsed}
          main={mainContent.main}
          onDetailCollapsedChange={setIsDetailCollapsed}
          onSidebarCollapsedChange={setIsSidebarCollapsed}
          sidebar={sidebarContent}
        />
      )}
      <SearchDialog
        onClose={() => setIsSearchOpen(false)}
        onSelectConversation={selectConversation}
        open={isSearchOpen}
        searchRecents={searchRecents}
        selectedConversationKey={selectedConversationKey}
      />
    </>
  );
}

function getActiveTurnId(thread: AssistantThreadSnapshot | null): string | null {
  if (!thread) {
    return null;
  }

  for (let index = thread.timeline.turns.length - 1; index >= 0; index -= 1) {
    const turn = thread.timeline.turns[index];
    if (turn?.status === "in_progress") {
      return turn.id;
    }
  }

  return null;
}

function getSidebarInteractionSelector(item: { kind: "project" | "conversation"; id: string }): string {
  const escapedId = CSS.escape(item.id);
  return item.kind === "project" ? `[data-toggle-project="${escapedId}"]` : `[data-conversation-key="${escapedId}"]`;
}
