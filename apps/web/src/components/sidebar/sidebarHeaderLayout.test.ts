import assert from "node:assert/strict";
import { readWebSource, readWorkspaceSource } from "../../test-support/sourcePaths.ts";
import test from "node:test";

const sidebarComponent = readWebSource("components/sidebar/sidebar.tsx");
const conversationThreadComponent = readWebSource("components/conversation/codex-assistant-thread.tsx");
const mainPanelsComponent = readWebSource("components/detail/main-panels.tsx");
const sharedStyles = readWorkspaceSource("packages/ui/src/styles.css");

test("when the sidebar header is rendered, should use application header semantics instead of window chrome", () => {
  assert.match(sidebarComponent, /className="sidebar-header"/);
  assert.match(sidebarComponent, /className="sidebar-header-controls"/);
  assert.doesNotMatch(sidebarComponent, /className="sidebar-window-controls"/);
  assert.match(sidebarComponent, /aria-label=\{props\.isCollapsed \? props\.copy\.sidebar\.expandSidebar : props\.copy\.sidebar\.collapseSidebar\}/);
  assert.match(sidebarComponent, /\{props\.isMobile \? <span \/> : \(/);
  assert.match(sidebarComponent, /className="sidebar-header-control sidebar-header-control-button sidebar-toggle-button"/);
  assert.match(sidebarComponent, /className="sidebar-header-control sidebar-header-control-button"/);
});

test("when the sidebar header styles are defined, should keep the compact spacing contract from the approved design", () => {
  assert.match(sharedStyles, /--cr-control-size:\s*32px;/);
  assert.match(sharedStyles, /--cr-control-size-mobile:\s*36px;/);
  assert.match(sharedStyles, /--cr-stroke:\s*1px solid var\(--cr-line\);/);
  assert.match(sharedStyles, /\.sidebar-header\s*\{[^}]*gap:\s*3px;/s);
  assert.match(sharedStyles, /\.sidebar-header-controls\s*\{[^}]*height:\s*var\(--cr-control-size\);/s);
  assert.match(
    sharedStyles,
    /\.sidebar-header-separator\s*\{[^}]*height:\s*var\(--cr-sidebar-header-separator-height\);[^}]*background:\s*transparent;/s,
  );
  assert.match(sharedStyles, /\.sidebar-header-control\s*\{[^}]*width:\s*var\(--cr-control-size\);[^}]*height:\s*var\(--cr-control-size\);/s);
});

test("when the primary nav styles are updated, should keep the compact nav height and lighter trailing device metadata", () => {
  assert.match(sharedStyles, /\.nav-button\s*\{[^}]*min-height:\s*var\(--cr-control-size\);/s);
  assert.match(sharedStyles, /\.nav-button\s*\{[^}]*font-size:\s*var\(--cr-text-body\);/s);
  assert.match(sharedStyles, /\.nav-device-status\s*\{[^}]*font-size:\s*var\(--cr-text-compact\);/s);
  assert.match(sharedStyles, /\.nav-glyph\s*\{[^}]*background:\s*transparent;/s);
});

