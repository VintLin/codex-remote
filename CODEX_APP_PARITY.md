# Codex App Parity Sub-Roadmap

## Purpose

Codex Remote's main product goal remains a self-hosted multi-device Codex control plane. This sub-roadmap defines how the Web workbench should feel closer to Codex App while keeping the multi-computer remote-control goal primary.

This document defines the product capability target before new stages are split. It does not expose raw app-server protocol as product API, and it does not make permission or approval policy decisions by itself.

## Source Of Truth

- App-server protocol: `packages/codex-protocol/src/generated/ClientRequest.ts`, `ServerRequest.ts`, and `ServerNotification.ts`
- Public API: `packages/api-contract/openapi.yaml`
- Current support state: `FEATURE_SUPPORT.md`
- Main stage roadmap: `PLAN.md`
- Research references: `docs/references/questions/q29-q33-codex-app-parity-research-answers/`

## Direction

```text
Web Codex App-like workbench
  -> Control Plane state and product API
    -> Worker local adapter
      -> Codex app-server generated protocol
```

The Web product surface should expose stable capabilities such as conversation management, realtime timeline, files, shell, Git, model selection, skills, plugins, MCP, and account state. Worker maps those capabilities to app-server methods. Web and Control Plane do not pass through raw JSON-RPC, raw prompts, raw command output, raw diffs, raw local paths, provider secrets, or app-server URLs.

## Capability Implementation Shape

Each Codex App-like capability should be designed as a product capability, not as a raw app-server method pass-through.

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

Rules:

- `packages/api-contract/openapi.yaml` defines public fields first.
- `packages/codex-protocol` generated types define only the Worker-side app-server mapping.
- `apps/worker` is the only app-server, filesystem, Git, and shell caller.
- `apps/control-plane` keeps device routing and shared state separate from Worker-local execution.
- `apps/web` consumes only Control Plane-shaped public APIs and never imports app-server protocol types.
- A capability is not product-ready until its UI state, degraded/empty state, and real local verification are defined.

## Capability Targets

| Capability area | Codex App-like target | Current Codex Remote state | Gap |
| --- | --- | --- | --- |
| Conversation lifecycle | Start, resume, fork, archive, unarchive, rename, goals, compact, rollback | Start and list/read are supported; resume/fork/archive/rename/goals/compact/rollback are not productized | Need full conversation management surface |
| Turn control | Start, follow-up, steer, interrupt | Supported with real evidence for start, follow-up, steer, interrupt | Need tighter realtime state display around active turns |
| Timeline | Live agent output, reasoning, plan, item state, tool state, diffs, warnings, completion | Snapshot/timeline read is supported; durable live stream is not | Need Worker-projected event stream and Web reconciliation |
| Approval and input | Capture app-server requests, show user decisions, send responses, show resolved state | Approval capture is partial; decision remains real-gap; user input/MCP elicitation/tool calls are not exposed | Need request/response lifecycle parity |
| Models and runtime | Model list, provider capabilities, reroute and verification status | Not exposed | Need model/runtime surface |
| Config and experiments | Read/write config, requirements, experimental features | Not exposed | Need config surface derived from app-server protocol and public API |
| Filesystem | Read, write, create, remove, copy, metadata, directory, watch | Not exposed | Need file browser/editor/watch surface through Worker |
| Shell and commands | Execute, write stdin, resize, terminate, show process output | Not exposed | Need terminal-like command surface through Worker |
| Git and review | Diff to remote, review start, diff updates | Not exposed | Need Git/review surface |
| Search | Fuzzy file search sessions and results | Not exposed | Need project search surface |
| Skills and hooks | List skills, extra roots, config, hooks, change notifications | Not exposed | Need skills/hooks management surface |
| Plugins and marketplace | List/read/install/uninstall/share/update marketplace packages | Not exposed | Need plugin and marketplace surface |
| MCP | Server status, OAuth, reload, resources, tool calls, progress, elicitation | Not exposed | Need MCP management and interaction surface |
| Apps | App list and app list updates | Not exposed | Need app surface if app-server remains the source |
| Account | Login/logout/read/auth status, rate limits, usage, account updates | Not exposed | Need account state surface without moving secrets into Control Plane |
| Realtime voice | Realtime thread, transcript, audio, SDP, errors, close | Not exposed | Need voice experience only after protocol path is proven |
| Windows sandbox | Setup, readiness, warnings | Not exposed | Need platform-specific surface when Windows is in scope |
| Remote-only devices/tasks | Multi-device routing, project binding, task links | Partially supported with real local evidence | Need deeper integration with the Codex App-like workbench |

