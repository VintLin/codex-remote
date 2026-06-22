# Contracts

Public API source of truth:

- `packages/api-contract/openapi.yaml`

Generated Codex app-server protocol types:

- `packages/codex-protocol/src/generated/`

Event and manifest schemas (not yet produced):

- `packages/api-contract/schemas/events.schema.json` (deferred)
- `packages/api-contract/schemas/task-manifest.schema.json` (deferred)

Rules:

- Do not duplicate contract files under `docs/`.
- Public API contract is the only schema source for Web, Worker, Control Plane, and future iOS. Generated TypeScript types flow from `openapi-typescript`.
- Codex app-server protocol types are generated via `codex app-server generate-ts` / `generate-json-schema` and live in `packages/codex-protocol`. They are Worker-only.
- Per `AGENTS.md` 唯一事实源 rules: do not write parallel DTO fields in API handlers, UI, or tests.

Status: index-only. Event / manifest schemas deferred until a stage spec needs them.