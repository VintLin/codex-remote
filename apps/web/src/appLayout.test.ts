import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { appPanelLayout } from "./appLayout.ts";

const appComponent = readFileSync(join(process.cwd(), "src/components/codex-remote-app.tsx"), "utf8");
const shellComponent = readFileSync(join(process.cwd(), "src/components/resizable-workspace-shell.tsx"), "utf8");
const mainPanelsComponent = readFileSync(join(process.cwd(), "src/components/main-panels.tsx"), "utf8");
const detailWorkspaceComponent = readFileSync(join(process.cwd(), "src/components/detail-workspace.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "../../packages/ui/src/styles.css"), "utf8");

test("when workspace panels are configured, should expose the confirmed resize constraints", () => {
  assert.deepEqual(appPanelLayout.left, {
    id: "left",
    defaultSize: 280,
    minSize: 220,
    collapsedSize: 0,
  });
  assert.deepEqual(appPanelLayout.main, {
    id: "main",
    minSize: 520,
  });
  assert.deepEqual(appPanelLayout.right, {
    id: "right",
    defaultSize: 380,
    minSize: 300,
    maxSize: 560,
    collapsedSize: 0,
  });
});

test("when viewport is mobile, should switch from the desktop shell to a sidebar -> main -> detail page flow", () => {
  assert.match(appComponent, /type MobileWorkspacePane = "detail" \| "main" \| "sidebar";/);
  assert.match(appComponent, /const \[mobilePane, setMobilePane\] = useState<MobileWorkspacePane>\("sidebar"\);/);
  assert.match(appComponent, /window\.matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(appComponent, /setMobilePane\("main"\);/);
  assert.match(appComponent, /setMobilePane\("detail"\);/);
  assert.match(appComponent, /<div className="mobile-shell">/);
  assert.match(styles, /\.mobile-shell\s*\{[^}]*width:\s*100vw;[^}]*height:\s*100vh;/s);
  assert.match(styles, /@media \(max-width: 767px\) \{[^}]*\.mobile-shell \.sidebar,/s);
});

test("when the device list is used on mobile, should advance from the list page into a dedicated detail page", () => {
  assert.match(mainPanelsComponent, /onOpenDetail\?: \(deviceId: string\) => void;/);
  assert.match(mainPanelsComponent, /onOpenDetail\?\.\(device\.id\);/);
  assert.match(appComponent, /onOpenDetail=\{\(\) => \{/);
  assert.match(appComponent, /if \(isMobileViewport\) \{\s*setMobilePane\("detail"\);/s);
});

test("when the main workspace meets the sidebar, should keep rounded left corners on the content pane", () => {
  assert.match(
    styles,
    /\.workspace-panel-main\s*\{[^}]*border-top:\s*var\(--cr-pane-stroke-top\);[^}]*border-bottom:\s*var\(--cr-pane-stroke-bottom\);[^}]*border-left:\s*var\(--cr-pane-stroke-left\);[^}]*border-top-left-radius:\s*var\(--cr-radius-xl\);[^}]*border-bottom-left-radius:\s*var\(--cr-radius-xl\);[^}]*background:\s*var\(--cr-bg\);/s,
  );
  assert.match(styles, /\.app-shell\s*\{[^}]*background:\s*var\(--cr-sidebar\);/s);
});

