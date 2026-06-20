# Feature Support Matrix

This document records what Codex Remote supports today versus what the current generated Codex app-server protocol exposes.

Source of truth:

- Public product API: `packages/api-contract/openapi.yaml`
- Codex app-server protocol: `packages/codex-protocol/src/generated/ClientRequest.ts`
- Server-initiated requests: `packages/codex-protocol/src/generated/ServerRequest.ts`
- Notifications/events: `packages/codex-protocol/src/generated/ServerNotification.ts`

Status labels:

- `Supported`: exposed through Web -> Control Plane -> Worker and covered by current real/local evidence.
- `Partial`: some boundary or code exists, but the full product path or real evidence is missing.
- `Not supported`: app-server may expose it, but Codex Remote does not expose it as product capability.
- `Codex Remote only`: project feature, not an app-server protocol feature.

## Product Feature Matrix

| Feature | Product status | Real evidence | App-server capability | Notes |
| --- | --- | --- | --- | --- |
| Interrupt | Supported | Yes | `turn/interrupt` | Real-check records interrupt as `real-pass`. |
| Steer | Supported | Yes | `turn/steer` | Requires public active-turn proof. |
| Follow-up | Supported | Yes | `turn/start` | Existing conversation follow-up is supported. |
| Approval capture | Partial | Partial | `item/*/requestApproval`, legacy approval requests | Worker registry captures supported pending approvals, but safe real fixture did not produce a pending approval. |
| Approval decision | Partial | No | server request response path | Public route exists, but no safe real pending approval was available to decline/cancel. |
| Approval auto cleanup | Partial | No | `serverRequest/resolved` | Process-local cleanup exists; no durable/product-ready approval lifecycle. |
| Start conversation | Supported | Yes | `thread/start`, `turn/start` | Real-check records start as `real-pass`. |
| Timeline read | Supported | Yes | `thread/read` | Metadata-only projection; not full event replay. |
| Conversation list pagination | Supported internally | Yes | `thread/list` | Worker drains app-server cursors; Web does not expose pagination controls. |
| Conversation directory isolation | Supported | Yes | `thread/list`, `thread/read` | Worker uses cwd and realpath checks; local paths stay Worker-private. |
| Degraded versus empty state | Supported | Yes | N/A | Control Plane behavior, not an app-server feature. |
| Task link validation | Supported | Yes | N/A | Codex Remote DB/Control Plane feature. |
| Real-time output stream | Not supported | No | app-server notifications | Current UI uses snapshots, not a durable live stream. |
| Model list | Not supported | No | `model/list` | Protocol exists; no public API/Web path. |
| Filesystem operations | Not supported | No | `fs/*` | Not exposed because it expands local machine access. |
| Shell execution | Not supported | No | `command/exec`, `thread/shellCommand` | Not exposed; high-risk permission boundary. |
| Config management | Not supported | No | `config/*`, `configRequirements/read` | Not exposed; would edit/read local Codex config. |
| Skills management | Not supported | No | `skills/*` | Not exposed. |
| Plugin management | Not supported | No | `plugin/*`, `marketplace/*` | Not exposed. |
| MCP service management | Not supported | No | `mcpServer/*` | Not exposed. |
| Account authentication | Not supported | No | `account/*`, `getAuthStatus` | Not exposed; auth stays on Worker device. |
| Review | Not supported | No | `review/start` | Not exposed. |
| Git diff | Not supported | No | `gitDiffToRemote` | Not exposed. |
| Fuzzy search | Not supported | No | `fuzzyFileSearch` | Not exposed. |
| Realtime voice | Not supported | No | realtime notifications only | Generated notifications include realtime audio/transcript events; no client request/product path exists here. |

## App-Server Client Requests

