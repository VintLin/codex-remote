# Worker Control Main Chain Design

## Stage

Stage 5: 控制主链。

## Goal

Add the first safe control slice for active Codex work: interrupt a running turn, steer a running turn, surface pending approval requests, and submit explicit approval decisions through the Worker boundary.

This stage serves one vertical control workflow:

```text
Web selected conversation control
  -> Worker HTTP control API
    -> apps/worker control handlers
      -> Codex app-server turn/interrupt, turn/steer, or JSON-RPC approval response
  -> Web refreshes safe Worker projections
```

## Non-Goals

- No Control Plane, multi-device routing, pairing, DB, task board, iOS, productized auth, external deployment, or reverse WSS.
- No durable streaming transport, SSE, WebSocket, event replay, or persistent event log.
- No approval auto-accept, policy amendment UI, permission-profile editing, broad sandbox control, model switching, terminal control, file diff display, or raw command output.
- No Web start conversation UI expansion.
- No raw app-server JSON-RPC, raw notification payload, prompt echo, command output, full diff, stack/cause, provider secret, Codex auth, raw app-server URL, or private path in HTTP responses, logs, UI, tests, or docs.
- No Web import from `@codex-remote/codex-protocol`.

## Source Of Truth

- Public API fields start in `packages/api-contract/openapi.yaml`.
- Generated public TypeScript types in `packages/api-contract/src/generated/openapi.ts` are updated only by the package generation command.
- Codex app-server request, server request, and response shapes come from `packages/codex-protocol` generated artifacts.
- `apps/worker` remains the only app that imports `@codex-remote/codex-protocol` or calls/responds to app-server protocol.
- `apps/web` consumes only `@codex-remote/api-contract`.
- UI visuals follow `DESIGN.md`; product behavior follows `PRODUCT.md`.

## Recommended Scope

Implement four versioned Worker endpoints:

- `POST /v1/conversations/{conversationId}/turns/{turnId}/interrupt`
- `POST /v1/conversations/{conversationId}/turns/{turnId}/steer`
- `GET /v1/conversations/{conversationId}/approvals`
- `POST /v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision`

Return `202 CommandAccepted` for interrupt, steer, and approval decision. `202` means the Worker accepted and submitted the control request; it does not mean the turn completed or the approval effect has become visible in a refreshed timeline.

Use `GET /v1/conversations/{conversationId}/approvals` as a process-local snapshot of pending app-server approval requests captured by the Worker connection. It is not durable and must return only sanitized metadata.

Reasons:

- Interrupt and steer already have generated protocol methods: `turn/interrupt` and `turn/steer`.
- `turn/steer` already requires `expectedTurnId` in generated protocol, matching the Stage 5 concurrency guard.
- Approval requests are app-server `ServerRequest` messages, not normal timeline errors. A Worker registry is the minimal safe boundary before durable Control Plane/DB exists.
- Keeping approvals separate from follow-up avoids treating a privileged execution decision as chat input.

## Public Contract Shape

### `InterruptTurnInput`

- `clientRequestId`: string, required, max 128.
- `expectedTurnId`: string, required. Must match the path `turnId`.

### `SteerTurnInput`

- `message`: string, 1..20000 chars.
- `clientRequestId`: string, required, max 128.
- `expectedTurnId`: string, required. Must match the path `turnId` and is passed to app-server `turn/steer`.

Do not include provider credentials, raw `cwd`, app-server method names, approval policy, sandbox override, tool args, or raw config.

### `PendingApproval`

Public metadata:

- `id`: opaque Worker approval request id.
- `conversationId`: string.
- `turnId`: string.
- `itemId`: string.
- `kind`: one of `command_execution`, `file_change`, `legacy_exec`, `legacy_apply_patch`.
- `status`: `pending`.
- `startedAt`: ISO timestamp when known, otherwise Worker capture time.
- `summary`: short sanitized label for UI display.
- `risk`: `low`, `medium`, `high`, or `unknown`.

Do not include command text, arguments, cwd, file paths, patch text, permission profile internals, raw request params, or policy amendment proposals in Stage 5. Those can be designed later as explicit review surfaces.

### `ApprovalDecisionInput`

