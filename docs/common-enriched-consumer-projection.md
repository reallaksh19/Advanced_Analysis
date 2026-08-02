# Common enriched consumer projection

Phase 13 materializes deterministic consumer payloads from published enrichment baselines without executing the consumer.

- A READY consumer record is mandatory.
- The projection policy adapter version and configuration hash must match readiness.
- Every projected source field must have been qualified by readiness.
- Only approved resolved values are projected; allowed `NOT_APPLICABLE` fields become explicit nulls.
- Missing, blocked, stale, unapproved, or unqualified fields fail closed.
- Explicit output names and target kinds prevent positional or first-found mapping.
- Records and values are canonical, immutable, sorted, and semantic-hashed.
- The generated descriptor uses the projection payload hash and feeds the readiness-gated handoff contract directly.

This module does not run empirical calculations, write stagedJson, create an LFEA model, invoke a solver, mutate topology, persist Project Data, or claim release qualification.

```bash
node scripts/run-common-enriched-consumer-projection-checks.mjs
```
