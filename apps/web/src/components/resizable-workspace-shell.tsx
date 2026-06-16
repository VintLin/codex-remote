"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Group as PanelGroup,
  Panel,
  type PanelSize,
  Separator as PanelResizeHandle,
  usePanelRef,
} from "react-resizable-panels";

import { appPanelLayout } from "../appLayout";

interface ResizableWorkspaceShellProps {
  detail: ReactNode;
  isDetailCollapsed: boolean;
  isSidebarCollapsed: boolean;
  main: ReactNode;
  onDetailCollapsedChange: (collapsed: boolean) => void;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  sidebar: ReactNode;
}

interface PanelLimits {
  leftMaxSize: number;
  rightMaxSize: number;
}

export function ResizableWorkspaceShell({
  detail,
  isDetailCollapsed,
  isSidebarCollapsed,
  main,
  onDetailCollapsedChange,
  onSidebarCollapsedChange,
  sidebar,
}: ResizableWorkspaceShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [panelLimits, setPanelLimits] = useState<PanelLimits>(() => ({
    leftMaxSize: appPanelLayout.left.defaultSize,
    rightMaxSize: appPanelLayout.right.maxSize,
  }));

  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  const collapseSidebar = useCallback(() => {
    const leftPanel = leftPanelRef.current;
    if (!leftPanel || leftPanel.isCollapsed()) {
      onSidebarCollapsedChange(true);
      return;
    }

    blurActiveElement();
    leftPanel.collapse();
    onSidebarCollapsedChange(true);
  }, [blurActiveElement, leftPanelRef, onSidebarCollapsedChange]);

  const expandSidebar = useCallback(() => {
    const leftPanel = leftPanelRef.current;
    if (!leftPanel) {
      return;
    }

    leftPanel.expand();
    onSidebarCollapsedChange(false);
  }, [leftPanelRef, onSidebarCollapsedChange]);

  const collapseDetail = useCallback(() => {
    const rightPanel = rightPanelRef.current;
    if (!rightPanel || rightPanel.isCollapsed()) {
      onDetailCollapsedChange(true);
      return;
    }

    blurActiveElement();
    rightPanel.collapse();
    onDetailCollapsedChange(true);
  }, [blurActiveElement, onDetailCollapsedChange, rightPanelRef]);

  const expandDetail = useCallback(() => {
    const rightPanel = rightPanelRef.current;
    if (!rightPanel) {
      return;
    }

    rightPanel.expand();
    onDetailCollapsedChange(false);
  }, [onDetailCollapsedChange, rightPanelRef]);

  const syncPanelLimits = useCallback(() => {
    const shell = shellRef.current;
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    if (!shell || !leftPanel || !rightPanel) {
      return;
    }

    const shellWidth = shell.getBoundingClientRect().width;
    const handlesWidth = appPanelLayout.resizeHandleWidth * 2;
    const leftWidth = leftPanel.isCollapsed() ? 0 : leftPanel.getSize().inPixels;
    const rightWidth = rightPanel.isCollapsed() ? 0 : rightPanel.getSize().inPixels;
    const rightAvailableWidth = shellWidth - leftWidth - appPanelLayout.main.minSize - handlesWidth;
    const leftAvailableWidth = shellWidth - rightWidth - appPanelLayout.main.minSize - handlesWidth;

    if (rightAvailableWidth < appPanelLayout.right.minSize && !rightPanel.isCollapsed()) {
      collapseDetail();
    }

    const nextLimits = {
      leftMaxSize: Math.max(appPanelLayout.left.minSize, leftAvailableWidth),
      rightMaxSize: Math.max(
        appPanelLayout.right.minSize,
        Math.min(appPanelLayout.right.maxSize, rightAvailableWidth),
      ),
    };

    setPanelLimits((current) =>
      Math.abs(current.leftMaxSize - nextLimits.leftMaxSize) < 1 &&
      Math.abs(current.rightMaxSize - nextLimits.rightMaxSize) < 1
        ? current
        : nextLimits,
    );
  }, [collapseDetail, leftPanelRef, rightPanelRef]);

  const resizeLeftPanel = useCallback(
    (panelSize: PanelSize) => {
      if (panelSize.inPixels <= appPanelLayout.left.minSize && !isSidebarCollapsed) {
        collapseSidebar();
        return;
      }

      if (panelSize.inPixels > appPanelLayout.left.collapsedSize && isSidebarCollapsed) {
        onSidebarCollapsedChange(false);
      }

      syncPanelLimits();
    },
    [collapseSidebar, isSidebarCollapsed, onSidebarCollapsedChange, syncPanelLimits],
  );

  const resizeRightPanel = useCallback(
    (panelSize: PanelSize) => {
      if (panelSize.inPixels <= appPanelLayout.right.minSize && !isDetailCollapsed) {
        collapseDetail();
        return;
      }

      if (panelSize.inPixels > appPanelLayout.right.collapsedSize && isDetailCollapsed) {
        onDetailCollapsedChange(false);
      }

      syncPanelLimits();
    },
    [collapseDetail, isDetailCollapsed, onDetailCollapsedChange, syncPanelLimits],
  );

  useEffect(() => {
    if (isSidebarCollapsed) {
      collapseSidebar();
      return;
    }

    expandSidebar();
  }, [collapseSidebar, expandSidebar, isSidebarCollapsed]);

  useEffect(() => {
    if (isDetailCollapsed) {
      collapseDetail();
      return;
    }

    expandDetail();
  }, [collapseDetail, expandDetail, isDetailCollapsed]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    syncPanelLimits();

    const resizeObserver = new ResizeObserver(syncPanelLimits);
    resizeObserver.observe(shell);

    return () => resizeObserver.disconnect();
  }, [syncPanelLimits]);

  return (
    <PanelGroup
      className="app-shell min-h-screen"
      elementRef={shellRef}
      id="codex-remote-workspace"
      orientation="horizontal"
    >
      <Panel
        className="workspace-panel workspace-panel-sidebar"
        collapsedSize={appPanelLayout.left.collapsedSize}
        collapsible
        defaultSize={appPanelLayout.left.defaultSize}
        groupResizeBehavior="preserve-pixel-size"
        id={appPanelLayout.left.id}
        maxSize={panelLimits.leftMaxSize}
        minSize={appPanelLayout.left.minSize}
        onResize={resizeLeftPanel}
        panelRef={leftPanelRef}
      >
        {sidebar}
      </Panel>
      <PanelResizeHandle
        aria-label="调整左侧边栏宽度"
        className={`workspace-resize-handle workspace-resize-handle-left${isSidebarCollapsed ? " is-disabled" : ""}`}
        disabled={isSidebarCollapsed}
        id="left-main-resize"
      />
      <Panel
        className="workspace-panel workspace-panel-main"
        groupResizeBehavior="preserve-relative-size"
        id={appPanelLayout.main.id}
        minSize={appPanelLayout.main.minSize}
        onResize={syncPanelLimits}
      >
        {main}
      </Panel>
      <PanelResizeHandle
        aria-label="调整右侧边栏宽度"
        className={`workspace-resize-handle workspace-resize-handle-right${isDetailCollapsed ? " is-disabled" : ""}`}
        disabled={isDetailCollapsed}
        id="main-right-resize"
      />
      <Panel
        className="workspace-panel workspace-panel-detail"
        collapsedSize={appPanelLayout.right.collapsedSize}
        collapsible
        defaultSize={appPanelLayout.right.defaultSize}
        groupResizeBehavior="preserve-pixel-size"
        id={appPanelLayout.right.id}
        maxSize={panelLimits.rightMaxSize}
        minSize={appPanelLayout.right.minSize}
        onResize={resizeRightPanel}
        panelRef={rightPanelRef}
      >
        {detail}
      </Panel>
    </PanelGroup>
  );
}
