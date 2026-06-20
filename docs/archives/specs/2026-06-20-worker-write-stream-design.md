# Worker Write And Stream Design

## Stage

Stage 4: 写操作主链。

## Goal

Add the first write-capable vertical slice: Worker exposes schema-first start and follow-up APIs, and Web completes the follow-up workflow through the Worker HTTP boundary, then observes a safe read-refresh status.

This stage serves one narrow workflow:

```text
Web composer follow-up
  -> Worker HTTP write API
    -> apps/worker app-server adapter
      -> Codex app-server turn/start
  -> Web reloads/read-refreshes safe Worker projections
```

`POST /v1/conversations` is implemented at the Worker/API layer in this stage so the contract has a coherent write surface, but the Web start-conversation entrypoint and Chrome start smoke are deferred until the follow-up flow proves the write boundary. This keeps Stage 4 to one user-facing vertical slice while avoiding a half-defined public start API.

## Non-Goals

- No approval request/response implementation.
- No interrupt or steer.
- No Control Plane, multi-device routing, pairing, DB, task board, iOS, productized auth, or external deployment.
- No durable event log, replay protocol, WSS reverse connection, SSE, WebSocket, or server push.
- No raw app-server JSON-RPC, raw notification payload, prompt echo, command output, full diff, stack/cause, provider secret, Codex auth, or raw app-server URL in HTTP responses, logs, UI, tests, or docs.
- No Web import from `@codex-remote/codex-protocol`.
- No broad UI redesign. The composer may become enabled only for the minimal start/follow-up path.

## Source Of Truth

- Public API fields start in `packages/api-contract/openapi.yaml`.
- Generated public TypeScript types in `packages/api-contract/src/generated/openapi.ts` are updated only by the package generation command.
- Codex app-server request and notification shapes come from `packages/codex-protocol` generated artifacts.
- `apps/worker` remains the only app that imports `@codex-remote/codex-protocol` or calls app-server methods.
- `apps/web` consumes only `@codex-remote/api-contract`.
- UI visuals follow `DESIGN.md`; product behavior follows `PRODUCT.md`.

## Recommended Scope

Implement two versioned Worker endpoints:

- `POST /v1/conversations`
- `POST /v1/conversations/{conversationId}/follow-up`

Return `202 CommandAccepted` for both. `202` means the Worker accepted and submitted the app-server request; it does not mean the Codex turn completed.

Replace the existing legacy unversioned `POST /conversations/{conversationId}/follow-up` contract. Stage 4 must remove or disable that path from `openapi.yaml`, regenerate types, and add a contract test proving no unversioned public write path remains.

Add a bounded status/event snapshot endpoint only if needed for Chrome verification:

- Preferred default: Web refreshes existing `GET /v1/conversations` and `GET /v1/conversations/{conversationId}/timeline`.
- Optional if implementation proves necessary: `GET /v1/conversations/{conversationId}/events` returning sanitized, Worker-generated event metadata only. This endpoint must not be a streaming transport.

Reasons:

- It keeps Stage 4 as a write path, not a full streaming infrastructure stage.
- It uses existing read endpoints for post-write verification.
- It avoids inventing durable delivery before Stage 6 reverse connection and Stage 7 persistence.

## Public Contract Shape

### `StartConversationInput`

Public input:

- `projectId`: string. For Stage 4 Worker, this must identify the configured allowed project root or a project derived from current Worker conversations.
- `message`: string, 1..20000 chars.
- `clientRequestId`: string, required idempotency key supplied by Web.

Do not include:

- Provider credentials.
- Raw `cwd` paths from the browser.
- App-server method names.
- Tool arguments, raw JSON schema, raw config map, or developer instructions.
- Approval policy or sandbox override. Stage 4 uses Worker/local Codex defaults; approval and sandbox control move to a later safety stage.

### `FollowUpInput`

Existing `FollowUpInput` must be reconciled with Stage 4 needs:

- `message`: string, 1..20000 chars.
- `clientRequestId`: string, required idempotency key.
- `expectedConversationId`: string optional redundant guard; when present it must match the path `conversationId`.