test("when sidebar project and conversation rows are refined, should keep the reference-inspired compact row rhythm", () => {
  assert.match(
    sharedStyles,
    /\.sidebar-heading\s*\{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*var\(--cr-sidebar-slot-size\) minmax\(0, 1fr\) var\(--cr-sidebar-trailing-width\);[^}]*min-height:\s*var\(--cr-control-size\);/s,
  );
  assert.match(
    sharedStyles,
    /\.sidebar-heading\s*\{[^}]*color:\s*var\(--cr-muted\);[^}]*font-size:\s*var\(--cr-text-body\);[^}]*font-weight:\s*var\(--cr-weight-regular\);/s,
  );
  assert.match(sharedStyles, /\.sidebar-list-item\s*\{[^}]*min-height:\s*var\(--cr-control-size\);/s);
  assert.match(
    sharedStyles,
    /\.sidebar-list-item\s*\{[^}]*grid-template-columns:\s*var\(--cr-sidebar-slot-size\) minmax\(0, 1fr\) var\(--cr-sidebar-trailing-width\);/s,
  );
  assert.match(sharedStyles, /\.sidebar-list-meta\s*\{[^}]*font-size:\s*var\(--cr-text-compact\);/s);
  assert.match(sharedStyles, /\.nested-list\s*\{[^}]*padding-left:\s*0;/s);
  assert.match(sharedStyles, /\.sidebar-list-item-conversation\.is-nested\s*\{[^}]*padding-left:\s*0;/s);
  assert.match(sharedStyles, /\.sidebar-list-item-project\.is-expanded \.sidebar-list-inline\s*\{[^}]*transform:\s*rotate\(90deg\);/s);
  assert.match(
    sharedStyles,
    /\.sidebar-list-item:hover \.sidebar-list-inline,\s*\.sidebar-list-item:focus-within \.sidebar-list-inline,\s*\.sidebar-list-item\.is-pressed \.sidebar-list-inline\s*\{\s*opacity:\s*1;\s*\}/s,
  );
  assert.match(
    sharedStyles,
    /\.sidebar-list-item-project \.item-title,\s*\.sidebar-list-item-conversation \.item-title\s*\{[^}]*color:\s*var\(--cr-ink-strong\);[^}]*font-size:\s*var\(--cr-text-body\);[^}]*font-weight:\s*var\(--cr-weight-regular\);/s,
  );
  assert.match(
    sharedStyles,
    /\.sidebar-list-item-empty \.item-title\s*\{[^}]*color:\s*var\(--cr-sidebar-muted\);[^}]*font-size:\s*var\(--cr-text-body\);[^}]*font-weight:\s*var\(--cr-weight-regular\);/s,
  );
});

test("when sidebar items are selected, should promote them above hover with a stronger selected layer", () => {
  assert.match(sharedStyles, /--cr-sidebar-selected:\s*oklch\(0\.941 0 89\.9\);/);
  assert.match(sharedStyles, /\.sidebar-list-item-conversation\.is-selected\s*\{[^}]*background:\s*var\(--cr-sidebar-selected\);/s);
  assert.match(
    sharedStyles,
    /\.sidebar-list-item-project\.is-selected \.item-title,\s*\.sidebar-list-item-conversation\.is-selected \.item-title\s*\{[^}]*color:\s*var\(--cr-ink-strong\);/s,
  );
});

test("when sidebar controls are hovered, should use one consistent gray hover background", () => {
  assert.match(sharedStyles, /\.nav-button:hover,[^}]*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
  assert.match(sharedStyles, /\.sidebar-heading:hover,[^}]*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
  assert.match(sharedStyles, /\.sidebar-list-icon-button:hover,[^}]*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
  assert.match(sharedStyles, /\.action-menu-trigger:hover,[^}]*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
  assert.match(sharedStyles, /\.icon-button:hover,[^}]*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
});

