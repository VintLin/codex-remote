---
name: Codex Remote
description: A calm multi-device Codex workstation with restrained OKLCH neutrals, compact controls, and explicit state boundaries.
colors:
  canvas: "oklch(0.9911 0 89.9)"
  surface: "oklch(0.9731 0 89.9)"
  surface-raised: "oklch(1 0 89.9)"
  sidebar-surface: "oklch(0.9731 0 89.9)"
  sidebar-hover: "oklch(0.9551 0 89.9)"
  sidebar-selected: "oklch(0.941 0 89.9)"
  ink: "oklch(0.3791 0 89.9)"
  ink-strong: "oklch(0.2435 0 89.9)"
  muted: "oklch(0.5032 0 89.9)"
  muted-strong: "oklch(0.3791 0 89.9)"
  hairline: "oklch(0.931 0 89.9)"
  hairline-soft: "oklch(0.9551 0 89.9)"
  hairline-hover: "oklch(0.884 0 89.9)"
  primary: "oklch(0.2435 0 89.9)"
  primary-strong: "oklch(0.3791 0 89.9)"
  primary-soft: "oklch(0.9551 0 89.9)"
  accent: "oklch(0.622 0.2045 259.6)"
  success: "oklch(0.7245 0.2033 149.2)"
  warning: "oklch(0.7697 0.1689 68)"
  danger: "oklch(0.6378 0.2373 25.4)"
typography:
  title:
    fontFamily: "\"InterVariable\", \"InterVariable Fallback\", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "\"InterVariable\", \"InterVariable Fallback\", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "\"InterVariable\", \"InterVariable Fallback\", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 560
    lineHeight: 1.4
    letterSpacing: "0"
  code:
    fontFamily: "\"BerkeleyMono\", \"BerkeleyMono Fallback\", \"SF Mono\", \"Cascadia Code\", ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-raised}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  icon-button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    width: "32px"
    height: "32px"
  sidebar-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "32px"
  sidebar-row-selected:
    backgroundColor: "{colors.sidebar-selected}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "32px"
  topbar-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "56px"
  text-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "12px 14px 10px"
  search-dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "14px 8px 10px"
  detail-pane:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
---

# Design System: Codex Remote

## Overview

**Creative North Star: "The Control Desk"**

Codex Remote should feel like a compact workstation that lets one operator supervise several remote Codex sessions without visual drama. The system is quiet, neutral, and operational: near-white content surfaces, a slightly separated sidebar field, restrained semantic color, and small, consistent controls that favor familiarity over novelty.

This is product UI, not a showcase surface. The interface should earn trust by making state, ownership, and boundaries explicit. Device identity, project grouping, active conversation state, approval risk, and detail context should always be legible before the user opens another panel or menu.

The system explicitly rejects the anti-references in `PRODUCT.md`: it must not drift into a marketing SaaS landing page, a full Codex Desktop clone, a colorful multi-agent orchestration suite, a provider proxy console, or a decorative analytics dashboard. Oversized hero gestures, heavy gradients, novelty terminal themes, and any styling that makes inactive state look urgent are out of bounds.

**Key Characteristics**

- Calm and dense enough for repeated operational work
- Technical without looking like a toy terminal
- Compact controls with one shared interaction vocabulary
- Border-first separation, with shadows used only to support layer changes
- Semantic color reserved for status, primary action, and risk

## Colors

The palette is restrained and almost entirely neutral. Color exists to clarify state and action, not to decorate surfaces.

### Primary

- **Workstation Charcoal** (`oklch(0.2435 0 89.9)`): primary action backgrounds, strong icons, and the highest-emphasis control text.
- **Raised Paper** (`oklch(1 0 89.9)`): foreground for filled controls and the brightest working surface.

### Secondary

- **Signal Blue** (`oklch(0.622 0.2045 259.6)`): running or active semantic emphasis, never a decorative wash.

### Tertiary

- **Operator Green** (`oklch(0.7245 0.2033 149.2)`): healthy or done state.
- **Risk Amber** (`oklch(0.7697 0.1689 68)`): waiting, degraded, or approval-needed state.
- **Interrupt Red** (`oklch(0.6378 0.2373 25.4)`): failed or dangerous state.

### Neutral

- **Canvas White** (`oklch(0.9911 0 89.9)`): app canvas and main content field.
- **Sidebar Field** (`oklch(0.9731 0 89.9)`): sidebar background and secondary neutral layer.
- **Hover Gray** (`oklch(0.9551 0 89.9)`): hover, pressed, and low-emphasis selected scaffolding.
- **Selected Gray** (`oklch(0.941 0 89.9)`): persistent selected conversation layer.
- **Hairline Gray** (`oklch(0.931 0 89.9)`): universal 1px border and pane separation token.
- **Hairline Hover** (`oklch(0.884 0 89.9)`): stronger border response on interactive chrome.
- **Body Ink** (`oklch(0.3791 0 89.9)`): default text.
- **Strong Ink** (`oklch(0.2435 0 89.9)`): headings, selected text, and denser control emphasis.
- **Muted Copy** (`oklch(0.5032 0 89.9)`): secondary text, timestamps, and metadata.

