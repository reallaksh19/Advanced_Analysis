# Common Enriched Properties Core

Phase 1 provides closed, immutable, deterministic contracts for:

- normalized engineering-master snapshots;
- field-level enrichment outcomes;
- line/component target records;
- unapproved enrichment candidates;
- externally authorized immutable baselines;
- consumer-readiness records.

Phase 2 adds an exact-only target inventory over `shared-piping-model/v1`:

- every source component receives a stable component target;
- components sharing one exact model `identity.lineId` are retained in a duplicate-safe line bucket;
- line keys are canonicalized only by trim and uppercase;
- missing model line identity remains `BLOCKED_MISSING`;
- branch-name tokens, regex, containment, fuzzy matching, and service inference are not used;
- stale shared-model hashes are rejected before inventory creation.

This module does **not** perform master matching, fallback, engineering approval,
Project Data persistence, empirical calculations, LFEA binding, stagedJson
mutation, topology validation, or solver work.

## Invariants

1. Every record uses exact keys and a versioned schema.
2. Semantic hashes are computed over canonical JSON projections.
3. Constructors require caller-supplied identities and UTC timestamps; no hidden
   clock, random ID, or storage dependency exists.
4. Blocked fields remain `null`, unapproved, and zero-confidence.
5. Deterministic derivations require policy identity and hash.
6. An approved heuristic proposal requires a review-event binding.
7. Candidates always remain `UNAPPROVED_CANDIDATE`.
8. Publication requires a separate `APPROVE` decision bound to the exact
   candidate semantic hash.
9. Published baselines are deeply frozen and never modified in place.
10. Consumer readiness is separate from baseline publication.
11. Exact target inventory never derives a line identity from names or paths.
12. One line key maps to an ordered array of component targets, never one overwritten row.

## Qualification

```bash
node scripts/run-common-enriched-properties-checks.mjs
node scripts/run-common-enriched-target-inventory-checks.mjs
```
