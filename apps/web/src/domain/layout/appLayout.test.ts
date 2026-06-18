import assert from "node:assert/strict";
import { readWebSource, readWorkspaceSource } from "../../test-support/sourcePaths.ts";
import test from "node:test";

import { appPanelLayout } from "./appLayout.ts";

const appComponent = readWebSource("components/shell/codex-remote-app.tsx");
const shellComponent = readWebSource("components/shell/resizable-workspace-shell.tsx");
const mainPanelsComponent = readWebSource("components/detail/main-panels.tsx");
const detailWorkspaceComponent = readWebSource("components/detail/detail-workspace.tsx");
const sidebarComponent = readWebSource("components/sidebar/sidebar.tsx");
const statusPresentation = readWebSource("domain/status/statusPresentation.ts");
const rightDetailPaneComponent = readWorkspaceSource("packages/ui/src/panels/right-detail-pane.tsx");
const badgeComponent = readWorkspaceSource("packages/ui/src/primitives/badge.tsx");
const styles = readWorkspaceSource("packages/ui/src/styles.css");

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

test("when conversations are empty, app shell should allow null selected conversation instead of non-null assertions", () => {
  assert.match(appComponent, /useState<string \| null>/);
  assert.doesNotMatch(appComponent, /conversations\[0\]!\.id/);
  assert.match(appComponent, /conversation === null/);
});

test("when the device list is used on mobile, should advance from the list page into a dedicated detail page", () => {
  assert.match(mainPanelsComponent, /onOpenDetail\?: \(deviceId: string\) => void;/);
  assert.match(mainPanelsComponent, /onOpenDetail\?\.\(device\.id\);/);
  assert.match(appComponent, /onOpenDetail=\{\(\) => \{/);
  assert.match(appComponent, /if \(isMobileViewport\) \{\s*setMobilePane\("detail"\);/s);
});

test("when the main workspace meets adjacent panes, should keep the left sidebar corner radius while using straight right detail edges", () => {
  assert.match(
    styles,
    /\.workspace-panel-main\s*\{[^}]*border-top:\s*var\(--cr-pane-stroke-top\);[^}]*border-bottom:\s*var\(--cr-pane-stroke-bottom\);[^}]*border-left:\s*var\(--cr-pane-stroke-left\);[^}]*border-top-left-radius:\s*var\(--cr-radius-xl\);[^}]*border-bottom-left-radius:\s*var\(--cr-radius-xl\);[^}]*background:\s*var\(--cr-bg\);/s,
  );
  assert.match(styles, /\.review-pane\s*\{[^}]*border-left:\s*var\(--cr-pane-stroke-left\);[^}]*border-radius:\s*0;/s);
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
  assert.match(styles, /\.device-grid\s*\{[^}]*border:\s*var\(--cr-stroke\);[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.device-card\s*\{[^}]*border-bottom:\s*var\(--cr-stroke\);[^}]*background:\s*var\(--cr-bg\);[^}]*box-shadow:\s*none;/s);
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
  assert.match(
    styles,
    /\.conversation-title-menu \.action-menu-trigger\s*\{[^}]*width:\s*var\(--cr-title-menu-trigger-size\);[^}]*height:\s*var\(--cr-title-menu-trigger-size\);/s,
  );
  assert.match(styles, /\.conversation-collapsed-sidebar-controls\s*\{[^}]*display:\s*flex;[^}]*gap:\s*4px;/s);
});

test("when the devices header is simplified, should keep the add action beside the title and reserve the right edge for sidebar expansion", () => {
  assert.match(mainPanelsComponent, /className="workspace-title devices-title"/);
  assert.match(mainPanelsComponent, /aria-label="新增设备"/);
  assert.match(mainPanelsComponent, /className="icon-button devices-add-button"/);
  assert.match(mainPanelsComponent, /className="toolbar devices-toolbar"/);
  assert.doesNotMatch(mainPanelsComponent, /管理当前 Control Plane 可见的设备/);
  assert.doesNotMatch(mainPanelsComponent, /新增设备<\/button>/);
  assert.match(styles, /\.devices-title\s*\{[^}]*gap:\s*6px;/s);
  assert.match(styles, /\.devices-toolbar\s*\{[^}]*flex:\s*1 1 auto;[^}]*justify-content:\s*flex-end;/s);
});

test("when demo actions are unavailable, should render disabled controls instead of clickable no-op actions", () => {
  const actionMenuComponent = readWebSource("components/sidebar/action-menu.tsx");
  const menuComponent = readWorkspaceSource("packages/ui/src/overlays/popover-menu.tsx");

  assert.match(actionMenuComponent, /disabled\?: boolean;/);
  assert.match(actionMenuComponent, /disabled: true/);
  assert.match(actionMenuComponent, /<PopoverMenu/);
  assert.match(menuComponent, /aria-disabled=\{action\.disabled === true\}/);
  assert.match(menuComponent, /disabled=\{action\.disabled === true\}/);
  assert.doesNotMatch(actionMenuComponent, /createPortal/);
  assert.doesNotMatch(actionMenuComponent, /useLayoutEffect/);
  assert.match(mainPanelsComponent, /aria-label="新增设备" className="icon-button devices-add-button" disabled/);
  assert.match(mainPanelsComponent, /aria-label="编辑设备" className="icon-button device-action-button" disabled/);
  assert.match(mainPanelsComponent, /aria-label="删除设备" className="icon-button device-action-button device-action-button-danger" disabled/);
});

