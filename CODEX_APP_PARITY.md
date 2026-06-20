# Codex App Parity Roadmap

## Purpose

Codex Remote should feel like Codex App in a browser, with the remote-specific additions needed for devices, projects, and tasks.

This document defines the product capability target before new stages are split. It does not expose raw app-server protocol as product API, and it does not make permission or approval policy decisions by itself.

## Source Of Truth

- App-server protocol: `packages/codex-protocol/src/generated/ClientRequest.ts`, `ServerRequest.ts`, and `ServerNotification.ts`
- Public API: `packages/api-contract/openapi.yaml`
- Current support state: `FEATURE_SUPPORT.md`
- Stage roadmap: `PLAN.md`

## Direction

```text
Web Codex App-like workbench
  -> Control Plane state and product API
    -> Worker local adapter
      -> Codex app-server generated protocol
```

The Web product surface should expose stable capabilities such as conversation management, realtime timeline, files, shell, Git, model selection, skills, plugins, MCP, and account state. Worker maps those capabilities to app-server methods. Web and Control Plane do not pass through raw JSON-RPC, raw prompts, raw command output, raw diffs, raw local paths, provider secrets, or app-server URLs.

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

1. Conversation workbench parity: lifecycle, active turn state, timeline stream, request cards.
2. Local work tools: filesystem, shell, Git, review, fuzzy search.
3. Runtime management: models, config, experiments, account status.
4. Extension management: skills, hooks, plugins, marketplace, MCP, apps.
5. Advanced realtime and platform: realtime voice, Windows sandbox, external agent config, feedback.
6. Remote-specific hardening: devices, project binding, task association, self-hosted evidence, future pairing/reverse connection.

Each stage must still keep the existing architecture boundary:

- `apps/web` calls only Control Plane-shaped public API.
- `apps/control-plane` coordinates devices and product state.
- `apps/worker` is the only Codex app-server, local filesystem, Git, and shell caller.
- Generated app-server protocol and OpenAPI remain the only schema sources.

## Deprecated Direction

The next stage is no longer assumed to be only permission or approval productionization. Approval remains an important gap, but it should be placed inside the broader Codex App parity roadmap instead of driving the entire roadmap by itself.