test("when visual primitives are standardized, should reuse shared size, icon, and stroke tokens across controls and surfaces", () => {
  assert.match(styles, /--cr-control-icon-size:\s*14px;/);
  assert.match(styles, /--cr-nav-icon-size:\s*16px;/);
  assert.match(styles, /\.icon-button\s*\{[^}]*width:\s*var\(--cr-control-size\);/s);
  assert.match(styles, /\.action-menu-trigger\s*\{[^}]*width:\s*var\(--cr-control-size\);[^}]*height:\s*var\(--cr-control-size\);/s);
  assert.match(styles, /\.nav-glyph \.icon\s*\{[^}]*width:\s*var\(--cr-nav-icon-size\);[^}]*height:\s*var\(--cr-nav-icon-size\);/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.device-icon\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.device-card\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
  assert.match(styles, /\.linked-task h2,[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
  assert.match(styles, /\.workspace-title h1\s*\{[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
});

test("when the conversation header is simplified, should move collapsed sidebar controls into the main topbar and keep only title menu plus layout action", () => {
  assert.match(mainPanelsComponent, /className="topbar-leading conversation-topbar-leading"/);
  assert.match(mainPanelsComponent, /className="conversation-collapsed-sidebar-controls"/);
  assert.match(mainPanelsComponent, /<ActionMenu ariaLabel="打开对话操作菜单" className="conversation-title-menu" group="conversation" \/>/);
  assert.match(mainPanelsComponent, /aria-label="布局列表"/);
  assert.match(mainPanelsComponent, /<Icon name="layout-list" \/>/);
  assert.doesNotMatch(mainPanelsComponent, /aria-label="运行上下文"/);
  assert.doesNotMatch(mainPanelsComponent, /aria-label="对话概览"/);
  assert.doesNotMatch(mainPanelsComponent, /aria-label="切换布局"/);
  assert.doesNotMatch(mainPanelsComponent, /aria-label="More actions"/);
  assert.match(styles, /\.conversation-title-menu \.action-menu-trigger\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
  assert.match(styles, /\.conversation-collapsed-sidebar-controls\s*\{[^}]*display:\s*flex;[^}]*gap:\s*4px;/s);
});

test("when a side panel is collapsed at the drag threshold, should disable its resize handle until a header button expands it", () => {
  assert.match(shellComponent, /disabled=\{isSidebarCollapsed\}/);
  assert.match(shellComponent, /disabled=\{isDetailCollapsed\}/);
  assert.match(shellComponent, /className=\{`workspace-resize-handle workspace-resize-handle-left\$\{isSidebarCollapsed \? " is-disabled" : ""\}`\}/);
  assert.match(shellComponent, /className=\{`workspace-resize-handle workspace-resize-handle-right\$\{isDetailCollapsed \? " is-disabled" : ""\}`\}/);
  assert.match(shellComponent, /const collapseThresholdBufferPx = 4;/);
  assert.match(shellComponent, /const leftCollapseThreshold = Math\.max\(\s*appPanelLayout\.left\.collapsedSize,\s*appPanelLayout\.left\.minSize - collapseThresholdBufferPx,\s*\);/s);
  assert.match(shellComponent, /const rightCollapseThreshold = Math\.max\(\s*appPanelLayout\.right\.collapsedSize,\s*appPanelLayout\.right\.minSize - collapseThresholdBufferPx,\s*\);/s);
  assert.match(shellComponent, /if \(panelSize\.inPixels <= leftCollapseThreshold && !isSidebarCollapsed\) \{/);
  assert.match(shellComponent, /if \(panelSize\.inPixels <= rightCollapseThreshold && !isDetailCollapsed\) \{/);
  assert.match(shellComponent, /const mainMinSizePercent =\s*shellWidth > 0 \? Math\.min\(\(appPanelLayout\.main\.minSize \/ shellWidth\) \* 100, 100\) : appPanelLayout\.main\.minSize;/s);
  assert.match(shellComponent, /minSize=\{mainMinSizePercent\}/);
  assert.match(shellComponent, /const requiredWidth =\s*appPanelLayout\.left\.minSize \+\s*measurements\.rightWidth \+\s*appPanelLayout\.main\.minSize \+\s*appPanelLayout\.resizeHandleWidth \* 2;/s);
  assert.match(shellComponent, /if \(requiredWidth > measurements\.shellWidth && !rightPanel\.isCollapsed\(\)\) \{/);
  assert.match(shellComponent, /const requiredWidth =\s*measurements\.leftWidth \+\s*appPanelLayout\.right\.minSize \+\s*appPanelLayout\.main\.minSize \+\s*appPanelLayout\.resizeHandleWidth \* 2;/s);
  assert.match(shellComponent, /if \(requiredWidth > measurements\.shellWidth && !leftPanel\.isCollapsed\(\)\) \{/);
  assert.match(mainPanelsComponent, /label="展开左侧边栏"/);
  assert.match(mainPanelsComponent, /label="展开右侧边栏"/);
  assert.match(detailWorkspaceComponent, /aria-label="收起右侧边栏"/);
  assert.doesNotMatch(detailWorkspaceComponent, /aria-label="清空详情"/);
  assert.match(styles, /\.sidebar-toggle-button \.sidebar-toggle-icon\s*\{[^}]*width:\s*var\(--cr-nav-icon-size\);[^}]*height:\s*var\(--cr-nav-icon-size\);/s);
  assert.match(styles, /\.workspace-resize-handle\s*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle:hover,[^}]*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle\.is-disabled\s*\{[^}]*width:\s*0;[^}]*pointer-events:\s*none;/s);
});

test("when the detail workspace is rendered, should inherit the sidebar background without pane borders", () => {
  assert.match(styles, /\.detail-workspace\s*\{[^}]*border-left:\s*var\(--cr-pane-stroke-left\);[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.detail-workspace \.review-header\s*\{[^}]*border-bottom:\s*0;[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.detail-workspace \.review-scroll\s*\{[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(detailWorkspaceComponent, /const workspaceTools: WorkspaceToolDefinition\[] = \[/);
  assert.match(detailWorkspaceComponent, /title: "审查"/);
  assert.match(detailWorkspaceComponent, /title: "终端"/);
  assert.match(detailWorkspaceComponent, /title: "浏览器"/);
  assert.match(detailWorkspaceComponent, /title: "文件"/);
  assert.match(detailWorkspaceComponent, /title: "侧边聊天"/);
  assert.match(detailWorkspaceComponent, /const showWorkspaceMeta = target !== null;/);
  assert.match(styles, /\.detail-workspace \.detail-tool-item:hover,[^}]*\.detail-workspace \.detail-tool-item\.is-active\s*\{[^}]*background:/s);
  assert.doesNotMatch(detailWorkspaceComponent, /detail-tool-preview/);
  assert.doesNotMatch(detailWorkspaceComponent, /工具区/);
  assert.doesNotMatch(detailWorkspaceComponent, /当前未选中具体目标/);
});