test("when device rows expose status and actions, should use a status dot plus icon-only edit and delete actions", () => {
  assert.match(mainPanelsComponent, /import \{ Badge as UiBadge, Icon, RightDetailPane, StatusDot \} from "@codex-remote\/ui";/);
  assert.match(mainPanelsComponent, /import \{ getStatusClassName, statusText \} from "\.\.\/\.\.\/domain\/status\/statusPresentation";/);
  assert.match(sidebarComponent, /import \{ getStatusClassName \} from "\.\.\/\.\.\/domain\/status\/statusPresentation";/);
  assert.match(statusPresentation, /export const statusText = \{/);
  assert.match(statusPresentation, /export function getStatusClassName/);
  assert.doesNotMatch(sidebarComponent, /export function statusToClass/);
  assert.match(mainPanelsComponent, /className="device-card-title">\s*<span>\{device\.name\}<\/span>\s*<StatusBadge status=\{device\.status\} \/>/s);
  assert.match(mainPanelsComponent, /<UiBadge ariaLabel=\{statusText\[props\.status\]\} className=\{`badge-device-status \$\{statusClassName\}`\}>/);
  assert.match(mainPanelsComponent, /<StatusDot statusClassName=\{statusClassName\} \/>/);
  assert.match(mainPanelsComponent, /<UiBadge className=\{statusClassName\}>\{statusText\[props\.status\]\}<\/UiBadge>/);
  assert.doesNotMatch(mainPanelsComponent, /function Badge\(/);
  assert.match(badgeComponent, /export function Badge/);
  assert.match(badgeComponent, /export function StatusDot/);
  assert.match(mainPanelsComponent, /aria-label="编辑设备" className="icon-button device-action-button"/);
  assert.match(mainPanelsComponent, /<Icon name="pencil" \/>/);
  assert.match(mainPanelsComponent, /aria-label="删除设备" className="icon-button device-action-button device-action-button-danger"/);
  assert.match(mainPanelsComponent, /<Icon name="delete" \/>/);
  assert.match(styles, /\.device-card-title\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;/s);
  assert.match(
    styles,
    /\.badge-device-status\s*\{[^}]*min-width:\s*var\(--cr-status-dot-device-size\);[^}]*background:\s*transparent;[^}]*flex:\s*0 0 auto;/s,
  );
  assert.match(styles, /\.status-dot\.online\s*\{[^}]*background:\s*var\(--cr-success-ink\);/s);
  assert.match(styles, /\.status-dot\.offline\s*\{[^}]*background:\s*var\(--cr-danger-ink\);/s);
  assert.match(styles, /\.device-action-button\s*\{[^}]*color:\s*var\(--cr-muted-strong\);/s);
  assert.match(styles, /\.device-action-button-danger\s*\{[^}]*color:\s*var\(--cr-danger-ink\);/s);
});

test("when the automations page is aligned with the rest of the workspace, should keep the header minimal and the empty state as plain copy", () => {
  assert.match(mainPanelsComponent, /className="workspace-title automations-title"/);
  assert.match(mainPanelsComponent, /className="toolbar automations-toolbar"/);
  assert.match(mainPanelsComponent, /className="empty-state automation-empty-state"/);
  assert.doesNotMatch(mainPanelsComponent, /后续用于展示当前设备上的自动化任务/);
  assert.match(styles, /\.empty-state\s*\{[^}]*padding:\s*8px 0 0;/s);
  assert.match(styles, /\.empty-state h2\s*\{[^}]*font-size:\s*var\(--cr-text-body\);/s);
  assert.match(styles, /\.empty-state p\s*\{[^}]*color:\s*var\(--cr-muted-strong\);/s);
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
  assert.match(rightDetailPaneComponent, /aria-label="收起右侧边栏"/);
  assert.doesNotMatch(detailWorkspaceComponent, /aria-label="清空详情"/);
  assert.match(styles, /\.sidebar-toggle-button \.sidebar-toggle-icon\s*\{[^}]*width:\s*var\(--cr-nav-icon-size\);[^}]*height:\s*var\(--cr-nav-icon-size\);/s);
  assert.match(styles, /\.workspace-resize-handle\s*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle:hover,[^}]*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle\.is-disabled\s*\{[^}]*width:\s*0;[^}]*pointer-events:\s*none;/s);
});

test("when the detail workspace is rendered, should inherit the sidebar background without pane borders", () => {
  assert.match(detailWorkspaceComponent, /<RightDetailPane/);
  assert.match(detailWorkspaceComponent, /className="detail-workspace"/);
  assert.match(rightDetailPaneComponent, /className=\{`review-pane right-detail-pane/);
  assert.match(styles, /\.right-detail-pane\s*\{[^}]*border-left:\s*var\(--cr-pane-stroke-left\);[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.right-detail-pane \.review-header\s*\{[^}]*border-bottom:\s*0;[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.right-detail-pane \.review-scroll\s*\{[^}]*background:\s*var\(--cr-bg\);/s);
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

test("when device and automation detail panes are rendered, should share the same white sidebar shell as conversation detail", () => {
  assert.match(mainPanelsComponent, /<RightDetailPane/);
  assert.match(mainPanelsComponent, /className="device-detail-pane"/);
  assert.match(mainPanelsComponent, /title="设备详情"/);
  assert.match(mainPanelsComponent, /title="自动化详情"/);
  assert.match(styles, /\.right-detail-pane-glyph\s*\{[^}]*color:\s*var\(--cr-muted-strong\);/s);
  assert.match(styles, /\.device-detail-pane \.linked-task,\s*\.device-detail-pane \.diff-panel\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.device-detail-pane \.linked-task h2,[^}]*font-weight:\s*var\(--cr-weight-regular\);/s);
});
