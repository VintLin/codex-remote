import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sidebarComponent = readFileSync(join(process.cwd(), "src/components/sidebar.tsx"), "utf8");
const sharedStyles = readFileSync(join(process.cwd(), "../../packages/ui/src/styles.css"), "utf8");

test("when the sidebar header is rendered, should use application header semantics instead of window chrome", () => {
  assert.match(sidebarComponent, /className="sidebar-header"/);
  assert.match(sidebarComponent, /className="sidebar-header-controls"/);
  assert.doesNotMatch(sidebarComponent, /className="sidebar-window-controls"/);
  assert.match(sidebarComponent, /aria-label=\{props\.isCollapsed \? "展开左侧边栏" : "收起左侧边栏"\}/);
  assert.match(sidebarComponent, /\{props\.isMobile \? <span \/> : \(/);
  assert.match(sidebarComponent, /className="sidebar-header-control sidebar-header-control-button sidebar-toggle-button"/);
  assert.match(sidebarComponent, /className="sidebar-header-control sidebar-header-control-button"/);
});

test("when the sidebar header styles are defined, should keep the compact spacing contract from the approved design", () => {
  assert.match(sharedStyles, /--cr-control-size:\s*32px;/);
  assert.match(sharedStyles, /--cr-control-size-mobile:\s*36px;/);
  assert.match(sharedStyles, /--cr-stroke:\s*1px solid var\(--cr-line\);/);
  assert.match(sharedStyles, /\.sidebar-header\s*\{[^}]*gap:\s*8px;/s);
  assert.match(sharedStyles, /\.sidebar-header-controls\s*\{[^}]*height:\s*var\(--cr-control-size\);/s);
  assert.match(sharedStyles, /\.sidebar-header-separator\s*\{[^}]*height:\s*var\(--cr-separator-space\);[^}]*background:\s*transparent;/s);
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
  assert.match(sharedStyles, /\.sidebar-list-item\s*\{[^}]*min-height:\s*var\(--cr-control-size\);/s);
  assert.match(
    sharedStyles,
    /\.sidebar-list-item\s*\{[^}]*grid-template-columns:\s*var\(--cr-sidebar-slot-size\) minmax\(0, 1fr\) var\(--cr-sidebar-trailing-width\);/s,
  );
  assert.match(sharedStyles, /\.sidebar-list-meta\s*\{[^}]*font-size:\s*var\(--cr-text-compact\);/s);
  assert.match(sharedStyles, /\.nested-list\s*\{[^}]*padding-left:\s*0;/s);
  assert.match(sharedStyles, /\.sidebar-list-item-conversation\.is-nested\s*\{[^}]*padding-left:\s*17px;/s);
  assert.match(sharedStyles, /\.sidebar-list-item-project \.item-title\s*\{[^}]*color:\s*var\(--cr-muted\);[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
  assert.match(sharedStyles, /\.sidebar-list-item-conversation \.item-title\s*\{[^}]*color:\s*var\(--cr-ink-strong\);[^}]*font-size:\s*var\(--cr-text-body\);/s);
});

test("when sidebar items are selected, should promote them above hover with a stronger selected layer", () => {
  assert.match(sharedStyles, /--cr-sidebar-selected:\s*oklch\(0\.941 0 89\.9\);/);
  assert.match(sharedStyles, /\.sidebar-list-item-conversation\.is-selected\s*\{[^}]*background:\s*var\(--cr-sidebar-selected\);/s);
  assert.match(sharedStyles, /\.sidebar-list-item-project\.is-selected \.item-title\s*\{[^}]*color:\s*var\(--cr-muted-strong\);/s);
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
  assert.match(sharedStyles, /\.search-dialog\s*\{[^}]*border:\s*var\(--cr-stroke\);[^}]*border-radius:\s*var\(--cr-radius-xl\);/s);
  assert.match(sharedStyles, /\.search-dialog\s*\{[^}]*box-shadow:\s*var\(--cr-shadow-hover\);/s);
  assert.match(sharedStyles, /\.search-input\s*\{[^}]*border-bottom:\s*var\(--cr-stroke\);/s);
  assert.match(sharedStyles, /\.codex-assistant-composer\s*\{[^}]*border:\s*var\(--cr-stroke\);[^}]*border-radius:\s*var\(--cr-radius-xl\);/s);
  assert.match(sharedStyles, /\.codex-assistant-composer\s*\{[^}]*box-shadow:\s*var\(--cr-shadow\);/s);
  assert.match(sharedStyles, /\.panel,\s*\.run-card,\s*\.composer\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
  assert.match(sharedStyles, /\.approval-box,\s*\.linked-task,\s*\.diff-panel\s*\{[^}]*border:\s*var\(--cr-stroke\);/s);
});

test("when mobile navigation is active, should promote full-page back navigation instead of desktop expand or collapse controls", () => {
  assert.match(sharedStyles, /\.mobile-back-icon\s*\{[^}]*transform:\s*rotate\(180deg\);/s);
  assert.match(sharedStyles, /\.review-pane\.mobile-pane\s*\{[^}]*border-left:\s*0;/s);
});

test("when sidebar panels are collapsed or expanded, should switch to panel-specific glyphs instead of rotating one shared icon", () => {
  assert.doesNotMatch(sharedStyles, /\.sidebar-toggle-button\[data-direction="left"\]\[data-state="expanded"\] \.sidebar-toggle-icon,[^}]*transform:\s*rotate\(180deg\);/s);
  assert.match(sidebarComponent, /name=\{props\.isCollapsed \? "panel-left-open" : "panel-left-close"\}/);
});