- `decision`: `accept`, `decline`, or `cancel`.
- `clientRequestId`: string, required, max 128.
- `expectedConversationId`: string, required. Must match the path `conversationId`.
- `expectedTurnId`: string, required. Must match the pending approval `turnId`.
- `expectedApprovalRequestId`: string, required. Must match the path `approvalRequestId`.

Stage 5 supports only the common decision triad:

- `accept`: submit the generated protocol accept decision for the captured approval kind.
- `decline`: submit the generated protocol decline/denied decision for the captured approval kind.
- `cancel`: submit the generated protocol cancel/abort decision for the captured approval kind.

Stage 5 must reject policy amendment decisions, session-wide accept, permission grants, and raw custom approval payloads. This avoids accidentally widening permission scope before the UI has a dedicated review design.

Decision mapping is explicit and per generated approval kind:

| Public decision | `item/commandExecution/requestApproval` | `item/fileChange/requestApproval` | `execCommandApproval` | `applyPatchApproval` |
| --- | --- | --- | --- | --- |
| `accept` | `{ decision: "accept" }` | `{ decision: "accept" }` | `{ decision: "approved" }` | `{ decision: "approved" }` |
| `decline` | `{ decision: "decline" }` | `{ decision: "decline" }` | `{ decision: "denied" }` | `{ decision: "denied" }` |
| `cancel` | `{ decision: "cancel" }` | `{ decision: "cancel" }` | `{ decision: "abort" }` | `{ decision: "abort" }` |

`item/permissions/requestApproval` is out of Stage 5 decision scope. Its generated response requires a permission profile and scope, so a three-choice UI would either be incomplete or would implicitly grant permissions without a dedicated review surface. Stage 5 must not expose permissions approvals in `PendingApproval`; if one is captured internally, respond to public listing/decision attempts as `control_not_supported` or omit it from public pending approvals.

### `CommandAccepted`

Reuse the existing Stage 4 response shape:

- `id`
- `status`
- `conversationId`
- `turnId`
- `acceptedAt`

Do not include message text or raw app-server response.

## Worker Behavior

### Interrupt

Worker maps public `InterruptTurnInput` to app-server `turn/interrupt`.

Required checks:

- Prove `conversationId` belongs to the configured allowed project root before control.
- Require `expectedTurnId` and reject if it differs from the path `turnId`.
- Use path `turnId` as app-server `turnId`.
- Use process-local idempotency keyed by `interrupt + conversationId + turnId + clientRequestId` plus request fingerprint.
- Return sanitized `CommandAccepted`.

### Steer

Worker maps public `SteerTurnInput` to app-server `turn/steer`.

Required checks:

- Prove `conversationId` belongs to the configured allowed project root before control.
- Require `expectedTurnId` and reject if it differs from the path `turnId`.
- Send one text `UserInput` item using the same local Worker text-input helper shape as Stage 4.
- Use `clientRequestId` as `clientUserMessageId`.
- Use process-local idempotency keyed by `steer + conversationId + turnId + clientRequestId` plus request fingerprint.
- Return sanitized `CommandAccepted`.

### Approval Registry

Worker extends app-server RPC handling so server-originated approval requests can be captured and responded to.

Required registry behavior:

- Capture only generated `ServerRequest` methods that are approval requests:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - `execCommandApproval`
  - `applyPatchApproval`
- Treat `item/permissions/requestApproval` as unsupported in Stage 5; do not expose it as `PendingApproval` and do not submit a public decision for it.
- Generate a Worker-local opaque `PendingApproval.id` for each captured server request.
- Store the app-server JSON-RPC request id internally, never expose it to Web.
- Store enough generated request metadata to build the proper generated response type for `accept`, `decline`, or `cancel`.
- Do not store raw command output, patch text, full paths for public response, provider secrets, or raw JSON-RPC frames.
- Remove approval from the pending registry when a decision is submitted or when a matching `serverRequest/resolved` notification is observed.

Stage 5 registry is process-local only. If the Worker restarts, pending approvals are lost and Web must show no pending approval until app-server sends a new request. Durable approval state belongs to later Control Plane/DB stages.

### Approval Decision

Worker maps `ApprovalDecisionInput` to the generated response for the captured request kind, then sends a JSON-RPC response with the original server request id.

Required checks:

