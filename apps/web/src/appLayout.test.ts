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
  assert.match(styles, /\.device-card\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
  assert.match(styles, /\.linked-task h2,[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
  assert.match(styles, /\.workspace-title h1\s*\{[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
});

test("when a side panel is collapsed at the drag threshold, should disable its resize handle until a header button expands it", () => {
  assert.match(shellComponent, /disabled=\{isSidebarCollapsed\}/);
  assert.match(shellComponent, /disabled=\{isDetailCollapsed\}/);
  assert.match(shellComponent, /className=\{`workspace-resize-handle workspace-resize-handle-left\$\{isSidebarCollapsed \? " is-disabled" : ""\}`\}/);
  assert.match(shellComponent, /className=\{`workspace-resize-handle workspace-resize-handle-right\$\{isDetailCollapsed \? " is-disabled" : ""\}`\}/);
  assert.match(shellComponent, /if \(panelSize\.inPixels <= appPanelLayout\.left\.minSize && !isSidebarCollapsed\) \{/);
  assert.match(shellComponent, /if \(panelSize\.inPixels <= appPanelLayout\.right\.minSize && !isDetailCollapsed\) \{/);
  assert.match(mainPanelsComponent, /label="展开左侧边栏"/);
  assert.match(mainPanelsComponent, /label="展开右侧边栏"/);
  assert.match(detailWorkspaceComponent, /aria-label="收起右侧边栏"/);
  assert.match(styles, /\.workspace-resize-handle\s*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle:hover,[^}]*\{[^}]*background:\s*transparent;/s);
  assert.match(styles, /\.workspace-resize-handle\.is-disabled\s*\{[^}]*width:\s*0;[^}]*pointer-events:\s*none;/s);
});
