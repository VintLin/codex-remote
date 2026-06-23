"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  Group as PanelGroup,
  Panel,
  type PanelSize,
  Separator as PanelResizeHandle,
  usePanelRef,
} from "react-resizable-panels";

import { appPanelLayout } from "../../domain/layout/appLayout";
import type { WebDictionary } from "../../i18n/dictionary.ts";

interface ResizableWorkspaceShellProps {
  copy: WebDictionary["sidebar"];
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

interface WorkspaceMeasurements {
  rightWidth: number;
  shellWidth: number;
  leftWidth: number;
}

const collapseThresholdBufferPx = 4;

export function ResizableWorkspaceShell({
  copy,
  detail,
  isDetailCollapsed,
  isSidebarCollapsed,
  main,
  onDetailCollapsedChange,
  onSidebarCollapsedChange,
  sidebar,
}: ResizableWorkspaceShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sidebarTransitionRef = useRef(false);
  const detailTransitionRef = useRef(false);
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [panelLimits, setPanelLimits] = useState<PanelLimits>(() => ({
    leftMaxSize: appPanelLayout.left.defaultSize,
    rightMaxSize: appPanelLayout.right.maxSize,
  }));
  const [shellWidth, setShellWidth] = useState(0);

  const measureWorkspace = useCallback((): WorkspaceMeasurements | null => {
    const shell = shellRef.current;
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    if (!shell || !leftPanel || !rightPanel) {
      return null;
    }

    return {
      shellWidth: shell.getBoundingClientRect().width,
      leftWidth: leftPanel.isCollapsed() ? 0 : leftPanel.getSize().inPixels,
      rightWidth: rightPanel.isCollapsed() ? 0 : rightPanel.getSize().inPixels,
    };
  }, [leftPanelRef, rightPanelRef]);

  const mainMinSizePercent =
    shellWidth > 0 ? Math.min((appPanelLayout.main.minSize / shellWidth) * 100, 100) : appPanelLayout.main.minSize;
  const leftCollapseThreshold = Math.max(
    appPanelLayout.left.collapsedSize,
    appPanelLayout.left.minSize - collapseThresholdBufferPx,
  );
  const rightCollapseThreshold = Math.max(
    appPanelLayout.right.collapsedSize,
    appPanelLayout.right.minSize - collapseThresholdBufferPx,
  );

  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  function schedulePanelExpand(expand: () => void) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        expand();
        syncPanelLimits();
      });
    });
  }

  function markProgrammaticTransition(transitionRef: MutableRefObject<boolean>, action: () => void) {
    transitionRef.current = true;
    action();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        transitionRef.current = false;
        syncPanelLimits();
      });
    });
  }

  const collapseSidebar = useCallback(() => {
    const leftPanel = leftPanelRef.current;
    if (!leftPanel || leftPanel.isCollapsed()) {
      onSidebarCollapsedChange(true);
      return;
    }

    blurActiveElement();
    markProgrammaticTransition(sidebarTransitionRef, () => {
      leftPanel.collapse();
      onSidebarCollapsedChange(true);
    });
  }, [blurActiveElement, leftPanelRef, onSidebarCollapsedChange]);

  const expandSidebar = useCallback(() => {
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    const measurements = measureWorkspace();
    if (!leftPanel || !rightPanel || !measurements) {
      return;
    }

    const requiredWidth =
      appPanelLayout.left.minSize +
      measurements.rightWidth +
      appPanelLayout.main.minSize +
      appPanelLayout.resizeHandleWidth * 2;

    if (requiredWidth > measurements.shellWidth && !rightPanel.isCollapsed()) {
      rightPanel.collapse();
      onDetailCollapsedChange(true);
      schedulePanelExpand(() => {
        const nextLeftPanel = leftPanelRef.current;
        if (!nextLeftPanel) {
          return;
        }
        markProgrammaticTransition(sidebarTransitionRef, () => {
          nextLeftPanel.expand();
          onSidebarCollapsedChange(false);
        });
      });
      return;
    }

    markProgrammaticTransition(sidebarTransitionRef, () => {
      leftPanel.expand();
      onSidebarCollapsedChange(false);
    });
  }, [leftPanelRef, measureWorkspace, onDetailCollapsedChange, onSidebarCollapsedChange, rightPanelRef, schedulePanelExpand]);

  const collapseDetail = useCallback(() => {
    const rightPanel = rightPanelRef.current;
    if (!rightPanel || rightPanel.isCollapsed()) {
      onDetailCollapsedChange(true);
      return;
    }

    blurActiveElement();
    markProgrammaticTransition(detailTransitionRef, () => {
      rightPanel.collapse();
      onDetailCollapsedChange(true);
    });
  }, [blurActiveElement, onDetailCollapsedChange, rightPanelRef]);

  const expandDetail = useCallback(() => {
    const rightPanel = rightPanelRef.current;
    const leftPanel = leftPanelRef.current;
    const measurements = measureWorkspace();
    if (!rightPanel || !leftPanel || !measurements) {
      return;
    }

    const requiredWidth =
      measurements.leftWidth +
      appPanelLayout.right.minSize +
      appPanelLayout.main.minSize +
      appPanelLayout.resizeHandleWidth * 2;

    if (requiredWidth > measurements.shellWidth && !leftPanel.isCollapsed()) {
      leftPanel.collapse();
      onSidebarCollapsedChange(true);
      schedulePanelExpand(() => {
        const nextRightPanel = rightPanelRef.current;
        if (!nextRightPanel) {
          return;
        }
        markProgrammaticTransition(detailTransitionRef, () => {
          nextRightPanel.expand();
          onDetailCollapsedChange(false);
        });
      });
      return;
    }

    markProgrammaticTransition(detailTransitionRef, () => {
      rightPanel.expand();
      onDetailCollapsedChange(false);
    });
  }, [leftPanelRef, measureWorkspace, onDetailCollapsedChange, onSidebarCollapsedChange, rightPanelRef, schedulePanelExpand]);

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
      if (sidebarTransitionRef.current) {
        syncPanelLimits();
        return;
      }

      if (panelSize.inPixels <= leftCollapseThreshold && !isSidebarCollapsed) {
        collapseSidebar();
        return;
      }

      if (panelSize.inPixels > appPanelLayout.left.collapsedSize && isSidebarCollapsed) {
        onSidebarCollapsedChange(false);
      }

      syncPanelLimits();
    },
    [collapseSidebar, isSidebarCollapsed, leftCollapseThreshold, onSidebarCollapsedChange, syncPanelLimits],
  );

  const resizeRightPanel = useCallback(
    (panelSize: PanelSize) => {
      if (detailTransitionRef.current) {
        syncPanelLimits();
        return;
      }

      if (panelSize.inPixels <= rightCollapseThreshold && !isDetailCollapsed) {
        collapseDetail();
        return;
      }

      if (panelSize.inPixels > appPanelLayout.right.collapsedSize && isDetailCollapsed) {
        onDetailCollapsedChange(false);
      }

      syncPanelLimits();
    },
    [collapseDetail, isDetailCollapsed, onDetailCollapsedChange, rightCollapseThreshold, syncPanelLimits],
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

    const updateShellWidth = () => setShellWidth(shell.getBoundingClientRect().width);

    updateShellWidth();
    syncPanelLimits();

    const resizeObserver = new ResizeObserver(() => {
      updateShellWidth();
      syncPanelLimits();
    });
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
        aria-label={copy.resizeLeftHandle}
        className={`workspace-resize-handle workspace-resize-handle-left${isSidebarCollapsed ? " is-disabled" : ""}`}
        disabled={isSidebarCollapsed}
        id="left-main-resize"
      />
      <Panel
        className="workspace-panel workspace-panel-main"
        groupResizeBehavior="preserve-relative-size"
        id={appPanelLayout.main.id}
        minSize={mainMinSizePercent}
        onResize={syncPanelLimits}
      >
        {main}
      </Panel>
      <PanelResizeHandle
        aria-label={copy.resizeRightHandle}
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
