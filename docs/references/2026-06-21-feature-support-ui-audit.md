# Feature Support UI Audit

Date: 2026-06-21

Scope: map `FEATURE_SUPPORT.md` product capabilities to the current Web UI and record whether each capability is shown correctly.

Evidence read:

- `FEATURE_SUPPORT.md`
- `PROJECT_STRUCTURE.md`
- `apps/web/src/components/shell/codex-remote-app.tsx`
- `apps/web/src/components/detail/main-panels.tsx`
- `apps/web/src/components/conversation/codex-assistant-thread.tsx`
- `apps/web/src/components/sidebar/sidebar.tsx`
- `apps/web/src/components/sidebar/action-menu.tsx`
- `apps/web/src/data/workerApi/workbenchData.ts`
- `apps/worker/src/http/projections.ts`

Subagent review:

- Hilbert: Web UI surface mapping.
- Cicero: API / Worker / Web boundary and leak-risk review.
- Linnaeus: real/local evidence and Stage 11 verification review.

Important context:

- The working tree currently has unfinished repair drafts in Web, Worker, and API contract files. This audit records current observed code shape, not a verified release state.
- `FEATURE_SUPPORT.md` says Stage 11 still requires browser verification before archival.
- The 2026-06-21 consensus has been codified in the active Stage 11 spec and plan: `docs/superpowers/specs/2026-06-21-conversation-workbench-parity-design.md` and `docs/superpowers/plans/2026-06-21-conversation-workbench-parity.md`.

User feedback and pending clarification from 2026-06-21 follow-up:

- Keep already-designed UI surfaces even when not implemented yet. Do not remove known future affordances only because the backend path is missing; mark them as TODO / placeholder instead.
- Do not add unconfirmed permission behavior. Permission UI must be derived from app-server protocol support before it changes request behavior.
- `metadata-only` means status/timing/tool-summary without conversation body. User expectation is closer to app-like conversation display, but exact safe projection fields still need a Stage 11 spec update.
- `steer` is needed during execution: when the user sends a new message while a turn is running, the UI should let them choose between steering the active turn immediately and queueing/sending after the current execution completes.
- Archive action removes the conversation from the normal sidebar immediately. Restore/discovery for archived conversations belongs in Settings under "已归档对话".
- Message action row should show all planned icons as placeholders first; implement only what is already supported, and mark unsupported actions with TODO comments in code when implemented.

## Summary

| Category | Assessment |
| --- | --- |
| Correct | Rename action, task empty/degraded distinction, device navigation, unsupported high-risk app-server capabilities mostly hidden. |
| Wrong | Start/interrupt/steer are exposed as debug strips; archived conversations are shown in normal sidebar with badges; conversations can be mis-grouped when `projectId` is absent; some `Supported / Yes` claims mix API evidence with missing Chrome UI evidence. |
| Needs confirmation | Exact permission menu mapping from app-server `approvalPolicy` / `approvalsReviewer` / `sandboxPolicy` / `permissionProfile/list`; which message action row icons are functional versus TODO placeholders; exact queue-after-current behavior for running-turn messages. |

## Conversation Workbench