**The Restrained Color Rule.** Accent and semantic colors are only for primary action, current operational state, and risk. Neutral surfaces carry the interface.

## Typography

**Display Font:** none; product UI uses a single UI family rather than a display/body pairing  
**Body Font:** `InterVariable`, falling back to Inter and system sans stacks  
**Label/Mono Font:** `BerkeleyMono` for diffs, paths, code, and technical snippets

**Character:** The type system is compact and trustworthy rather than expressive. InterVariable carries headings, controls, metadata, and body copy. Berkeley Mono is reserved for technical artifacts so the UI can separate control-plane chrome from runtime artifacts without changing the whole visual register.

### Hierarchy

- **Title** (`400`, `14px`, `1.35`): topbar titles, review headers, and standard section labels.
- **Body** (`400`, `14px`, `1.5`): conversation copy, buttons, control text, empty states, and form values.
- **Label** (`560`, `12px`, `1.4`): metadata, timestamps, compact badges, and supporting chrome.
- **Code** (`400`, `12px`, `1.5`): inline code, diffs, paths, and technical snippets.

**The One Family Rule.** Product UI labels, buttons, and data stay in the Inter system. No display typography enters operational chrome.

## Elevation

Codex Remote is border-led and layer-lite. Most separation comes from a shared 1px hairline token, subtle surface shifts, and pane geometry. Shadows are present, but only as compact support for raised controls and overlays; they must not become a decorative visual language.

### Shadow Vocabulary

- **Outline Lift** (`0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06), 0 2px 4px 0 oklch(0 0 0 / 0.04)`): default raised controls and framed content blocks.
- **Hover Lift** (`0 0 0 1px oklch(0 0 0 / 0.08), 0 1px 2px -1px oklch(0 0 0 / 0.08), 0 2px 4px 0 oklch(0 0 0 / 0.06)`): active/hover response for raised controls.
- **Focus Halo** (`0 0 0 3px oklch(0 0 0 / 0.08)`): keyboard focus support only.

**The Border-First Rule.** If a surface already carries a 1px border, any shadow on it must stay compact and structural. Wide ambient drop shadows are not part of the system.

## Components

### Buttons

- **Character:** compact, familiar, and structurally consistent.
- **Shape:** 8px radius for standard buttons; pill only for explicit circular affordances.
- **Primary:** dark charcoal fill with white foreground, 32px height, compact horizontal padding.
- **Secondary:** white raised surface with hairline border and small support shadow.
- **Hover / Focus:** hover changes surface or border strength; focus uses the shared halo token.

### Cards / Containers

- **Character:** framed work surfaces, not stacked marketing cards.
- **Corner Style:** 10px for contained surfaces, 16px only for major inputs or overlays.
- **Background:** raised white or near-white surfaces over a near-white canvas.
- **Shadow Strategy:** use outline lift only when a container needs to sit above its immediate field.
- **Border:** 1px shared hairline token on major surfaces.
- **Internal Padding:** compact; 12px, 14px, 16px, 20px, and 24px are the core working steps.

### Inputs / Fields

- **Character:** stable, quiet, and explicit.
- **Style:** white input surface, shared hairline border, 16px radius only for large composer or search shells.
- **Focus:** shared focus halo, no ornamental glow.
- **Error / Disabled:** semantic color only where state changes meaning; disabled states should remain legible.

### Navigation

- **Sidebar:** 32px row rhythm, one neutral hover layer, muted project labeling, darker conversation text, persistent background selection only for active conversation rows.
- **Topbar:** 56px fixed shell with border-bottom separation and compact trailing controls.
- **Review Pane:** explicit border-left separation from the main workspace and the same topbar/header rhythm as the main pane.

### Signature Component

- **Assistant Composer:** a large-radius input shell that anchors the main conversation workflow. It should read as a single operational field, not as a floating promotional card.

## Do's and Don'ts

### Do

- **Do** keep device, project, conversation, and task ownership visible at the point of action.
- **Do** use `--cr-line` as the universal 1px border token for pane edges, headers, dialogs, and framed controls.
- **Do** keep primary action, selection, and semantic state colors scarce and deliberate.
- **Do** use one shared interaction vocabulary: same button shape, same icon tone, same hover gray, same focus treatment.
- **Do** make empty states, status rows, and detail panes explain the next meaningful action.

### Don't

- **Don't** make the interface look like a marketing SaaS landing page.
- **Don't** make it look like a full Codex Desktop clone.
- **Don't** make it look like a colorful multi-agent orchestration suite, a provider proxy console, or a decorative analytics dashboard.
- **Don't** use oversized hero sections, heavy gradients, novelty terminal themes, or styling that makes inactive state look urgent.
- **Don't** pair full borders with wide decorative drop shadows on overlays or large inputs.
- **Don't** introduce display fonts into labels, buttons, or data surfaces.
