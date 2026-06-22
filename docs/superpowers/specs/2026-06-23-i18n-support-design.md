# I18n Support Design

Date: 2026-06-23

## Purpose

Add first-pass internationalization for the Web workbench so the user can switch the UI between Simplified Chinese and English from Settings.

This design covers static Web UI text only. It does not translate user content, model output, device names, project names, conversation titles, runtime values, or Worker/API payloads.

## Locales

- Supported locales: `zh-CN` and `en-US`.
- Default locale: `zh-CN`.
- `zh-CN` remains the fallback when an unknown locale is requested.
- The selected locale controls static UI copy, accessible labels, placeholders, document language, and page metadata.

## Routing

Use the Next.js App Router locale segment pattern:

- Move the Web page under `apps/web/src/app/[locale]/page.tsx`.
- Move locale-aware layout under `apps/web/src/app/[locale]/layout.tsx`.
- Keep `/` as a redirect to `/zh-CN`.
- Set `<html lang={locale}>` from the route locale.

This keeps direct links locale-specific without adding an i18n package.

## Dictionary Shape

Add `apps/web/src/i18n/`:

- `locales.ts`: exports `supportedLocales`, `defaultLocale`, `Locale`, and `isLocale`.
- `dictionary.ts`: returns the dictionary for a locale.
- `dictionaries/zh-CN.ts`: default Simplified Chinese copy.
- `dictionaries/en-US.ts`: English copy.

The `en-US` dictionary must satisfy the same TypeScript shape as `zh-CN`. `zh-CN` is the source dictionary for key shape only; neither dictionary is an API contract.

Dictionary values should stay boring strings or small functions for interpolation, for example count labels. Do not add a message formatting framework until plural rules or translator workflows require it.

## Component Integration

- `CodexRemoteApp` receives `locale` and `dictionary` from the locale page.
- Components receive the smallest dictionary slice they need through props.
- Domain modules that currently return UI copy, such as status or connection presentation, receive a dictionary slice or return stable keys that components render.
- Shared `packages/ui` primitives continue to accept plain labels from callers and remain locale-agnostic.

Do not introduce a global translation hook or provider unless prop threading becomes demonstrably worse than the provider.

## Settings Entry

Settings gets a compact language selector:

- Label: `语言` / `Language`.
- Options: `简体中文` and `English`.
- Selecting an option navigates to the same workbench route with the new locale segment.
- The current locale is visibly selected.
- Store the selected locale in `localStorage` so the Settings control remembers the last explicit user choice in the browser. The root route still redirects to `/zh-CN` in this stage.

The selector belongs in the existing Settings surface. It must not create a new settings page, modal, onboarding flow, or account preference model.

## Copy Scope

Translate static Web UI copy in the current workbench surfaces:

- Sidebar/navigation labels and action menus.
- Main conversation empty states, composer controls, request cards, queued-message controls, and accessibility labels.
- Detail pane tabs, file/search/git/runtime/settings/local-tools/task-board labels, empty states, and failure text.
- Connection-entry state copy.
- Status display strings that are Web presentation labels.
- Placeholders, button labels, `aria-label`, `title`, and page metadata.

Leave these values unchanged:

- User-authored messages.
- Assistant/model messages.
- File paths, command names, diffs, markdown content, and generated timeline text.
- Device, project, task, and conversation names returned by the API.
- Public API enum values and protocol names.

## Error Handling

- Unknown route locale redirects to `/zh-CN`.
- Missing dictionary keys must fail during TypeScript checking through shared dictionary types.
- Runtime data remains renderable even when it contains either Chinese or English text from upstream sources.

## Testing

Add the smallest checks that prove the boundary:

- Unit test for locale validation and default fallback.
- Unit test or type-level assertion that `zh-CN` and `en-US` dictionaries have matching keys.
- Component/source tests updated so they assert localized labels through the dictionary, not hard-coded one-language strings.
- E2E smoke covers `/zh-CN` and `/en-US`, Settings language switch, `html[lang]`, and a few high-signal labels in sidebar, Settings, and conversation empty state.

Run:

- `pnpm --filter @codex-remote/web test`
- `pnpm --filter @codex-remote/web typecheck`
- `pnpm web:e2e:smoke`

If final implementation touches shared contracts or package boundaries, also run the broader repo checks required by `AGENTS.md`.

## Non-Goals

- No new i18n dependency.
- No translation management platform.
- No automatic translation.
- No date, number, relative-time, or plural-rule localization beyond current simple UI strings.
- No server-side language preference storage.
- No API, Worker, Control Plane, DB, or OpenAPI changes.
- No RTL language support.

## Acceptance Criteria

- `/` opens the Chinese UI by default.
- `/zh-CN` renders Chinese static UI and `<html lang="zh-CN">`.
- `/en-US` renders English static UI and `<html lang="en-US">`.
- Settings can switch between `zh-CN` and `en-US`.
- Static UI labels, placeholders, button text, and accessible labels used in current workbench surfaces are no longer hard-coded to one language.
- User/model/runtime/API content is not translated or rewritten.
- Dictionary key parity is enforced by tests or TypeScript.
- Focused Web tests and smoke checks pass with fresh output.