| Feature support item | Current UI surface | Assessment | Notes / expected presentation |
| --- | --- | --- | --- |
| Start conversation: Supported | Separate `Start conversation` strip above the thread with `Start` button. | Wrong placement | Keep the start capability, but move it into the shared composer instead of a debug-looking strip. |
| Follow-up: Supported | Composer contenteditable input plus send button. | Mostly correct | Existing conversation follow-up belongs in the composer. It should share status with start and not be visually split from lifecycle controls. |
| Interrupt: Supported | Separate `Interrupt` button in `ConversationControlStrip`; unfinished draft also adds a composer interrupt button, but main panel does not pass the needed props yet. | Wrong | Running turn should switch or add a stop/interrupt affordance beside the send button. It should not live in a debug control strip. |
| Steer: Supported | Separate `Steer active turn` input. | Wrong placement / label | `turn/steer` appends user input to the currently active turn and requires `expectedTurnId`. It is not "派生"; branch/fork is `thread/fork`. Product UI should appear when sending a new message during execution: choose "引导当前执行" or "排队等执行完成后发送". |
| Open/resume conversation: Supported | Selecting a conversation calls `openConversation` before refresh. | Partially correct | Snapshot read should still display history if open/resume degrades or times out. UI must not require clicking a separate Start control to show real data. |
| Archive/unarchive: Supported | Conversation action menu exposes archive/restore. Sidebar and header also show `Archived` badge. | Wrong | Archive should immediately remove the row from normal sidebar. Archived discovery/restore belongs in Settings -> 已归档对话. |
| Rename conversation: Supported | Inline title rename form in conversation header. | Correct | Uses public `title` and avoids `window.prompt`. |
| Loaded/live badges: Supported | Header/sidebar badges show `Loaded` and `Live`. | Correct with minor copy risk | `Loaded` / `Live` are acceptable Stage 11 technical badges. `Archived` should be removed from normal primary surfaces. |
| Timeline read: Supported | Thread renders projected timeline rows; before unfinished draft it only had turn metadata. The unfinished draft adds public text nodes. | Wrong current experience | "Metadata-only" means showing only status/timing such as `turn completed`, without actual conversation content. Product direction is to show app-server conversation content in an app-like timeline. Projection still must not expose token/provider secrets, private paths, raw JSON-RPC, raw command output, or full diff. |
| Snapshot workbench events: Partial | Approval cards render inside `ConversationControlStrip`. | Wrong placement | Request cards belong in the conversation timeline/workbench flow, not in the debug control strip. Pending/resolved state is conceptually right. |
| Approval capture/decision: Partial | Pending approvals have accept/decline/cancel buttons in control strip. | Partially correct | Buttons map to the capability, but placement and wording are too raw. Needs real safe pending-approval evidence. |
| Approval auto cleanup: Partial | Registry-backed cleanup is not directly visible. | Correct | No standalone UI needed. Resolved cards should simply reflect state when available. |

## Sidebar And Navigation

| Area | Current UI surface | Assessment | Notes / expected presentation |
| --- | --- | --- | --- |
| Project grouping | Sidebar has `项目` and `对话`; grouping requires `conversation.projectId`. | Wrong when Worker omits `projectId` | Real allowed-project conversations should appear under the project. Projectless conversations may remain under `对话`. |
| Project list | Worker exposes one `local-project` for `CODEX_REMOTE_ALLOWED_PROJECT_ROOT`. | Correct for current boundary / expectation mismatch | `FEATURE_SUPPORT.md` does not claim multi-project discovery. Showing only one project is expected until a future stage expands safe project discovery. |
| Free conversation section | Shows conversations with no `projectId`. | Correct only for true projectless conversations | If Worker projection omits `projectId`, this section becomes misleading. |
| Archived rows | Sidebar renders archived rows and `Archived` badge. | Wrong | Primary sidebar should omit archived rows. Restore path can live on the selected archived conversation or a future archived view. |
| Sidebar action menus | Project/section menus include disabled "新对话", "创建工作树", "置顶", "归档所有聊天", sort, remove. | Placeholder | Keep confirmed future UI placeholders. When implemented in code, unsupported actions should have explicit TODO comments and stay visibly non-destructive. |
| Previous/next conversation | Header/sidebar arrows use `resolveConversationNavigator`. | Correct | Navigation scope should remain project-local after project grouping is fixed. |
| Search entry | Sidebar shows `搜索`; dialog displays recent conversations, but input does not filter. | Wrong / needs confirmation | `fuzzyFileSearch` is not supported, but a conversation search label implies filtering. Either implement conversation filtering or label it as recents. |

## Composer And Message Actions

