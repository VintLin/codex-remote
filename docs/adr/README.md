# Architecture Decision Records

ADRs record durable design rationale that future work should not casually reverse.

Template: see `99_Memory/references/Project Structure.md` §`adr/_template.md`.

Status: empty. The first ADR will be added when a stage produces a durable architecture decision that needs to survive across future stages.

When to add an ADR:

- The decision constrains future stages (e.g. opaque ids, Worker-only local access, event projection rules).
- The decision has been considered against alternatives and rejected those alternatives for documented reasons.
- The decision would cause rework if reversed casually.

When NOT to add an ADR:

- Pure implementation detail that can change with the spec.
- Per-feature behavior — that belongs in `docs/features/<slug>.md`.
- Per-stage execution steps — that belongs in `docs/superpowers/plans/`.