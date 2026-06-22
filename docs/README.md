# Source of Truth Priority

When documents in this repository conflict, use this priority order. Higher items override lower items.

1. **Active contract files**

   - `packages/api-contract/openapi.yaml`
   - `packages/codex-protocol/schema/app-server.schema.json`

2. **Current feature specs**

   - `docs/features/*.md`
   - `docs/FEATURE_INDEX.md`

3. **Architecture decisions**

   - `docs/adr/*.md`

4. **Tests and verification**

   - Package tests under `apps/*/src/**/*.test.ts` and `packages/*/src/**/*.test.ts`
   - `apps/web/e2e/*.spec.ts`
   - `docs/verification/**`

5. **Product and design facts**

   - `docs/PRODUCT.md`
   - `docs/DESIGN.md`
   - `docs/GLOSSARY.md`
   - `PROJECT_STRUCTURE.md`

6. **Active implementation workflow**

   - `docs/superpowers/specs/*`
   - `docs/superpowers/plans/*`

7. **References**

   - `docs/references/**`

8. **Archives**

   - `docs/archives/**`

Archived files and references are not current source of truth.

## Current Project State

Codex Remote has completed the first Stage 15 Advanced App-like Platform readiness slice. The latest support state is tracked in `docs/FEATURE_INDEX.md`; known verification entrypoints and real-gaps are tracked in `docs/verification/README.md`. New Stage 16 work starts with a spec in `docs/superpowers/specs/`.

## Stage Workflow

Per `~/Memory/references/Project Structure.md`:

1. User request -> `docs/superpowers/specs/<date>-<topic>.md`
2. Spec -> `docs/superpowers/plans/<date>-<topic>.md`
3. Implement -> relevant tests pass
4. Update contract / schema / tests
5. Stabilize durable behavior -> `docs/features/<feature>.md`
6. Update `docs/FEATURE_INDEX.md`
7. Architecture decision, if any -> `docs/adr/<id>.md`
8. Move completed spec / plan -> `docs/archives/`