test("when the sidebar list is separated from surrounding chrome, should use a scroll fade mask instead of a solid divider", () => {
  assert.match(sidebarComponent, /className="sidebar-scroll sidebar-scroll-mask"/);
  assert.match(sharedStyles, /\.sidebar-scroll-mask\s*\{[^}]*mask-image:\s*linear-gradient\(#0000, #000 24px calc\(100% - 32px\), #0000\);/s);
  assert.match(sharedStyles, /\.sidebar-scroll-mask\[data-top="true"\]\[data-bottom="true"\]\s*\{[^}]*mask-image:\s*linear-gradient\(#000 0 100%\);/s);
});

test("when container borders are aligned to the reference visual language, should use explicit neutral strokes and tighter radii", () => {
  assert.match(sharedStyles, /--cr-line-hover:\s*oklch\(0\.884 0 89\.9\);/);
  assert.match(sharedStyles, /--cr-radius-lg:\s*10px;/);
  assert.match(sharedStyles, /--cr-radius-xl:\s*16px;/);
  assert.match(sharedStyles, /\.topbar\s*\{[^}]*border-bottom:\s*var\(--cr-stroke\);/s);
  assert.match(sharedStyles, /\.review-header\s*\{[^}]*border-bottom:\s*var\(--cr-stroke\);/s);
  assert.match(
    sharedStyles,
    /\.search-dialog\s*\{[^}]*border:\s*var\(--cr-stroke\);[^}]*border-radius:\s*var\(--cr-radius-card\);[^}]*background:\s*var\(--cr-bg\);/s,
  );
  assert.match(sharedStyles, /\.search-dialog\s*\{[^}]*padding:\s*12px 8px 10px;/s);
  assert.match(sharedStyles, /\.search-dialog\s*\{[^}]*box-shadow:\s*var\(--cr-shadow\);/s);
  assert.match(
    sharedStyles,
    /\.search-input-shell\s*\{[^}]*min-height:\s*var\(--cr-search-input-shell-min-height\);[^}]*margin:\s*0 6px 8px;[^}]*border-bottom:\s*var\(--cr-stroke\);/s,
  );
  assert.match(sharedStyles, /\.search-input\s*\{[^}]*appearance:\s*none;[^}]*-webkit-appearance:\s*none;[^}]*box-shadow:\s*none;/s);
  assert.match(sharedStyles, /\.search-input:focus,\s*\.search-input:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s);
  assert.match(sharedStyles, /\.codex-assistant-composer\s*\{[^}]*border:\s*var\(--cr-stroke\);[^}]*border-radius:\s*var\(--cr-radius-xl\);/s);
  assert.match(sharedStyles, /\.codex-assistant-composer\s*\{[^}]*box-shadow:\s*var\(--cr-shadow\);/s);
  assert.match(sharedStyles, /\.panel,\s*\.run-card,\s*\.composer\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
  assert.match(sharedStyles, /\.approval-box,\s*\.linked-task,\s*\.diff-panel\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
  assert.match(sharedStyles, /\.search-results\s*\{[^}]*gap:\s*2px;/s);
  assert.match(sharedStyles, /\.search-result\.is-active,\s*\.search-result:hover\s*\{[^}]*background:\s*var\(--cr-sidebar-strong\);/s);
  assert.match(sharedStyles, /\.codex-markdown :where\(ul, ol\)\s*\{[^}]*list-style-position:\s*outside;[^}]*padding-left:\s*1\.35em;/s);
  assert.match(sharedStyles, /\.codex-markdown ul\s*\{[^}]*list-style-type:\s*disc;/s);
  assert.match(sharedStyles, /\.codex-markdown ol\s*\{[^}]*list-style-type:\s*decimal;/s);
  assert.match(sharedStyles, /\.codex-markdown li::marker\s*\{[^}]*color:\s*var\(--cr-muted\);/s);
});

test("when mobile navigation is active, should promote full-page back navigation instead of desktop expand or collapse controls", () => {
  assert.match(sharedStyles, /\.mobile-back-icon\s*\{[^}]*transform:\s*rotate\(180deg\);/s);
  assert.match(sharedStyles, /\.review-pane\.mobile-pane\s*\{[^}]*border-left:\s*0;/s);
});

test("when sidebar panels are collapsed or expanded, should switch to panel-specific glyphs instead of rotating one shared icon", () => {
  assert.doesNotMatch(sharedStyles, /\.sidebar-toggle-button\[data-direction="left"\]\[data-state="expanded"\] \.sidebar-toggle-icon,[^}]*transform:\s*rotate\(180deg\);/s);
  assert.match(sidebarComponent, /name=\{props\.isCollapsed \? "panel-left-open" : "panel-left-close"\}/);
});

test("conversation main when source is not loaded, should render explicit example data copy", () => {
  assert.match(mainPanelsComponent, /copy\.showingSampleData\(/);
  assert.match(mainPanelsComponent, /copy\.notConnectedToControlPlane/);
});

test("task board when source is not loaded, should render explicit example data copy", () => {
  assert.match(mainPanelsComponent, /source: WorkbenchData\["source"\]/);
  assert.match(mainPanelsComponent, /const isExampleData = source\.reason !== "loaded";/);
  assert.match(mainPanelsComponent, /<section aria-label=\{copy\.taskBoardSource\} className="conversation-source-banner">/);
  assert.match(mainPanelsComponent, /copy\.showingSampleTasks\(/);
  assert.match(readWebSource("components/shell/codex-remote-app.tsx"), /source=\{source\}/);
});

test("conversation composer when future controls are placeholders, should keep them visibly disabled", () => {
  assert.match(conversationThreadComponent, /aria-label=\{dictionary\.addAttachment\}[^>]*disabled/);
  assert.doesNotMatch(conversationThreadComponent, /aria-label="语音输入"/);
  assert.doesNotMatch(conversationThreadComponent, /className="codex-assistant-model"/);
  assert.match(conversationThreadComponent, /className="codex-assistant-access"/);
});
