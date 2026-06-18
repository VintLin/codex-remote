# @codex-remote/codex-protocol

This package contains Codex app-server protocol artifacts generated from the installed Codex CLI.

Generated files are owned by upstream Codex protocol generation:

- `src/generated/app-server.ts`
- `src/generated/**/*.ts`
- `schema/app-server.schema.json`
- `generation-metadata.json`

Do not hand-edit generated artifacts. Regenerate them from the same Codex CLI version and update `generation-metadata.json` in the same commit.

Only `apps/worker` may consume this package. Web, Control Plane, UI, and DB packages must use `@codex-remote/api-contract` instead.
