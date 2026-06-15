# Sidebar Header Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the left sidebar header so it reads as a compact desktop-app navigation header instead of a fake window chrome, while preserving existing sidebar behavior.

**Architecture:** Keep the existing sidebar behavior and data flow intact. Limit implementation to a small markup reshuffle in `sidebar.tsx`, a focused light-mode spacing and typography refresh in `packages/ui/src/styles.css`, and a narrow set of regression tests that assert the new header semantics and CSS constraints without introducing a new test framework.

**Tech Stack:** Next.js 16, React 19, TypeScript, shared CSS in `packages/ui/src/styles.css`, Node built-in test runner

---

## File Structure

### Files to modify

- `apps/web/src/components/sidebar.tsx`
  - Replace the old window-control row with a dedicated sidebar header block.
  - Keep existing navigation callbacks and aria labels intact.
- `packages/ui/src/styles.css`
  - Add the new sidebar header layout classes.
  - Retire the visual semantics of the old `chrome-control` row.
  - Adjust spacing, typography, and hover hierarchy for the left sidebar header and primary nav.

### Files to create

- `apps/web/src/sidebarHeaderLayout.test.ts`
  - Assert the new sidebar header markup and CSS contract using the existing `node:test` pattern.

### Files to verify but not change unless blocked

- `apps/web/src/components/icons.tsx`
  - Only touch if the new left header needs a new icon name.
- `apps/web/package.json`
  - Confirm current `node --test` flow remains enough for this work.

## Task 1: Lock the new header contract with failing tests

**Files:**
- Create: `apps/web/src/sidebarHeaderLayout.test.ts`
- Test: `apps/web/src/sidebarHeaderLayout.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
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
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/sidebarHeaderLayout.test.ts
```

Expected:

```text
FAIL
```

Expected failure reason:

- `sidebar-header` classes are not present yet
- `sidebar-window-controls` is still present
- compact spacing values are not defined yet

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web/src/sidebarHeaderLayout.test.ts
git commit -m "test: lock sidebar header refresh contract"
```

## Task 2: Replace the old header markup with the new sidebar header block

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Test: `apps/web/src/sidebarHeaderLayout.test.ts`

- [ ] **Step 1: Update the sidebar header markup**

Replace the top of `Sidebar()` with this structure:

```tsx
<aside aria-label="Workspace navigation" className="sidebar">
  <div className="sidebar-header">
    <div className="sidebar-header-controls">
      <button className="sidebar-header-control" type="button">
        <Icon name="shrink" />
      </button>
      <div className="sidebar-header-nav">
        <button
          aria-label="切换到上一条对话"
          className="sidebar-header-control"
          disabled={!props.conversationNavigator.previousConversationId}
          onClick={() => {
            if (props.conversationNavigator.previousConversationId) {
              props.onSelectAdjacentConversation(props.conversationNavigator.previousConversationId);
            }
          }}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="切换到下一条对话"
          className="sidebar-header-control"
          disabled={!props.conversationNavigator.nextConversationId}
          onClick={() => {
            if (props.conversationNavigator.nextConversationId) {
              props.onSelectAdjacentConversation(props.conversationNavigator.nextConversationId);
            }
          }}
          type="button"
        >
          ›
        </button>
      </div>
    </div>

    <nav aria-label="Primary" className="primary-nav">
      {/* keep existing NavButton usage */}
    </nav>

    <div className="sidebar-header-separator" />
  </div>

  <div className="sidebar-scroll" ref={props.sidebarScrollRef}>
    <DeviceWorkspaceNav
      model={props.model}
      onSelectConversation={props.onSelectConversation}
      onToggleSection={props.onToggleSection}
      onToggleProject={props.onToggleProject}
      pressedItem={props.pressedItem}
      sectionState={props.sectionState}
      selectedConversationId={props.selectedConversationId}
    />
  </div>

  <div className="sidebar-footer">
    {/* keep existing settings button */}
  </div>
</aside>
```

- [ ] **Step 2: Remove obsolete classes from the component**

Delete the old top-row wrapper and its usage:

```tsx
<div className="sidebar-window-controls">
  <button className="chrome-control" tabIndex={-1} type="button">
    <Icon name="shrink" />
  </button>
  ...
</div>
```

Do not change:

- `aria-label="切换到上一条对话"`
- `aria-label="切换到下一条对话"`
- existing `NavButton` calls
- `Sidebar` props or state shape

- [ ] **Step 3: Run the targeted test and verify the markup assertions pass while CSS assertions still fail**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/sidebarHeaderLayout.test.ts
```

Expected:

```text
1 or 2 tests PASS
1 or 2 tests FAIL
```

The component-structure assertion should pass. CSS-contract assertions may still fail until Task 3 is complete.

- [ ] **Step 4: Commit the markup change**

```bash
git add apps/web/src/components/sidebar.tsx apps/web/src/sidebarHeaderLayout.test.ts
git commit -m "refactor: reshape sidebar header markup"
```

## Task 3: Apply the compact spacing and typography refresh in shared CSS

**Files:**
- Modify: `packages/ui/src/styles.css`
- Test: `apps/web/src/sidebarHeaderLayout.test.ts`

