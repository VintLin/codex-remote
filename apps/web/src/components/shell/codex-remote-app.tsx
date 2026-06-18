"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import { assistantThreads, conversations, devices, sidebarProjects } from "../../data/app-server/mockData";
import {
  createDefaultSidebarSectionState,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "../../domain/sidebar/sidebarModel";
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

export function CodexRemoteApp() {
  const [activeView, setActiveView] = useState<AppView>("conversation");
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]!.id);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => conversations[0]?.id ?? null);
  const [expandedProjectIds, setExpandedProjectIds] = useState(
    () => new Set(sidebarProjects.filter((project) => project.expanded).map((project) => project.id)),
  );
  const [sectionState, setSectionState] = useState(createDefaultSidebarSectionState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobileWorkspacePane>("sidebar");
  const [pressedItem, setPressedItem] = useState<SidebarPressedItem>(null);
  const [focusTarget, setFocusTarget] = useState<SidebarFocusTarget>(null);
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<DetailTarget | LinkReference | null>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);

  const device = devices.find((deviceItem) => deviceItem.id === selectedDeviceId) ?? devices[0]!;
  const conversation =
    conversations.find((conversationItem) => conversationItem.id === selectedConversationId) ??
    conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ??
    conversations[0] ??
    null;
  const assistantThread = conversation ? assistantThreads.find((thread) => thread.id === conversation.id) ?? null : null;
  const sidebarModel = useMemo(
    () => createSidebarModel({ conversations, expandedProjectIds, projects: sidebarProjects }),
    [expandedProjectIds],
  );
  const conversationNavigator = useMemo(
    () =>
      selectedConversationId
        ? resolveConversationNavigator(sidebarModel, selectedConversationId)
        : { nextConversationId: null, previousConversationId: null },
    [selectedConversationId, sidebarModel],
  );

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
  }, [focusTarget, selectedConversationId, expandedProjectIds]);

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
  }, [assistantThread?.id, conversation?.id]);

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
    setSelectedConversationId(
      conversations.find((conversationItem) => conversationItem.deviceId === nextDeviceId)?.id ?? selectedConversationId,
    );
  };

  const toggleProject = (projectId: string, options: { restoreFocus?: boolean } = {}) => {
    pressSidebarItem({ kind: "project", id: projectId }, options);
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const selectConversation = (conversationId: string) => {
    pressSidebarItem({ kind: "conversation", id: conversationId });
    setSelectedConversationId(conversationId);
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
            conversation={null}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            nextConversationId={conversationNavigator.nextConversationId}
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
            previousConversationId={conversationNavigator.previousConversationId}
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
          conversation={conversation}
          isDetailCollapsed={isDetailCollapsed}
          isMobile={isMobileViewport}
          isSidebarCollapsed={isSidebarCollapsed}
          nextConversationId={conversationNavigator.nextConversationId}
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
          previousConversationId={conversationNavigator.previousConversationId}
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
      selectedConversationId={selectedConversationId ?? ""}
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
        selectedConversationId={selectedConversationId}
      />
    </>
  );
}

function getSidebarInteractionSelector(item: { kind: "project" | "conversation"; id: string }): string {
  const escapedId = CSS.escape(item.id);
  return item.kind === "project" ? `[data-toggle-project="${escapedId}"]` : `[data-conversation-id="${escapedId}"]`;
}
