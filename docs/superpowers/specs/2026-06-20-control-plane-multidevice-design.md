# Control Plane Multi-Device Design

## Stage

Stage 6: Control Plane multi-device routing and status aggregation.

## Goal

Add the first self-hosted Control Plane slice so Web can talk to one local Control Plane API that aggregates multiple configured Device Workers.

This stage serves one vertical multi-device workflow:

```text
Web workbench
  -> Control Plane HTTP API
    -> configured Worker HTTP upstream by deviceId
      -> apps/worker
        -> Codex app-server
  -> Web renders aggregated devices, conversations, timelines, writes, and controls
```

## Non-Goals

- No DB, task board persistence, migrations, durable audit log, or `packages/db`.
- No reverse WSS implementation, pairing flow, QR code, DPoP/device-bound token implementation, token rotation UI, or revocation UI.
- No external deployment, TLS termination, cloud topology, productized auth, installer, OS service, or iOS app.
- No direct Control Plane call to Codex app-server.
- No Web import from `@codex-remote/codex-protocol`.
- No storage of OpenAI API key, ChatGPT auth, Codex auth, provider secrets, raw Worker token, raw prompt, raw command output, raw JSON-RPC frame, full diff, stack/cause, or private paths in Control Plane responses/logs/tests/docs.
- No new stream transport or durable event replay.
- No broad task board, automatic device selection, automatic task migration, model switching, sandbox override, permission grant UI, or policy amendment UI.

## Source Of Truth

- Public API fields start in `packages/api-contract/openapi.yaml`.
- Generated public TypeScript types in `packages/api-contract/src/generated/openapi.ts` are updated only by the package generation command.
- Control Plane runtime configuration is the Stage 6 source for configured Worker upstreams. It is in-memory/env/file config only, not DB.
- Worker remains the only app-server protocol caller. `packages/codex-protocol` is still Worker-only.
- Web consumes only `@codex-remote/api-contract` and app-local datasource adapters.
- UI visuals follow `DESIGN.md`; product behavior follows `PRODUCT.md`.

## Recommended Scope

Create `apps/control-plane` as a local HTTP service.

Expose Control Plane endpoints that reuse existing public shapes where possible:

- `GET /v1/control-plane/health`
- `GET /v1/devices`
- `GET /v1/conversations`
- `GET /v1/devices/{deviceId}/worker/health`
- `GET /v1/devices/{deviceId}/worker/capabilities`
- `GET /v1/devices/{deviceId}/conversations/{conversationId}/timeline`
- `GET /v1/devices/{deviceId}/conversations/{conversationId}/approvals`
- `POST /v1/devices/{deviceId}/conversations`
- `POST /v1/devices/{deviceId}/conversations/{conversationId}/follow-up`
- `POST /v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt`
- `POST /v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer`
- `POST /v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision`

Keep Worker's existing `/v1/...` API unchanged. Control Plane forwards to Worker after resolving `deviceId` from runtime config.

Reasons:

- Device-scoped routes avoid guessing conversation ownership when two Workers have the same conversation id.
- Existing schemas already include `deviceId` on `Device`, `CodexConversation`, `WorkerHealth`, and related projections.
- A configured upstream registry verifies multi-device routing without creating pairing, reverse connection, or DB prematurely.

## Runtime Config

Stage 6 runtime config should be explicit and local:

```json
{
  "publicToken": "example-token",
  "devices": [
    {
      "id": "device-a",
      "name": "MacBook Pro",
      "baseUrl": "http://127.0.0.1:8788",
      "token": "example-token"
    }
  ]
}
```

Rules:

- `token` is an upstream Worker bearer token kept only in Control Plane process memory/config.
- Tests may use `example-token`; no real token or provider secret in fixtures.
- Startup logs must not print upstream token or full raw config.
- Control Plane public API must not echo upstream `baseUrl` or token.
- Invalid duplicate `device.id`, invalid URL, missing token, or non-loopback default test URL should fail closed in config parsing.

Stage 6 can accept env JSON or a local config file path. If both are supported, env JSON is enough for tests and Chrome smoke. Do not add config persistence.

## Public Contract Shape

### `ControlPlaneHealth`

- `status`: `ok` or `degraded`.
- `checkedAt`: ISO string.
- `deviceCount`: number.
- `connectedDeviceCount`: number.

### `Device`

Reuse existing `Device` schema. Control Plane derives it from configured device metadata plus Worker health.

Stage 6 derivation:

- `id`: configured device id.
- `name`: configured device name.
- `status`: `Connected`, `Not connected`, or `Degraded` from Worker health fetch result.
- `ip`: sanitized host label or `local`; do not expose token or raw credentials.
- `lastOnlineAt`: health `checkedAt` when connected, otherwise current checked time.
- `currentProject`: best-effort from latest aggregated conversation project, otherwise empty.
- `model`: best-effort from Worker data when available, otherwise empty.