| Method | Product status | Notes |
| --- | --- | --- |
| `initialize` | Partial | Worker uses app-server session initialization internally. |
| `thread/start` | Supported | Used for start conversation. |
| `thread/resume` | Not supported | No public resume route. |
| `thread/fork` | Not supported | No fork UI/API. |
| `thread/archive` | Not supported | No archive UI/API. |
| `thread/unsubscribe` | Partial | Worker session lifecycle uses connection management internally, not product UI. |
| `thread/name/set` | Not supported | No rename UI/API. |
| `thread/goal/set` | Not supported | No goal UI/API. |
| `thread/goal/get` | Not supported | No goal UI/API. |
| `thread/goal/clear` | Not supported | No goal UI/API. |
| `thread/metadata/update` | Not supported | No metadata edit UI/API. |
| `thread/unarchive` | Not supported | No unarchive UI/API. |
| `thread/compact/start` | Not supported | No compact UI/API. |
| `thread/shellCommand` | Not supported | High-risk shell path; not exposed. |
| `thread/approveGuardianDeniedAction` | Not supported | No guardian approval UI/API. |
| `thread/rollback` | Not supported | No rollback UI/API. |
| `thread/list` | Supported | Used for conversation list and pagination probe. |
| `thread/loaded/list` | Not supported | Not exposed. |
| `thread/read` | Supported | Used for timeline and allowlist proof. |
| `thread/inject_items` | Not supported | Not exposed. |
| `skills/list` | Not supported | Not exposed. |
| `skills/extraRoots/set` | Not supported | Not exposed. |
| `hooks/list` | Not supported | Not exposed. |
| `marketplace/add` | Not supported | Not exposed. |
| `marketplace/remove` | Not supported | Not exposed. |
| `marketplace/upgrade` | Not supported | Not exposed. |
| `plugin/list` | Not supported | Not exposed. |
| `plugin/installed` | Not supported | Not exposed. |
| `plugin/read` | Not supported | Not exposed. |
| `plugin/skill/read` | Not supported | Not exposed. |
| `plugin/share/save` | Not supported | Not exposed. |
| `plugin/share/updateTargets` | Not supported | Not exposed. |
| `plugin/share/list` | Not supported | Not exposed. |
| `plugin/share/checkout` | Not supported | Not exposed. |
| `plugin/share/delete` | Not supported | Not exposed. |
| `app/list` | Not supported | Not exposed. |
| `fs/readFile` | Not supported | Filesystem access is not exposed. |
| `fs/writeFile` | Not supported | Filesystem access is not exposed. |
| `fs/createDirectory` | Not supported | Filesystem access is not exposed. |
| `fs/getMetadata` | Not supported | Filesystem access is not exposed. |
| `fs/readDirectory` | Not supported | Filesystem access is not exposed. |
| `fs/remove` | Not supported | Filesystem access is not exposed. |
| `fs/copy` | Not supported | Filesystem access is not exposed. |
| `fs/watch` | Not supported | Filesystem access is not exposed. |
| `fs/unwatch` | Not supported | Filesystem access is not exposed. |
| `skills/config/write` | Not supported | Not exposed. |
| `plugin/install` | Not supported | Not exposed. |
| `plugin/uninstall` | Not supported | Not exposed. |
| `turn/start` | Supported | Used for start conversation and follow-up. |
| `turn/steer` | Supported | Used for steer. |
| `turn/interrupt` | Supported | Used for interrupt. |
| `review/start` | Not supported | Not exposed. |
| `model/list` | Not supported | Not exposed. |
| `modelProvider/capabilities/read` | Not supported | Not exposed. |
| `experimentalFeature/list` | Not supported | Not exposed. |
| `permissionProfile/list` | Not supported | Not exposed. |
| `experimentalFeature/enablement/set` | Not supported | Not exposed. |
| `mcpServer/oauth/login` | Not supported | Not exposed. |
| `config/mcpServer/reload` | Not supported | Not exposed. |
| `mcpServerStatus/list` | Not supported | Not exposed. |
| `mcpServer/resource/read` | Not supported | Not exposed. |
| `mcpServer/tool/call` | Not supported | Not exposed. |
| `windowsSandbox/setupStart` | Not supported | Not exposed. |
| `windowsSandbox/readiness` | Not supported | Not exposed. |
| `account/login/start` | Not supported | Not exposed. |
| `account/login/cancel` | Not supported | Not exposed. |
| `account/logout` | Not supported | Not exposed. |
| `account/rateLimits/read` | Not supported | Not exposed. |
| `account/usage/read` | Not supported | Not exposed. |
| `account/sendAddCreditsNudgeEmail` | Not supported | Not exposed. |
| `feedback/upload` | Not supported | Not exposed. |
| `command/exec` | Not supported | High-risk shell path; not exposed. |
| `command/exec/write` | Not supported | Not exposed. |
| `command/exec/terminate` | Not supported | Not exposed. |
| `command/exec/resize` | Not supported | Not exposed. |
| `config/read` | Not supported | Not exposed. |
| `externalAgentConfig/detect` | Not supported | Not exposed. |
| `externalAgentConfig/import` | Not supported | Not exposed. |
| `config/value/write` | Not supported | Not exposed. |
| `config/batchWrite` | Not supported | Not exposed. |
| `configRequirements/read` | Not supported | Not exposed. |
| `account/read` | Not supported | Not exposed. |
| `getConversationSummary` | Not supported | Not exposed. |
| `gitDiffToRemote` | Not supported | Not exposed. |
| `getAuthStatus` | Not supported | Not exposed. |
| `fuzzyFileSearch` | Not supported | Not exposed. |

## App-Server Server Requests

