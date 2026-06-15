"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { assistantThreads, conversations, devices, sidebarProjects, tasks } from "../mockData";
import {
  createDefaultSidebarSectionState,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "../sidebarModel";
import { AutomationsPage, ConversationMain, DevicesPage, SearchDialog } from "./main-panels";
import { type AppView, Sidebar, type SidebarPressedItem } from "./sidebar";

type SidebarFocusTarget = { kind: "project" | "conversation"; id: string } | null;

export function CodexRemoteApp() {
  const [activeView, setActiveView] = useState<AppView>("conversation");
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]!.id);
  const [selectedConversationId, setSelectedConversationId] = useState(conversations[0]!.id);
  const [selectedTaskId] = useState(tasks[0]!.id);
  const [expandedProjectIds, setExpandedProjectIds] = useState(
    () => new Set(sidebarProjects.filter((project) => project.expanded).map((project) => project.id)),
  );
  const [sectionState, setSectionState] = useState(createDefaultSidebarSectionState);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pressedItem, setPressedItem] = useState<SidebarPressedItem>(null);
  const [focusTarget, setFocusTarget] = useState<SidebarFocusTarget>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);

  const device = devices.find((deviceItem) => deviceItem.id === selectedDeviceId) ?? devices[0]!;
  const conversation =
    conversations.find((conversationItem) => conversationItem.id === selectedConversationId) ??
    conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ??
    conversations[0]!;
  const assistantThread = assistantThreads.find((thread) => thread.id === conversation.id) ?? null;
  const sidebarModel = useMemo(
    () => createSidebarModel({ conversations, expandedProjectIds, projects: sidebarProjects }),
    [expandedProjectIds],
  );
  const conversationNavigator = useMemo(
    () => resolveConversationNavigator(sidebarModel, selectedConversationId),
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
  };

  const toggleSection = (sectionId: Parameters<typeof toggleSidebarSection>[1]) => {
    setSectionState((current) => toggleSidebarSection(current, sectionId));
  };

  const mainContent =
    activeView === "devices" ? (
      <DevicesPage onSelectDevice={selectDevice} selectedDeviceId={selectedDeviceId} />
    ) : activeView === "automations" ? (
      <AutomationsPage />
    ) : (
      <ConversationMain
        assistantThread={assistantThread}
        conversation={conversation}
        device={device}
        selectedTaskId={selectedTaskId}
      />
    );

  return (
    <>
      <div className="app-shell min-h-screen">
        <Sidebar
          activeView={activeView}
          conversationNavigator={conversationNavigator}
          device={device}
          model={sidebarModel}
          onOpenSearch={() => setIsSearchOpen(true)}
          onSelectAdjacentConversation={selectConversation}
          onSelectConversation={selectConversation}
          onSelectView={selectView}
          onToggleProject={toggleProject}
          pressedItem={pressedItem}
          sectionState={sectionState}
          selectedConversationId={selectedConversationId}
          sidebarScrollRef={sidebarScrollRef}
          onToggleSection={toggleSection}
        />
        {mainContent}
      </div>
      <SearchDialog onClose={() => setIsSearchOpen(false)} open={isSearchOpen} />
    </>
  );
}

function getSidebarInteractionSelector(item: { kind: "project" | "conversation"; id: string }): string {
  const escapedId = CSS.escape(item.id);
  return item.kind === "project" ? `[data-toggle-project="${escapedId}"]` : `[data-conversation-id="${escapedId}"]`;
}
