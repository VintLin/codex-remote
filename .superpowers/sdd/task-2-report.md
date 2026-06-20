# Stage 9 Task 2 Report: Real Local Stack Lifecycle

## Status

DONE_WITH_CONCERNS

Concern: runtime stack execution was intentionally not run because this review-fix task explicitly forbids `pnpm real:start`. Verification is limited to script-source tests, product readiness checks, and shell syntax checks.

## Scope

Changed only the allowed Stage 9 Task 2 review-fix files:

- `scripts/start-real-local-stack.sh`
- `scripts/status-real-local-stack.sh`
- `scripts/product-readiness-check.mjs`
- `scripts/product-readiness-check.test.mjs`
- `docs/references/local-self-hosting.md`
- `.superpowers/sdd/task-2-report.md`

No Worker stdio transport implementation, Worker lifecycle changes, package script changes, push, real stack startup, or unrelated worktree cleanup was performed.

## Review Fixes

Conclusion: default `CODEX_REMOTE_APP_SERVER_TRANSPORT=stdio` now fails closed.

Reason: the current Worker lifecycle does not implement stdio app-server startup, so starting loopback WebSocket while labeling the transport as stdio misrepresents readiness.

Risk: `pnpm real:start` no longer starts with defaults until Worker stdio lifecycle exists.

Next step: a later Worker transport task should implement real stdio lifecycle before treating the default local stack as product-ready.

Conclusion: `CODEX_REMOTE_APP_SERVER_TRANSPORT=debug-websocket pnpm real:start` remains available as an explicit debug fallback.

Reason: Stage 9 still needs a way to exercise the existing loopback WebSocket path without silently claiming stdio readiness.

Risk: debug fallback can still prove only current debug behavior, not target product readiness.

Next step: keep runbook and script messages labeling it as a Stage 9 readiness gap.

Conclusion: lifecycle startup no longer redirects full service stdout/stderr into `logs/*.log`.

Reason: service output may include private paths, prompts, raw protocol frames, command output, stack traces, or other sensitive values.

Risk: debugging background service startup has less captured output.

Next step: use explicit sanitized health/status checks instead of raw service logs when later tasks add runtime diagnostics.

## TDD Evidence

RED:

- Added script-source tests for missing stdio fail-closed guard and full service output redirection.
- Ran `node --test scripts/product-readiness-check.test.mjs`.
- Expected failures observed:
  - missing `Worker stdio app-server transport is not implemented` guard
  - existing `>"$LOG_DIR/$name.log" 2>&1` full-output redirection

GREEN:

- Added transport gate in `scripts/start-real-local-stack.sh`.
- Suppressed background service output with `/dev/null` and wrote only sanitized lifecycle status lines.
- Added product readiness checks for lifecycle shell syntax, stdio guard, debug fallback label, output suppression, and status port overrides.
- Updated local self-hosting runbook to label the debug WebSocket path as fallback only.
- Re-ran the required verification commands.

## Verification

Commands run:

```bash
node --test scripts/product-readiness-check.test.mjs
pnpm product:check
bash -n scripts/start-real-local-stack.sh scripts/status-real-local-stack.sh scripts/stop-real-local-stack.sh
```

Results:

- `node --test scripts/product-readiness-check.test.mjs`: 16 tests, 16 pass, 0 fail.
- `pnpm product:check`: passed with `Product readiness checks passed.`
- `bash -n`: passed for all three lifecycle scripts.
