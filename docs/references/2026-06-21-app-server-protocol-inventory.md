# Codex App-Server Protocol Inventory

Date: 2026-06-21

Purpose: map generated Codex app-server protocol outputs to Codex Remote product capability groups before adding more Codex App-like Web features.

This is an inventory, not an implementation plan. It does not authorize Web to call app-server protocol directly.

## Source Of Truth

| Layer | Source |
| --- | --- |
| app-server protocol | `packages/codex-protocol/src/generated/ClientRequest.ts`, `ServerRequest.ts`, `ServerNotification.ts`, and generated `v2/*` types |
| public API | `packages/api-contract/openapi.yaml` |
| DB fields | `packages/db` schema |
| Web UI/domain | derived from public API types only |

Data flow rule:

```text
generated app-server protocol
  -> Worker adapter/projection
  -> packages/api-contract/openapi.yaml public model
  -> generated public API types
  -> Control Plane route/state
  -> Web datasource/domain/UI
```

No Web or Control Plane code may import `packages/codex-protocol`.

## Current Public API Coverage

Public API currently covers:

- Devices, projects, Worker health/capabilities/probe.
- Conversation list/start/open/archive/unarchive/rename/timeline/follow-up/interrupt/steer.
- Pending approval list and decision.
- Task board and conversation links.

Public API does not yet cover:

- Fork, goals, compact, rollback.
- Permission profiles as a product model.
- Files, shell, Git diff/review, fuzzy search.
- Models/runtime/config/experiments.
- Skills, hooks, plugins, marketplace, MCP, apps.
- Account/auth/rate/usage surfaces.
- Realtime voice, Windows sandbox, feedback upload, external agent import.

## Capability Groups

| Product group | app-server methods / requests / notifications | Public API status | Stage |
| --- | --- | --- | --- |
| Conversation lifecycle | `thread/start`, `thread/resume`, `thread/list`, `thread/read`, `thread/archive`, `thread/unarchive`, `thread/name/set`, `thread/loaded/list`; notifications `thread/started`, `thread/status/changed`, `thread/archived`, `thread/unarchived`, `thread/name/updated`, `thread/closed` | Partial | Stage 11 |
| Conversation branching and memory | `thread/fork`, `thread/goal/*`, `thread/compact/start`, `thread/rollback`, `thread/inject_items` | Not supported except fork placeholder | Stage 11 placeholder, Stage 12+ later |
| Turn control | `turn/start`, `turn/steer`, `turn/interrupt`; notifications `turn/started`, `turn/completed`, `turn/plan/updated`, `turn/diff/updated`, `turn/moderationMetadata` | Partial | Stage 11 |
| Timeline items | `Thread.turns[].items`; notifications `item/started`, `item/completed`, deltas, command/file/MCP progress | Snapshot partial; durable stream missing | Stage 11 then Stage 12 |
| Request and approval lifecycle | server requests `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`, `item/permissions/requestApproval`; notification `serverRequest/resolved` | Approval partial; user input/MCP/permissions not exposed | Stage 11 partial, later stages |
| Permission profiles and run policy | `permissionProfile/list`; `TurnStartParams.approvalPolicy`, `approvalsReviewer`, `sandboxPolicy`; `ThreadForkParams.approvalPolicy`, `approvalsReviewer`, `sandbox` | Not exposed as behavior | Stage 11 placeholder/spec detail |
| Local files | `fs/readFile`, `fs/getMetadata`, `fs/readDirectory`, `fs/watch`, `fs/unwatch`, writes/removes/copy/create; notification `fs/changed` | Not supported | Stage 12 read-only, Stage 13 controlled write |
| Shell/process | `command/exec`, `command/exec/write`, `command/exec/terminate`, `command/exec/resize`, `thread/shellCommand`; notifications output/process/terminal | Not supported | Stage 12 read-only history, Stage 13 controlled action |
| Git/review | `gitDiffToRemote`, `review/start`; `enteredReviewMode` / `exitedReviewMode` thread items | Not supported | Stage 12 read-only, Stage 13 controlled action |
| Search | `fuzzyFileSearch`; notifications session updated/completed | Not supported | Stage 12 |
| Models/runtime | `model/list`, `modelProvider/capabilities/read`, model reroute/verification notifications | Not supported | Stage 14 |
| Config/experiments | `config/read`, `config/value/write`, `config/batchWrite`, `configRequirements/read`, `experimentalFeature/list`, `experimentalFeature/enablement/set`, config warnings | Not supported | Stage 14 read-only first |
| Skills/hooks/apps | `skills/list`, `skills/extraRoots/set`, `skills/config/write`, `hooks/list`, `app/list`; notifications `skills/changed`, `hook/*`, `app/list/updated` | Not supported | Stage 12 read-only, later controlled write |
| Plugins/marketplace | `plugin/*`, `marketplace/*` | Not supported | Stage 12 read-only, later install/update |
| MCP | `mcpServerStatus/list`, `mcpServer/resource/read`, `mcpServer/tool/call`, `mcpServer/oauth/login`, reload; requests elicitation/tool call; progress/status notifications | Not supported | Stage 12 read-only, Stage 13+ controlled interaction |
| Account/auth | `account/read`, `getAuthStatus`, login/logout/rate/usage/add-credit; notifications account/login/rate updates | Not supported | Stage 14 sanitized read-only first |
| Realtime voice | realtime thread/audio/transcript/SDP notifications | Not supported | Stage 15+ watchlist |
| Windows sandbox | `windowsSandbox/setupStart`, `windowsSandbox/readiness`, warnings/setup notifications | Not supported | Stage 15+ watchlist |
| Feedback/external agent | `feedback/upload`, `externalAgentConfig/detect`, `externalAgentConfig/import` | Not supported | Stage 15+ watchlist |