| Area | Current UI surface | Assessment | Notes / expected presentation |
| --- | --- | --- | --- |
| Permission modes | Unfinished draft restores "请求批准 / 替我审批 / 完全访问" menu. | Needs protocol-derived design | Do not invent behavior. App-server has `TurnStartParams.approvalPolicy`, `TurnStartParams.approvalsReviewer`, `TurnStartParams.sandboxPolicy`, `permissionProfile/list`, and `item/permissions/requestApproval`. UI labels must be mapped from those shapes before they affect requests. |
| Send button | Composer sends follow-up. | Correct | Should also start a new conversation when no conversation is selected and a project is selected. |
| Running state | Unfinished draft has composer interrupt button, but main panel still renders separate interrupt strip. | Wrong | Running composer should support interrupt and running-message send mode selection: steer now versus queue/send later. |
| Message action row | Copy/thumbs/fork/hooks/timestamp row is not present. | Missing placeholder UI | Show the full planned icon row as placeholders. Implement currently safe/local actions first, such as copy and timestamp. `派生` maps to `thread/fork`; hooks maps to `hooks/list`; thumbs needs product/API confirmation. |
| Model selector | No current composer model selector. | Correct | `model/list` is not supported. |
| Attachments / filesystem | Attachment button is disabled in unfinished draft. | Placeholder | Keep if it is a confirmed future UI, but do not wire filesystem behavior until the stage explicitly supports it. |
| Tool summary mapping | Unfinished draft maps public tool kinds into existing workbench tool rows. | Wrong in draft | `command`, `image`, and `other` must not be rendered as file-change affordances. Each public tool kind needs an honest safe label or should stay as a neutral event. |

## Codex Remote Only Surfaces

| Feature support item | Current UI surface | Assessment | Notes / expected presentation |
| --- | --- | --- | --- |
| Device page | Sidebar `设备`, main device cards, device detail pane. | Correct | This is a Codex Remote boundary surface, not raw app-server. |
| Degraded versus empty state | Conversation/task banners and empty states. | Correct | Keep separate "not connected/example" from real empty data. |
| Task link validation | Task page supports create/link/unlink and blocks link without `selectedConversation.projectId`. | Mostly correct | Labels are still English (`Create`, `Link`, `Unlink`) and task UI is outside Stage 11 focus. |
| Device add/edit/delete | Disabled controls and placeholder copy in device detail. | Needs confirmation | If device management is not supported, visible disabled controls should be recorded as stubs or hidden. |
| Settings footer | Sidebar footer shows `设置` as a clickable button without a wired settings surface. | Needs implementation | Settings is now the planned home for "已归档对话". Keep the UI entry, but route it to a real settings surface before archive restore depends on it. |
| Current model label | Device detail can display `selectedDevice.model`. | Correct with caveat | This is a read-only device summary field, not `model/list` or model selection support. |

## Unsupported App-Server Capabilities

These should remain absent from active UI until their stage exists:

- Filesystem operations: currently not exposed. Correct.
- Shell execution: currently not exposed. Correct.
- Raw command output stream: currently not exposed. Correct.
- Full Git diff / review / fuzzy file search: currently not exposed as real workbench surfaces. Correct, except the generic `搜索` label may overpromise.
- Skills, plugin, marketplace, MCP management: not exposed as real surfaces. Correct.
- Account login/logout/auth status: not exposed. Correct.
- Realtime voice: not exposed. Correct.
- Windows sandbox setup, feedback upload, external agent import: not exposed. Correct.

Placeholder affordances to keep but gate:

- Project action menu entries for worktree, pin, remove, bulk archive, and sort.
- Settings footer, with "已归档对话" as the first concrete setting surface needed by archive/unarchive.
- Permission mode selector, but only after mapping to app-server permission/profile concepts.
- Message action row icons for copy, feedback, fork/派生, hooks, and timestamp. Unsupported actions should be TODO placeholders, not silently removed.

## Evidence And Claim Gaps

