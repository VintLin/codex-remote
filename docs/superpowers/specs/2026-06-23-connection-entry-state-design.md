# Connection Entry State Design

Date: 2026-06-23

## Purpose

Add an initial connection state for Web entry so the user can see which device is being restored, what connection step is running, and how to retry when the chain is not ready.

This design covers the Web loading surface only. It does not add a new pairing protocol, new realtime transport, or persistent device registry.

## User-Facing Terms

Use the names from `docs/GLOSSARY.md`:

- `控制中心` for Control Plane.
- `设备连接器` for Worker.
- `Codex 本机服务` for Codex runtime / app-server.
- `设备` for a selectable machine.
- `对话记录` for timeline/history content.

Do not expose `Control Plane`, `Worker`, `runtime`, JSON-RPC, or raw app-server wording in the UI.

## Layout

- While connecting, the normal left and right workbench sidebars remain collapsed.
- The main workspace shows a centered, unframed launch-page layout.
- The centered content has two left-aligned columns:
  - Left column: up to the first three devices, including the last selected device when available.
  - Right column: connection title, short summary, and connection steps.
- The layout is not a card. It sits directly on the app canvas with normal pane chrome and hairline separation only.
- On successful connection, the loading layout is removed and the normal workbench opens with the correct sidebar conversation state and main content.

## Device List

- Show at most three devices.
- Prefer the last selected device as the first row when it still exists.
- Each row shows device name and one short status line.
- Status dots are decorative and must not add English accessibility text such as `Connected`.
- Rows use Chinese accessible labels, for example `MacBook-Pro-4，上次使用，正在连接`.
- If there are no devices, the left column shows an empty label state rather than reserving fake devices.

## Connection Steps

Show steps in this order:

1. `连接控制中心`
2. `连接上次使用的设备`
3. `启动 Codex 本机服务`
4. `载入对话记录与工作区`

Each step can be `done`, `active`, `pending`, or `failed`.

Failure copy should distinguish the broad user-facing cause:

- `控制中心不可达`
- `设备不可达`
- `Codex 本机服务未就绪`
- `对话记录暂不可读`

Failed states show a compact `重试连接` action. Retry should rerun the current connection load; it should not reset the last selected device unless the user chooses another device.

## Style

Use the existing light design system from `docs/DESIGN.md` and `packages/ui/src/styles.css`.

- Font family: `InterVariable`, then Inter/system sans fallbacks.
- Body text: `14px`, `400`, `1.5`, `letter-spacing: 0`.
- Labels and metadata: `12px`, `560` for section labels; `12px`, `400` for supporting metadata.
- Colors must use the existing `--cr-*` OKLCH tokens:
  - Canvas/surface: `--cr-bg`, `--cr-surface`, `--cr-surface-raised`.
  - Text: `--cr-ink`, `--cr-ink-strong`, `--cr-muted`.
  - Lines: `--cr-line`, `--cr-line-hover`.
  - Active/running: `--cr-accent`.
  - Done/healthy: `--cr-success`.
- Do not introduce a dark-mode-only entry state.
- Do not introduce new decorative gradients, oversized display typography, or card-heavy composition.

## State Ownership

- Web owns the presentation and last-selected-device restoration.
- Web still loads through the Control Plane-shaped public API.
- Control Plane continues to route or aggregate configured device data.
- Worker remains the only boundary that starts or checks Codex 本机服务.

## Non-Goals

- No new Web-to-Worker direct calls.
- No browser-side app-server WebSocket bridge.
- No new persistent device registry.
- No custom design token set.
- No new full-screen marketing welcome page.

## Acceptance Criteria

- Entering Web while the connection chain is loading shows the centered connection layout.
- The previous selected device is attempted first when still present.
- The device list shows no more than three devices.
- Connection steps update enough to identify which broad stage is running or failed.
- A failed state shows `重试连接`.
- A successful load opens the normal workbench with the correct conversation sidebar and main content.
- Font, color, radius, and hairline styling match existing `--cr-*` design tokens.
- UI text uses glossary user-facing names and does not expose internal implementation terms.
