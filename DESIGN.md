# Design

## Foundation

Codex Remote uses a restrained product interface inspired by the provided light Codex-style screenshot and the common visual system from `oklch.fyi/color-palettes`: neutral OKLCH gray surfaces, compact controls, subtle 1px shadow outlines, Inter for UI text, and Berkeley Mono for code-like content. The design serves a technical control workflow, so density, scanability, and state clarity come before brand expression.

## Color

Use OKLCH tokens only. The base system follows the `oklch.fyi` gray scale: near-white app background, white preview/card surfaces, neutral dividers, deep gray foreground, and deep gray primary buttons. Blue, green, amber, and red are reserved for state and secondary emphasis.

```css
--cr-bg: oklch(0.9911 0 89.9);
--cr-surface: oklch(0.9731 0 89.9);
--cr-surface-raised: oklch(1 0 89.9);
--cr-ink: oklch(0.3791 0 89.9);
--cr-ink-strong: oklch(0.2435 0 89.9);
--cr-muted: oklch(0.5032 0 89.9);
--cr-line: oklch(0.931 0 89.9);
--cr-primary: oklch(0.2435 0 89.9);
--cr-accent: oklch(0.622 0.2045 259.6);
--cr-success: oklch(0.7245 0.2033 149.2);
--cr-warning: oklch(0.7697 0.1689 68);
--cr-danger: oklch(0.6378 0.2373 25.4);
```

## Typography

Use InterVariable for all UI text, falling back to Inter and system UI fonts. Use Berkeley Mono for code, diffs, paths, and inline technical snippets.

The type scale follows the referenced site:

- `12px` for meta text, timestamps, and compact labels.
- `14px` for body, buttons, badges, lists, and standard controls.
- `16px` for dense section headings.
- `18px` for larger panel headings when needed.
- `24px+` only for non-workbench overview surfaces; product screens should stay compact.

Product headings stay fixed-size, not fluid. Labels are compact and sentence case. Conversation text gets slightly more line height than dense tables and lists.

## Layout

Desktop uses a three-column app shell:

- Left rail: global navigation, devices, task boards, and settings.
- Main column: selected device/project context, conversation stream, run summary, and composer.
- Right panel: review, approvals, linked task metadata, and diff/status detail.

Tablet collapses the right panel below the conversation. Mobile stacks all panels and keeps primary controls reachable without horizontal scrolling.

## Components

Controls use 8px radius, subtle `oklch.fyi`-style outline shadows, clear hover/focus states, and no decorative large shadows. Cards are only used for repeated list items or framed tools. Status badges always pair color with text. Empty and loading states should explain the next available action.

## Motion

Motion is limited to 150-200ms state feedback for hover, selection, panel reveal, and composer focus. Respect `prefers-reduced-motion: reduce` by removing transitions.