- Path `conversationId` must match `expectedConversationId`.
- Pending approval must exist and belong to the path `conversationId`.
- Pending approval `turnId` must match `expectedTurnId`.
- Path `approvalRequestId` must match `expectedApprovalRequestId`.
- Same `clientRequestId` with same fingerprint returns the same accepted response.
- Same idempotency key with different fingerprint returns sanitized conflict/invalid request.
- Missing, resolved, or mismatched approval fails closed.
- `accept` must not become `acceptForSession`, policy amendment, permission profile grant, or any broader scoped decision.
- Per-kind adapters must use only the explicit decision mapping table in this spec.

## Web Behavior

- Show interrupt and steer controls only for the selected conversation when there is a known active/running turn id.
- Interrupt button uses a compact risk label and requires no prompt text.
- Steer uses a compact input/action area separate from follow-up; copy should make clear it targets the current active turn.
- Approval panel lists pending approvals from the Worker approval snapshot.
- Approval decision UI offers only accept, decline, and cancel for Stage 5.
- On accepted control response:
  - show compact accepted state;
  - refresh selected conversation/timeline and pending approvals;
  - do not render the control text as assistant output.
- On failure:
  - preserve steer draft;
  - keep approval decision available unless Worker reports missing/resolved approval;
  - show sanitized failed state.

## Error Handling

Use existing `ErrorEnvelope` and add or allow these codes through the API contract and Worker errors:

- `invalid_request`
- `unauthorized`
- `origin_forbidden`
- `conversation_not_found`
- `turn_not_found`
- `approval_not_found`
- `project_forbidden`
- `app_server_timeout`
- `app_server_unavailable`
- `control_not_supported`
- `duplicate_request`
- `worker_internal_error`

Public messages must be curated. Details may include only allowlisted diagnostic fields such as `operation`, `retryable`, `diagnosticId`, `reason`, `field`, `limit`, `expected`, and `actualKind`. Do not include raw upstream error bodies, command text, cwd, paths, stack/cause, JSON-RPC id, or app-server URL.

## Testing Strategy

Focused tests:

- API contract source-of-truth tests cover new endpoints, inputs, `PendingApproval`, and no unversioned control routes.
- Worker control handler tests:
  - interrupt maps to `turn/interrupt` after conversation allowlist proof;
  - steer maps to `turn/steer` with one text input, `expectedTurnId`, and `clientUserMessageId`;
  - mismatched expected ids fail before app-server control;
  - idempotency replay and fingerprint conflict behavior is scoped by operation, conversation, turn, and `clientRequestId`;
  - app-server failures map to sanitized `ErrorEnvelope`.
- Worker approval registry tests:
  - captures only approval `ServerRequest` methods;
  - treats `item/permissions/requestApproval` as unsupported and does not expose it publicly;
  - projects sanitized pending approval metadata;
  - decision response writes only the explicit per-kind generated response shapes for accept/decline/cancel;
  - missing, resolved, wrong conversation, wrong turn, and wrong approval id fail closed;
  - public response never includes command, cwd, patch, raw JSON-RPC id, stack/cause, token, URL, or private path.
- Worker HTTP tests:
  - strict JSON object body validation;
  - `additionalProperties: false` parity;
  - `clientRequestId.maxLength: 128`;
  - POST and GET route auth/CORS behavior.
- Web client/controller tests:
  - control API calls use generated public types;
  - accepted interrupt/steer/approval refreshes selected conversation and approvals;
  - failures preserve steer text and show sanitized status;
  - Web still does not import `@codex-remote/codex-protocol`.
- Fake Worker Chrome smoke tests:
  - pending approval list renders sanitized metadata;
  - accept/decline/cancel accepted state refreshes list;
  - interrupt accepted state refreshes active turn metadata;
  - steer accepted state preserves no prompt echo and refreshes metadata;
  - failure path shows sanitized error and no leaks.

Repository gate:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/worker test
pnpm --filter @codex-remote/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Chrome smoke:

1. Start deterministic fake Worker with Stage 5 control endpoints and Stage 3 read endpoints.
2. Start Web with example Worker config.
3. Verify loaded read state and active turn metadata.
4. Submit steer; verify accepted state, timeline metadata refresh, draft clear on accepted, and no prompt echo.
5. Submit interrupt; verify accepted state and refreshed status metadata.
6. Load pending approvals; verify only sanitized summary/risk/kind appears.
7. Submit approval accept and decline/cancel paths against fake pending approvals; verify accepted state and approval list refresh.
8. Trigger fake failures and verify steer draft remains, approval actions remain available for retry unless the approval is missing/resolved, and errors are sanitized.
9. Leak check for token, raw URL, command text, cwd/private path, patch, prompt echo, command output, full diff, stack/cause, and raw JSON-RPC.

## Recommended Options And Risks

### Conclusion

Use separate endpoints for interrupt, steer, approval listing, and approval decision.

### Reason

These operations have different safety semantics and generated protocol shapes. A generic `control` endpoint would hide concurrency guards and make approval decisions look like ordinary chat writes.

### Risk

The first approval UI will be intentionally minimal and may be too coarse for complex permission requests.

### Next Step

Keep Stage 5 decisions to accept/decline/cancel only. Add richer approval review surfaces in a later explicit safety stage.

### Conclusion

Use process-local approval and idempotency registries.

### Reason

Stage 5 has no DB by plan, and durable multi-device state belongs to Stage 6/7. Process-local state is enough for local Chrome verification and preserves the architecture sequence.

### Risk

Worker restart loses pending approvals and duplicate request memory.

### Next Step

Document this as a Stage 5 limitation and revisit in Stage 7 DB-backed idempotency/approval state.

## Completion Criteria

Stage 5 is complete when:

- Public control contract is schema-first and generated.
- Worker can submit interrupt and steer through generated app-server protocol types.
- Worker can capture approval server requests, expose sanitized pending approvals, and submit explicit accept/decline/cancel decisions.
- Web can exercise interrupt, steer, and approval decision controls through Worker only.
- Focused tests and repository gate pass.
- Chrome smoke verifies normal, failure, and leak-check paths.
- `PLAN.md`, this spec, and the Stage 5 plan record review findings, fixes, verification, and remaining risks.

## Completion Record

Status: completed.

Design decisions validated during implementation:

- Separate public endpoints for interrupt, steer, approval listing, and approval decision were kept. No generic control endpoint was introduced.
- `packages/api-contract/openapi.yaml` remained the public API source of truth; generated aliases were exported from `@codex-remote/api-contract`.
- `apps/worker` remained the only app-server protocol caller/responder. `apps/web` did not import `@codex-remote/codex-protocol`.
- Permissions approvals stayed unsupported and hidden from public pending approvals.
- Approval list and decision now require allowed-project proof before exposing or consuming registry state.

Review findings and fixes:

- Architecture review required clearer permissions approval exclusion and legacy approval decision mapping. The spec and plan were updated before implementation.
- Worker review required a long-lived Worker session for approval observers, retry-safe pending approval completion, and Worker capture-time fallback for unknown approval start timestamps. All were fixed and reviewed.
- Final Task 4/5 review found approval list/decision missing allowed-root proof. The handlers now use `withControlClient + assertConversationAllowed`; forbidden list/decision regression tests pass and review approved.

Verification:

- Focused package verification passed:
  - `pnpm --filter @codex-remote/api-contract test`
  - `pnpm --filter @codex-remote/api-contract build`
  - `pnpm --filter @codex-remote/worker typecheck`
  - `pnpm --filter @codex-remote/worker test` with 143/143 tests passed after the P1 fix.
  - `pnpm --filter @codex-remote/web typecheck`
  - `pnpm --filter @codex-remote/web test` with 76/76 tests passed.
- Repository gate passed:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Chrome verification passed with deterministic fake Worker:
  - loaded state and active turn metadata;
  - steer accepted path and draft clear;
  - approval accept path and pending-list refresh;
  - interrupt accepted path and disabled controls after no active turn;
  - fallback `request_failure` path after fake Worker shutdown;
  - no visible token, raw Worker URL, raw JSON-RPC, command output, full diff, stack/cause, or private path.

Remaining Stage 5 limitations:

- Approval registry and idempotency memory are process-local only.
- Approval UI intentionally shows sanitized metadata only and no command/path/patch detail.
- Control Plane, DB persistence, reverse WSS, iOS, pairing, productized auth, durable streaming, and task board remain future stages.