| Claim area | Current claim risk | Required correction |
| --- | --- | --- |
| Stage 11 lifecycle features | `FEATURE_SUPPORT.md` marks several lifecycle features as `Supported / Yes`, but Stage 11 still lacks real Chrome UI verification. | Split evidence into API evidence and Chrome UI evidence. |
| Conversation directory isolation | Recent real/local evidence reportedly has a `thread/list cwd scope` gap. | Downgrade or annotate until the gap is resolved and rechecked. |
| Real smoke test | `apps/web/e2e/real-local-smoke.spec.ts` expects the separate Start strip. | Treat current smoke as real-stack plumbing only, not app-like Stage 11 UI parity proof. |
| Approval decision | UI path exists, but no safe real pending approval fixture was observed. | Keep as Partial until pending and resolved states are proven in Chrome. |
| Timeline text | Existing metadata-only claim conflicts with app-like requirement. | Update the Stage 11 spec/plan to define safe app-server content projection. |

## App-Server Capability Notes

| UI concept | App-server support found | Implementation implication |
| --- | --- | --- |
| Steer / 引导当前执行 | `turn/steer` with `{ threadId, input, expectedTurnId }`. | Only valid while a turn is active. It appends user input to the active turn; it is not branch/fork. UI should offer it as the immediate option when sending during execution. |
| Queue after current turn / 排队发送 | No dedicated app-server queue API found in current audit. | Likely a Web/Control Plane queue concept or delayed `turn/start` after active completion; needs design before implementation. |
| Fork / 派生 | `thread/fork` with thread id and overrides such as cwd, model, approval policy, sandbox. | Message action row can show 派生 as TODO until public API/Worker route exists. |
| Hooks | `hooks/list` returns hooks by cwd. | Message action row can show hook icon as TODO or read-only status after a safe Worker route exists. |
| Permission profiles | `permissionProfile/list` returns profile ids/descriptions, optionally by cwd. | Permission menu should be populated/mapped from profiles when exposed, not hard-coded as behavior. |
| Approval policy | `turn/start` and `thread/fork` accept `approvalPolicy`; values include `untrusted`, `on-failure`, `on-request`, granular, and `never`. | "请求批准" likely maps to approval policy, but exact labels need a spec. |
| Approval reviewer | `turn/start` and `thread/fork` accept `approvalsReviewer`: `user`, `auto_review`, `guardian_subagent`. | "替我审批" likely maps to `auto_review`, but must not be sent until designed and verified. |
| Sandbox/access | `turn/start` accepts `sandboxPolicy`; `thread/fork` accepts sandbox mode. | "完全访问" likely maps to danger/full access style settings, which is high risk and must stay explicit. |
| Permission request approval | Server request `item/permissions/requestApproval`. | This is request handling, not the same as selecting the composer permission mode. |

## Fix List

1. Keep the start UI capability but move `StartConversationStrip` into the shared composer start/follow-up flow.
2. Move interrupt into the composer running state; remove the separate interrupt row.
3. Replace visible `Steer active turn` strip with running-composer send mode: "引导当前执行" via `turn/steer` or "排队发送" after current completion; do not call it "派生".
4. Keep archived conversations out of normal sidebar lists; add Settings -> 已归档对话 as the restore/discovery surface.
5. Ensure Worker-projected conversations include the allowed project id so sidebar grouping is correct.
6. Resolve the timeline contract conflict by defining safe app-server content projection for app-like display.
7. Move approval request cards into the timeline/workbench flow and keep pending/resolved state.
8. Preserve confirmed future UI placeholders, but annotate unsupported implementation paths with TODO comments when code is changed.
9. Clarify or implement conversation search; do not imply fuzzy file search.
10. Derive permission menu behavior from app-server permission/profile interfaces before treating it as supported.
11. Split `FEATURE_SUPPORT.md` evidence into product API evidence, Chrome UI evidence, and known gaps.

## Open Questions

1. What is the exact label mapping for permission modes: approval policy, approval reviewer, sandbox policy, and/or permission profile?
2. Should thumbs up/down have a local-only placeholder, or does it need a product API before showing as enabled?
3. Should the one-project Worker boundary remain for Stage 11, with multi-project discovery deferred to a later stage?
4. What exact fields from app-server `ThreadItem` are allowed for app-like display beyond user/assistant text?
5. Should "排队发送" be Web-only pending UI, Control Plane persisted queue, or delayed Worker command after active turn completion?