### Existing Worker Shapes

Reuse:

- `WorkerHealth`
- `WorkerCapabilities`
- `CodexConversation`
- `ConversationTimeline`
- `StartConversationInput`
- `FollowUpInput`
- `InterruptTurnInput`
- `SteerTurnInput`
- `PendingApproval`
- `ApprovalDecisionInput`
- `CommandAccepted`
- `ErrorEnvelope`

Do not create parallel `ControlPlaneConversation`, `ControlPlaneTimeline`, or Web-only DTOs.

## Control Plane Behavior

### Authentication

Use a single local Control Plane bearer token for Stage 6.

Required checks:

- Missing/invalid bearer token returns sanitized `401 ErrorEnvelope`.
- Browser origin allowlist follows Worker's conservative local behavior.
- Token is never logged or rendered.

Conclusion: keep Stage 6 auth simple bearer-only.

Reason: the goal is multi-device routing, not production-grade device-bound auth.

Risk: bearer-only is not sender-constrained and is not enough for production.

Next step: Stage 6 spec records this as development posture; Stage 8/productization can implement sender-constrained device auth after a threat model.

### Device Registry

Use an in-memory registry built from runtime config.

Required behavior:

- Resolve `deviceId` before any upstream request.
- Unknown `deviceId` returns `404 device_not_found`.
- Duplicate configured ids fail startup/config validation.
- Upstream failures degrade that device and produce sanitized errors.

Conclusion: runtime-config registry is the Stage 6 source for devices.

Reason: it verifies Web -> Control Plane -> Worker routing without DB/pairing.

Risk: device list changes require process restart or config reload.

Next step: add pairing/registration and DB-backed device records in a later explicit stage.

### Aggregation

`GET /v1/devices`:

- Calls each configured Worker health endpoint with per-device timeout.
- Returns one `Device` per configured upstream.
- Does not fail the whole request when one Worker is down.

`GET /v1/conversations`:

- Calls each configured Worker conversations endpoint.
- Returns concatenated `CodexConversation[]`.
- Each returned conversation must be rewritten to the configured `deviceId`; do not trust an upstream to impersonate another configured device id.
- Sort by `updatedAt` desc where possible.
- If one Worker fails, omit its conversations and keep device degraded; do not leak upstream URL/token/error details.

### Device-Scoped Proxy

All device-scoped read/write/control endpoints:

- Resolve device by path `deviceId`.
- Forward to that device's Worker endpoint using upstream Worker token.
- Preserve public request body shape.
- Return only public response shapes after device identity normalization.
- Rewrite every returned public object that contains `deviceId` to the configured path device id when the object is known and safe to normalize:
  - `WorkerHealth.deviceId`;
  - `WorkerCapabilities.deviceId`;
  - `CodexConversation.deviceId`;
  - `ConversationTimeline.deviceId`.
- For public shapes where rewriting would be unsafe or ambiguous, fail closed with sanitized `device_unavailable` instead of forwarding a conflicting device identity.
- Map upstream network/auth/errors to sanitized `ErrorEnvelope`.
- Never expose upstream base URL or token.

For write/control accepted responses:

- Ensure returned `conversationId` and `turnId` remain opaque.
- Do not rewrite app-server ids.
- Do not claim command completion.

Conclusion: configured `deviceId` is authoritative at the Control Plane boundary.

Reason: Worker upstreams are configured runtime dependencies, not identity authorities in Stage 6. A misconfigured or malicious upstream must not poison Web routing by returning a different `deviceId`.

Risk: rewriting can hide upstream misconfiguration during local development.

Next step: add tests for upstream `deviceId: other-device`; Control Plane must expose the configured device id for known normalizable shapes, or fail closed for unsafe shapes.

### Web Behavior

Web datasource should support Control Plane mode:

- Default base URL can point at Control Plane.
- Device list loads from `GET /v1/devices`.
- Conversation list loads from `GET /v1/conversations`.
- Timeline, approvals, follow-up, interrupt, steer, and approval decision use selected conversation's `deviceId` to call device-scoped Control Plane routes.
- Existing fallback behavior remains when token/base URL is missing or Control Plane is unavailable.

Do not keep Worker-only routes as the Web's long-term assumption after Stage 6. It is acceptable to keep a small compatibility adapter for tests/fallback if it does not duplicate DTOs.

## Error Handling

Use `ErrorEnvelope`.

Add or allow these codes if not already available:

- `device_not_found`
- `device_unavailable`
- `control_plane_unavailable`
- `invalid_config`
- existing Worker codes such as `unauthorized`, `origin_forbidden`, `conversation_not_found`, `approval_not_found`, `app_server_unavailable`, `worker_internal_error`

Public messages must be curated. Details may include only allowlisted diagnostic fields such as `operation`, `retryable`, `diagnosticId`, `deviceId`, `field`, `limit`, `expected`, and `actualKind`.

