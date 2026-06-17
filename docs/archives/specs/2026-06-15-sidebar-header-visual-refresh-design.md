# Sidebar Header Visual Refresh Design

## 1. Scope

This design covers only the left sidebar visual refresh for the web workspace in `apps/web`.

In scope:

- Rework the left sidebar header structure.
- Rebalance spacing values around the header and primary navigation.
- Introduce a typography hierarchy closer to the referenced ZCode `hero-visual-theme` desktop shell.
- Prepare the sidebar icon system for replacement with the referenced linear icon style.

Out of scope:

- Adding a marketing-style hero section.
- Adding a global top header above the workspace.
- Changing the main content pane information architecture.
- Changing the right detail pane in this iteration.

## 2. Goal

Keep the existing light-mode control-plane workbench intact, but make the left sidebar feel more like a refined desktop app shell.

The reference should influence:

- header rhythm
- vertical spacing
- icon style
- text hierarchy

The reference should not influence:

- dark hero background
- landing-page presentation
- glassmorphism or decorative gradients

## 3. Existing State

The current sidebar header is implemented in `apps/web/src/components/sidebar.tsx` as a window-control-like row:

- a non-functional shrink button
- previous conversation button
- next conversation button

The visual treatment currently reads like a simulated system titlebar instead of an application workspace header.

The current spacing and typography are also relatively flat:

- the top control row and primary navigation are visually disconnected
- most visible text sizes cluster around `13px` to `14px`
- metadata and navigation labels are not separated strongly enough

## 4. Target Direction

The new sidebar should read as a compact, deliberate application navigation column.

Design intent:

- remove the fake system-window semantics
- make the top area feel like a real workspace control header
- preserve the current sidebar information density
- tighten the vertical rhythm
- make navigation and metadata hierarchy clearer in light mode

## 5. Sidebar Structure

### 5.1 Header block

The sidebar top area becomes a single `sidebar-header` block with two rows:

1. `sidebar-header-controls`
2. `primary-nav`

### 5.2 Controls row

The first row contains:

- one left-aligned sidebar control button
- two right-side conversation navigation buttons

The controls row starts directly at the top of the sidebar content area. It no longer imitates macOS or Windows traffic/window controls.

Button semantics:

- left control button: collapse/layout affordance
- right controls: previous conversation / next conversation

All three controls use the same visual button language.

### 5.3 Primary navigation row

The second row remains the existing primary navigation:

- `设备`
- `搜索`
- `自动化`

This row is treated as part of the same header block rather than a separate floating navigation group.

### 5.4 Divider

A restrained divider separates the header block from the scrollable project/conversation area.

The divider remains subtle and should not visually dominate the header.

## 6. Spacing Specification

The main values are chosen by referencing the tighter desktop-shell spacing from the target ZCode section, adapted to this project's light workbench.

Sidebar shell:

- sidebar outer padding remains `12px 10px`

Header block:

- top controls row height: `32px`
- controls row bottom gap to primary nav: `8px`
- primary nav bottom gap to divider: `10px`
- divider vertical margin: `8px 2px`

Primary nav:

- nav button min height: `32px` to `34px`
- nav internal horizontal padding stays compact

Section transition:

- reduce the visual jump between divider and first section heading
- keep section headings close enough to feel connected to the header, but not merged into it

These values are intended as the first implementation target, not aspirational guidance.

## 7. Typography and Color Hierarchy

This iteration keeps the existing light mode, but sharpens hierarchy.

### 7.1 Navigation

- primary nav label: `13px`
- active nav weight: medium/emphasis
- inactive nav weight: regular

### 7.2 Trailing device status

- size: `11px` to `12px`
- color: one level lighter than nav label
- status dot and device name should read as auxiliary information

### 7.3 Section headings

- size: `11px` to `12px`
- color remains muted
- maintain compact casing and understated emphasis

### 7.4 General text intent

Do not darken everything. The goal is hierarchy, not heaviness:

- titles should feel more anchored
- metadata should step back
- hover/active states should deepen contrast slightly without introducing a new accent color

## 8. Icon Direction

The project may directly reuse the referenced interface icon assets if they can be obtained in a technically clean way.

Required target replacements in the sidebar system:

- shrink / panel toggle
- search
- reload
- settings
- folder
- folder-open
- down / chevron
- right / disclosure
- plus
- device-related icons

Fallback rule:

If direct asset reuse proves unsafe or structurally incompatible with the current icon pipeline, replace them with icons that match the same linear, compact, desktop-tool style.

The structural and spacing refresh must not depend on icon replacement being completed first.

## 9. Component Changes

### 9.1 `apps/web/src/components/sidebar.tsx`

Required changes:

- replace the current top row structure with a dedicated header block
- rename the old window-control semantics to application header semantics
- preserve existing navigation behavior and keyboard interaction
- keep the current section and list rendering model unchanged

### 9.2 `packages/ui/src/styles.css`

Required changes:

- add or refactor styles for:
  - `sidebar-header`
  - `sidebar-header-controls`
  - `sidebar-header-separator`
- retire or narrow styles tied to:
  - `sidebar-window-controls`
  - `chrome-control`
  - `chrome-control-nav`
- update typography and spacing tokens used by sidebar header and nav

### 9.3 `apps/web/src/components/icons.tsx` and public icon assets

Potential changes:

- add new icon names only if needed by the new sidebar header semantics
- replace asset files for reused icon names where safe
- keep the existing icon API shape unless there is a strong reason to widen it

## 10. Interaction Rules

The refresh is visual and structural, not behavioral.

Behavior that must remain unchanged:

- previous/next conversation navigation
- search entry behavior
- active view switching
- project expand/collapse
- keyboard focus restoration

No new state model should be introduced for the sidebar header.

## 11. Risks and Mitigations

### Risk 1: Header becomes cleaner, but the rest of the sidebar still feels old

Mitigation:

- adjust nav and section spacing in the same iteration
- do not stop at row replacement only

### Risk 2: Direct external icon reuse causes asset mismatch

Mitigation:

- keep icon replacement isolated from layout structure
- allow same-style fallback assets without redesigning the sidebar again

### Risk 3: Tightening spacing hurts clarity

Mitigation:

- reduce spacing selectively
- preserve button height and hit area
- keep divider and section labels readable

## 12. Testing and Verification

Implementation should verify:

- sidebar header renders correctly in light mode
- top controls align consistently at different sidebar widths
- nav text truncation still works for trailing device names
- keyboard focus remains visible and correct
- previous/next conversation buttons still enable and disable correctly

Expected validation commands after implementation:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

If any of these commands are not yet meaningfully established for the touched surface, that must be stated explicitly in the implementation report.

## 13. Success Criteria

The design is successful when:

- the sidebar no longer reads like a fake OS titlebar
- the top area feels like one intentional header block
- spacing above the project/conversation sections feels tighter and more deliberate
- navigation hierarchy is clearer in light mode
- the result visibly borrows the reference's desktop-application discipline without turning the page into a landing hero