| Method | Product status | Notes |
| --- | --- | --- |
| `item/commandExecution/requestApproval` | Partial | Registry can capture sanitized command approval metadata; no real safe pending approval observed in fixture. |
| `item/fileChange/requestApproval` | Partial | Registry can capture sanitized file-change approval metadata; no real safe fixture proof. |
| `item/tool/requestUserInput` | Not supported | Not exposed. |
| `mcpServer/elicitation/request` | Not supported | Not exposed. |
| `item/permissions/requestApproval` | Not supported | Intentionally not exposed in current approval scope. |
| `item/tool/call` | Not supported | Not exposed. |
| `account/chatgptAuthTokens/refresh` | Not supported | Not exposed; account/auth stays local to Worker. |
| `attestation/generate` | Not supported | Not exposed. |
| `applyPatchApproval` | Partial | Legacy approval capture/decision mapping exists for supported registry entries; no real safe fixture proof. |
| `execCommandApproval` | Partial | Legacy approval capture/decision mapping exists for supported registry entries; no real safe fixture proof. |

## App-Server Notifications

Codex Remote currently does not expose app-server notifications as a durable product stream. Some notifications are consumed internally by the Worker session and approval registry.

| Method | Product status |
| --- | --- |
| `error` | Partial |
| `thread/started` | Partial |
| `thread/status/changed` | Not supported |
| `thread/archived` | Not supported |
| `thread/unarchived` | Not supported |
| `thread/closed` | Partial |
| `skills/changed` | Not supported |
| `thread/name/updated` | Not supported |
| `thread/goal/updated` | Not supported |
| `thread/goal/cleared` | Not supported |
| `thread/settings/updated` | Not supported |
| `thread/tokenUsage/updated` | Not supported |
| `turn/started` | Partial |
| `hook/started` | Not supported |
| `turn/completed` | Partial |
| `hook/completed` | Not supported |
| `turn/diff/updated` | Not supported |
| `turn/plan/updated` | Not supported |
| `item/started` | Partial |
| `item/autoApprovalReview/started` | Not supported |
| `item/autoApprovalReview/completed` | Not supported |
| `item/completed` | Partial |
| `rawResponseItem/completed` | Not supported |
| `item/agentMessage/delta` | Not supported |
| `item/plan/delta` | Not supported |
| `command/exec/outputDelta` | Not supported |
| `process/outputDelta` | Not supported |
| `process/exited` | Not supported |
| `item/commandExecution/outputDelta` | Not supported |
| `item/commandExecution/terminalInteraction` | Not supported |
| `item/fileChange/outputDelta` | Not supported |
| `item/fileChange/patchUpdated` | Not supported |
| `serverRequest/resolved` | Partial |
| `item/mcpToolCall/progress` | Not supported |
| `mcpServer/oauthLogin/completed` | Not supported |
| `mcpServer/startupStatus/updated` | Not supported |
| `account/updated` | Not supported |
| `account/rateLimits/updated` | Not supported |
| `app/list/updated` | Not supported |
| `remoteControl/status/changed` | Not supported |
| `externalAgentConfig/import/completed` | Not supported |
| `fs/changed` | Not supported |
| `item/reasoning/summaryTextDelta` | Not supported |
| `item/reasoning/summaryPartAdded` | Not supported |
| `item/reasoning/textDelta` | Not supported |
| `thread/compacted` | Not supported |
| `model/rerouted` | Not supported |
| `model/verification` | Not supported |
| `turn/moderationMetadata` | Not supported |
| `warning` | Not supported |
| `guardianWarning` | Not supported |
| `deprecationNotice` | Not supported |
| `configWarning` | Not supported |
| `fuzzyFileSearch/sessionUpdated` | Not supported |
| `fuzzyFileSearch/sessionCompleted` | Not supported |
| `thread/realtime/started` | Not supported |
| `thread/realtime/itemAdded` | Not supported |
| `thread/realtime/transcript/delta` | Not supported |
| `thread/realtime/transcript/done` | Not supported |
| `thread/realtime/outputAudio/delta` | Not supported |
| `thread/realtime/sdp` | Not supported |
| `thread/realtime/error` | Not supported |
| `thread/realtime/closed` | Not supported |
| `windows/worldWritableWarning` | Not supported |
| `windowsSandbox/setupCompleted` | Not supported |
| `account/login/completed` | Not supported |

## Next Planning Implication

Codex Remote should not try to expose all app-server methods at once. The next planning step is Codex App parity mapping by product capability area:

1. Map app-server protocol methods to stable product capabilities, not raw pass-through APIs.
2. Split future stages by experience surface: conversation workbench, local work tools, runtime management, extension management, advanced realtime/platform, and remote-specific hardening.
3. Keep approval as a major gap inside that roadmap, but do not let approval alone define the next roadmap.

See `CODEX_APP_PARITY.md` for the current capability target and stage split direction.
