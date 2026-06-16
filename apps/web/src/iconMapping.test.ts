import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const iconComponent = readFileSync(join(process.cwd(), "src/components/icons.tsx"), "utf8");
const actionMenuComponent = readFileSync(join(process.cwd(), "src/components/action-menu.tsx"), "utf8");
const detailWorkspaceComponent = readFileSync(join(process.cwd(), "src/components/detail-workspace.tsx"), "utf8");
const assistantThreadComponent = readFileSync(join(process.cwd(), "src/components/codex-assistant-thread.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "../../packages/ui/src/styles.css"), "utf8");

test("when refreshing the svg icon library, should point icon classes at the imported replacement assets", () => {
  assert.match(styles, /\.icon-search\s*\{[^}]*url\("\/icons\/search\.svg"\);/s);
  assert.match(styles, /\.icon-right\s*\{[^}]*url\("\/icons\/chevron-right\.svg"\);/s);
  assert.match(styles, /\.icon-down\s*\{[^}]*url\("\/icons\/chevron-down\.svg"\);/s);
  assert.match(styles, /\.icon-reload\s*\{[^}]*url\("\/icons\/timer-reset\.svg"\);/s);
  assert.match(styles, /\.icon-more\s*\{[^}]*url\("\/icons\/ellipsis\.svg"\);/s);
  assert.match(styles, /\.icon-setting-o\s*\{[^}]*url\("\/icons\/settings\.svg"\);/s);
  assert.match(styles, /\.icon-shrink\s*\{[^}]*url\("\/icons\/split\.svg"\);/s);
  assert.match(styles, /\.icon-information-o\s*\{[^}]*url\("\/icons\/info\.svg"\);/s);
  assert.match(styles, /\.icon-globe\s*\{[^}]*url\("\/icons\/globe\.svg"\);/s);
  assert.match(styles, /\.icon-square-terminal\s*\{[^}]*url\("\/icons\/square-terminal\.svg"\);/s);
});

test("when icon semantics differ by action, should split send pin and mic while removing the old detail close glyph", () => {
  assert.match(iconComponent, /"arrow-up"/);
  assert.match(iconComponent, /"clock"/);
  assert.match(iconComponent, /"mic"/);
  assert.match(iconComponent, /"pin"/);
  assert.match(iconComponent, /"x"/);

  assert.match(actionMenuComponent, /icon: "pin", label: "置顶"/);
  assert.match(actionMenuComponent, /icon: "clock", label: "按创建时间排序"/);
  assert.doesNotMatch(detailWorkspaceComponent, /<Icon name="x" \/>/);
  assert.match(assistantThreadComponent, /<Icon name="mic" \/>/);
  assert.match(assistantThreadComponent, /<Icon name="arrow-up" \/>/);
});

test("when choosing device glyphs from the imported set, should map mac windows mobile and fallback devices without legacy apple svg assets", () => {
  assert.match(styles, /\.icon-apple\s*\{[^}]*url\("\/icons\/laptop-minimal\.svg"\);/s);
  assert.match(styles, /\.icon-windows\s*\{[^}]*url\("\/icons\/computer\.svg"\);/s);
  assert.match(styles, /\.icon-mobile\s*\{[^}]*url\("\/icons\/smartphone\.svg"\);/s);
  assert.match(styles, /\.icon-laptop\s*\{[^}]*url\("\/icons\/laptop-minimal\.svg"\);/s);
});

test("when sidebar panels are toggled, should use panel open close glyphs instead of rotating a shared chevron", () => {
  assert.match(iconComponent, /"panel-left-close"/);
  assert.match(iconComponent, /"panel-left-open"/);
  assert.match(iconComponent, /"panel-right-close"/);
  assert.match(iconComponent, /"panel-right-open"/);
  assert.match(styles, /\.icon-panel-left-close\s*\{[^}]*url\("\/icons\/panel-left-close\.svg"\);/s);
  assert.match(styles, /\.icon-panel-left-open\s*\{[^}]*url\("\/icons\/panel-left-open\.svg"\);/s);
  assert.match(styles, /\.icon-panel-right-close\s*\{[^}]*url\("\/icons\/panel-right-close\.svg"\);/s);
  assert.match(styles, /\.icon-panel-right-open\s*\{[^}]*url\("\/icons\/panel-right-open\.svg"\);/s);
});

test("when user specifies explicit action icons, should use those exact svg mappings for sidebar arrows and project actions", () => {
  assert.match(iconComponent, /"arrow-left"/);
  assert.match(iconComponent, /"arrow-right"/);
  assert.match(iconComponent, /"globe"/);
  assert.match(iconComponent, /"layout-list"/);
  assert.match(iconComponent, /"message-circle-plus"/);
  assert.match(iconComponent, /"pencil"/);
  assert.match(iconComponent, /"square-terminal"/);
  assert.match(styles, /\.icon-arrow-left\s*\{[^}]*url\("\/icons\/arrow-left\.svg"\);/s);
  assert.match(styles, /\.icon-arrow-right\s*\{[^}]*url\("\/icons\/arrow-right\.svg"\);/s);
  assert.match(styles, /\.icon-globe\s*\{[^}]*url\("\/icons\/globe\.svg"\);/s);
  assert.match(styles, /\.icon-layout-list\s*\{[^}]*url\("\/icons\/layout-list\.svg"\);/s);
  assert.match(styles, /\.icon-message-circle-plus\s*\{[^}]*url\("\/icons\/message-circle-plus\.svg"\);/s);
  assert.match(styles, /\.icon-pencil\s*\{[^}]*url\("\/icons\/pencil\.svg"\);/s);
  assert.match(styles, /\.icon-square-terminal\s*\{[^}]*url\("\/icons\/square-terminal\.svg"\);/s);
  assert.match(actionMenuComponent, /icon: "message-circle-plus", label: "新对话"/);
  assert.match(actionMenuComponent, /icon: "shrink", label: "创建工作树"/);
  assert.match(actionMenuComponent, /icon: "pencil", label: "重命名"/);
});