## Stage 11 Data Model Implications

Stage 11 may add or repair only public product fields that serve the conversation workbench:

- conversation lifecycle state;
- selected thread snapshot;
- safe timeline nodes from `Turn.items`;
- active turn id/status;
- request/approval cards;
- composer send mode state;
- archived conversation listing for Settings;
- message action capabilities.

Stage 11 must not add public API for files, shell, Git, MCP tools, plugin install, account login/logout, realtime voice, Windows setup, feedback upload, or external agent import.

## Thread And Timeline Projection

Generated protocol facts:

- `Thread` includes `id`, `sessionId`, `forkedFromId`, `parentThreadId`, `preview`, `ephemeral`, `modelProvider`, `createdAt`, `updatedAt`, `status`, `path`, `cwd`, `cliVersion`, `source`, `threadSource`, `agentNickname`, `agentRole`, `gitInfo`, `name`, and `turns`.
- `Thread.turns` is populated only for `thread/resume`, `thread/rollback`, `thread/fork`, and `thread/read` with `includeTurns`.
- `Turn` includes `id`, `items`, `itemsView`, `status`, `error`, `startedAt`, `completedAt`, `durationMs`.
- `ThreadItem` variants include user message, agent message, plan, reasoning, command execution, file change, MCP tool call, dynamic tool call, collab agent call, web search, image view/generation, review mode, hook prompt, and context compaction.

Projection rules:

- `Thread.path`, `Thread.cwd`, image paths, command cwd, raw command, aggregated output, full diffs, MCP arguments/results, collab prompts, raw reasoning content, and auth/secrets stay Worker-private unless a later stage explicitly designs a sanitized public model.
- User and assistant visible message text can be projected only through a public `ConversationTimelineNode` model with length bounds and redaction tests.
- Tool items should become neutral summaries by kind/status/duration/count. Web must not reinterpret unknown tool kinds as file changes.
- `itemsView` must be represented when partial history is possible; otherwise Web may falsely treat a partial snapshot as complete.

## Permission And Access Mapping

Generated protocol facts:

- `AskForApproval` = `untrusted`, `on-failure`, `on-request`, granular flags, or `never`.
- `ApprovalsReviewer` = `user`, `auto_review`, `guardian_subagent`.
- `SandboxPolicy` = `dangerFullAccess`, `readOnly`, `externalSandbox`, or `workspaceWrite`.
- `SandboxMode` = `read-only`, `workspace-write`, `danger-full-access`.
- `permissionProfile/list` returns profile `id` and optional `description`, optionally scoped by `cwd`.

Product rule:

- Existing UI labels such as `请求批准`, `替我审批`, and `完全访问` are placeholders until a public permission model is defined.
- Web must not send approval/sandbox/profile changes by string labels.
- Any enabled behavior must start from OpenAPI public fields, then Worker maps to generated protocol fields.

## Dirty Draft Findings

Current dirty draft should be reconciled before implementation continues:

| File | Finding | Required action |
| --- | --- | --- |
| `packages/api-contract/openapi.yaml` | Adds `ConversationTimelineNode` directly for timeline content. | Keep only if tests prove it is the public model and generated types are updated. Add `itemsView`/partial-history decision before finalizing. |
| `apps/worker/src/http/projections.ts` | Projects user/assistant text and tool nodes, but risks exposing raw text without redaction tests and maps many tool statuses/kinds ad hoc. | Keep concept, rewrite with explicit safe projection helpers and tests. |
| `apps/web/src/data/workerApi/workbenchData.ts` | Maps unknown/non-web/MCP tool kinds into existing UI kinds, including file-change-like rows. | Replace with public tool summary rendering; Web must not guess app-server semantics. |
| `apps/web/src/components/conversation/codex-assistant-thread.tsx` | Restores permission UI and interrupt button but still hard-codes behavior labels and does not complete running send modes. | Keep UI surface, disable behavior until public permission model exists; implement steer/queue through public API only. |
| `apps/worker/src/http/readOnlyHandlers.ts` | Adds fixed `local-project` projection. | Accept only as current one-project boundary; document as deferred multi-project discovery. |

## Public Model Rules For New Fields

For every new app-server-derived field:

1. Name the product concept first.
2. Confirm which generated protocol field(s) feed it.
3. Decide whether it is snapshot, live event, Control Plane state, or DB state.
4. Add it to `packages/api-contract/openapi.yaml`.
5. Regenerate API types.
6. Map it in Worker projection.
7. Pass it through Control Plane without app-server leakage.
8. Render it in Web from public types only.
9. Add focused tests for redaction, boundary, degraded state, and unknown future protocol variants.

## Stage Gate Recommendation

Use this inventory as the input to Stage 11 Task 0:

- First reconcile dirty draft against the table above.
- Then update Stage 11 spec/plan only for conversation workbench data.
- Do not implement Stage 12+ local tools during Stage 11.
- Use Chrome/Zcode only for UI behavior questions, not as a data model source of truth.