- [ ] **Step 1: Add the new header layout classes**

Insert these rules near the existing sidebar styles:

```css
.sidebar-header {
  display: grid;
  gap: 8px;
}

.sidebar-header-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 32px;
  padding: 0 2px;
}

.sidebar-header-nav {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sidebar-header-separator {
  height: 1px;
  margin: 8px 2px;
  background: var(--cr-line);
}
```

- [ ] **Step 2: Replace the old control-button visual language**

Replace the old `chrome-control` rules with the new application-header button rules:

```css
.sidebar-header-control {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: var(--cr-radius-sm);
  background: transparent;
  color: var(--cr-muted);
  font-size: var(--cr-text-list);
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    color 180ms ease;
}

.sidebar-header-control:hover:not(:disabled),
.sidebar-header-control:focus-visible {
  background: var(--cr-sidebar-strong);
  color: var(--cr-ink);
}

.sidebar-header-control:disabled {
  color: color-mix(in oklch, var(--cr-muted) 42%, transparent);
  cursor: default;
}

.sidebar-header-control .icon {
  width: 13px;
  height: 13px;
}
```

- [ ] **Step 3: Tighten primary nav and trailing metadata hierarchy**

Update the existing nav rules to this shape:

```css
.primary-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-button {
  display: grid;
  grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 6px 8px;
  font-size: 13px;
  font-weight: var(--cr-weight-regular);
}

.nav-button.is-active {
  background: color-mix(in oklch, var(--cr-bg) 70%, var(--cr-sidebar-strong));
  color: var(--cr-ink-strong);
  font-weight: var(--cr-weight-emphasis);
}

.nav-device-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--cr-muted);
  font-size: 11px;
  font-weight: var(--cr-weight-regular);
}
```

- [ ] **Step 4: Reduce duplicate separators inside the scroll region**

Update `DeviceWorkspaceNav()` in `apps/web/src/components/sidebar.tsx` to remove the leading separator that used to sit above the sections:

```tsx
return (
  <>
    <section aria-label="置顶" className="sidebar-section">
      ...
    </section>
    ...
    <div className="sidebar-separator" />
  </>
);
```

This avoids stacking the new header separator with the old content separator.

- [ ] **Step 5: Run the targeted sidebar test and verify it passes**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/sidebarHeaderLayout.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 6: Run the broader web package checks**

Run:

```bash
pnpm --filter @codex-remote/web lint
pnpm --filter @codex-remote/web typecheck
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web build
```

Expected:

```text
All commands exit 0
```

- [ ] **Step 7: Commit the CSS refresh**

```bash
git add apps/web/src/components/sidebar.tsx packages/ui/src/styles.css apps/web/src/sidebarHeaderLayout.test.ts
git commit -m "feat: refresh sidebar header styling"
```

## Task 4: Verify icon readiness and decide whether the sidebar can reuse the referenced asset set safely

**Files:**
- Verify: `apps/web/src/components/icons.tsx`
- Verify: `apps/web/public/icons/*.svg`
- Modify only if needed: `apps/web/public/icons/*.svg`

- [ ] **Step 1: Inspect the existing icon pipeline**

Run:

```bash
sed -n '1,220p' apps/web/src/components/icons.tsx
ls apps/web/public/icons
```

Expected:

```text
Existing icon names map to CSS mask assets in /public/icons
```

- [ ] **Step 2: Decide whether direct icon reuse is structurally safe**

Apply this rule:

```text
If the referenced icons can be dropped in as monochrome SVG mask assets with consistent viewBox sizing, reuse the existing icon names and replace only the asset files.
If they require multi-color rendering, incompatible strokes, or a different rendering pipeline, keep the refreshed layout and defer icon replacement without changing the icon API.
```

- [ ] **Step 3: If safe, replace one sidebar-visible icon asset at a time**

Start with these files only:

```text
apps/web/public/icons/search.svg
apps/web/public/icons/setting-o.svg
apps/web/public/icons/shrink.svg
apps/web/public/icons/down.svg
apps/web/public/icons/folder.svg
apps/web/public/icons/folder-open.svg
```

Do not widen scope to the whole app in this pass.

- [ ] **Step 4: Re-run the web package checks after any icon asset replacement**

Run:

```bash
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web build
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit the icon asset update only if it happened**

```bash
git add apps/web/public/icons apps/web/src/components/icons.tsx
git commit -m "chore: align sidebar icons with refreshed header"
```

If no icon asset replacement is completed in this task, skip the commit.

## Task 5: Final verification and handoff

**Files:**
- Verify only: modified files from Tasks 1-4

- [ ] **Step 1: Run repo-level verification for the requested submission standard**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

```text
All commands exit 0
```

- [ ] **Step 2: Review the diff for scope**

Run:

```bash
git diff --stat HEAD~3..HEAD
git status --short
```

Expected:

```text
Only sidebar-header refresh files and any intentional icon assets are included
```

- [ ] **Step 3: Summarize the result with explicit caveats**

Report:

```text
- which sidebar behaviors were preserved unchanged
- whether icon assets were directly reused or deferred
- which commands were actually run
- whether any verification command is only nominal in this repository
```
