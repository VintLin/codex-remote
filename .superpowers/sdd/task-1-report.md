# Task 1 Report: Add Contract Guard Tests First

## What changed
- Updated only `packages/api-contract/src/contractGeneration.test.ts`.
- Added 4 red tests for Stage 2 contract guards:
  - asserts five versioned Stage 2 paths exist in `openapi.yaml`:
    - `/v1/worker/health`
    - `/v1/worker/capabilities`
    - `/v1/worker/probe`
    - `/v1/conversations`
    - `/v1/conversations/{conversationId}/timeline`
  - asserts non-2xx errors reference `ErrorEnvelope` for statuses `400/401/403/408/424/500`.
  - asserts write/stream routes are not in Stage 2 allowlist (`workerFollowUpConversation`, `workerApproval`, `workerInterrupt`, `workerSteer`).
  - asserts `ErrorEnvelope.details` is allowlist-style (presence of `type/object`, `oneOf`, and refs to `ProbeFailure`, `CommandNotAllowedError`, `ConversationNotFoundError`).

## Test command and results
- Command: `pnpm --filter @codex-remote/api-contract test`
- Result: failed as expected for Task 1 (RED), because OpenAPI has not yet been updated in Task 2.
- Node test output summary:
  - tests: `8`
  - pass: `5`
  - fail: `3`

### Failing evidence (expected)
- `when worker read-only http api is maintained, openapi should define versioned stage 2 paths`
- `when worker read-only http api errors are maintained, routes should use ErrorEnvelope`
- `when ErrorEnvelope is maintained, details must be allowlisted`

## Files changed
- `packages/api-contract/src/contractGeneration.test.ts`

## Self-review
- Scope is limited to the single requested file.
- Existing test style is preserved (stringly assertions against raw `openapi.yaml` text).
- No OpenAPI, generated files, docs, lockfiles, or implementation source were modified.

## Concerns
- The new Stage 2 path/response checks are intentionally coarse-grained because this task is a contract-guard slice; they are meant to fail fast before Task 2 and may be refined once the schema is introduced.
- The `ErrorEnvelope.details` assertions currently verify schema content exists in the file but do not yet constrain schema location.

## Fix pass (findings review response)

### What was changed in this pass
- Replaced blacklist route checks with Stage-2 whitelist assertions in `packages/api-contract/src/contractGeneration.test.ts`.
- Added versioned path helpers to:
  - assert the five Stage 2 paths exist as explicit `/v1` blocks,
  - assert those path blocks expose only `get` methods,
  - reject versioned write/stream/approval/interrupt/steer path candidates,
  - reject corresponding operationIds under versioned `/v1` path blocks.
- Narrowed `ErrorEnvelope` validation to the `ErrorEnvelope` block and its `details` child.
  - now checks `details` does not use `additionalProperties: true`,
  - now checks `details` contains allowlist keys `operation`, `retryable`, `diagnosticId`, `reason`, `field`, `limit`.
- Tightened non-2xx assertions to be per Stage 2 path + status:
  - requires statuses `400/401/403/408/424/500` in each Stage 2 path response set,
  - accepts direct `$ref` to `#/components/schemas/ErrorEnvelope` or component response refs that resolve to ErrorEnvelope.

### Updated test output
- Command: `pnpm --filter @codex-remote/api-contract test`
- Result: failed as expected (RED) with 3 failing tests:
  - `when worker read-only http api is maintained, openapi should define versioned stage 2 paths`
  - `when worker read-only http api errors are maintained, stage 2 routes should use ErrorEnvelope`
  - `when ErrorEnvelope is maintained, details must be allowlisted`
- Summary: `tests 7`, `pass 4`, `fail 3`.

## Second review fix pass

### What was changed (this pass)
- Added an exact `/v1` allowlist check in `packages/api-contract/src/contractGeneration.test.ts`:
  - collects only `/v1` path lines from the `paths:` section,
  - asserts the set equals exactly:
    - `/v1/worker/health:`
    - `/v1/worker/capabilities:`
    - `/v1/worker/probe:`
    - `/v1/conversations:`
    - `/v1/conversations/{conversationId}/timeline:`
  - keeps per-path method validation so each versioned path must be `get`-only.
- Tightened `ErrorEnvelope` `details` check to be fail-closed:
  - now asserts `additionalProperties: false` inside scoped `details` block.
- Tightened component response resolver:
  - `getComponentResponseUsesErrorEnvelope()` now returns true only when the component response body contains an actual schema ref line to `#/components/schemas/ErrorEnvelope` via `$ref`.

### Updated test output
- Command: `pnpm --filter @codex-remote/api-contract test`
- Result: still RED (expected before Task 2):
  - `tests 7`
  - `pass 4`
  - `fail 3`

## Third review fix pass

### What was changed (this pass)
- Normalized `extractVersionedPathLines()` to return `/v1/...:` strings without leading spaces so it matches `stage2Paths` exactly.
- Fixed `ErrorEnvelope.details` scoped extraction to match the actual YAML indentation:
  - starts at `^ {8}details:`
  - ends when a nonblank sibling line has indent `<= 8`
  - requires `^ {10}additionalProperties: false$`
  - checks allowlisted nested keys at 10-space indent: `operation`, `retryable`, `diagnosticId`, `reason`, `field`, `limit`
- Preserved and mirrored strict `$ref` matching by requiring direct schema refs to appear as an actual `$ref: "#/components/schemas/ErrorEnvelope"` line, not an arbitrary string occurrence.

### Updated test output
- Command: `pnpm --filter @codex-remote/api-contract test`
- Result: still RED before Task 2, but the failures now reflect real OpenAPI gaps instead of test parser mistakes.
- Summary:
  - `tests 7`
  - `pass 4`
  - `fail 3`

### Current failing evidence
- `when worker read-only http api is maintained, openapi should define versioned stage 2 paths`
  - actual versioned `/v1` path set is still `[]`
- `when worker read-only http api errors are maintained, stage 2 routes should use ErrorEnvelope`
  - Stage 2 versioned route blocks are still absent
- `when ErrorEnvelope is maintained, details must be allowlisted`
  - `ErrorEnvelope.details` still uses `additionalProperties: true` in `openapi.yaml`
