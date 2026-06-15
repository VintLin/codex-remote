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
  assert.match(sidebarComponent, /<span aria-hidden="true" className="sidebar-header-control sidebar-header-control-decorative">/);
  assert.match(sidebarComponent, /className="sidebar-header-control sidebar-header-control-button"/);
});

test("when the sidebar header styles are defined, should keep the compact spacing contract from the approved design", () => {
  assert.match(sharedStyles, /\.sidebar-header\s*\{[^}]*gap:\s*8px;/s);
  assert.match(sharedStyles, /\.sidebar-header-controls\s*\{[^}]*height:\s*32px;/s);
  assert.match(sharedStyles, /\.sidebar-header-separator\s*\{[^}]*margin:\s*8px 2px;/s);
});

test("when the primary nav styles are updated, should keep the compact nav height and lighter trailing device metadata", () => {
  assert.match(sharedStyles, /\.nav-button\s*\{[^}]*min-height:\s*34px;/s);
  assert.match(sharedStyles, /\.nav-device-status\s*\{[^}]*font-size:\s*11px;/s);
});