## Stage Split Direction

Future stages should be split by product capability area, not by raw app-server method.

1. Conversation workbench parity: open/resume, archive/unarchive, rename, loaded/live status, snapshot-first timeline, projected live events, request cards, approval pending/resolved state.
2. Local work tools read-only: filesystem preview/metadata, command output, Git diff, review findings, fuzzy search, MCP status/resources/tools list, plugin/marketplace read, skills/hooks/apps list.
3. Controlled local actions: explicit user shell command, allowlisted project actions, review start, stage/unstage/revert hunk/file, enable/disable skill, OAuth or connector login only with local confirmation.
4. Runtime and extension management: model/profile, sanitized `account/read`, device platform/sandbox/auth projection, config read-only, richer skills/plugins/MCP/apps management.
5. Advanced realtime and platform watchlist: realtime voice, Windows sandbox setup/readiness, feedback upload, external agent config import, remote GUI/computer use, automations.
6. Remote-specific hardening: devices, project binding, task association, self-hosted evidence, future pairing/reverse connection.

Each stage must still keep the existing architecture boundary:

- `apps/web` calls only Control Plane-shaped public API.
- `apps/control-plane` coordinates devices and product state.
- `apps/worker` is the only Codex app-server, local filesystem, Git, and shell caller.
- Generated app-server protocol and OpenAPI remain the only schema sources.

## UI Support Contract

Every future capability area must declare which Web support surfaces it uses before implementation.

| UI support surface | Use |
| --- | --- |
| Sidebar / Navigator | Device, project, conversation, task, or capability navigation |
| Main Conversation | Conversation timeline, follow-up, steer, interrupt, request cards |
| Right Detail Pane | Files, Git, approvals, runtime state, extension detail, account detail |
| Tool Surface | Shell, file browser, search, review, MCP tools, plugin management |
| Status Strip / Badges | Device, model, account, permission, connection, degraded, running, waiting states |
| Modal / Popover | Small choices, confirmations, configuration, and one-shot decisions |

Minimum UI states for every supported capability:

- Loading
- Loaded empty
- Loaded with data
- Degraded dependency
- Action pending
- Action accepted
- Action failed with sanitized error

Unsupported capabilities should be absent or explicitly disabled; they must not appear as clickable no-op controls.

## Deprecated Direction

The next stage is no longer assumed to be only permission or approval productionization. Approval remains an important gap, but it should be placed inside the broader Codex App parity roadmap instead of driving the entire roadmap by itself.

## Research-Adopted Guardrails

- Notifications are runtime stream inputs, not durable history. Worker must project them into Web-facing events with `seq`, `eventId`, redaction, replay/gap handling, and snapshot reconciliation.
- The first timeline stream should include turn lifecycle, assistant deltas, command summaries, diff updates, approval/request state, MCP tool-call state, warnings, and terminal turn state. Reasoning, standalone process APIs, fuzzy-search sessions, and realtime voice stay out of the first stream.
- Conversation lifecycle UI uses user intent names: open/continue, branch, archive, restore, rename, goal, compact, rollback preview. It must not expose raw `thread/*` method names as buttons.
- Near-term lifecycle scope is open/resume, archive/unarchive, rename, and loaded/live badge. Fork/goal/compact are next; rollback and `inject_items` are deferred.
- Local tools enter as read-only evidence first. Arbitrary filesystem write, arbitrary shell, plugin install, MCP config edit, and destructive external app actions require later controlled-action stages.
- Account capability starts as sanitized device auth status from `account/read`. Login/logout, externally supplied tokens, usage/rate detail, and feedback upload are not near-term Web actions.
- Realtime voice is experimental/watch. Official Codex App evidence supports dictation-like input more clearly than durable realtime voice control.