Do not include raw upstream error bodies, base URL, token, command text, cwd, paths, stack/cause, JSON-RPC id, or app-server URL.

## Testing Strategy

Focused tests:

- API contract tests:
  - Control Plane device-scoped paths exist and use existing public schemas.
  - No unversioned Control Plane paths.
  - No parallel conversation/timeline schemas.
  - Error details allowlist includes only safe device diagnostics.
- Control Plane config tests:
  - valid config creates registry;
  - duplicate ids, missing tokens, invalid URLs, and blank ids fail closed;
  - safe startup summaries omit tokens and raw config.
- Control Plane HTTP tests:
  - auth and origin checks;
  - `GET /v1/devices` returns connected/degraded devices independently;
  - `GET /v1/conversations` aggregates multiple fake Workers and rewrites device id to configured id;
  - device-scoped health, capabilities, timeline, and start response projections normalize upstream `deviceId` to configured path device id;
  - unsafe or unknown device-bearing response conflicts fail closed without leaking upstream identity details;
  - device-scoped timeline/write/control/proxy endpoints call the right upstream and preserve public body shape;
  - unknown device returns `device_not_found`;
  - upstream failure maps to sanitized `device_unavailable`.
- Web tests:
  - datasource uses device-scoped Control Plane routes for timeline and controls;
  - Web still does not import `@codex-remote/codex-protocol`;
  - fallback path remains sanitized.
- Fake Control Plane/Worker Chrome smoke tests:
  - two fake Workers render as two devices;
  - selecting conversations from different devices fetches the correct device-scoped timeline;
  - follow-up or control action routes to the selected conversation's device;
  - one Worker down degrades only that device and does not leak raw URL/token.

Repository gate:

```bash
pnpm --filter @codex-remote/api-contract test
pnpm --filter @codex-remote/control-plane test
pnpm --filter @codex-remote/control-plane typecheck
pnpm --filter @codex-remote/web test
pnpm --filter @codex-remote/web typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Chrome smoke:

1. Start two deterministic fake Workers on different loopback ports.
2. Start Control Plane with both configured upstreams and one public example token.
3. Start Web against Control Plane.
4. Verify two devices render, one conversation per fake Worker appears, and datasource is loaded.
5. Select a conversation on device A and verify timeline loads from device A.
6. Select a conversation on device B and verify timeline loads from device B.
7. Submit one follow-up or control action and verify only the selected device's fake Worker state changes.
8. Stop one fake Worker and verify only that device degrades; no raw URL/token appears.

## Recommended Options And Risks

### Conclusion

Use configured Worker upstreams for Stage 6 instead of pairing or reverse WSS.

### Reason

The project needs a first multi-device Web -> Control Plane -> Worker chain. Runtime config is the smallest source of truth that proves routing and aggregation without building identity lifecycle or persistence early.

### Risk

Configured upstreams are not enough for real remote devices behind NAT and are operationally manual.

### Next Step

Document this as Stage 6 local/self-hosted MVP. Pairing and Worker outbound reverse WSS require a later threat-modeled stage.

### Conclusion

Use device-scoped Control Plane routes for timeline/write/control.

### Reason

Conversation ids are app-server-owned and not globally unique. Device-scoped paths avoid hidden server-side ownership caches and make routing explicit.

### Risk

Web call sites must carry `deviceId` for selected conversation actions.

### Next Step

Update Web datasource helpers to require selected conversation device id when calling timeline, follow-up, interrupt, steer, and approval APIs.

### Conclusion

Keep Control Plane stateless and DB-free in Stage 6.

### Reason

Stage 7 owns persistence and task board. A stateless Control Plane preserves the roadmap sequence and reduces security surface.

### Risk

No durable device history, audit trail, or pairing state.

### Next Step

Stage 7 can introduce `packages/db` with schema-first persistence after multi-device routing is working.

## Completion Criteria

Stage 6 is complete when:

- `apps/control-plane` exists and is included in workspace validation.
- Public Control Plane contract is schema-first and generated.
- Control Plane can aggregate at least two configured Worker upstreams.
- Web can load devices/conversations through Control Plane and use device-scoped timeline/write/control routes.
- One Worker failure degrades only that device and does not break the whole workbench.
- Focused tests, repository gate, and Chrome smoke pass.
- `PLAN.md`, this spec, and the Stage 6 plan record review findings, fixes, verification, and remaining risks.

Completion evidence:

- Focused tests covered API contract generation, Control Plane config/registry/client/HTTP/boundary, Web Control Plane datasource, duplicate conversation id routing, duplicate project id grouping, empty remote conversations, Worker error envelope allowlist, and fake multi-Worker smoke behavior.
- Repository gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Chrome verified Web -> Control Plane -> two fake Workers, Project B duplicate `shared-thread` selection, device-scoped timeline/approvals/steer/approval decision, partial Worker outage, full Worker outage empty remote state, and no upstream Worker port/token in DOM.