If the existing schema differs, update it in `openapi.yaml`, regenerate types, then update Web/Worker together.

### `CommandAccepted`

Response:

- `id`: accepted command id, deterministic from `clientRequestId` or Worker-generated stable id.
- `status`: `accepted`.
- `conversationId`: returned for both start and follow-up.
- `turnId`: nullable until Worker can prove a turn id from app-server response/notification.
- `acceptedAt`: ISO timestamp.

Do not include prompt text or raw app-server response.

## Worker Behavior

### Start Conversation

Worker maps `StartConversationInput` to app-server `thread/start`, then `turn/start`. The current generated `ThreadStartParams` has no user input field, so the initial user message must be sent through `turn/start` after a thread id is available.

Recommended safe mapping:

- Resolve `projectId` to `WorkerHttpConfig.allowedProjectRoot`; fail closed if it does not match.
- Build app-server `ThreadStartParams` with `cwd` from the Worker config, never from Web.
- Use the returned thread id or `thread/started` notification thread id as the public `conversationId`.
- Build `UserInput` as one text item with `text_elements: []`.
- Use `clientRequestId` as `clientUserMessageId` where supported.
- Return `CommandAccepted` after the app-server request has been accepted.

### Follow-Up

Worker maps `FollowUpInput` to app-server `turn/start`.

Required checks:

- Prove `conversationId` is in the allowed thread list before write.
- Read or list enough metadata to ensure the thread is inside `allowedProjectRoot`.
- Use `clientRequestId` as `clientUserMessageId`.
- Send one text `UserInput` item.
- Return `CommandAccepted`.

### Idempotency

Stage 4 has no DB. Use a process-local bounded idempotency cache in Worker only:

- key: `operation + conversationId/projectId + clientRequestId`.
- fingerprint: normalized request body fields that affect the write.
- value: `CommandAccepted`.
- TTL: short, such as 10 minutes.
- scope: device-local process only.

If the same key is seen with a different fingerprint, Worker returns a sanitized conflict/invalid request error instead of replaying the old accepted response. This is a best-effort duplicate guard, not a durable guarantee. Stage 7 can replace it with DB-backed idempotency.

### Events / Stream

Stage 4 must not implement durable streaming. If event visibility is required for the Chrome smoke, expose only Worker-generated metadata:

- `eventId`
- `sequence`
- `timestamp`
- `conversationId`
- optional `turnId`
- public status kind such as `accepted`, `started`, `completed`, `failed`

Never expose:

- agent text deltas
- command output
- file diff
- raw app-server notification body
- raw tool args

## Web Behavior

- Enable composer only when datasource is `loaded` and the selected conversation is not read-error.
- On follow-up submit:
  - create `clientRequestId` in Web.
  - POST to Worker follow-up endpoint.
  - clear composer only after `202`.
  - refresh the selected conversation timeline using existing read endpoint.
- On start conversation:
  - no Web start entrypoint is required in Stage 4.
  - keep the Worker/API start endpoint covered by contract and Worker tests.
  - add the Web entrypoint in a later slice after follow-up is verified.
- Show `accepted` / `failed` state as compact metadata, not as assistant output.
- Keep raw error details sanitized using existing `ErrorEnvelope` rules.

## Error Handling

Use existing `ErrorEnvelope` and add/extend allowlisted codes only in the API contract and Worker errors:

- `invalid_request`
- `unauthorized`
- `origin_forbidden`
- `conversation_not_found`
- `project_forbidden`
- `app_server_timeout`
- `app_server_unavailable`
- `write_not_supported`
- `duplicate_request`
- `worker_internal_error`

Public messages must be curated. Details may include only allowlisted diagnostic fields such as `operation`, `retryable`, `diagnosticId`, `reason`, `field`, `limit`.

## Testing Strategy

Focused tests:

- API contract source-of-truth tests cover new endpoints and schemas.
- Generated type check confirms `StartConversationInput`, `FollowUpInput`, and `CommandAccepted` are exported from `@codex-remote/api-contract`.
- Worker write handler tests:
  - start maps public input to safe app-server params and Worker-owned cwd.
  - follow-up proves allowed conversation before `turn/start`.
  - invalid `projectId` or mismatched `expectedConversationId` fails closed.
  - missing/duplicate `clientRequestId` is handled.
  - app-server failures map to sanitized `ErrorEnvelope`.
  - responses never include raw prompt, command output, raw URL, raw JSON-RPC, stack/cause, full diff, provider secret, or private path.
- Web datasource/client tests:
  - POST start/follow-up uses public contract types.
  - accepted response updates UI state and triggers read refresh.
  - failures preserve composer text and show sanitized status.
- Boundary tests:
  - Web still does not import `@codex-remote/codex-protocol`.
  - Worker write code is the only app-server write caller.

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

1. Start a deterministic fake Worker that supports Stage 4 POST endpoints and Stage 3 read endpoints.
2. Start Web with example Worker config.
3. Verify loaded read state.
4. Send a follow-up from the composer.
5. Verify `202` accepted state, composer clear, timeline refresh, no token/raw URL/prompt echo/command output/full diff.
6. Trigger a fake failure and verify composer text is preserved and sanitized error state is visible.

## Architecture Review Record

Plan review was performed by a subagent as an architect review before implementation.

Initial result: REQUEST CHANGES.

Findings fixed:

- Removed ambiguity from the existing legacy unversioned follow-up path; Stage 4 must replace it with `/v1/conversations/{conversationId}/follow-up` and add a no-legacy-write contract test.
- Removed `approvalPolicy` and `sandbox` from Stage 4 public input. Worker uses local defaults; approval and sandbox control move to a later safety stage.
- Scoped idempotency by operation, target id, and `clientRequestId`; added request fingerprint conflict behavior.
- Reconciled Stage goal and verification by narrowing Web scope to follow-up while keeping Worker/API start implemented and tested.

Second result: APPROVE.

## Completion Criteria

Stage 4 is complete when:

- Public write contract is schema-first and generated.
- Worker can submit start and follow-up through app-server generated protocol types.
- Web can send a follow-up through Worker and refresh read state.
- Web start-conversation UI is explicitly deferred; Worker/API start is implemented and tested.
- Optional event/status snapshot is metadata-only if implemented.
- Focused tests and repository gate pass.
- Chrome smoke verifies normal accepted path and sanitized failure path.
- `PLAN.md` and `docs/references/development-context.md` record Stage 4 status, risks, verification, and Stage 5 recommendation.

## Completion Record

Stage 4 completed the scoped follow-up write slice.

Delivered:

- Schema-first versioned write contract for `POST /v1/conversations` and `POST /v1/conversations/{conversationId}/follow-up`.
- Removal of the legacy unversioned public follow-up write path.
- Worker-only mapping from public contract inputs to generated Codex app-server protocol methods.
- Process-local bounded idempotency for start and follow-up.
- Web follow-up submit through Worker HTTP only, with explicit accepted/failed status and read-refresh observation.
- Fake Worker POST support for Chrome smoke normal and failure paths.

Deferred:

- Web start-conversation UI.
- Durable stream, SSE, WebSocket, replay, event log, Control Plane, DB, iOS, pairing, productized auth.
- Approval, interrupt, and steer.

Verification:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Chrome normal path: loaded read state, enabled composer, accepted submit, cleared draft, refreshed metadata-only `turn in_progress`, and no token/raw URL/prompt echo/command output/full diff/stack/cause/JSON-RPC in UI.
- Chrome failure path: `smoke-fail` preserved composer text, showed sanitized `发送失败`, and produced no browser console errors.

Chrome-found fixes:

- Replaced `ComposerPrimitive.Send` with a regular send button because the Stage 4 custom contenteditable composer does not use assistant-ui internal composer input state.
- Propagated explicit submit results so failed Worker writes do not clear composer draft after raw errors are sanitized into `failed`.
