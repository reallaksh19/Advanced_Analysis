# Common Enriched Properties Core

Phase 1 provides closed, immutable, deterministic contracts for:

- normalized engineering-master snapshots;
- field-level enrichment outcomes;
- line/component target records;
- unapproved enrichment candidates;
- externally authorized immutable baselines;
- consumer-readiness records.

This module does **not** perform source matching, fallback, engineering approval,
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

## Qualification

```bash
node scripts/run-common-enriched-properties-checks.mjs
```
