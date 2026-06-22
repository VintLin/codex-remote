# Product

## Register

product

## Users

Power users who run Codex across several macOS, Windows, and Linux machines. They are usually coordinating long-running implementation, deployment, packaging, or verification work and need a single browser surface that shows which device is active, what each Codex conversation is doing, and which task those conversations belong to.

## Product Purpose

Codex Remote is a self-hosted multi-device Codex control plane. It aggregates device status, remote projects, conversations, output streams, approvals, local work tools, runtime state, and manual task links without sharing OpenAI, ChatGPT, Codex, or provider secrets across devices. Success means the user can quickly switch devices, inspect live Codex work, send follow-up instructions, interrupt unsafe or stale turns, use local Codex capabilities through the owning Worker, and associate conversations from different machines with one task board item.

Current subgoal: make the Web workbench feel as close as practical to Codex App while preserving Codex Remote's main product goal of controlling multiple Codex instances across multiple computers.

## Current Product Direction

Codex Remote remains a self-hosted multi-device Codex control plane. The current product direction is to make the Web workbench feel as close as practical to Codex App while preserving Codex Remote's primary goal: controlling multiple Codex instances across multiple computers.

## Architecture Boundaries

- `packages/api-contract/openapi.yaml` is the public API source of truth for Web, Worker, Control Plane, and future iOS-shaped clients.
- `packages/codex-protocol` is the generated Codex app-server protocol source of truth.
- `packages/db` schema is the persistence source of truth.
- `apps/worker` is the only app that directly connects to Codex app-server, local filesystem, Git, shell, and terminal capabilities.
- `apps/web` consumes only Control Plane-shaped public APIs.

## Codex App-like Workbench Direction

Each Codex App-like capability is designed as a product capability, not as a raw app-server method pass-through:

```text
Capability goal
  -> public API contract
  -> Control Plane routing/state
  -> Worker app-server/local adapter
  -> Web datasource
  -> Web domain model
  -> Web UI surface
  -> real local verification
```

Web and Control Plane do not pass through raw JSON-RPC, raw prompts, raw command output, raw diffs, raw local paths, provider secrets, or app-server URLs.

## Core Scenarios

- See all connected devices, their online state, active projects, running Codex conversations, models, sandbox mode, and approval posture in one Web workbench.
- Open a device workspace to inspect projects, conversation list, current timeline, runtime state, files, terminal/output context, Git/review state, extension state, and available actions.
- Use a task board to manually link Codex conversations from different devices or projects to the same task.
- Start or resume deployment, packaging, or verification work on the device that owns the relevant local environment.

## MVP Scope

P0:

- Device connection and setup status.
- Remote project list.
- Codex conversation list and read-only timeline.
- Follow-up, interrupt, output stream, and approval handling once the read-only path is stable.
- Task board with manual conversation links.

P1:

- Codex App parity surfaces in product order: conversation workbench lifecycle and projected live timeline first; local files/commands/Git/review/search/MCP/plugins/skills/apps as read-only work surfaces next; controlled local writes only after explicit confirmation, approval, and rollback semantics are designed.
- Runtime projections: sanitized model/profile, account auth status, platform, sandbox, and transport health. Account login/logout, token handling, feedback upload, external agent import, realtime voice, and Windows setup are not near-term browser workbench actions.

P2:

- Mobile client, automatic task migration, provider abstraction, and packaged installation flows.

## Brand Personality

Calm, technical, precise. The interface should feel like a trustworthy workstation: dense enough for repeated operations, quiet enough to stay readable during long sessions, and explicit about state, ownership, and risk.

## Anti-references

This should not look like a marketing SaaS landing page, an unbounded raw app-server clone, a colorful multi-agent orchestration suite, a provider proxy console, or a decorative analytics dashboard. Avoid oversized hero sections, heavy gradients, novelty terminal themes, and visual patterns that make inactive state look urgent.

Product non-goals:

- Do not build multi-agent orchestration.
- Do not automatically migrate tasks across devices.
- Do not automatically choose idle devices.
- Do not prioritize OpenCode, MiniMax Code, Claude Code, or provider abstraction in the MVP.
- Do not repackage Codex Desktop.
- Do not implement a full iOS app in the MVP.

## Design Principles

- Keep device, project, conversation, and task ownership visible at the point of action.
- Make operational state legible before asking the user to drill in.
- Separate control-plane state from local Codex/runtime state so security boundaries remain obvious.
- Prefer compact, familiar controls over custom interaction patterns.
- Keep manual task linking lightweight; the product coordinates work, it does not pretend to automate every decision.

## Accessibility & Inclusion

Target WCAG 2.2 AA for contrast, keyboard focus, and control naming. Motion should be brief and state-driven, with reduced-motion alternatives. Status must not rely on color alone; labels and icons/text should carry the same meaning.
